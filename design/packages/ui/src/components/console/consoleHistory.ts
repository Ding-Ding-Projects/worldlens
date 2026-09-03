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
    readonly storageWarning?: ConsoleHistoryStorageWarning | null;
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

const SEGMENT_LINES = 512;
const MAX_SEGMENTS_PER_RENDER = Math.ceil(CONSOLE_HISTORY_MAX_LINES / SEGMENT_LINES);
const MAX_RENDER_ID_CHARS = 256;
const SEGMENT_KEY_PREFIX = "worldlens.render-console.segment.v2";
const INDEX_KEY = "worldlens.render-console.index.v2";
const INDEX_TMP_KEY = `${INDEX_KEY}.tmp`;

interface HistoryIndexEntry {
    readonly renderId: string;
    readonly segmentStart: number;
    readonly segmentRevisions: readonly number[];
    readonly segmentCount: number;
    readonly lineCount: number;
    readonly dropped: number;
    readonly updatedAt: string;
    readonly complete: boolean;
    readonly evictedLines: number;
    readonly evictedRenders: number;
    readonly storageWarning: ConsoleHistoryStorageWarning | null;
    /** UTF-8 bytes occupied by this render's segment payloads. */
    readonly bytes: number;
}

interface HistoryIndex {
    readonly version: 2;
    readonly revision: number;
    readonly entries: readonly HistoryIndexEntry[];
}

interface HistorySegment {
    readonly version: 2;
    readonly revision: number;
    readonly renderId: string;
    readonly segment: number;
    readonly lines: readonly ConsoleLine[];
}

function emptyIndex(revision = 0): HistoryIndex {
    return { version: 2, revision, entries: [] };
}

function segmentKey(renderId: string, segment: number, revision = 0): string {
    return `${SEGMENT_KEY_PREFIX}.${encodeURIComponent(renderId)}.${segment}.${revision}`;
}

function segmentTmpKey(renderId: string, segment: number, revision = 0): string {
    return `${segmentKey(renderId, segment, revision)}.tmp`;
}

function parseIndex(raw: string | null): HistoryIndex | null {
    if (raw === null) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object") return null;
        const candidate = value as { version?: unknown; revision?: unknown; entries?: unknown };
        if (candidate.version !== 2 || typeof candidate.revision !== "number" || !Number.isSafeInteger(candidate.revision) || candidate.revision < 0 || !Array.isArray(candidate.entries)) {
            return null;
        }
        if (candidate.entries.length > CONSOLE_HISTORY_MAX_RENDERS) return null;
        const entries: HistoryIndexEntry[] = [];
        const renderIds = new Set<string>();
        for (const entry of candidate.entries) {
            if (!entry || typeof entry !== "object") return null;
            const item = entry as Partial<HistoryIndexEntry>;
            if (!(
                typeof item.renderId === "string" &&
                item.renderId.length > 0 &&
                item.renderId.length <= MAX_RENDER_ID_CHARS &&
                typeof item.segmentStart === "number" && Number.isSafeInteger(item.segmentStart) &&
                item.segmentStart >= 0 &&
                typeof item.segmentCount === "number" && Number.isSafeInteger(item.segmentCount) &&
                item.segmentCount >= 0 &&
                item.segmentCount <= MAX_SEGMENTS_PER_RENDER &&
                Array.isArray(item.segmentRevisions) &&
                item.segmentRevisions.length === item.segmentCount &&
                item.segmentRevisions.every((revision) => Number.isSafeInteger(revision) && revision >= 0) &&
                typeof item.lineCount === "number" && Number.isSafeInteger(item.lineCount) &&
                item.lineCount >= 0 &&
                item.lineCount <= CONSOLE_HISTORY_MAX_LINES &&
                typeof item.dropped === "number" &&
                Number.isSafeInteger(item.dropped) &&
                item.dropped >= 0 &&
                typeof item.updatedAt === "string" &&
                typeof item.complete === "boolean" &&
                typeof item.evictedLines === "number" && Number.isSafeInteger(item.evictedLines) &&
                item.evictedLines >= 0 &&
                typeof item.evictedRenders === "number" && Number.isSafeInteger(item.evictedRenders) &&
                item.evictedRenders >= 0 &&
                (item.storageWarning === null || item.storageWarning === "retention-limit" || item.storageWarning === "storage-limit") &&
                typeof item.bytes === "number" &&
                Number.isSafeInteger(item.bytes) &&
                item.bytes >= 0
            )) return null;
            if (renderIds.has(item.renderId)) return null;
            renderIds.add(item.renderId);
            entries.push(item as HistoryIndexEntry);
        }
        if (utf8Bytes(raw) + entries.reduce((total, entry) => total + entry.bytes, 0) > CONSOLE_HISTORY_MAX_BYTES) return null;
        return { version: 2, revision: candidate.revision, entries };
    } catch {
        return null;
    }
}

function readIndex(target: Storage): HistoryIndex | null {
    const primary = parseIndex(target.getItem(INDEX_KEY));
    const temporary = parseIndex(target.getItem(INDEX_TMP_KEY));
    if (temporary !== null && (primary === null || temporary.revision > primary.revision)) return temporary;
    return primary;
}

/** Legacy v1 envelope reader retained only for the migration fallback. */
function readEnvelope(target: Storage): HistoryEnvelope {
    const primary = parse(target.getItem(CONSOLE_HISTORY_KEY));
    const temporary = parse(target.getItem(`${CONSOLE_HISTORY_KEY}.tmp`));
    return temporary.revision > primary.revision ? temporary : primary;
}

function parseSegment(raw: string | null, renderId: string, segment: number, expectedRevision: number): HistorySegment | null {
    if (raw === null) return null;
    if (utf8Bytes(raw) > CONSOLE_HISTORY_MAX_BYTES) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object") return null;
        const candidate = value as Partial<HistorySegment>;
        if (
            candidate.version !== 2 ||
            candidate.renderId !== renderId ||
            candidate.segment !== segment ||
            candidate.revision !== expectedRevision ||
            typeof candidate.revision !== "number" ||
            !Number.isSafeInteger(candidate.revision) ||
            !Array.isArray(candidate.lines) ||
            candidate.lines.length > SEGMENT_LINES ||
            !candidate.lines.every(isLine)
        ) return null;
        return candidate as HistorySegment;
    } catch {
        return null;
    }
}

function readSegment(target: Storage, renderId: string, segment: number, revision = 0): HistorySegment | null {
    const primary = parseSegment(target.getItem(segmentKey(renderId, segment, revision)), renderId, segment, revision);
    const temporary = parseSegment(target.getItem(segmentTmpKey(renderId, segment, revision)), renderId, segment, revision);
    if (temporary !== null && (primary === null || temporary.revision > primary.revision)) return temporary;
    return primary;
}

function indexBytes(index: HistoryIndex): number {
    return utf8Bytes(JSON.stringify(index));
}

function totalBytes(index: HistoryIndex): number {
    return indexBytes(index) + index.entries.reduce((total, entry) => total + entry.bytes, 0);
}

function writeSegment(target: Storage, segment: HistorySegment): boolean {
    const encoded = JSON.stringify(segment);
    const key = segmentKey(segment.renderId, segment.segment, segment.revision);
    const temporaryKey = segmentTmpKey(segment.renderId, segment.segment, segment.revision);
    target.setItem(temporaryKey, encoded);
    if (target.getItem(temporaryKey) !== encoded) return false;
    target.setItem(key, encoded);
    if (target.getItem(key) !== encoded) return false;
    target.removeItem(temporaryKey);
    return true;
}

function writeIndex(target: Storage, index: HistoryIndex): boolean {
    const encoded = JSON.stringify(index);
    target.setItem(INDEX_TMP_KEY, encoded);
    if (target.getItem(INDEX_TMP_KEY) !== encoded) return false;
    target.setItem(INDEX_KEY, encoded);
    if (target.getItem(INDEX_KEY) !== encoded) return false;
    target.removeItem(INDEX_TMP_KEY);
    return true;
}

interface SegmentDraft {
    readonly renderId: string;
    readonly segment: number;
    readonly lines: readonly ConsoleLine[];
    readonly bytes: number;
}

function entryFromRecord(record: ConsoleHistoryRecord, revision: number): { readonly entry: HistoryIndexEntry; readonly segments: readonly SegmentDraft[] } {
    const lines = record.lines.slice(-CONSOLE_HISTORY_MAX_LINES).map(redactConsoleLine);
    const evictedLines = (record.evictedLines ?? 0) + record.lines.length - lines.length;
    const segments: SegmentDraft[] = [];
    for (let offset = 0; offset < lines.length; offset += SEGMENT_LINES) {
        const segment = Math.floor(offset / SEGMENT_LINES);
        const segmentRecord: HistorySegment = {
            version: 2,
            revision,
            renderId: record.renderId,
            segment,
            lines: lines.slice(offset, offset + SEGMENT_LINES),
        };
        segments.push({ renderId: record.renderId, segment, lines: segmentRecord.lines, bytes: utf8Bytes(JSON.stringify(segmentRecord)) });
    }
    return {
        entry: {
            renderId: record.renderId,
            segmentStart: 0,
            segmentRevisions: segments.map(() => revision),
            segmentCount: segments.length,
            lineCount: lines.length,
            dropped: Math.max(0, Math.trunc(record.dropped)),
            updatedAt: record.updatedAt,
            complete: record.complete && evictedLines === 0,
            evictedLines,
            evictedRenders: Math.max(0, Math.trunc(record.evictedRenders ?? 0)),
            storageWarning: record.storageWarning ?? (evictedLines > 0 ? "retention-limit" : null),
            bytes: segments.reduce((total, item) => total + item.bytes, 0),
        },
        segments,
    };
}

function fitIndexToBudget(index: HistoryIndex, drafts: readonly SegmentDraft[]): { readonly index: HistoryIndex; readonly drafts: readonly SegmentDraft[] } {
    let entries = [...index.entries];
    let keptDrafts = [...drafts];
    let evictedRenders = 0;
    while (entries.length > 1 && totalBytes({ ...index, entries }) > CONSOLE_HISTORY_MAX_BYTES) {
        entries = entries.slice(0, -1);
        keptDrafts = keptDrafts.filter((draft) => entries.some((entry) => entry.renderId === draft.renderId));
        evictedRenders++;
    }
    if (entries.length === 0) return { index: { ...index, entries }, drafts: keptDrafts };

    let first = entries[0];
    if (first === undefined) return { index: { ...index, entries }, drafts: keptDrafts };
    const firstRenderId = first.renderId;
    let firstDrafts = keptDrafts.filter((draft) => draft.renderId === firstRenderId).sort((left, right) => left.segment - right.segment);
    while (firstDrafts.length > 0 && totalBytes({ ...index, entries }) > CONSOLE_HISTORY_MAX_BYTES) {
        const removed = firstDrafts.shift();
        if (removed === undefined) break;
        first = {
            ...first,
            segmentStart: first.segmentStart + 1,
            segmentRevisions: first.segmentRevisions.slice(1),
            segmentCount: firstDrafts.length,
            lineCount: Math.max(0, first.lineCount - removed.lines.length),
            evictedLines: first.evictedLines + removed.lines.length,
            complete: false,
            storageWarning: "storage-limit",
            bytes: Math.max(0, first.bytes - removed.bytes),
        };
        entries = [first, ...entries.slice(1)];
        keptDrafts = [...firstDrafts, ...keptDrafts.filter((draft) => draft.renderId !== firstRenderId)];
    }
    if (evictedRenders > 0) {
        first = { ...first, complete: false, evictedRenders: first.evictedRenders + evictedRenders, storageWarning: first.storageWarning ?? "retention-limit" };
        entries = [first, ...entries.slice(1)];
    }
    return { index: { ...index, entries }, drafts: keptDrafts };
}

function migrateLegacy(target: Storage): HistoryIndex | null {
    const legacy = readEnvelope(target);
    const revision = 1;
    const built = legacy.records.slice(0, CONSOLE_HISTORY_MAX_RENDERS).map((record) => entryFromRecord(record, revision));
    const fitted = fitIndexToBudget(
        { version: 2, revision, entries: built.map((item) => item.entry) },
        built.flatMap((item) => item.segments),
    );
    try {
        for (const draft of fitted.drafts) {
            if (!writeSegment(target, { version: 2, revision, renderId: draft.renderId, segment: draft.segment, lines: draft.lines })) return null;
        }
        if (!writeIndex(target, fitted.index)) return null;
        // The v2 index is now authoritative; dropping the monolithic copy is what
        // makes the 8 MiB bound describe actual storage rather than two generations.
        target.removeItem(CONSOLE_HISTORY_KEY);
        target.removeItem(`${CONSOLE_HISTORY_KEY}.tmp`);
        return fitted.index;
    } catch {
        return null;
    }
}

function ensureIndex(target: Storage): HistoryIndex | null {
    const current = readIndex(target);
    if (current !== null) {
        target.removeItem(CONSOLE_HISTORY_KEY);
        target.removeItem(`${CONSOLE_HISTORY_KEY}.tmp`);
        return current;
    }
    if (target.getItem(CONSOLE_HISTORY_KEY) !== null) return migrateLegacy(target);
    return emptyIndex();
}

function recordFromEntry(target: Storage, entry: HistoryIndexEntry): ConsoleHistoryRecord {
    const lines: ConsoleLine[] = [];
    for (let segment = 0; segment < entry.segmentCount; segment++) {
        const chunk = readSegment(target, entry.renderId, entry.segmentStart + segment, entry.segmentRevisions[segment] ?? 0);
        if (chunk !== null) lines.push(...chunk.lines);
    }
    const missing = Math.max(0, entry.lineCount - lines.length);
    return {
        version: 1,
        renderId: entry.renderId,
        lines,
        dropped: entry.dropped,
        updatedAt: entry.updatedAt,
        complete: entry.complete && missing === 0,
        evictedLines: entry.evictedLines + missing,
        evictedRenders: entry.evictedRenders,
        storageWarning: missing > 0 ? "retention-limit" : entry.storageWarning,
    };
}

function entrySegmentKeys(entry: HistoryIndexEntry): string[] {
    return entry.segmentRevisions.map((revision, offset) => segmentKey(entry.renderId, entry.segmentStart + offset, revision));
}

function readV2Record(target: Storage, renderId: string): ConsoleHistoryRecord | null {
    const index = readIndex(target);
    const entry = index?.entries.find((item) => item.renderId === renderId);
    return entry === undefined ? null : recordFromEntry(target, entry);
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
        const index = readIndex(target);
        if (index !== null) return readV2Record(target, renderId);
        return parse(target.getItem(CONSOLE_HISTORY_KEY)).records.find((record) => record.renderId === renderId) ?? null;
    } catch {
        return null;
    }
}

/** Every retained render, newest first, with retention loss facts intact. */
export function readAllConsoleHistory(target: Storage | null = storage()): readonly ConsoleHistoryRecord[] {
    if (target === null) return [];
    try {
        const index = readIndex(target);
        if (index !== null) return index.entries.map((entry) => recordFromEntry(target, entry));
        return parse(target.getItem(CONSOLE_HISTORY_KEY)).records;
    } catch {
        return [];
    }
}

type ConsoleHistoryInput = Pick<ConsoleHistoryRecord, "renderId" | "lines" | "dropped" | "complete"> &
    Partial<Pick<ConsoleHistoryRecord, "updatedAt" | "evictedLines" | "evictedRenders" | "storageWarning">>;

function persistV2(record: ConsoleHistoryInput, target: Storage): boolean {
    if (record.renderId === "" || record.renderId.length > MAX_RENDER_ID_CHARS) return false;
    const current = ensureIndex(target);
    if (current === null) return false;
    const cleanupKeys: string[] = [];
    const previous = current.entries.find((entry) => entry.renderId === record.renderId);
    const revision = current.revision + 1;
    let entry: HistoryIndexEntry;
    if (previous === undefined) {
        const built = entryFromRecord({
            version: 1,
            renderId: record.renderId,
            lines: record.lines,
            dropped: record.dropped,
            updatedAt: record.updatedAt ?? new Date().toISOString(),
            complete: record.complete,
            evictedLines: record.evictedLines ?? 0,
            evictedRenders: record.evictedRenders ?? 0,
            storageWarning: record.storageWarning ?? null,
        }, revision);
        entry = built.entry;
        for (const draft of built.segments) {
            if (!writeSegment(target, { version: 2, revision, renderId: draft.renderId, segment: draft.segment, lines: draft.lines })) return false;
        }
    } else {
        const lastSegmentNumber = previous.segmentStart + Math.max(0, previous.segmentCount - 1);
        const lastRevision = previous.segmentRevisions.at(-1) ?? 0;
        const last = previous.segmentCount === 0 ? null : readSegment(target, previous.renderId, lastSegmentNumber, lastRevision);
        if (previous.segmentCount > 0 && last === null) return false;
        const lastId = last?.lines.at(-1)?.id ?? -1;
        const suffix = record.lines.filter((line) => line.id > lastId);
        entry = {
            ...previous,
            dropped: Math.max(previous.dropped, Math.max(0, Math.trunc(record.dropped))),
            updatedAt: record.updatedAt ?? previous.updatedAt,
            complete: record.complete && previous.evictedLines === 0,
            storageWarning: record.storageWarning ?? previous.storageWarning,
        };
        for (const sourceLine of suffix) {
            const line = redactConsoleLine(sourceLine);
            const segmentNumber = entry.segmentStart + Math.max(0, entry.segmentCount - 1);
            const existingRevision = entry.segmentRevisions.at(-1) ?? 0;
            const existing = entry.segmentCount === 0 ? null : readSegment(target, entry.renderId, segmentNumber, existingRevision);
            if (entry.segmentCount > 0 && existing === null) return false;
            const lines = existing !== null && existing.lines.length < SEGMENT_LINES ? [...existing.lines, line] : [line];
            const nextSegment = existing !== null && existing.lines.length < SEGMENT_LINES ? segmentNumber : entry.segmentStart + entry.segmentCount;
            const segmentRecord: HistorySegment = { version: 2, revision, renderId: entry.renderId, segment: nextSegment, lines };
            const nextBytes = utf8Bytes(JSON.stringify(segmentRecord));
            if (!writeSegment(target, segmentRecord)) return false;
            if (existing !== null && existingRevision !== revision) cleanupKeys.push(segmentKey(entry.renderId, segmentNumber, existingRevision));
            entry = {
                ...entry,
                segmentRevisions:
                    existing !== null && existing.lines.length < SEGMENT_LINES
                        ? [...entry.segmentRevisions.slice(0, -1), revision]
                        : [...entry.segmentRevisions, revision],
                segmentCount: existing !== null && existing.lines.length < SEGMENT_LINES ? entry.segmentCount : entry.segmentCount + 1,
                lineCount: entry.lineCount + 1,
                bytes: entry.bytes - (existing === null ? 0 : utf8Bytes(JSON.stringify(existing))) + nextBytes,
            };
        }
        while (entry.lineCount > CONSOLE_HISTORY_MAX_LINES && entry.segmentCount > 0) {
            const oldestRevision = entry.segmentRevisions[0] ?? 0;
            const oldest = readSegment(target, entry.renderId, entry.segmentStart, oldestRevision);
            if (oldest === null) return false;
            cleanupKeys.push(segmentKey(entry.renderId, entry.segmentStart, oldestRevision));
            entry = {
                ...entry,
                segmentStart: entry.segmentStart + 1,
                segmentRevisions: entry.segmentRevisions.slice(1),
                segmentCount: entry.segmentCount - 1,
                lineCount: Math.max(0, entry.lineCount - oldest.lines.length),
                evictedLines: entry.evictedLines + oldest.lines.length,
                complete: false,
                storageWarning: "retention-limit",
                bytes: Math.max(0, entry.bytes - utf8Bytes(JSON.stringify(oldest))),
            };
        }
    }
    let nextIndex: HistoryIndex = {
        version: 2,
        revision,
        entries: [entry, ...current.entries.filter((item) => item.renderId !== entry.renderId)].slice(0, CONSOLE_HISTORY_MAX_RENDERS),
    };
    for (const oldEntry of current.entries) {
        if (!nextIndex.entries.some((item) => item.renderId === oldEntry.renderId)) cleanupKeys.push(...entrySegmentKeys(oldEntry));
    }
    let removedRenders = Math.max(0, current.entries.length + (previous === undefined ? 1 : 0) - nextIndex.entries.length);
    while (nextIndex.entries.length > 1 && totalBytes(nextIndex) > CONSOLE_HISTORY_MAX_BYTES) {
        const removed = nextIndex.entries.at(-1);
        if (removed !== undefined) cleanupKeys.push(...entrySegmentKeys(removed));
        nextIndex = { ...nextIndex, entries: nextIndex.entries.slice(0, -1) };
        removedRenders++;
    }
    let first = nextIndex.entries[0];
    while (first !== undefined && nextIndex.entries.length === 1 && totalBytes(nextIndex) > CONSOLE_HISTORY_MAX_BYTES && first.segmentCount > 0) {
        const segmentRevision = first.segmentRevisions[0] ?? 0;
        const segment = readSegment(target, first.renderId, first.segmentStart, segmentRevision);
        if (segment === null) return false;
        cleanupKeys.push(segmentKey(first.renderId, first.segmentStart, segmentRevision));
        first = {
            ...first,
            segmentStart: first.segmentStart + 1,
            segmentCount: first.segmentCount - 1,
            lineCount: Math.max(0, first.lineCount - segment.lines.length),
            evictedLines: first.evictedLines + segment.lines.length,
            complete: false,
            storageWarning: "storage-limit",
            bytes: Math.max(0, first.bytes - utf8Bytes(JSON.stringify(segment))),
        };
        nextIndex = { ...nextIndex, entries: [first] };
    }
    if (first !== undefined && removedRenders > 0) {
        nextIndex = { ...nextIndex, entries: [{ ...first, complete: false, evictedRenders: first.evictedRenders + removedRenders, storageWarning: first.storageWarning ?? "retention-limit" }, ...nextIndex.entries.slice(1)] };
    }
    if (totalBytes(nextIndex) > CONSOLE_HISTORY_MAX_BYTES) return false;
    if (!writeIndex(target, nextIndex)) return false;
    for (const key of cleanupKeys) target.removeItem(key);
    return true;
}

export function persistConsoleHistory(
    record: ConsoleHistoryInput,
    target: Storage | null = storage(),
): boolean {
    if (target === null || record.renderId === "") return false;
    try {
        return persistV2(record, target);
    } catch {
        return false;
    }
}

/** Append one event without making the caller reconstruct the durable record. */
export function appendConsoleHistoryLine(
    renderId: string,
    line: ConsoleLine,
    target: Storage | null = storage(),
): boolean {
    if (target === null || renderId === "") return false;
    try {
        return persistV2(
            { renderId, lines: [line], dropped: 0, complete: false, updatedAt: line.at },
            target,
        );
    } catch {
        return false;
    }
}

export function clearConsoleHistory(renderId: string, target: Storage | null = storage()): boolean {
    if (target === null) return false;
    try {
        const index = readIndex(target);
        if (index !== null) {
            const entry = index.entries.find((item) => item.renderId === renderId);
            if (entry === undefined) return true;
            const next: HistoryIndex = {
                version: 2,
                revision: index.revision + 1,
                entries: index.entries.filter((item) => item.renderId !== renderId),
            };
            if (!writeIndex(target, next)) return false;
            for (let segment = 0; segment < entry.segmentCount; segment++) {
                const revision = entry.segmentRevisions[segment] ?? 0;
                target.removeItem(segmentKey(renderId, entry.segmentStart + segment, revision));
                target.removeItem(segmentTmpKey(renderId, entry.segmentStart + segment, revision));
            }
            return true;
        }
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
