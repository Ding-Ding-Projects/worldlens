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
}

function readCache(): VocabularyState {
    let raw: string | null;
    try {
        raw = localStorage.getItem(VOCABULARY_STORAGE_KEY);
    } catch {
        // A refused localStorage read (private browsing, disabled storage) fails closed
        // to shipped wording exactly the same way a corrupt cache does.
        return { status: "cache-unreadable", entries: {} };
    }
    if (raw === null) return { status: "no-file", entries: {} };

    const validated = validateVocabularyPayload(raw);
    if (!validated.ok) return { status: "cache-unreadable", entries: {} };
    return { status: "loaded", entries: validated.payload.entries };
}

export const vocabularyStore = reactive<VocabularyState>(readCache());

let persisting = true;

/** Stops persistence while a test rearranges the store, so one test cannot write another's. */
export function setVocabularyPersistence(on: boolean): void {
    persisting = on;
}

/** Re-reads storage. Used after a test replaces `localStorage`, and after a clear/replace. */
export function reloadVocabularyStore(): void {
    const fresh = readCache();
    vocabularyStore.status = fresh.status;
    vocabularyStore.entries = fresh.entries;
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
export function loadVocabularyFile(bytes: string): VocabularyLoadResult {
    const validated = validateVocabularyPayload(bytes);
    if (!validated.ok) return { ok: false, reason: validated.reason };

    vocabularyStore.status = "loaded";
    vocabularyStore.entries = validated.payload.entries;
    return { ok: true };
}

/**
 * Purges the cache and restores original wording immediately. This is the one path back
 * to "no-file" from either "loaded" or "cache-unreadable" - clearing a corrupt cache is
 * the recovery for the unreadable state too, since there is no way to repair bytes the
 * store could not parse in the first place.
 */
export function clearVocabulary(): void {
    vocabularyStore.status = "no-file";
    vocabularyStore.entries = {};
    if (!persisting) return;
    try {
        localStorage.removeItem(VOCABULARY_STORAGE_KEY);
    } catch {
        // Nothing to recover to; the in-memory state is already correct.
    }
}
