import { validateVocabularyPayload } from "@worldlens/shared/vocabulary";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const VOCABULARY_FILE = "personal-vocabulary.json";
const CACHE_VERSION = 1;

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
    return Number.isSafeInteger(metadata.revision) && metadata.revision !== undefined && metadata.revision > 0 && metadata.revision <= 1_000_000_000
        && typeof metadata.sourceDigest === "string" && /^[a-f0-9]{64}$/u.test(metadata.sourceDigest)
        && typeof metadata.loadedAt === "string" && Number.isFinite(Date.parse(metadata.loadedAt));
}

function validate(raw: string) {
    const result = validateVocabularyPayload(raw);
    return result.ok ? { ok: true as const, entries: result.payload.entries } : result;
}

export class VocabularyStore {
    private readonly filePath: string;
    private pending: Promise<unknown> = Promise.resolve();
    constructor(applicationDataDirectory: string) {
        this.filePath = path.join(applicationDataDirectory, VOCABULARY_FILE);
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.pending.then(operation, operation);
        this.pending = result.then(() => undefined, () => undefined);
        return result;
    }

    read(): Promise<VocabularySnapshot> {
        return this.enqueue(() => this.readNow());
    }

    private async readNow(): Promise<VocabularySnapshot> {
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

    load(raw: unknown): Promise<VocabularyResult> {
        return this.enqueue(() => this.loadNow(raw));
    }

    private async loadNow(raw: unknown): Promise<VocabularyResult> {
        if (typeof raw !== "string") return { ...await this.readNow(), ok: false, reason: "read-failed" };
        const result = validate(raw);
        if (!result.ok) return { ...await this.readNow(), ok: false, reason: result.reason };
        const temporary = `${this.filePath}.${randomUUID()}.tmp`;
        try {
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            const previous = await this.readNow();
            const metadata: VocabularyCacheMetadata = {
                revision: (previous.metadata?.revision ?? 0) + 1,
                sourceDigest: digest(raw),
                loadedAt: new Date().toISOString(),
            };
            await fs.writeFile(temporary, JSON.stringify({ cacheVersion: CACHE_VERSION, payload: JSON.stringify({ schemaVersion: 1, entries: result.entries }), metadata }), { encoding: "utf8", mode: 0o600, flag: "wx" });
            await fs.rename(temporary, this.filePath);
            return { ok: true, status: "loaded", entries: result.entries, metadata };
        } catch {
            const previous = await this.readNow();
            return { ...previous, ok: false, reason: "write-failed" };
        } finally {
            await fs.rm(temporary, { force: true }).catch(() => undefined);
        }
    }

    clear(): Promise<VocabularyResult> {
        return this.enqueue(() => this.clearNow());
    }

    private async clearNow(): Promise<VocabularyResult> {
        try {
            await fs.rm(this.filePath, { force: true });
        } catch {
            return { ...await this.readNow(), ok: false, reason: "clear-failed" };
        }
        return { ok: true, ...empty("no-file") };
    }
}
