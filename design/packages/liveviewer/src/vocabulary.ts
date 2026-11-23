/**
 * Whole-string replacement of visible text.
 *
 * A match is the entire string, never a fragment: replacing inside a sentence would turn
 * ordinary words into something unrelated. Lookup is exact first, then case-insensitive,
 * and a string with no entry is returned unchanged. The mapping exists only in memory;
 * nothing here logs or writes it.
 */
export function replaceWhole(text: string, vocabulary: Readonly<Record<string, string>>): string {
    const exact = vocabulary[text];
    if (exact !== undefined) return exact;
    const lower = text.toLowerCase();
    for (const [key, value] of Object.entries(vocabulary)) {
        if (key.toLowerCase() === lower) return value;
    }
    return text;
}

/** The visible strings the container itself produces, before replacement. */
export const VISIBLE_STRINGS = {
    pageTitle: "Live viewer",
    chatLabel: "Chat",
    offlineLabel: "Waiting for the bot to join",
    joinedAnnouncement: "Joined the server",
    reconnectingAnnouncement: "Reconnecting",
} as const;

export type VisibleStrings = Record<keyof typeof VISIBLE_STRINGS, string>;

/**
 * The only entries of a personal vocabulary the container can ever use.
 *
 * The application sends this subset, never the whole mapping, so a remote host learns
 * nothing about wording it has no way to display.
 */
export function relevantVocabulary(vocabulary: Readonly<Record<string, string>>): Record<string, string> {
    const out: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const original of Object.values(VISIBLE_STRINGS)) {
        const replaced = replaceWhole(original, vocabulary);
        if (replaced !== original) out[original] = replaced;
    }
    return out;
}

export function localisedStrings(vocabulary: Readonly<Record<string, string>>): VisibleStrings {
    const out = {} as VisibleStrings;
    for (const key of Object.keys(VISIBLE_STRINGS) as (keyof typeof VISIBLE_STRINGS)[]) {
        out[key] = replaceWhole(VISIBLE_STRINGS[key], vocabulary);
    }
    return out;
}
