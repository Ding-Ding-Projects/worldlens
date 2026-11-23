/**
 * The personal wording table, applied to the few labels the map server shows.
 *
 * The map server's own page title and its health label are text a person can read, so when a
 * personal vocabulary file is loaded they go through the same whole-string replacement as
 * the rest of the app. The replacement happens here, when the container is started, and the
 * result travels as environment values; the table is never written into source, never logged
 * and never placed in the image. With no file loaded the plain labels are used.
 */
import type { VocabularyStore } from "../vocabulary/store.js";

export const DEFAULT_HEALTH_LABEL = "Map server";
export const DEFAULT_CONTAINER_LABEL = "Worldlens map";

export interface Wording {
    /** Replaces `text` when the table has an exact entry for it, and returns it otherwise. */
    apply(text: string): string;
}

export const plainWording: Wording = { apply: (text) => text };

export function wordingFrom(entries: Readonly<Record<string, string>>): Wording {
    return { apply: (text) => (Object.prototype.hasOwnProperty.call(entries, text) ? (entries[text] as string) : text) };
}

/** Reads the loaded table, or the plain labels when no file is loaded or the cache is bad. */
export async function wordingFromStore(store: Pick<VocabularyStore, "read">): Promise<Wording> {
    const snapshot = await store.read();
    return snapshot.status === "loaded" ? wordingFrom(snapshot.entries) : plainWording;
}
