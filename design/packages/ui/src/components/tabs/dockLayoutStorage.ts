/**
 * What the docking layer remembers: the arrangement of panes, and named layouts.
 *
 * Two separate things are stored, deliberately apart from the tab workspace itself.
 *
 * The **arrangement** is the dockview layout JSON: where each pane sits, how the
 * splits are sized, which panes float. It is a version-1 envelope under its own
 * key, derived from the workspace key (`<key>-dock`). The tab workspace under the
 * unchanged key stays exactly the shape it always was, so a build that has never
 * heard of docking reads it without noticing anything, and a returning person's
 * tabs, groups, pins and order are not migrated so much as left alone.
 *
 * The **named layouts** are snapshots the person saved on purpose: the strips (the
 * same JSON the workspace key holds) plus the arrangement that went with them.
 *
 * ### A saved arrangement is a claim, and it can be wrong
 *
 * The file is editable by hand, written by other builds, and goes stale whenever
 * a pane is merged away. {@link layoutMatchesStrips} therefore checks that the
 * arrangement accounts for exactly the strips the workspace has, one pane each,
 * before anything is handed to dockview. A layout that does not is not repaired,
 * it is dropped, and the caller builds the default arrangement from the strips.
 * The one outcome this module never allows is an arrangement that hides a strip:
 * an empty Work page was once the visible result of a stored layout that no
 * longer matched what it described.
 */

import {
    workspaceStripsFromJson,
    workspaceStripsToJson,
    type TabStorage,
} from "./tabStorage.js";
import { setActiveTab, type TabStripState, type TabWorkspaceState } from "./tabModel.js";

export const DOCK_LAYOUT_VERSION = 1;
export const NAMED_LAYOUTS_VERSION = 1;
export const MAX_NAMED_LAYOUTS = 24;
export const MAX_LAYOUT_NAME_LENGTH = 60;

/** The dockview layout JSON, which this module treats as opaque apart from its panel ids. */
export type DockLayoutJson = Record<string, unknown>;

export function dockStorageKey(workspaceKey: string): string {
    return `${workspaceKey}-dock`;
}

export function namedLayoutsStorageKey(workspaceKey: string): string {
    return `${workspaceKey}-layouts`;
}

function defaultStorage(): TabStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether an arrangement describes exactly these strips.
 *
 * One pane per strip and no pane for anything else, a grid to put them in, and no
 * popout windows: popouts are not offered, so a stored one cannot be honoured and
 * the arrangement that carries it is not trusted.
 */
export function layoutMatchesStrips(layout: unknown, stripIds: readonly string[]): boolean {
    if (!isRecord(layout)) return false;
    const panels = layout["panels"];
    const grid = layout["grid"];
    if (!isRecord(panels) || !isRecord(grid) || !isRecord(grid["root"])) return false;
    const popouts = layout["popoutGroups"];
    if (Array.isArray(popouts) && popouts.length > 0) return false;
    const have = Object.keys(panels);
    if (have.length !== stripIds.length) return false;
    const wanted = new Set(stripIds);
    return wanted.size === stripIds.length && have.every((id) => wanted.has(id));
}

export interface StoredDock {
    readonly layout: DockLayoutJson;
    /** The strip that last held focus, so a restart reopens on the same pane. */
    readonly activeStripId: string | null;
}

/** The stored arrangement when it is readable and accounts for exactly these strips, else null. */
export function readDockLayout(
    stripIds: readonly string[],
    storage: TabStorage | null = defaultStorage(),
    workspaceKey = "worldlens-tabs",
): StoredDock | null {
    if (storage === null) return null;
    try {
        const raw = storage.getItem(dockStorageKey(workspaceKey));
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed) || parsed["version"] !== DOCK_LAYOUT_VERSION) return null;
        const layout = parsed["layout"];
        if (!layoutMatchesStrips(layout, stripIds)) return null;
        const active = parsed["activeStripId"];
        return {
            layout: layout as DockLayoutJson,
            activeStripId: typeof active === "string" && stripIds.includes(active) ? active : null,
        };
    } catch {
        return null;
    }
}

/** Writes the arrangement, silently doing nothing where storage refuses. */
export function writeDockLayout(
    layout: DockLayoutJson,
    activeStripId: string | null,
    storage: TabStorage | null = defaultStorage(),
    workspaceKey = "worldlens-tabs",
): void {
    if (storage === null) return;
    try {
        storage.setItem(
            dockStorageKey(workspaceKey),
            JSON.stringify({ version: DOCK_LAYOUT_VERSION, activeStripId, layout }),
        );
    } catch {
        // A remembered arrangement is not worth a toast.
    }
}

/* -------------------------------------------------------------------------- */
/* Named layouts                                                              */
/* -------------------------------------------------------------------------- */

export interface NamedLayout {
    readonly id: string;
    readonly name: string;
    /** ISO-8601, so a list can say when a layout was saved. */
    readonly savedAt: string;
    /** The strips, in the JSON the workspace key holds. */
    readonly strips: readonly unknown[];
    /** The arrangement that went with them, or null when it was a single pane. */
    readonly dock: DockLayoutJson | null;
}

/** A name a person typed, made storable: trimmed, whitespace collapsed, bounded. */
export function cleanLayoutName(raw: string): string {
    return raw.replace(/\s+/g, " ").trim().slice(0, MAX_LAYOUT_NAME_LENGTH);
}

export function readNamedLayouts(
    storage: TabStorage | null = defaultStorage(),
    workspaceKey = "worldlens-tabs",
): NamedLayout[] {
    if (storage === null) return [];
    try {
        const raw = storage.getItem(namedLayoutsStorageKey(workspaceKey));
        if (raw === null) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed) || parsed["version"] !== NAMED_LAYOUTS_VERSION) return [];
        const layouts = parsed["layouts"];
        if (!Array.isArray(layouts)) return [];
        const seen = new Set<string>();
        const out: NamedLayout[] = [];
        for (const entry of layouts) {
            if (!isRecord(entry)) continue;
            const id = entry["id"];
            const name = entry["name"];
            if (typeof id !== "string" || id === "" || seen.has(id)) continue;
            if (typeof name !== "string" || cleanLayoutName(name) === "") continue;
            const strips = entry["strips"];
            if (workspaceStripsFromJson(strips).length === 0) continue;
            seen.add(id);
            const dock = entry["dock"];
            const savedAt = entry["savedAt"];
            out.push({
                id,
                name: cleanLayoutName(name),
                savedAt: typeof savedAt === "string" ? savedAt : "",
                strips: strips as unknown[],
                dock: isRecord(dock) ? dock : null,
            });
        }
        return out.slice(0, MAX_NAMED_LAYOUTS);
    } catch {
        return [];
    }
}

export function writeNamedLayouts(
    layouts: readonly NamedLayout[],
    storage: TabStorage | null = defaultStorage(),
    workspaceKey = "worldlens-tabs",
): void {
    if (storage === null) return;
    try {
        storage.setItem(
            namedLayoutsStorageKey(workspaceKey),
            JSON.stringify({ version: NAMED_LAYOUTS_VERSION, layouts }),
        );
    } catch {
        // Same as the workspace itself: refused storage means the list does not survive.
    }
}

export type SaveLayoutOutcome =
    | { readonly ok: true; readonly layouts: readonly NamedLayout[]; readonly replaced: boolean }
    | { readonly ok: false; readonly reason: "empty-name" | "full" };

/**
 * Saves the current arrangement under a name.
 *
 * Saving under a name that already exists replaces that layout and says so
 * (`replaced`), so the caller can tell the person rather than leaving two layouts
 * the same words apart. Names compare without regard to case.
 */
export function saveNamedLayout(
    layouts: readonly NamedLayout[],
    rawName: string,
    workspace: TabWorkspaceState,
    dock: DockLayoutJson | null,
    now: Date = new Date(),
): SaveLayoutOutcome {
    const name = cleanLayoutName(rawName);
    if (name === "") return { ok: false, reason: "empty-name" };
    const existing = layouts.find((layout) => layout.name.toLowerCase() === name.toLowerCase());
    const entry: NamedLayout = {
        id: existing?.id ?? nextLayoutId(layouts),
        name,
        savedAt: now.toISOString(),
        strips: workspaceStripsToJson(workspace),
        dock,
    };
    if (existing === undefined) {
        if (layouts.length >= MAX_NAMED_LAYOUTS) return { ok: false, reason: "full" };
        return { ok: true, layouts: [...layouts, entry], replaced: false };
    }
    return {
        ok: true,
        layouts: layouts.map((layout) => (layout.id === existing.id ? entry : layout)),
        replaced: true,
    };
}

function nextLayoutId(layouts: readonly NamedLayout[]): string {
    const taken = new Set(layouts.map((layout) => layout.id));
    for (let n = 1; ; n++) {
        const candidate = `layout-${n}`;
        if (!taken.has(candidate)) return candidate;
    }
}

export function renameNamedLayout(
    layouts: readonly NamedLayout[],
    id: string,
    rawName: string,
): readonly NamedLayout[] | null {
    const name = cleanLayoutName(rawName);
    if (name === "") return null;
    if (layouts.some((layout) => layout.id !== id && layout.name.toLowerCase() === name.toLowerCase()))
        return null;
    if (!layouts.some((layout) => layout.id === id)) return null;
    return layouts.map((layout) => (layout.id === id ? { ...layout, name } : layout));
}

export function deleteNamedLayout(
    layouts: readonly NamedLayout[],
    id: string,
): readonly NamedLayout[] {
    return layouts.filter((layout) => layout.id !== id);
}

export interface AppliedLayout {
    readonly workspace: TabWorkspaceState;
    /** The saved arrangement, only when it still accounts for exactly these strips. */
    readonly dock: DockLayoutJson | null;
    /** Tabs of the saved layout whose page this build no longer has. */
    readonly droppedPageIds: readonly string[];
    /** Tabs that were open but the layout did not mention, kept in the first pane. */
    readonly keptPageIds: readonly string[];
}

/**
 * Turns a saved layout into a workspace for the current build.
 *
 * Three things are reconciled with the present, so applying a layout can never
 * silently lose work or resurrect something that is gone:
 *
 *  - saved tabs whose page is no longer available are dropped and reported;
 *  - tabs that are open now but are not in the layout are **kept**, appended to
 *    the first pane, because applying an arrangement must not close a tab;
 *  - a tab that is open now with unsaved work keeps its unsaved-work mark.
 *
 * Returns null when nothing of the layout survives, so the caller changes nothing
 * rather than replacing the workspace with an empty one.
 */
export function applyNamedLayout(
    layout: NamedLayout,
    current: TabWorkspaceState,
    availablePageIds: ReadonlySet<string>,
): AppliedLayout | null {
    const saved = workspaceStripsFromJson(layout.strips);
    const droppedPageIds: string[] = [];
    const dirtyPages = new Set(
        current.strips.flatMap((strip) =>
            strip.tabs.filter((tab) => tab.dirty).map((tab) => tab.pageId),
        ),
    );

    let strips: TabStripState[] = saved
        .map((strip): TabStripState => {
            const gone = strip.tabs.filter((tab) => !availablePageIds.has(tab.pageId));
            for (const tab of gone) droppedPageIds.push(tab.pageId);
            const goneIds = new Set(gone.map((tab) => tab.id));
            const tabs = strip.tabs
                .filter((tab) => !goneIds.has(tab.id))
                .map((tab) => (dirtyPages.has(tab.pageId) ? { ...tab, dirty: true } : tab));
            return {
                ...strip,
                tabs,
                groups: strip.groups.map((group) => ({
                    ...group,
                    tabIds: group.tabIds.filter((id) => !goneIds.has(id)),
                })),
                pinnedOrder: strip.pinnedOrder.filter((id) => !goneIds.has(id)),
                slots: strip.slots.filter((slot) =>
                    slot.kind === "tab" ? !goneIds.has(slot.tabId) : true,
                ),
                activeTabId:
                    strip.activeTabId !== null && goneIds.has(strip.activeTabId)
                        ? (tabs[0]?.id ?? null)
                        : strip.activeTabId,
            };
        })
        .filter((strip) => strip.tabs.length > 0);

    if (strips.length === 0) return null;

    const covered = new Set(strips.flatMap((strip) => strip.tabs.map((tab) => tab.pageId)));
    const orphans = current.strips
        .flatMap((strip) => strip.tabs)
        .filter((tab) => !covered.has(tab.pageId));
    const keptPageIds: string[] = [];
    const first = strips[0];
    if (first !== undefined && orphans.length > 0) {
        const taken = new Set(strips.flatMap((strip) => strip.tabs.map((tab) => tab.id)));
        const appended = orphans.map((tab, index) => {
            let id = tab.id;
            let n = 1;
            while (taken.has(id)) id = `${tab.id}-restored-${index + 1}-${n++}`;
            taken.add(id);
            keptPageIds.push(tab.pageId);
            return id === tab.id ? tab : { ...tab, id };
        });
        strips = [
            {
                ...first,
                tabs: [...first.tabs, ...appended],
                slots: [
                    ...first.slots,
                    ...appended.map((tab) => ({ kind: "tab" as const, tabId: tab.id })),
                ],
            },
            ...strips.slice(1),
        ];
    }

    const ids = strips.map((strip) => strip.id);
    const dock = layout.dock !== null && layoutMatchesStrips(layout.dock, ids) ? layout.dock : null;
    const active = strips[0];
    return {
        workspace: {
            strips: strips.map((strip, index) =>
                index === 0 && active !== undefined && strip.activeTabId === null && strip.tabs[0]
                    ? setActiveTab(strip, strip.tabs[0].id)
                    : strip,
            ),
        },
        dock,
        droppedPageIds,
        keptPageIds,
    };
}
