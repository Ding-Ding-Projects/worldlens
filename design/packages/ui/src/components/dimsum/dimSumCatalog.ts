/**
 * The dim sum catalog: names and photo URLs, resolved from the public dish repository.
 *
 * This module never bundles a single photo and never invents a dish. The shared instructions
 * are explicit that agents must not generate or vendor dim sum photos into a consumer
 * repository - the one canonical public source is `Ding-Ding-Projects/dim-sum-photos`, whose
 * `catalog/index.json` names the dishes and whose `catalog-v1*` release assets carry the
 * actual pictures. So the whole job here is: fetch that JSON with a bounded timeout, cache the
 * last good answer in `localStorage` so an offline second launch still has something to draw
 * from, and when neither is available, say so honestly rather than making something up.
 *
 * The catalog's exact JSON shape is intentionally read defensively. It is a repository this
 * project does not own, so a dish record is accepted whenever it carries the fields a startup
 * surprise actually needs (an id, a bilingual name, and optionally an image URL) and skipped
 * otherwise, instead of the whole fetch failing over one dish missing a field.
 */

const CATALOG_URL = "https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json";

const CACHE_KEY = "worldlens.dimsum.catalog.v1";

/** A fetch this slow is a fetch that has no business blocking a startup surprise. */
const FETCH_TIMEOUT_MS = 4000;

export interface DimSumDish {
    readonly id: string;
    readonly nameEn: string;
    readonly nameZhHant: string;
    /** Null when the catalog carried no usable image for this dish. */
    readonly imageUrl: string | null;
}

interface RawCatalogEntry {
    readonly id?: unknown;
    readonly slug?: unknown;
    readonly name?: { readonly en?: unknown; readonly zhHant?: unknown } | unknown;
    readonly nameEn?: unknown;
    readonly nameZhHant?: unknown;
    readonly image?: unknown;
    readonly imageUrl?: unknown;
    readonly photoUrl?: unknown;
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Reads one catalog entry defensively against the handful of shapes a JSON index like this
 * plausibly takes (`name: {en, zhHant}` versus flat `nameEn`/`nameZhHant`; `image` versus
 * `imageUrl`/`photoUrl`). Returns null rather than throwing when the entry cannot supply at
 * least an id and both names - a dish with no name is not a dish this surprise can show.
 */
function parseEntry(entry: unknown): DimSumDish | null {
    if (entry === null || typeof entry !== "object") return null;
    const raw = entry as RawCatalogEntry;
    const id = asString(raw.id) ?? asString(raw.slug);
    const nested = raw.name !== null && typeof raw.name === "object" ? (raw.name as Record<string, unknown>) : null;
    const nameEn = asString(raw.nameEn) ?? asString(nested?.en);
    const nameZhHant = asString(raw.nameZhHant) ?? asString(nested?.zhHant);
    if (id === null || nameEn === null || nameZhHant === null) return null;
    const imageUrl = asString(raw.imageUrl) ?? asString(raw.photoUrl) ?? asString(raw.image);
    return { id, nameEn, nameZhHant, imageUrl };
}

function parseCatalog(payload: unknown): readonly DimSumDish[] {
    const list: readonly unknown[] = Array.isArray(payload)
        ? payload
        : payload !== null && typeof payload === "object" && Array.isArray((payload as { dishes?: unknown }).dishes)
          ? ((payload as { dishes: readonly unknown[] }).dishes)
          : [];
    const dishes: DimSumDish[] = [];
    for (const entry of list) {
        const parsed = parseEntry(entry);
        if (parsed !== null) dishes.push(parsed);
    }
    return dishes;
}

function readCache(): readonly DimSumDish[] {
    try {
        const raw = globalThis.localStorage?.getItem(CACHE_KEY) ?? null;
        if (raw === null) return [];
        const parsed: unknown = JSON.parse(raw);
        return parseCatalog(parsed);
    } catch {
        return [];
    }
}

function writeCache(payload: unknown): void {
    try {
        globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
        // A full or unavailable localStorage is not a reason to fail the fetch that just
        // succeeded; the dishes are still usable for this one launch.
    }
}

/**
 * Resolves the dish catalog for this launch: try the public source with a bounded timeout,
 * fall back to the last cached good answer, and return an empty list (never a fabricated
 * dish) when neither is available. The empty case is a normal, expected outcome for an
 * offline machine and is handled by the caller as "nothing to show tonight."
 */
export async function resolveDimSumCatalog(fetchImpl: typeof fetch = fetch): Promise<readonly DimSumDish[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetchImpl(CATALOG_URL, { signal: controller.signal });
        if (!response.ok) return readCache();
        const payload: unknown = await response.json();
        const dishes = parseCatalog(payload);
        if (dishes.length === 0) return readCache();
        writeCache(payload);
        return dishes;
    } catch {
        return readCache();
    } finally {
        clearTimeout(timer);
    }
}
