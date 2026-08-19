import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const VOCABULARY_FILE = "personal-vocabulary.json";
const CACHE_VERSION = 1;
const MAX_BYTES = 262_144;
const MAX_ENTRIES = 4_096;
const MAX_KEY = 160;
const MAX_VALUE = 1_000;
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/u;
const UNSAFE = new Set(["__proto__", "prototype", "constructor"]);

export type VocabularyStatus = "no-file" | "loaded" | "cache-unreadable";
export interface VocabularyCacheMetadata {
    readonly revision: number;
    readonly sourceDigest: string;
    readonly loadedAt: string;
}
export interface VocabularySnapshot {
    readonly status: VocabularyStatus;
    readonly entries: Readonly<Record<string, string>>;
    readonly metadata?: VocabularyCacheMetadata;
}
export interface VocabularyResult extends VocabularySnapshot {
    readonly ok: boolean;
    readonly reason?: string;
}

function empty(status: VocabularyStatus): VocabularySnapshot {
    return { status, entries: Object.create(null) as Record<string, string> };
}

function digest(raw: string): string {
    return createHash("sha256").update(raw, "utf8").digest("hex");
}

function validMetadata(value: unknown): value is VocabularyCacheMetadata {
    if (value === null || typeof value !== "object") return false;
    const metadata = value as Partial<VocabularyCacheMetadata>;
    return Number.isSafeInteger(metadata.revision) && metadata.revision > 0 && metadata.revision <= 1_000_000_000
        && typeof metadata.sourceDigest === "string" && /^[a-f0-9]{64}$/u.test(metadata.sourceDigest)
        && typeof metadata.loadedAt === "string" && Number.isFinite(Date.parse(metadata.loadedAt));
}

function validate(raw: string): { ok: true; entries: Record<string, string> } | { ok: false; reason: string } {
    if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) return { ok: false, reason: "too-large" };
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return { ok: false, reason: "malformed-json" }; }
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "not-an-object" };
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== "schemaVersion" && key !== "entries")) return { ok: false, reason: "unexpected-field" };
    if (record.schemaVersion !== 1) return { ok: false, reason: "unknown-schema-version" };
    if (record.entries === null || typeof record.entries !== "object" || Array.isArray(record.entries)) return { ok: false, reason: "entries-not-an-object" };
    const entries = record.entries as Record<string, unknown>;
    const keys = Object.keys(entries);
    if (keys.length > MAX_ENTRIES) return { ok: false, reason: "too-many-entries" };
    const output = Object.create(null) as Record<string, string>;
    for (const key of keys) {
        const replacement = entries[key];
        if (UNSAFE.has(key)) return { ok: false, reason: "unsafe-key" };
        if (key.length === 0) return { ok: false, reason: "empty-key" };
        if (key.length > MAX_KEY) return { ok: false, reason: "key-too-long" };
        if (CONTROL.test(key) || typeof replacement !== "string") return { ok: false, reason: typeof replacement === "string" ? "control-character" : "value-not-a-string" };
        if (replacement.length > MAX_VALUE) return { ok: false, reason: "value-too-long" };
        if (CONTROL.test(replacement)) return { ok: false, reason: "control-character" };
        output[key] = replacement;
    }
    return { ok: true, entries: output };
}

export class VocabularyStore {
    private readonly filePath: string;
    constructor(applicationDataDirectory: string) {
        this.filePath = path.join(applicationDataDirectory, VOCABULARY_FILE);
    }

    async read(): Promise<VocabularySnapshot> {
        try {
            const raw = await fs.readFile(this.filePath, "utf8");
            const envelope = JSON.parse(raw) as { cacheVersion?: number; payload?: string; metadata?: VocabularyCacheMetadata };
            if (envelope.cacheVersion !== CACHE_VERSION || typeof envelope.payload !== "string" || !validMetadata(envelope.metadata)) return empty("cache-unreadable");
            const result = validate(envelope.payload);
            return result.ok ? { status: "loaded", entries: result.entries, metadata: envelope.metadata } : empty("cache-unreadable");
        } catch (error) {
            return (error as NodeJS.ErrnoException)?.code === "ENOENT" ? empty("no-file") : empty("cache-unreadable");
        }
    }

    async load(raw: unknown): Promise<VocabularyResult> {
        if (typeof raw !== "string") return { ...empty("no-file"), ok: false, reason: "read-failed" };
        const result = validate(raw);
        if (!result.ok) return { ...empty("no-file"), ok: false, reason: result.reason };
        try {
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            const temporary = `${this.filePath}.${randomUUID()}.tmp`;
            const previous = await this.read();
            const metadata: VocabularyCacheMetadata = {
                revision: (previous.metadata?.revision ?? 0) + 1,
                sourceDigest: digest(raw),
                loadedAt: new Date().toISOString(),
            };
            await fs.writeFile(temporary, JSON.stringify({ cacheVersion: CACHE_VERSION, payload: JSON.stringify({ schemaVersion: 1, entries: result.entries }), metadata }), "utf8");
            await fs.rename(temporary, this.filePath);
            return { ok: true, status: "loaded", entries: result.entries, metadata };
        } catch {
            const previous = await this.read();
            return { ...previous, ok: false, reason: "write-failed" };
        }
    }

    async clear(): Promise<VocabularyResult> {
        try { await fs.rm(this.filePath, { force: true }); } catch { return { ...empty("cache-unreadable"), ok: false, reason: "clear-failed" }; }
        return { ok: true, ...empty("no-file") };
    }
}
