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
    readonly receipts?: readonly { readonly family: string; readonly variants: number; readonly revision: string | null }[];
}

export interface OllamaCatalogSource { readonly fetchPage: (cursor: string | null) => Promise<OllamaPage<OllamaCatalogVariant>>; }

/** Official published inventory. This is the rendered inventory users browse, not a local tags response. */
export const OFFICIAL_OLLAMA_CATALOG_URL = "https://ollama.com/library";
const MAX_OFFICIAL_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_OFFICIAL_PAGES = 500;
const MAX_CATALOG_VARIANTS = 100_000;

interface OfficialPage { readonly items: readonly OllamaCatalogVariant[]; readonly revision: string | null; }

async function boundedText(response: Response): Promise<string> {
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_OFFICIAL_PAGE_BYTES) throw new Error("Official Ollama inventory page exceeded the safety limit.");
    const reader = response.body?.getReader();
    if (!reader) { const text = await response.text(); if (new TextEncoder().encode(text).byteLength > MAX_OFFICIAL_PAGE_BYTES) throw new Error("Official Ollama inventory page exceeded the safety limit."); return text; }
    const decoder = new TextDecoder(); let text = ""; let bytes = 0;
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > MAX_OFFICIAL_PAGE_BYTES) { await reader.cancel().catch(() => undefined); throw new Error("Official Ollama inventory page exceeded the safety limit."); } text += decoder.decode(chunk.value, { stream: true }); }
    return text + decoder.decode();
}

function parseInventoryPage(html: string, source: string, revision: string | null): OfficialPage {
    const items: OllamaCatalogVariant[] = [];
    const seen = new Set<string>();
    const pattern = /href="\/library\/([^"/:]+(?:\/[^"/:]+)*):([^"/]+)"/g;
    for (const match of html.matchAll(pattern)) {
        const name = `${match[1]}:${match[2]}`;
        if (seen.has(name) || name.length > 256) continue;
        seen.add(name);
        items.push({ name, family: match[1] ?? null, capabilities: [], quantization: null, parameterSize: null, catalogSource: source });
    }
    return { items, revision };
}

async function officialPage(url: string, signal?: AbortSignal): Promise<OllamaPage<OllamaCatalogVariant>> {
    const response = await fetch(url, { redirect: "error", signal: signal ?? AbortSignal.timeout(15_000), headers: { accept: "text/html" } });
    if (!response.ok) throw new Error(`Official Ollama catalog returned HTTP ${response.status}.`);
    const body = await boundedText(response);
    const page = parseInventoryPage(body, sourceUrl(url), response.headers.get("etag"));
    return { items: page.items, next: null, revision: page.revision };
}

function sourceUrl(url: string): string { return url.startsWith("https://ollama.com/library") ? url : OFFICIAL_OLLAMA_CATALOG_URL; }

export async function refreshOfficialCatalog(dataDir: string, signal?: AbortSignal): Promise<OllamaCatalogSnapshot> {
    const landingResponse = await fetch(OFFICIAL_OLLAMA_CATALOG_URL, { redirect: "error", signal: signal ?? AbortSignal.timeout(15_000), headers: { accept: "text/html" } });
    if (!landingResponse.ok) throw new Error(`Official Ollama inventory returned HTTP ${landingResponse.status}.`);
    const landing = await boundedText(landingResponse);
    const families = [...new Set([...landing.matchAll(/href="\/library\/([^"/:]+(?:\/[^"/:]+)*)"/g)].map((match) => match[1]).filter((family): family is string => typeof family === "string" && !family.endsWith("/tags") && !family.endsWith("/preview") && !family.endsWith("/assets")))];
    if (families.length === 0 || families.length > MAX_OFFICIAL_PAGES) throw new Error("Official Ollama inventory did not provide a bounded family list.");
    const variants: OllamaCatalogVariant[] = []; const revisions: string[] = []; const receipts: { family: string; variants: number; revision: string | null }[] = [];
    for (const family of families) { if (signal?.aborted) throw new Error("Official Ollama inventory refresh was cancelled."); const page = await officialPage(`${OFFICIAL_OLLAMA_CATALOG_URL}/${family}`, signal); if (page.items.length === 0) throw new Error(`Official Ollama inventory family ${family} returned no published tags. Markup drift was refused.`); variants.push(...page.items); receipts.push({ family, variants: page.items.length, revision: page.revision }); if (page.revision) revisions.push(page.revision); if (variants.length > MAX_CATALOG_VARIANTS) throw new Error("Official Ollama inventory variant count exceeded the safety limit."); }
    const snapshot: OllamaCatalogSnapshot = { version: 1, variants: [...new Map(variants.map((item) => [item.name, item])).values()], fetchedAt: new Date().toISOString(), pages: families.length + 1, complete: true, revision: revisions.join(",") || landingResponse.headers.get("etag"), stale: false, source: OFFICIAL_OLLAMA_CATALOG_URL, completenessReason: "Every family page linked by the official published Ollama library inventory was fetched and every published model tag link was recorded.", receipts };
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
        if (snapshot.version !== 1 || !Array.isArray(snapshot.variants) || snapshot.variants.length > MAX_CATALOG_VARIANTS || typeof snapshot.fetchedAt !== "string" || typeof snapshot.pages !== "number" || typeof snapshot.complete !== "boolean" || typeof snapshot.source !== "string" || (snapshot.complete && !Array.isArray(snapshot.receipts))) return null;
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
