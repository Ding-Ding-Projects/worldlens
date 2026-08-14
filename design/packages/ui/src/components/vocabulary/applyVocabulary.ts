/**
 * Applies a person's own approved replacements at the user-facing text boundary.
 *
 * This is the one function every rendered surface is meant to call its own labels
 * through, including accessible names - the contract requires the replacement to reach
 * `aria-label`s and other assistive-technology text too, not only what is visually on
 * screen. It is deliberately narrow: a command, a URL, an identifier, a file path or
 * any other factual, external record is never passed through here, because those stay
 * verbatim regardless of what a vocabulary file asks for.
 *
 * When the store holds no entries - never uploaded, cleared, or a cache that failed to
 * read back - this is the identity function, so a surface that always calls it costs
 * nothing extra and never needs its own "do I have a vocabulary" branch.
 */

import { vocabularyStore } from "./vocabularyStore.js";

/**
 * Replaces every occurrence of a matched vocabulary term inside `text`. Matching is a
 * literal, case-sensitive substring match on the entry's key: no regular expressions,
 * no partial-word heuristics, so a term a user did not actually write can never be
 * silently rewritten by an unrelated one that happens to look similar.
 */
export function applyVocabulary(text: string): string {
    const entries = vocabularyStore.entries;
    const keys = Object.keys(entries);
    if (keys.length === 0) return text;

    let result = text;
    for (const key of keys) {
        if (key.length === 0) continue;
        result = result.split(key).join(entries[key] as string);
    }
    return result;
}

/**
 * Applies replacements to a localization message before its named values are interpolated.
 * Placeholder tokens stay literal, so a user-supplied mapping cannot alter a runtime path,
 * URL, command, identifier, count, or other factual value passed through `{name}`.
 */
export function applyVocabularyTemplate(template: string): string {
    const placeholder = /\{[A-Za-z_][A-Za-z0-9_]*\}/g;
    let cursor = 0;
    let result = "";

    for (const match of template.matchAll(placeholder)) {
        const index = match.index ?? cursor;
        result += applyVocabulary(template.slice(cursor, index));
        result += match[0];
        cursor = index + match[0].length;
    }

    return result + applyVocabulary(template.slice(cursor));
}
