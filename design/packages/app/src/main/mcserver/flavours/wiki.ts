import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWriteTextFile } from "../../storage/atomicReplace.js";
import type { WikiArticleState } from "./catalogue.js";

function wikiUrlFor(version: string): string | null {
    const game = version.split("#", 1)[0]?.trim() ?? "";
    if (game === "" || !/^[A-Za-z0-9._-]+$/.test(game)) return null;
    const title = /^\d+\.\d+(\.\d+)?$/.test(game) ? `Java_Edition_${game}` : game;
    return `https://minecraft.wiki/w/${encodeURIComponent(title)}`;
}

export type WikiFetch = (
    url: string,
    method: "HEAD" | "GET",
    signal: AbortSignal,
) => Promise<{ status: number; body?: string }>;

export interface WikiVerificationRecord {
    readonly url: string;
    readonly state: WikiArticleState;
    readonly checkedAt: string;
}

const FILE = "mcserver-wiki-verification.v1.json";
const SHAPE = 1;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;
export const WIKI_VERIFIED_TTL_MS = 24 * 60 * 60 * 1000;
export const WIKI_UNVERIFIED_TTL_MS = 10 * 60 * 1000;

function cacheFile(dataDir: string): string {
    return join(dataDir, FILE);
}

function iso(value: unknown): value is string {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}

async function defaultFetch(
    url: string,
    method: "HEAD" | "GET",
    signal: AbortSignal,
): Promise<{ status: number; body?: string }> {
    const response = await globalThis.fetch(url, {
        method,
        redirect: "error",
        headers: { accept: "text/html,application/xhtml+xml" },
        signal,
    });
    if (method === "HEAD") return { status: response.status };
    if (response.body === null) return { status: response.status, body: await response.text() };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > MAX_BODY_BYTES) {
            await reader.cancel();
            throw new Error("Wiki response exceeded the bounded verification body.");
        }
        chunks.push(next.value);
    }
    return {
        status: response.status,
        body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"),
    };
}

async function readCache(dataDir: string): Promise<Map<string, WikiVerificationRecord>> {
    try {
        const bytes = await readFile(cacheFile(dataDir));
        if (bytes.byteLength > MAX_CACHE_BYTES) return new Map();
        const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
            return new Map();
        const body = parsed as { shape?: unknown; records?: unknown };
        if (body.shape !== SHAPE || !Array.isArray(body.records)) return new Map();
        const records = new Map<string, WikiVerificationRecord>();
        for (const raw of body.records) {
            if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return new Map();
            const record = raw as Record<string, unknown>;
            if (typeof record.url !== "string" || !record.url.startsWith("https://minecraft.wiki/"))
                return new Map();
            if (
                record.state !== "verified" &&
                record.state !== "unavailable" &&
                record.state !== "offline-unverified"
            )
                return new Map();
            if (!iso(record.checkedAt)) return new Map();
            records.set(record.url, record as unknown as WikiVerificationRecord);
        }
        return records;
    } catch {
        return new Map();
    }
}

async function writeCache(
    dataDir: string,
    records: Map<string, WikiVerificationRecord>,
): Promise<void> {
    const file = cacheFile(dataDir);
    await mkdir(dirname(file), { recursive: true });
    await atomicWriteTextFile(
        file,
        `${JSON.stringify({ shape: SHAPE, records: [...records.values()] }, null, 2)}\n`,
    );
}

function stateForStatus(status: number): WikiArticleState {
    if (status === 403 || status === 429 || status === 408) return "offline-unverified";
    if (status === 404 || status === 410) return "unavailable";
    return status >= 200 && status < 400 ? "verified" : "offline-unverified";
}

export async function verifyWikiArticle(options: {
    readonly dataDir: string;
    readonly version: string;
    readonly now?: () => string;
    readonly fetch?: WikiFetch;
}): Promise<WikiVerificationRecord> {
    const url = wikiUrlFor(options.version);
    const now = options.now ?? (() => new Date().toISOString());
    if (url === null) return { url: "", state: "unavailable", checkedAt: now() };
    const records = await readCache(options.dataDir);
    const existing = records.get(url);
    if (existing !== undefined) {
        const age = Date.parse(now()) - Date.parse(existing.checkedAt);
        const ttl = existing.state === "verified" ? WIKI_VERIFIED_TTL_MS : WIKI_UNVERIFIED_TTL_MS;
        if (Number.isFinite(age) && age >= 0 && age < ttl) return existing;
        records.delete(url);
    }
    const fetcher = options.fetch ?? defaultFetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let state: WikiArticleState = "offline-unverified";
    try {
        let response = await fetcher(url, "HEAD", controller.signal);
        if (response.status === 405 || response.status === 501)
            response = await fetcher(url, "GET", controller.signal);
        state = stateForStatus(response.status);
    } catch {
        state = "offline-unverified";
    } finally {
        clearTimeout(timer);
    }
    const record = { url, state, checkedAt: now() } satisfies WikiVerificationRecord;
    records.set(url, record);
    await writeCache(options.dataDir, records);
    return record;
}
