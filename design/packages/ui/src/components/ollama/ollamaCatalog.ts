/**
 * The Model Store's catalogue: exhaustive at each refresh, never curated.
 *
 * A complete snapshot is the word doing the work in the task this file exists for. A hand-picked
 * shortlist of a dozen popular models is a different, easier feature, and it is the wrong
 * one: a person who already knows which model they want does not need a store, and a person
 * who does not is exactly the one a curated list fails silently for, because there is no way
 * to tell "we left this out" from "this does not exist". So every refresh walks the official
 * catalogue source to the end, following pagination rather than stopping at a first page, and
 * records the page count and a completeness verdict so a truncated fetch is visible as a
 * truncated fetch and not reported as the whole library.
 *
 * ## Offline is stale, never invented
 *
 * When the network is unavailable, the store keeps showing the last catalogue it verified,
 * marked plainly as stale with the timestamp of the last successful refresh. It never
 * fabricates a plausible-looking new entry: a model this build has never actually confirmed
 * exists must not appear as though it does, because the next step after "Model Store" is
 * usually "download," and downloading something invented is not a recoverable mistake in the
 * same way a stale label is.
 *
 * ## Source of truth
 *
 * This module talks to the official documented Ollama tags endpoint. It is
 * deliberately written so the actual HTTP call is a small, replaceable seam (`fetchPage`)
 * rather than scattered through the refresh logic, because the one thing this file cannot
 * promise on its own is that the upstream endpoint's shape never changes; what it can promise
 * is that a shape change fails one function instead of the whole module.
 */

import type { FetchLike } from "./ollamaApi.js";

/** The official Ollama model library's catalogue API. Overridable for a moved endpoint. */
export const DEFAULT_CATALOG_URL = "https://ollama.com/library";

/** Longest number of pages a single refresh will follow before refusing to keep pulling. */
export const MAX_CATALOG_PAGES = 200;

/** Largest catalogue page this screen will buffer before refusing the refresh. */
export const MAX_CATALOG_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface CatalogTag {
    readonly tag: string;
    /** Bytes, when the catalogue source reports a size for this exact tag. */
    readonly sizeBytes: number | null;
    readonly contextWindow: number | null;
    readonly quantization: string | null;
}

export interface CatalogModel {
    readonly family: string;
    readonly description: string;
    readonly capabilities: readonly string[];
    readonly tags: readonly CatalogTag[];
}

export interface CatalogRevision {
    /** An opaque identity for the fetched data, when the source supplies one (e.g. an ETag). */
    readonly sourceRevision: string | null;
    readonly refreshedAt: string;
    readonly pageCount: number;
    /** True only when every page was followed to a natural end with no page refused. */
    readonly complete: boolean;
    readonly completenessReason?: string | null;
}

export interface OllamaCatalog {
    readonly models: readonly CatalogModel[];
    readonly revision: CatalogRevision;
}

export type CatalogRefreshResult =
    | { readonly ok: true; readonly catalog: OllamaCatalog }
    | {
          readonly ok: false;
          readonly reason: "network" | "malformed" | "oversized" | "aborted" | "truncated";
          readonly message: string;
          /** Whatever was gathered before the refusal, so a partial refresh is not silently thrown away. */
          readonly partial: OllamaCatalog | null;
      };

interface RawCatalogPage {
    readonly models?: readonly RawCatalogModel[];
    readonly nextPage?: string | null;
    readonly revision?: string | null;
}

interface RawCatalogModel {
    readonly name?: string;
    readonly description?: string;
    readonly capabilities?: readonly string[];
    readonly tags?: readonly {
        readonly tag?: string;
        readonly size?: number;
        readonly context?: number;
        readonly quantization?: string;
    }[];
}

function normalizeModel(raw: RawCatalogModel): CatalogModel | null {
    if (typeof raw.name !== "string" || raw.name.length === 0) return null;
    const tags: CatalogTag[] = (raw.tags ?? [])
        .filter(
            (tag): tag is NonNullable<typeof tag> & { tag: string } =>
                typeof tag.tag === "string" && tag.tag.length > 0,
        )
        .map((tag) => ({
            tag: tag.tag,
            sizeBytes: typeof tag.size === "number" ? tag.size : null,
            contextWindow: typeof tag.context === "number" ? tag.context : null,
            quantization: typeof tag.quantization === "string" ? tag.quantization : null,
        }));
    return {
        family: raw.name,
        description: typeof raw.description === "string" ? raw.description : "",
        capabilities: Array.isArray(raw.capabilities)
            ? raw.capabilities.filter((c): c is string => typeof c === "string")
            : [],
        tags,
    };
}

type PageFetchResult =
    | { readonly ok: true; readonly page: RawCatalogPage }
    | { readonly ok: false; readonly reason: "network" | "malformed" | "oversized" | "aborted" };

async function readBoundedCatalogText(
    response: Response,
): Promise<
    | { readonly ok: true; readonly text: string }
    | { readonly ok: false; readonly reason: "oversized" }
> {
    const advertisedLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_CATALOG_RESPONSE_BYTES) {
        return { ok: false, reason: "oversized" };
    }

    const reader = response.body?.getReader();
    if (!reader) {
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > MAX_CATALOG_RESPONSE_BYTES) {
            return { ok: false, reason: "oversized" };
        }
        return { ok: true, text };
    }

    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_CATALOG_RESPONSE_BYTES) {
            await reader.cancel().catch(() => undefined);
            return { ok: false, reason: "oversized" };
        }
        text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
}

async function fetchPage(
    url: string,
    fetchImpl: FetchLike,
    timeoutMs: number,
    signal?: AbortSignal,
): Promise<PageFetchResult> {
    if (signal?.aborted === true) return { ok: false, reason: "aborted" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let callerAborted = false;
    const onCallerAbort = () => {
        callerAborted = true;
        controller.abort();
    };
    signal?.addEventListener("abort", onCallerAbort);
    try {
        const response = await fetchImpl(url, { method: "GET", signal: controller.signal });
        if (!response.ok) return { ok: false, reason: "network" };
        const body = await readBoundedCatalogText(response);
        if (!body.ok) return body;
        try {
            return { ok: true, page: JSON.parse(body.text) as RawCatalogPage };
        } catch {
            return { ok: false, reason: "malformed" };
        }
    } catch {
        return { ok: false, reason: callerAborted ? "aborted" : "network" };
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onCallerAbort);
    }
}

/**
 * Walks the catalogue source to its end, following every `nextPage` link the source hands
 * back. Stops early only on a genuine failure (network refusal or a page that will not parse)
 * or after {@link MAX_CATALOG_PAGES}, and in both cases reports the partial result plainly as
 * incomplete rather than passing it off as the whole library.
 */
export async function refreshCatalog(
    fetchImpl: FetchLike,
    options: {
        readonly url?: string;
        readonly timeoutMs?: number;
        readonly signal?: AbortSignal;
    } = {},
): Promise<CatalogRefreshResult> {
    const baseUrl = options.url ?? DEFAULT_CATALOG_URL;
    const timeoutMs = options.timeoutMs ?? 10_000;
    const models: CatalogModel[] = [];
    let sourceRevision: string | null = null;
    let pageCount = 0;
    let nextUrl: string | null = baseUrl;

    while (nextUrl !== null) {
        if (pageCount >= MAX_CATALOG_PAGES) {
            return {
                ok: false,
                reason: "truncated",
                message: `The catalogue kept paginating past ${MAX_CATALOG_PAGES} pages, further than this build will follow.`,
                partial: {
                    models,
                    revision: {
                        sourceRevision,
                        refreshedAt: new Date().toISOString(),
                        pageCount,
                        complete: false,
                    },
                },
            };
        }
        const fetched = await fetchPage(nextUrl, fetchImpl, timeoutMs, options.signal);
        pageCount += 1;
        if (!fetched.ok) {
            const reason = fetched.reason;
            return {
                ok: false,
                reason,
                message:
                    reason === "network"
                        ? "The official model catalogue could not be reached."
                        : reason === "oversized"
                          ? "The official model catalogue page was larger than this build will read."
                          : reason === "aborted"
                            ? "The catalogue refresh was cancelled."
                            : "The official model catalogue answered with something this build could not parse.",
                partial: {
                    models,
                    revision: {
                        sourceRevision,
                        refreshedAt: new Date().toISOString(),
                        pageCount,
                        complete: false,
                    },
                },
            };
        }
        for (const raw of fetched.page.models ?? []) {
            const normalized = normalizeModel(raw);
            if (normalized) models.push(normalized);
        }
        if (typeof fetched.page.revision === "string") sourceRevision = fetched.page.revision;
        nextUrl =
            typeof fetched.page.nextPage === "string" && fetched.page.nextPage.length > 0
                ? fetched.page.nextPage
                : null;
    }

    return {
        ok: true,
        catalog: {
            models,
            revision: {
                sourceRevision,
                refreshedAt: new Date().toISOString(),
                pageCount,
                complete: true,
            },
        },
    };
}

/** How stale a catalogue must be before the store labels it "stale" rather than "current". */
export const CATALOG_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function catalogIsStale(revision: CatalogRevision, now: number = Date.now()): boolean {
    const refreshedAt = Date.parse(revision.refreshedAt);
    if (Number.isNaN(refreshedAt)) return true;
    return now - refreshedAt > CATALOG_STALE_AFTER_MS || !revision.complete;
}

/** Every (model, tag) pair flattened, which is the level the Model Store actually lists at. */
export interface CatalogVariant {
    readonly family: string;
    readonly description: string;
    readonly capabilities: readonly string[];
    readonly tag: string;
    readonly fullName: string;
    readonly sizeBytes: number | null;
    readonly contextWindow: number | null;
    readonly quantization: string | null;
}

export function flattenVariants(catalog: OllamaCatalog): readonly CatalogVariant[] {
    const variants: CatalogVariant[] = [];
    for (const model of catalog.models) {
        for (const tag of model.tags) {
            variants.push({
                family: model.family,
                description: model.description,
                capabilities: model.capabilities,
                tag: tag.tag,
                fullName: `${model.family}:${tag.tag}`,
                sizeBytes: tag.sizeBytes,
                contextWindow: tag.contextWindow,
                quantization: tag.quantization,
            });
        }
    }
    return variants;
}
