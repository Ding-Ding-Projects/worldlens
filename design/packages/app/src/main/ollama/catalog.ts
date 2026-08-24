import type { OllamaClient, OllamaModelTag, OllamaPage } from "./client.js";

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
