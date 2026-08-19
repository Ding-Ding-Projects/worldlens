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
    readonly storageWarning?: string;
}

type HistoryEnvelope = { readonly version: 1; readonly records: readonly ConsoleHistoryRecord[] };

/** Redact credential-shaped and connection-sensitive material before it reaches storage/export. */
export function redactConsoleText(value: string): string {
    return value
        .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, "[redacted]")
        .replace(/github_pat_[A-Za-z0-9_]{16,}/g, "[redacted]")
        .replace(/([?&](?:password|passwd|token|secret|access_token)=)[^&#\s]*/gi, "$1[redacted]")
        .replace(/(jdbc:[^?\s]+\?[^\s]*)(?:password|passwd|token|secret)=[^&\s]*/gi, "$1[redacted]")
        .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
        .replace(/(Authorization\s*:\s*Bearer\s+)[^\s]+/gi, "$1[redacted]");
}

function redactedLine(line: ConsoleLine): ConsoleLine {
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
            text: { ...annotation.text, fallback: redactConsoleText(annotation.text.fallback) },
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

function parse(raw: string | null): HistoryEnvelope {
    if (raw === null) return { version: 1, records: [] };
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) {
            return { version: 1, records: [] };
        }
        const records = (value as { records?: unknown }).records;
        if (!Array.isArray(records)) return { version: 1, records: [] };
        return {
            version: 1,
            records: records.filter((record): record is ConsoleHistoryRecord => {
                if (!record || typeof record !== "object") return false;
                const candidate = record as Partial<ConsoleHistoryRecord>;
                return candidate.version === 1 && typeof candidate.renderId === "string" && Array.isArray(candidate.lines);
            }),
        };
    } catch {
        return { version: 1, records: [] };
    }
}

export function readConsoleHistory(renderId: string, target: Storage | null = storage()): ConsoleHistoryRecord | null {
    if (target === null) return null;
    try {
        return parse(target.getItem(CONSOLE_HISTORY_KEY)).records.find((record) => record.renderId === renderId) ?? null;
    } catch {
        return null;
    }
}

export function persistConsoleHistory(
    record: Omit<ConsoleHistoryRecord, "version" | "updatedAt"> & Partial<Pick<ConsoleHistoryRecord, "updatedAt">>,
    target: Storage | null = storage(),
): boolean {
    if (target === null || record.renderId === "") return false;
    const redactedLines = record.lines.slice(-CONSOLE_HISTORY_MAX_LINES).map(redactedLine);
    const lineEvictions = Math.max(0, record.lines.length - redactedLines.length);
    const next: ConsoleHistoryRecord = {
        version: 1,
        renderId: record.renderId,
        lines: redactedLines,
        dropped: Math.max(0, Math.trunc(record.dropped)),
        updatedAt: record.updatedAt ?? new Date().toISOString(),
        complete: record.complete && lineEvictions === 0,
        evictedLines: lineEvictions,
        evictedRenders: 0,
        storageWarning: lineEvictions > 0 ? "retention-limit" : undefined,
    };
    try {
        const current = parse(target.getItem(CONSOLE_HISTORY_KEY));
        const records = [next, ...current.records.filter((item) => item.renderId !== next.renderId)].slice(
            0,
            CONSOLE_HISTORY_MAX_RENDERS,
        );
        let envelope: HistoryEnvelope = { version: 1, records };
        const replacingExisting = current.records.some((item) => item.renderId === next.renderId);
        let evictedRenders = Math.max(0, current.records.length + (replacingExisting ? 0 : 1) - records.length);
        let encoded = JSON.stringify(envelope);
        while (encoded.length > CONSOLE_HISTORY_MAX_BYTES && envelope.records.length > 1) {
            envelope = { version: 1, records: envelope.records.slice(0, -1) };
            evictedRenders++;
            encoded = JSON.stringify(envelope);
        }
        if (encoded.length > CONSOLE_HISTORY_MAX_BYTES && envelope.records.length === 1) {
            const only = envelope.records[0];
            if (only === undefined) return false;
            let lines = only.lines;
            let evictedLines = only.evictedLines ?? 0;
            while (encoded.length > CONSOLE_HISTORY_MAX_BYTES && lines.length > 0) {
                const keep = Math.max(0, Math.floor(lines.length * 0.8));
                evictedLines += lines.length - keep;
                lines = lines.slice(-keep);
                envelope = {
                    version: 1,
                    records: [{ ...only, lines, complete: false, evictedLines, storageWarning: "storage-limit" }],
                };
                encoded = JSON.stringify(envelope);
            }
            if (encoded.length > CONSOLE_HISTORY_MAX_BYTES) return false;
        }
        const first = envelope.records[0];
        if (first !== undefined && (evictedRenders > 0 || (first.evictedLines ?? 0) > 0)) {
            envelope = {
                version: 1,
                records: [
                    { ...first, complete: false, evictedRenders, storageWarning: first.storageWarning ?? "retention-limit" },
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

export function clearConsoleHistory(renderId: string, target: Storage | null = storage()): boolean {
    if (target === null) return false;
    try {
        const envelope = parse(target.getItem(CONSOLE_HISTORY_KEY));
        const encoded = JSON.stringify({ version: 1, records: envelope.records.filter((record) => record.renderId !== renderId) });
        target.setItem(`${CONSOLE_HISTORY_KEY}.tmp`, encoded);
        target.setItem(CONSOLE_HISTORY_KEY, encoded);
        target.removeItem(`${CONSOLE_HISTORY_KEY}.tmp`);
        return true;
    } catch {
        return false;
    }
}
