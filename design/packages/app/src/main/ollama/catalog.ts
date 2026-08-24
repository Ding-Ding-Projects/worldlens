import type { OllamaClient, OllamaModelTag, OllamaPage } from "./client.js";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteTextFile } from "../storage/atomicReplace.js";

export interface OllamaCatalogVariant extends OllamaModelTag {
    readonly family: string | null;
    readonly capabilities: readonly string[];
    readonly quantization: string | null;
    readonly parameterSize: string | null;
    readonly catalogSource: string;
}

export interface OllamaCatalogSnapshot {
    readonly version: 1;
    readonly variants: readonly OllamaCatalogVariant[];
    readonly fetchedAt: string;
    readonly pages: number;
    readonly complete: boolean;
    readonly revision: string | null;
    readonly stale: boolean;
    readonly source: string;
}

export interface OllamaCatalogSource { readonly fetchPage: (cursor: string | null) => Promise<OllamaPage<OllamaCatalogVariant>>; }

export const OFFICIAL_OLLAMA_CATALOG_URL = "https://ollama.com/api/library";
const MAX_OFFICIAL_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_OFFICIAL_PAGES = 200;

interface OfficialPage { readonly models?: readonly { readonly name?: string; readonly description?: string; readonly capabilities?: readonly string[]; readonly tags?: readonly { readonly tag?: string; readonly size?: number; readonly context?: number; readonly quantization?: string }[] }[]; readonly nextPage?: string | null; readonly revision?: string | null; }

async function officialPage(url: string, signal?: AbortSignal): Promise<OllamaPage<OllamaCatalogVariant>> {
    const response = await fetch(url, { redirect: "error", signal: signal ?? AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Official Ollama catalog returned HTTP ${response.status}.`);
    const bytes = Number(response.headers.get("content-length") ?? 0); if (bytes > MAX_OFFICIAL_PAGE_BYTES) throw new Error("Official Ollama catalog page exceeded the safety limit.");
    const body = await response.text(); if (body.length > MAX_OFFICIAL_PAGE_BYTES) throw new Error("Official Ollama catalog page exceeded the safety limit.");
    const page = JSON.parse(body) as OfficialPage;
    const items: OllamaCatalogVariant[] = [];
    for (const model of page.models ?? []) if (typeof model.name === "string" && model.name.length > 0) for (const tag of model.tags ?? []) if (typeof tag.tag === "string" && tag.tag.length > 0) items.push({ name: `${model.name}:${tag.tag}`, ...(typeof tag.size === "number" ? { size: tag.size } : {}), family: model.name, capabilities: model.capabilities ?? [], quantization: tag.quantization ?? null, parameterSize: null, catalogSource: OFFICIAL_OLLAMA_CATALOG_URL });
    return { items, next: typeof page.nextPage === "string" && page.nextPage.length > 0 ? page.nextPage : null, revision: page.revision ?? response.headers.get("etag") };
}

export async function refreshOfficialCatalog(dataDir: string, signal?: AbortSignal): Promise<OllamaCatalogSnapshot> {
    const source: OllamaCatalogSource = { fetchPage: (cursor) => officialPage(cursor ?? OFFICIAL_OLLAMA_CATALOG_URL, signal) };
    const snapshot = await fetchExhaustiveCatalog(source);
    await mkdir(join(dataDir, "ollama"), { recursive: true });
    await atomicWriteTextFile(join(dataDir, "ollama", "catalog.json"), JSON.stringify(snapshot, null, 2));
    return snapshot;
}

export async function writeCatalogCache(dataDir: string, snapshot: OllamaCatalogSnapshot): Promise<void> {
    await mkdir(join(dataDir, "ollama"), { recursive: true });
    await atomicWriteTextFile(join(dataDir, "ollama", "catalog.json"), JSON.stringify(snapshot, null, 2));
}

export async function readCatalogCache(dataDir: string, staleAfterMs = 24 * 60 * 60 * 1000): Promise<OllamaCatalogSnapshot | null> {
    try { const snapshot = JSON.parse(await readFile(join(dataDir, "ollama", "catalog.json"), "utf8")) as OllamaCatalogSnapshot; return markCatalogStale(snapshot, staleAfterMs); } catch { return null; }
}

/** Exhaustive page walk. It refuses to call a curated one-page fallback complete. */
export async function fetchExhaustiveCatalog(source: OllamaCatalogSource, now = () => new Date().toISOString()): Promise<OllamaCatalogSnapshot> {
    const variants: OllamaCatalogVariant[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let revision: string | null = null;
    while (true) {
        const page = await source.fetchPage(cursor);
        pages += 1;
        variants.push(...page.items);
        revision ??= page.revision;
        if (page.next === null) break;
        if (pages > 10_000) throw new Error("Ollama catalog pagination exceeded the safety limit.");
        cursor = page.next;
    }
    return { version: 1, variants, fetchedAt: now(), pages, complete: true, revision, stale: false, source: "official catalog pagination" };
}

export function mergeInstalledTags(snapshot: OllamaCatalogSnapshot, installed: readonly OllamaModelTag[], now = () => new Date().toISOString()): OllamaCatalogSnapshot {
    const seen = new Set(snapshot.variants.map((item) => item.name));
    const extra = installed.filter((item) => !seen.has(item.name)).map((item) => ({ ...item, family: null, capabilities: [], quantization: null, parameterSize: null, catalogSource: "local Ollama tags" }));
    return { ...snapshot, variants: [...snapshot.variants, ...extra], fetchedAt: now(), stale: false };
}

export function markCatalogStale(snapshot: OllamaCatalogSnapshot, staleAfterMs: number, now = Date.now()): OllamaCatalogSnapshot {
    return { ...snapshot, stale: now - Date.parse(snapshot.fetchedAt) > staleAfterMs };
}

export async function refreshInstalledState(client: OllamaClient): Promise<readonly OllamaModelTag[]> {
    const answer = await client.tags();
    return Array.isArray(answer.models) ? answer.models : [];
}

export const OLLAMA_CATALOG_COMPLETENESS = [
    "all-pages-followed",
    "variant-level-records",
    "installed-tags-merged",
    "revision-and-timestamp",
    "stale-and-offline-state",
] as const;

export function assertCatalogCompleteness(inventory: readonly string[] = OLLAMA_CATALOG_COMPLETENESS): void {
    const actual = new Set(inventory);
    for (const item of OLLAMA_CATALOG_COMPLETENESS) if (!actual.has(item)) throw new Error(`Ollama catalog completeness is missing ${item}.`);
}
