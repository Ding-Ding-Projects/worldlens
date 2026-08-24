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
    readonly completenessReason?: string;
}

export interface OllamaCatalogSource { readonly fetchPage: (cursor: string | null) => Promise<OllamaPage<OllamaCatalogVariant>>; }

/** Official documented tags endpoint. It reports tags available to this Ollama service, not an undocumented library scrape. */
export const OFFICIAL_OLLAMA_CATALOG_URL = "https://ollama.com/api/tags";
const MAX_OFFICIAL_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_OFFICIAL_PAGES = 200;
const MAX_CATALOG_VARIANTS = 100_000;

interface OfficialPage { readonly models?: readonly { readonly name?: string; readonly size?: number; readonly details?: { readonly family?: string; readonly parameter_size?: string; readonly quantization_level?: string }; }[]; }

async function officialPage(url: string, signal?: AbortSignal): Promise<OllamaPage<OllamaCatalogVariant>> {
    const response = await fetch(url, { redirect: "error", signal: signal ?? AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Official Ollama catalog returned HTTP ${response.status}.`);
    const bytes = Number(response.headers.get("content-length") ?? 0); if (bytes > MAX_OFFICIAL_PAGE_BYTES) throw new Error("Official Ollama catalog page exceeded the safety limit.");
    const body = await response.text(); if (body.length > MAX_OFFICIAL_PAGE_BYTES) throw new Error("Official Ollama catalog page exceeded the safety limit.");
    const page = JSON.parse(body) as OfficialPage;
    const items: OllamaCatalogVariant[] = [];
    for (const model of page.models ?? []) {
        if (typeof model.name !== "string" || model.name.length === 0 || model.name.length > 256) continue;
        const family = model.details?.family ?? null;
        items.push({ name: model.name, ...(typeof model.size === "number" ? { size: model.size } : {}), family, capabilities: [], quantization: model.details?.quantization_level ?? null, parameterSize: model.details?.parameter_size ?? null, catalogSource: OFFICIAL_OLLAMA_CATALOG_URL });
    }
    return { items, next: null, revision: response.headers.get("etag") };
}

export async function refreshOfficialCatalog(dataDir: string, signal?: AbortSignal): Promise<OllamaCatalogSnapshot> {
    const page = await officialPage(OFFICIAL_OLLAMA_CATALOG_URL, signal);
    const snapshot: OllamaCatalogSnapshot = { version: 1, variants: page.items, fetchedAt: new Date().toISOString(), pages: 1, complete: false, revision: page.revision, stale: false, source: OFFICIAL_OLLAMA_CATALOG_URL, completenessReason: "The documented /api/tags endpoint reports service-visible tags. Ollama does not document an exhaustive public library pagination endpoint, so this snapshot is never presented as the whole library." };
    await mkdir(join(dataDir, "ollama"), { recursive: true });
    await atomicWriteTextFile(join(dataDir, "ollama", "catalog.json"), JSON.stringify(snapshot, null, 2));
    return snapshot;
}

export async function writeCatalogCache(dataDir: string, snapshot: OllamaCatalogSnapshot): Promise<void> {
    await mkdir(join(dataDir, "ollama"), { recursive: true });
    await atomicWriteTextFile(join(dataDir, "ollama", "catalog.json"), JSON.stringify(snapshot, null, 2));
}

export async function readCatalogCache(dataDir: string, staleAfterMs = 24 * 60 * 60 * 1000): Promise<OllamaCatalogSnapshot | null> {
    try {
        const snapshot = JSON.parse(await readFile(join(dataDir, "ollama", "catalog.json"), "utf8")) as OllamaCatalogSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.variants) || snapshot.variants.length > MAX_CATALOG_VARIANTS || typeof snapshot.fetchedAt !== "string" || typeof snapshot.pages !== "number" || typeof snapshot.complete !== "boolean" || typeof snapshot.source !== "string") return null;
        return markCatalogStale(snapshot, staleAfterMs);
    } catch { return null; }
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
        if (page.items.length > MAX_CATALOG_VARIANTS || variants.length + page.items.length > MAX_CATALOG_VARIANTS) throw new Error("Ollama catalog variant count exceeded the safety limit.");
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
    return { ...snapshot, variants: [...snapshot.variants, ...extra], stale: snapshot.stale };
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
