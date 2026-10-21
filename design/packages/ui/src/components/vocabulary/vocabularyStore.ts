/**
 * Where a person's own personal-vocabulary replacements are kept, once they have
 * supplied a valid file.
 *
 * Local storage only, beside the rest of this application's own per-visitor state, for
 * the same reason `markerStudioStore.ts` keeps markers there and nowhere else: this is
 * the user's own private word list, and sending it anywhere would be a surprise nobody
 * asked for. Nothing here makes a network request, and the cached payload never carries
 * a source filename or path - only the validated `entries` map itself.
 *
 * ## No data until a valid file exists
 *
 * The store starts empty and stays empty until `loadVocabularyFile` is handed bytes
 * that pass `validateVocabularyPayload`. There is no bundled sample, template, or guess
 * to fall back to: every surface renders its original shipped wording for as long as
 * this store reports no entries, which is the fail-closed state as well as the empty
 * one - the two are the same state on purpose, so a corrupt cache and "never uploaded
 * anything" behave identically to the rest of the app.
 *
 * ## A read that fails is not a silently empty vocabulary
 *
 * `markerStudioStore.ts`'s own doc comment makes the same point about markers: answering
 * an unreadable store with an empty list invites somebody to redo work that still
 * exists. The stakes are different here - failing closed to shipped wording is exactly
 * the required behaviour, not a wrong answer - but the store still tracks *why* it is
 * empty (never uploaded, cleared, or cache unreadable) so the settings row can say which
 * one truthfully rather than collapsing all three into a single blank state.
 */

import { reactive, watch } from "vue";
import { validateVocabularyPayload, type VocabularyPayload } from "./vocabularySchema.js";

/** Exported so a test can point a stand-in `localStorage` at the same key this store writes. */
export const VOCABULARY_STORAGE_KEY = "worldlens-personal-vocabulary";

export type VocabularyStatus =
    /** No file has ever been supplied, or the cache was explicitly cleared. */
    | "no-file"
    /** A valid file's entries are cached and in effect. */
    | "loaded"
    /** The cached payload could not be read back; original wording is in effect. */
    | "cache-unreadable";

interface VocabularyState {
    status: VocabularyStatus;
    entries: Readonly<Record<string, string>>;
    metadata?:
        | { readonly revision: number; readonly sourceDigest: string; readonly loadedAt: string }
        | undefined;
    persistenceError?: string | undefined;
}

function readCache(): VocabularyState {
    let raw: string | null;
    try {
        raw = localStorage.getItem(VOCABULARY_STORAGE_KEY);
    } catch {
        // A refused localStorage read (private browsing, disabled storage) fails closed
        // to shipped wording exactly the same way a corrupt cache does.
        return { status: "cache-unreadable", entries: {}, persistenceError: "cache-unreadable" };
    }
    if (raw === null) return { status: "no-file", entries: {} };

    const validated = validateVocabularyPayload(raw);
    if (!validated.ok)
        return { status: "cache-unreadable", entries: {}, persistenceError: "cache-unreadable" };
    return { status: "loaded", entries: validated.payload.entries };
}

export const vocabularyStore = reactive<VocabularyState>(readCache());

const hostVocabulary = typeof window === "undefined" ? undefined : window.worldlens?.vocabulary;

let persisting = true;
// File-read intent and acknowledged host state are separate clocks. An invalid new
// selection cancels old reads, but cannot undo a host write already in progress.
let revision = 0;
let operation = 0;
let observedOperation = 0;
function reconcileSnapshot(
    id: number,
    snapshot: Pick<VocabularyState, "status" | "entries" | "metadata">,
    error?: string,
): void {
    if (id < observedOperation) return;
    observedOperation = id;
    vocabularyStore.status = snapshot.status;
    vocabularyStore.entries = snapshot.entries;
    vocabularyStore.metadata = snapshot.metadata;
    vocabularyStore.persistenceError = error;
}
let ready: Promise<void> = Promise.resolve();

/** Desktop startup reads the app-data cache through the main-process bridge. Browser and
 * static-site hosts keep the existing localStorage fallback, with no network route. */
export function initialiseVocabularyStore(): void {
    if (hostVocabulary === undefined) return;
    persisting = false;
    ready = hostVocabulary
        .read()
        .then((snapshot) => {
            if (observedOperation !== 0) return;
            vocabularyStore.status = snapshot.status;
            vocabularyStore.entries = snapshot.entries;
            vocabularyStore.metadata = snapshot.metadata;
            vocabularyStore.persistenceError = undefined;
        })
        .catch(() => {
            if (observedOperation !== 0) return;
            vocabularyStore.status = "cache-unreadable";
            vocabularyStore.entries = {};
            vocabularyStore.persistenceError = "cache-unreadable";
        });
}

initialiseVocabularyStore();

/** Stops persistence while a test rearranges the store, so one test cannot write another's. */
export function setVocabularyPersistence(on: boolean): void {
    persisting = on;
}

/** Re-reads storage. Used after a test replaces `localStorage`, and after a clear/replace. */
export function reloadVocabularyStore(): void {
    const fresh = readCache();
    vocabularyStore.status = fresh.status;
    vocabularyStore.entries = fresh.entries;
    vocabularyStore.metadata = fresh.metadata;
    vocabularyStore.persistenceError = fresh.persistenceError;
}

watch(
    () => ({ status: vocabularyStore.status, entries: vocabularyStore.entries }),
    ({ status, entries }) => {
        if (!persisting) return;
        try {
            if (status !== "loaded") {
                localStorage.removeItem(VOCABULARY_STORAGE_KEY);
                return;
            }
            const payload: VocabularyPayload = { schemaVersion: 1, entries };
            localStorage.setItem(VOCABULARY_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // A full or refused quota is not worth taking the app down for; the in-memory
            // state stays correct for this session and the next successful write catches up.
        }
    },
    { deep: true },
);

export interface VocabularyLoadResult {
    readonly ok: boolean;
    readonly reason?: string;
}

/**
 * Validates a candidate file's raw text and, only if it passes whole, replaces the
 * store's entries with it. A rejected file never applies partially: the store's prior
 * state - loaded or empty - is left exactly as it was.
 */
/** Claim an import before reading bytes so Clear and replacements cancel delayed file reads. */
export function beginVocabularyImport(): number {
    return ++revision;
}

export async function loadVocabularyFile(
    bytes: string,
    started = beginVocabularyImport(),
): Promise<VocabularyLoadResult> {
    if (started !== revision) return { ok: false, reason: "superseded" };
    const validated = validateVocabularyPayload(bytes);
    if (!validated.ok) return { ok: false, reason: validated.reason };
    await ready;
    if (started !== revision) return { ok: false, reason: "superseded" };
    const id = ++operation;
    try {
        if (hostVocabulary !== undefined) {
            const result = await hostVocabulary.load(bytes);
            // Even a failed host operation returns its authoritative durable snapshot.
            reconcileSnapshot(id, result, result.ok ? undefined : "write-failed");
            if (started !== revision) return { ok: false, reason: "superseded" };
            if (!result.ok) return { ok: false, reason: "write-failed" };
        } else {
            if (persisting)
                localStorage.setItem(VOCABULARY_STORAGE_KEY, JSON.stringify(validated.payload));
            reconcileSnapshot(id, { status: "loaded", entries: validated.payload.entries });
        }
        return { ok: true };
    } catch {
        if (id >= observedOperation) vocabularyStore.persistenceError = "write-failed";
        return { ok: false, reason: started === revision ? "write-failed" : "superseded" };
    }
}

/** Clear cancels pending reads; only an acknowledged removal changes durable state. */
export async function clearVocabulary(): Promise<VocabularyLoadResult> {
    ++revision;
    await ready;
    const id = ++operation;
    try {
        if (hostVocabulary !== undefined) {
            const result = await hostVocabulary.clear();
            reconcileSnapshot(id, result, result.ok ? undefined : "clear-failed");
            return result.ok ? { ok: true } : { ok: false, reason: "clear-failed" };
        }
        if (persisting) localStorage.removeItem(VOCABULARY_STORAGE_KEY);
        reconcileSnapshot(id, { status: "no-file", entries: {} });
        return { ok: true };
    } catch {
        if (id >= observedOperation) vocabularyStore.persistenceError = "clear-failed";
        return { ok: false, reason: "clear-failed" };
    }
}
