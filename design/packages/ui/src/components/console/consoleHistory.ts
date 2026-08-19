/** Durable, bounded storage for render console output.
 *
 * The visible console is intentionally a ring. This companion store keeps the
 * complete stream outside the component so navigation and a fresh mount do not
 * turn a missing viewport into missing evidence. Writes use a temporary key and
 * a final replace, making a half-written JSON value unreadable rather than
 * silently accepted.
 */
import type { ConsoleLine } from "./consoleModel.js";

export const CONSOLE_HISTORY_VERSION = 1;
export const CONSOLE_HISTORY_KEY = "worldlens.render-console.history.v1";
export const CONSOLE_HISTORY_MAX_RENDERS = 24;
export const CONSOLE_HISTORY_MAX_LINES = 200_000;
export const CONSOLE_HISTORY_MAX_BYTES = 8 * 1024 * 1024;
export type ConsoleHistoryStorageWarning = "retention-limit" | "storage-limit";

export interface ConsoleHistoryRecord {
    readonly version: 1;
    readonly renderId: string;
    readonly lines: readonly ConsoleLine[];
    readonly dropped: number;
    readonly updatedAt: string;
    readonly complete: boolean;
    /** Retention loss is explicit metadata, never silently presented as complete. */
    readonly evictedLines?: number;
    readonly evictedRenders?: number;
    /** Why the record is not complete, or null when every retained line is present. */
    readonly storageWarning: ConsoleHistoryStorageWarning | null;
}

type HistoryEnvelope = {
    readonly version: 1;
    /** Monotonic within this storage key; used to recover a verified interrupted write. */
    readonly revision: number;
    readonly records: readonly ConsoleHistoryRecord[];
};

export interface ConsoleHistoryRetentionFacts {
    readonly keptLines: number;
    readonly droppedLines: number;
    readonly evictedLines: number;
    readonly evictedRenders: number;
    readonly complete: boolean;
    readonly storageWarning: ConsoleHistoryStorageWarning | null;
}

/** Redact credential-shaped and connection-sensitive material before it reaches storage/export. */
export function redactConsoleText(value: string): string {
    return value
        .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, "[redacted]")
        .replace(/github_pat_[A-Za-z0-9_]{16,}/g, "[redacted]")
        .replace(/AKIA[0-9A-Z]{16}/g, "[redacted]")
        .replace(/-----BEGIN [A-Z ]+ KEY-----[\s\S]*?-----END [A-Z ]+ KEY-----/g, "[redacted]")
        .replace(/([?&](?:password|passwd|token|secret|access_token)=)[^&#\s]*/gi, "$1[redacted]")
        .replace(/(jdbc:[^?\s]+\?[^\s]*)(?:password|passwd|token|secret)=[^&\s]*/gi, "$1[redacted]")
        .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
        .replace(/(Authorization\s*:\s*Bearer\s+)[^\s]+/gi, "$1[redacted]")
        // Absolute filesystem paths are useful in the live console but are user-local
        // data in a retained record or export. Keep the fact that a path was printed,
        // without retaining the account name, checkout, or world location.
        .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>]+/g, "[path]")
        .replace(/(?:\/(?:Users|home|tmp|var|private)\/)[^\s"'<>]+/g, "[path]");
}

export function redactConsoleLine(line: ConsoleLine): ConsoleLine {
    return {
        ...line,
        message: redactConsoleText(line.message),
        text:
            line.text === null
                ? null
                : {
                      ...line.text,
                      fallback: redactConsoleText(line.text.fallback),
                      values: Object.fromEntries(
                          Object.entries(line.text.values).map(([key, value]) => [
                              key,
                              typeof value === "string" ? redactConsoleText(value) : value,
                          ]),
                      ),
                  },
        annotations: line.annotations.map((annotation) => ({
            ...annotation,
            text: {
                ...annotation.text,
                fallback: redactConsoleText(annotation.text.fallback),
                values: Object.fromEntries(
                    Object.entries(annotation.text.values).map(([key, value]) => [
                        key,
                        typeof value === "string" ? redactConsoleText(value) : value,
                    ]),
                ),
            },
        })),
    };
}

function storage(): Storage | null {
    try {
        return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
    } catch {
        return null;
    }
}

function emptyEnvelope(revision = 0): HistoryEnvelope {
    return { version: 1, revision, records: [] };
}

function isText(value: unknown): value is { readonly key: string; readonly fallback: string; readonly values: Record<string, string | number> } {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { key?: unknown; fallback?: unknown; values?: unknown };
    if (typeof candidate.key !== "string" || typeof candidate.fallback !== "string" || !candidate.values || typeof candidate.values !== "object") {
        return false;
    }
    return Object.values(candidate.values as Record<string, unknown>).every((item) => typeof item === "string" || typeof item === "number");
}

function isLine(value: unknown): value is ConsoleLine {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<ConsoleLine>;
    if (
        typeof candidate.id !== "number" ||
        !Number.isSafeInteger(candidate.id) ||
        typeof candidate.level !== "string" ||
        typeof candidate.origin !== "string" ||
        typeof candidate.message !== "string" ||
        typeof candidate.at !== "string" ||
        !Array.isArray(candidate.annotations)
    ) {
        return false;
    }
    if (candidate.text !== null && !isText(candidate.text)) return false;
    return candidate.annotations.every((annotation) => {
        if (!annotation || typeof annotation !== "object") return false;
        const item = annotation as { kind?: unknown; tone?: unknown; text?: unknown };
        return typeof item.kind === "string" && typeof item.tone === "string" && isText(item.text);
    });
}

function normaliseRecord(value: unknown): ConsoleHistoryRecord | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<ConsoleHistoryRecord>;
    if (!(
        candidate.version === 1 &&
        typeof candidate.renderId === "string" &&
        Array.isArray(candidate.lines) &&
        candidate.lines.every(isLine) &&
        typeof candidate.dropped === "number" &&
        Number.isSafeInteger(candidate.dropped) &&
        typeof candidate.updatedAt === "string" &&
        typeof candidate.complete === "boolean"
    )) return null;
    const evictedLines = candidate.evictedLines ?? 0;
    const evictedRenders = candidate.evictedRenders ?? 0;
    const storageWarning = candidate.storageWarning ?? (evictedLines > 0 || evictedRenders > 0 ? "retention-limit" : null);
    if (!Number.isSafeInteger(evictedLines) || evictedLines < 0 || !Number.isSafeInteger(evictedRenders) || evictedRenders < 0) return null;
    if (storageWarning !== null && storageWarning !== "retention-limit" && storageWarning !== "storage-limit") return null;
    return { ...candidate, version: 1, evictedLines, evictedRenders, storageWarning } as ConsoleHistoryRecord;
}

function parse(raw: string | null): HistoryEnvelope {
    if (raw === null) return emptyEnvelope();
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) return emptyEnvelope();
        const records = (value as { records?: unknown }).records;
        if (!Array.isArray(records)) return emptyEnvelope();
        const revision = (value as { revision?: unknown }).revision;
        return {
            version: 1,
            revision: typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
            records: records.flatMap((record) => {
                const normalised = normaliseRecord(record);
                return normalised === null ? [] : [normalised];
            }),
        };
    } catch {
        return emptyEnvelope();
    }
}

function utf8Bytes(value: string): number {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).byteLength;
    return encodeURIComponent(value).replace(/%[0-9A-F]{2}/gi, "x").length;
}

function readEnvelope(target: Storage): HistoryEnvelope {
    const primary = parse(target.getItem(CONSOLE_HISTORY_KEY));
    const temporary = parse(target.getItem(`${CONSOLE_HISTORY_KEY}.tmp`));
    return temporary.revision > primary.revision ? temporary : primary;
}

function retentionFacts(record: ConsoleHistoryRecord): ConsoleHistoryRetentionFacts {
    return {
        keptLines: record.lines.length,
        droppedLines: record.dropped,
        evictedLines: record.evictedLines ?? 0,
        evictedRenders: record.evictedRenders ?? 0,
        complete: record.complete,
        storageWarning: record.storageWarning ?? null,
    };
}

export function describeConsoleHistoryRetention(record: ConsoleHistoryRecord): ConsoleHistoryRetentionFacts {
    return retentionFacts(record);
}

export function readConsoleHistory(renderId: string, target: Storage | null = storage()): ConsoleHistoryRecord | null {
    if (target === null) return null;
    try {
        return readEnvelope(target).records.find((record) => record.renderId === renderId) ?? null;
    } catch {
        return null;
    }
}

/** Every retained render, newest first, with retention loss facts intact. */
export function readAllConsoleHistory(target: Storage | null = storage()): readonly ConsoleHistoryRecord[] {
    if (target === null) return [];
    try {
        return readEnvelope(target).records;
    } catch {
        return [];
    }
}

type ConsoleHistoryInput = Pick<ConsoleHistoryRecord, "renderId" | "lines" | "dropped" | "complete"> &
    Partial<Pick<ConsoleHistoryRecord, "updatedAt" | "evictedLines" | "evictedRenders" | "storageWarning">>;

export function persistConsoleHistory(
    record: ConsoleHistoryInput,
    target: Storage | null = storage(),
): boolean {
    if (target === null || record.renderId === "") return false;
    const redactedLines = record.lines.slice(-CONSOLE_HISTORY_MAX_LINES).map(redactConsoleLine);
    const lineEvictions = Math.max(0, record.lines.length - redactedLines.length);
    const next: ConsoleHistoryRecord = {
        version: 1,
        renderId: record.renderId,
        lines: redactedLines,
        dropped: Math.max(0, Math.trunc(record.dropped)),
        updatedAt: record.updatedAt ?? new Date().toISOString(),
        complete: record.complete && lineEvictions === 0,
        evictedLines: Math.max(0, Math.trunc(record.evictedLines ?? 0)) + lineEvictions,
        evictedRenders: Math.max(0, Math.trunc(record.evictedRenders ?? 0)),
        storageWarning: record.storageWarning ?? (lineEvictions > 0 ? "retention-limit" : null),
    };
    try {
        const current = readEnvelope(target);
        const records = [next, ...current.records.filter((item) => item.renderId !== next.renderId)].slice(
            0,
            CONSOLE_HISTORY_MAX_RENDERS,
        );
        let envelope: HistoryEnvelope = { version: 1, revision: current.revision + 1, records };
        const replacingExisting = current.records.some((item) => item.renderId === next.renderId);
        let evictedRenders = Math.max(0, current.records.length + (replacingExisting ? 0 : 1) - records.length);
        let encoded = JSON.stringify(envelope);
        while (utf8Bytes(encoded) > CONSOLE_HISTORY_MAX_BYTES && envelope.records.length > 1) {
            envelope = { version: 1, revision: envelope.revision, records: envelope.records.slice(0, -1) };
            evictedRenders++;
            encoded = JSON.stringify(envelope);
        }
        if (utf8Bytes(encoded) > CONSOLE_HISTORY_MAX_BYTES && envelope.records.length === 1) {
            const only = envelope.records[0];
            if (only === undefined) return false;
            let lines = only.lines;
            const originalEvictions = only.evictedLines ?? 0;
            let low = 0;
            let high = lines.length;
            while (low < high) {
                const keep = Math.ceil((low + high + 1) / 2);
                const candidate = lines.slice(-keep);
                const candidateEnvelope: HistoryEnvelope = {
                    version: 1,
                    revision: envelope.revision,
                    records: [{ ...only, lines: candidate, complete: false, evictedLines: originalEvictions + lines.length - keep, storageWarning: "storage-limit" }],
                };
                if (utf8Bytes(JSON.stringify(candidateEnvelope)) <= CONSOLE_HISTORY_MAX_BYTES) low = keep;
                else high = keep - 1;
            }
            lines = lines.slice(-low);
            envelope = {
                version: 1,
                revision: envelope.revision,
                records: [{ ...only, lines, complete: false, evictedLines: originalEvictions + only.lines.length - low, storageWarning: "storage-limit" }],
            };
            encoded = JSON.stringify(envelope);
            if (utf8Bytes(encoded) > CONSOLE_HISTORY_MAX_BYTES) {
                // A single line can exceed the byte budget on its own. Keep the render
                // metadata and an explicit loss fact rather than refusing the whole record.
                envelope = {
                    version: 1,
                    revision: envelope.revision,
                    records: [{ ...only, lines: [], complete: false, evictedLines: originalEvictions + only.lines.length, storageWarning: "storage-limit" }],
                };
                encoded = JSON.stringify(envelope);
                if (utf8Bytes(encoded) > CONSOLE_HISTORY_MAX_BYTES) return false;
            }
        }
        const first = envelope.records[0];
        if (first !== undefined && (evictedRenders > 0 || (first.evictedLines ?? 0) > 0)) {
            envelope = {
                version: 1,
                revision: envelope.revision,
                records: [
                    {
                        ...first,
                        complete: false,
                        evictedRenders: (first.evictedRenders ?? 0) + evictedRenders,
                        storageWarning: first.storageWarning ?? "retention-limit",
                    },
                    ...envelope.records.slice(1),
                ],
            };
            encoded = JSON.stringify(envelope);
        }
        const temporaryKey = `${CONSOLE_HISTORY_KEY}.tmp`;
        target.setItem(temporaryKey, encoded);
        const written = target.getItem(temporaryKey);
        if (written !== encoded) {
            target.removeItem(temporaryKey);
            return false;
        }
        target.setItem(CONSOLE_HISTORY_KEY, written);
        if (target.getItem(CONSOLE_HISTORY_KEY) !== written) {
            return false;
        }
        target.removeItem(temporaryKey);
        return true;
    } catch {
        try {
            target.removeItem(`${CONSOLE_HISTORY_KEY}.tmp`);
        } catch {
            // Storage refusal is deliberately non-fatal to the render.
        }
        return false;
    }
}

/** Append one event without making the caller reconstruct the durable record. */
export function appendConsoleHistoryLine(
    renderId: string,
    line: ConsoleLine,
    target: Storage | null = storage(),
): boolean {
    if (renderId === "") return false;
    const current = target === null ? null : readConsoleHistory(renderId, target);
    return persistConsoleHistory(
        {
            renderId,
            lines: [...(current?.lines ?? []), line],
            dropped: current?.dropped ?? 0,
            complete: false,
            updatedAt: line.at,
            evictedLines: current?.evictedLines ?? 0,
            evictedRenders: current?.evictedRenders ?? 0,
            storageWarning: current?.storageWarning ?? null,
        },
        target,
    );
}

export function clearConsoleHistory(renderId: string, target: Storage | null = storage()): boolean {
    if (target === null) return false;
    try {
        const envelope = readEnvelope(target);
        const encoded = JSON.stringify({
            version: 1,
            revision: envelope.revision + 1,
            records: envelope.records.filter((record) => record.renderId !== renderId),
        });
        const temporaryKey = `${CONSOLE_HISTORY_KEY}.tmp`;
        target.setItem(temporaryKey, encoded);
        if (target.getItem(temporaryKey) !== encoded) return false;
        target.setItem(CONSOLE_HISTORY_KEY, encoded);
        if (target.getItem(CONSOLE_HISTORY_KEY) !== encoded) return false;
        target.removeItem(temporaryKey);
        return true;
    } catch {
        return false;
    }
}
