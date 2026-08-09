/**
 * An append-only local record of every settings change.
 *
 * The site already version-controls the *scheduled* settings document: `schedule.ts`
 * keeps a short history of each saved rule set. Nothing recorded what happened to
 * the ordinary settings themselves, so a visitor who reset every preference to find
 * one control had no route back to the twelve choices that reset took with it. This
 * module is that route.
 *
 * Three properties matter more than anything else here, and each of them is a
 * deliberate constraint rather than an implementation accident:
 *
 * History is append-only. Restoring a past value writes a *new* record describing
 * the restore; it never edits, deletes or rewinds the record it restored from. That
 * is what makes an undo undoable, and that undo undoable in turn — a "restore" that
 * discarded the branch it replaced would make the panel unsafe to open, because a
 * visitor could not experiment without risking the state they started from.
 *
 * The only removal is bounded retention, and it is an explicit reported action. A
 * silent trim on write would be the one operation capable of losing a record the
 * visitor was relying on, and it would do so at the exact moment nobody was looking.
 * `prune()` is therefore something a surface calls on purpose and reports the result
 * of; appending past the retention bound merely makes the overflow visible.
 *
 * A failed history write never fails the change the visitor actually asked for. The
 * recorder runs inside the store's own listener loop, so a throw here would abort the
 * remaining listeners of a settings change that has already happened. Every path that
 * can touch storage or JSON is contained.
 */

import type { Preferences } from "../platform/Preferences.js";
import type { SettingsStore } from "./store.js";
import type { SettingValue } from "./types.js";

export const HISTORY_SCHEMA_VERSION = 1 as const;

/** The default retention bound. High enough that pruning is rare, low enough to stay a list. */
export const DEFAULT_HISTORY_RETENTION = 200;

const HISTORY_KEY = "settings.history";

/**
 * What a record can say happened, derived from what `SettingsStore` can actually do.
 *
 * Each member maps to exactly one store operation, and there is deliberately no
 * member that no store method produces:
 *
 * - `changed`             `store.set(id, value)`, the ordinary case.
 * - `reset`               `store.reset(id)`, one setting back to its default.
 * - `reset-all`           `store.resetAll()`, every setting at once.
 * - `imported`            `store.import(data)`, values arriving from an export file.
 * - `restored`            this model's own `restore()`, which writes through `store.set`.
 * - `scheduled-override`  `store.replaceScheduledOverrides(values)`, the schedule layer.
 *
 * A guess list would drift the first time the store grew a method; this list is
 * checkable against `store.ts` in one reading, which is the point.
 */
export const HISTORY_ACTIONS = [
    "changed",
    "reset",
    "reset-all",
    "imported",
    "restored",
    "scheduled-override",
] as const;

export type SettingsHistoryAction = (typeof HISTORY_ACTIONS)[number];

export interface SettingsHistoryChange {
    readonly id: string;
    /**
     * The value immediately before this record. Null only when the prior value was
     * genuinely unknown — a setting registered after the recorder started watching, or
     * a record written by another build. A null previous is honest about being
     * unrestorable rather than inventing a default to restore to.
     */
    readonly previous: SettingValue | null;
    readonly next: SettingValue | null;
}

export interface SettingsHistoryRecord {
    readonly id: string;
    /** ISO-8601, in UTC. Rendering converts to the visitor's own zone; storage never does. */
    readonly at: string;
    readonly action: SettingsHistoryAction;
    /**
     * Every setting this record touched. Derived from `changes` at the single point
     * records are created, and stored rather than recomputed so a reader of the
     * persisted blob can see what a record covers without understanding the value shape.
     */
    readonly settingIds: readonly string[];
    readonly changes: readonly SettingsHistoryChange[];
    /**
     * An i18n key, never a rendered sentence. Copy that was resolved at write time would
     * be frozen in whichever language and funny level happened to be active when the
     * visitor changed a setting, and would stay that way forever afterwards.
     */
    readonly labelKey: string;
}

export interface SettingsHistoryDocument {
    readonly version: typeof HISTORY_SCHEMA_VERSION;
    readonly records: readonly SettingsHistoryRecord[];
}

export interface PruneReport {
    readonly removed: number;
    readonly remaining: number;
}

export interface RestoreReport {
    /** Settings whose previous value was written back. */
    readonly restored: readonly string[];
    /**
     * Settings this restore could not touch, each with the reason: `unknown` for a
     * setting this build no longer declares, `no-previous` for a change with nothing
     * recorded before it, `unchanged` when the live value already matched.
     */
    readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

export interface SettingsHistoryOptions {
    /** How many records survive a `prune()`. */
    readonly retention?: number | undefined;
    /** Injectable so a test can place records on exact instants instead of racing a real clock. */
    readonly clock?: (() => Date) | undefined;
}

/** The label key a record of each action carries. Kept beside the action list so neither drifts. */
const LABEL_KEYS: Readonly<Record<SettingsHistoryAction, string>> = {
    changed: "history.label.changed",
    reset: "history.label.reset",
    "reset-all": "history.label.reset-all",
    imported: "history.label.imported",
    restored: "history.label.restored",
    "scheduled-override": "history.label.scheduled-override",
};

export class SettingsHistory {
    private readonly prefs: Preferences;
    private readonly retentionLimit: number;
    private readonly clock: () => Date;
    private readonly listeners = new Set<() => void>();
    /**
     * The values as of the last recorded state, so a store notification — which carries
     * only the ids that changed — can be turned into a before-and-after pair. The store
     * does not keep the old value anywhere once it has written the new one, so a shadow
     * copy is the only way to learn what a change replaced.
     */
    private readonly shadow = new Map<string, SettingValue>();
    /** Set while `withAction` is running, so a diff is classified by its cause. */
    private pendingAction: SettingsHistoryAction | null = null;
    private sequence = 0;
    private cache: SettingsHistoryRecord[] | null = null;

    constructor(prefs: Preferences, options: SettingsHistoryOptions = {}) {
        this.prefs = prefs;
        this.retentionLimit = Math.max(1, Math.floor(options.retention ?? DEFAULT_HISTORY_RETENTION));
        this.clock = options.clock ?? ((): Date => new Date());
    }

    get retention(): number {
        return this.retentionLimit;
    }

    /** Oldest first, which is the order they happened in and the order the file stores. */
    records(): readonly SettingsHistoryRecord[] {
        if (this.cache === null) {
            this.cache = [...(this.prefs.readJson(HISTORY_KEY, reviveDocument)?.records ?? [])];
        }
        return this.cache;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Watch a store and record what changes about it.
     *
     * This is the whole wiring contract: one call, and every `set`, `reset`, `resetAll`,
     * `import` and scheduled override that the store emits becomes a record. The
     * alternative — asking each call site to hand over the previous value — puts the
     * burden of remembering on the code least likely to remember, and a settings page
     * that forgets one call site produces a history with a hole in it that nothing
     * detects.
     *
     * The returned function stops watching. It does not erase anything already recorded.
     */
    trackChanges(store: SettingsStore): () => void {
        this.reseed(store);
        return store.subscribe((changedIds) => {
            try {
                this.recordDiff(store, changedIds);
            } catch {
                // A history write must never take a settings change down with it. The
                // store is mid-emit here, so throwing would also silence every listener
                // queued behind this one — the theme controller, the live preview, the
                // search index — over a record nobody asked for.
            }
        });
    }

    /**
     * Classify whatever the store emits during `run` as `action` rather than `changed`.
     *
     * The store reports which ids changed and nothing about why, and the difference
     * between a visitor typing a new value and a visitor resetting every setting is
     * exactly the difference a history panel exists to show. The cause is known at the
     * call site and nowhere else, so this is where it is supplied.
     *
     * An asynchronous `run` keeps the classification until its promise settles, because
     * a scheduled refresh applies its overrides after an await and would otherwise be
     * recorded as an ordinary change.
     */
    withAction<T>(action: SettingsHistoryAction, run: () => T): T {
        const restore = this.pendingAction;
        this.pendingAction = action;
        let result: T;
        try {
            result = run();
        } catch (error) {
            this.pendingAction = restore;
            throw error;
        }
        if (isThenable(result)) {
            const clear = (): void => {
                this.pendingAction = restore;
            };
            // The derived promise is what the caller gets, so a rejection stays handled
            // by whoever awaited `withAction` instead of surfacing as an unhandled one.
            return result.then(
                (value) => {
                    clear();
                    return value;
                },
                (error: unknown) => {
                    clear();
                    throw error;
                },
            ) as unknown as T;
        }
        this.pendingAction = restore;
        return result;
    }

    /**
     * Append a record directly.
     *
     * Used by anything that knows what it did but does not go through the tracked store
     * — and by tests, which need records at chosen instants. Returns the stored record,
     * or null when there was nothing to record or storage refused it.
     */
    append(
        action: SettingsHistoryAction,
        changes: readonly SettingsHistoryChange[],
    ): SettingsHistoryRecord | null {
        if (changes.length === 0) return null;
        this.sequence += 1;
        const at = this.clock();
        const record: SettingsHistoryRecord = {
            id: `${at.getTime()}-${this.sequence}`,
            at: at.toISOString(),
            action,
            settingIds: changes.map((change) => change.id),
            changes: changes.map((change) => ({ ...change })),
            labelKey: LABEL_KEYS[action],
        };
        const next = [...this.records(), record];
        this.cache = next;
        this.persist(next);
        this.notify();
        return record;
    }

    /**
     * Write a record's previous values back through the store.
     *
     * The restore itself becomes a new record, classified `restored`, because the
     * recorder is watching the same store this writes through. Nothing about the record
     * being restored from is touched: it stays exactly where it was, so restoring back
     * to the value this replaced is just another restore of another record.
     */
    restore(recordId: string, store: SettingsStore): RestoreReport {
        const record = this.records().find((candidate) => candidate.id === recordId);
        if (record === undefined) return { restored: [], skipped: [{ id: recordId, reason: "unknown-record" }] };
        const restored: string[] = [];
        const skipped: { id: string; reason: string }[] = [];
        this.withAction("restored", () => {
            for (const change of record.changes) {
                if (change.previous === null) {
                    skipped.push({ id: change.id, reason: "no-previous" });
                    continue;
                }
                if (store.definition(change.id) === undefined) {
                    skipped.push({ id: change.id, reason: "unknown" });
                    continue;
                }
                if (store.get(change.id) === change.previous) {
                    skipped.push({ id: change.id, reason: "unchanged" });
                    continue;
                }
                store.set(change.id, change.previous);
                restored.push(change.id);
            }
        });
        return { restored, skipped };
    }

    /** How many records sit beyond the retention bound and would go if `prune()` ran now. */
    overflow(): number {
        return Math.max(0, this.records().length - this.retentionLimit);
    }

    /**
     * Drop the oldest records beyond the retention bound and say how many went.
     *
     * Deliberately not automatic. A history that quietly shortened itself on every write
     * would be indistinguishable from one that lost a record, and the visitor would find
     * out by looking for something that is no longer there.
     */
    prune(): PruneReport {
        const current = this.records();
        const removed = Math.max(0, current.length - this.retentionLimit);
        if (removed === 0) return { removed: 0, remaining: current.length };
        const kept = current.slice(removed);
        this.cache = [...kept];
        this.persist(kept);
        this.notify();
        return { removed, remaining: kept.length };
    }

    /**
     * Re-read every tracked value without recording anything.
     *
     * Called when watching starts, and available to a surface that changed values behind
     * the store's back, so the next real change is diffed against reality rather than
     * against a stale shadow and reported as a change that never happened.
     */
    reseed(store: SettingsStore): void {
        this.shadow.clear();
        for (const definition of store.definitions_()) {
            try {
                this.shadow.set(definition.id, store.get(definition.id));
            } catch {
                // A definition the store cannot currently read is left out of the shadow.
                // Its first change is then recorded with a null previous, which says
                // "unknown" rather than asserting a before-value nobody observed.
            }
        }
    }

    private recordDiff(store: SettingsStore, changedIds: readonly string[]): void {
        const changes: SettingsHistoryChange[] = [];
        for (const id of changedIds) {
            let current: SettingValue;
            try {
                current = store.get(id);
            } catch {
                continue;
            }
            const had = this.shadow.has(id);
            const previous = this.shadow.get(id);
            if (had && previous === current) continue;
            this.shadow.set(id, current);
            changes.push({ id, previous: had && previous !== undefined ? previous : null, next: current });
        }
        if (changes.length === 0) return;
        this.append(this.pendingAction ?? "changed", changes);
    }

    private persist(records: readonly SettingsHistoryRecord[]): void {
        const document: SettingsHistoryDocument = { version: HISTORY_SCHEMA_VERSION, records };
        this.prefs.writeJson(HISTORY_KEY, document);
    }

    private notify(): void {
        for (const listener of [...this.listeners]) listener();
    }
}

export interface HistoryQuery {
    /** Empty means every action. An explicit empty selection is handled by the surface. */
    readonly actions?: readonly SettingsHistoryAction[] | undefined;
    /** Inclusive local calendar day, `YYYY-MM-DD`, or "" for unbounded. */
    readonly start?: string | undefined;
    readonly end?: string | undefined;
    /** Receives the record's searchable text. Absent means everything matches. */
    readonly matches?: ((text: string) => boolean) | undefined;
}

export interface ActionCount {
    readonly action: SettingsHistoryAction;
    readonly count: number;
}

/**
 * The count of every action, including the ones with none.
 *
 * A list that omitted its empty actions would make an absent action indistinguishable
 * from an action that is merely rare, and a visitor filtering for something that never
 * happened would be left wondering whether the filter was broken. A visible zero
 * answers that in one glance.
 */
export function actionCounts(records: readonly SettingsHistoryRecord[]): readonly ActionCount[] {
    const counts = new Map<SettingsHistoryAction, number>(
        HISTORY_ACTIONS.map((action) => [action, 0]),
    );
    for (const record of records) counts.set(record.action, (counts.get(record.action) ?? 0) + 1);
    return HISTORY_ACTIONS.map((action) => ({ action, count: counts.get(action) ?? 0 }));
}

/**
 * Narrow by action, by date range and by text at once.
 *
 * The three compose rather than override: a query with all three keeps only the records
 * that satisfy all three. A filter that silently won over another would be the worst
 * kind of defect here, because the result still looks like a plausible list.
 */
export function filterHistory(
    records: readonly SettingsHistoryRecord[],
    query: HistoryQuery,
    searchableText: (record: SettingsHistoryRecord) => string,
): readonly SettingsHistoryRecord[] {
    const actions = query.actions;
    const start = query.start ?? "";
    const end = query.end ?? "";
    return records.filter((record) => {
        if (actions !== undefined && actions.length > 0 && !actions.includes(record.action))
            return false;
        const day = localDay(record.at);
        // Both edges are inclusive, because a visitor asking for "the 3rd to the 5th"
        // means all three days. Comparing calendar days as strings is exact for the
        // ISO form both sides use, and avoids a timezone-shifted instant comparison
        // excluding a record made late in the evening of the final day.
        if (start !== "" && (day === null || day < start)) return false;
        if (end !== "" && (day === null || day > end)) return false;
        if (query.matches !== undefined && !query.matches(searchableText(record))) return false;
        return true;
    });
}

/**
 * The local calendar day a record belongs to, in the same `YYYY-MM-DD` form the shared
 * date range picker produces, or null for a timestamp that will not parse.
 */
export function localDay(iso: string): string | null {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    const year = at.getFullYear().toString().padStart(4, "0");
    const month = (at.getMonth() + 1).toString().padStart(2, "0");
    const day = at.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/** The interpolation values a record's label key expects, so copy and record cannot disagree. */
export function recordLabelValues(
    record: SettingsHistoryRecord,
): Readonly<Record<string, string | number>> {
    return { ids: record.settingIds.join(", "), count: record.settingIds.length };
}

function isThenable(value: unknown): value is Promise<unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as { then?: unknown }).then === "function"
    );
}

/**
 * Validate a persisted blob.
 *
 * A wrong version or a non-document shape falls back to an empty history rather than
 * being partly trusted, because a document from a build this one does not understand
 * cannot be safely half-read. Within a document of the right version, an individual
 * malformed record is dropped and its neighbours survive: one hand-edited line should
 * not cost a visitor everything else they had.
 */
function reviveDocument(value: unknown): SettingsHistoryDocument | undefined {
    if (!isRecord(value) || value["version"] !== HISTORY_SCHEMA_VERSION) return undefined;
    const raw = value["records"];
    if (!Array.isArray(raw)) return undefined;
    const records = raw.flatMap((candidate): SettingsHistoryRecord[] => {
        const record = reviveRecord(candidate);
        return record === undefined ? [] : [record];
    });
    return { version: HISTORY_SCHEMA_VERSION, records };
}

function reviveRecord(value: unknown): SettingsHistoryRecord | undefined {
    if (
        !isRecord(value) ||
        typeof value["id"] !== "string" ||
        typeof value["at"] !== "string" ||
        typeof value["labelKey"] !== "string" ||
        !isAction(value["action"]) ||
        !Array.isArray(value["changes"])
    )
        return undefined;
    const changes: SettingsHistoryChange[] = [];
    for (const candidate of value["changes"]) {
        if (!isRecord(candidate) || typeof candidate["id"] !== "string") return undefined;
        const previous = candidate["previous"];
        const next = candidate["next"];
        if (!isValueOrNull(previous) || !isValueOrNull(next)) return undefined;
        changes.push({ id: candidate["id"], previous, next });
    }
    if (changes.length === 0) return undefined;
    return {
        id: value["id"],
        at: value["at"],
        action: value["action"],
        // Rebuilt from the changes rather than trusted, so a hand-edited file cannot
        // produce a record whose stated ids and whose actual changes disagree.
        settingIds: changes.map((change) => change.id),
        changes,
        labelKey: value["labelKey"],
    };
}

function isAction(value: unknown): value is SettingsHistoryAction {
    return typeof value === "string" && (HISTORY_ACTIONS as readonly string[]).includes(value);
}

function isValueOrNull(value: unknown): value is SettingValue | null {
    return (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
