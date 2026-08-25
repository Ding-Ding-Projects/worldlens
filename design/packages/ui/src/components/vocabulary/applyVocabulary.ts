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
import { schoolModeEnabled } from "../setup/schoolMode.js";

/**
 * Replaces every occurrence of a matched vocabulary term inside `text`.
 *
 * Matching is literal and case-sensitive on the entry's key, and it stops at word
 * boundaries. That last part is not a refinement - it is the whole correctness of this
 * function, and it was missing.
 *
 * A plain substring replace rewrites the INSIDE of longer words. With a mapping of
 * `repo` to something else, "No download size was reported" rendered as
 * "No download size was <replacement>rted" in the shipped interface: the sentence still
 * looked like a sentence, so nothing about it read as broken, and the only clue was that
 * one word had quietly become nonsense.
 *
 * The comment that used to sit here claimed the opposite - that a literal substring match
 * meant "no partial-word heuristics, so a term a user did not actually write can never be
 * silently rewritten". A substring match is precisely the thing that does that. Anyone
 * reading it would have concluded this case was already handled.
 *
 * Boundaries are applied only where the key's own edge is a word character, so a key that
 * begins or ends with punctuation or a space still matches where it should.
 */

/** Escapes a user-supplied key so it can never be read as a pattern. */
function escapeForPattern(key: string): string {
    return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WORD_EDGE = /[A-Za-z0-9_]/;

/**
 * A pattern for one key, refusing to match inside a longer word.
 *
 * Lookarounds rather than ``, because `` is defined against word characters on BOTH
 * sides and a key like `working tree` or `--flag` has edges that are not word characters
 * at all - there, `` would refuse matches that should be made.
 */
function patternFor(key: string): RegExp {
    const before = WORD_EDGE.test(key[0] ?? "") ? String.raw`(?<![A-Za-z0-9_])` : "";
    const after = WORD_EDGE.test(key[key.length - 1] ?? "") ? String.raw`(?![A-Za-z0-9_])` : "";
    return new RegExp(`${before}${escapeForPattern(key)}${after}`, "g");
}
export function applyVocabulary(text: string): string {
    // School mode makes personal-vocabulary capability behave as if it is not installed.
    // The validated cache remains untouched so the user's choices return immediately after
    // the shared mode is disabled.
    if (schoolModeEnabled()) return text;
    const entries = vocabularyStore.entries;
    const keys = Object.keys(entries);
    if (keys.length === 0) return text;

    let result = text;
    // Longest first, so a short key cannot consume the start of a longer one the user also
    // mapped - with both `repo` and `repository` mapped, the shorter must not win.
    for (const key of [...keys].sort((left, right) => right.length - left.length)) {
        if (key.length === 0) continue;
        const replacement = entries[key] as string;
        // A function replacement, so a `$&` or `$1` inside somebody's own vocabulary value
        // is inserted literally rather than being read as a backreference.
        result = result.replace(patternFor(key), () => replacement);
    }
    return result;
}

/**
 * Applies replacements to a localization message before its named values are interpolated.
 * Placeholder tokens stay literal, so a user-supplied mapping cannot alter a runtime path,
 * URL, command, identifier, count, or other factual value passed through `{name}`.
 */
export function applyVocabularyTemplate(template: string): string {
    const protectedSpan =
        /\{[A-Za-z_][A-Za-z0-9_]*\}|`[^`\r\n]*`|https:\/\/[^\s<>"']+|[A-Za-z]:[\\/][^\s<>"']+|\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+|--[A-Za-z0-9][A-Za-z0-9-]*|\b(?:Ctrl|Alt|Shift|Meta|Cmd)(?:\+[A-Za-z0-9]+)+\b|\b[A-Z][A-Z0-9_]{1,}\b|\b[\w.-]+\.(?:json|jsonl|ndjson|ya?ml|toml|xml|csv|tsv|md|html?|sql|ts|js|mjs|cjs|py|go|rs|proto|conf|dat|jar|exe|zip|7z|nupkg|png|jpe?g|webp|svg|ico)\b|\b[\w.-]+:[\w./-]+\b|\bv?\d+(?:\.\d+){1,3}\b|\b\d+(?:[.,]\d+)*\b/g;
    let cursor = 0;
    let result = "";

    for (const match of template.matchAll(protectedSpan)) {
        const index = match.index ?? cursor;
        result += applyVocabulary(template.slice(cursor, index));
        result += match[0];
        cursor = index + match[0].length;
    }

    return result + applyVocabulary(template.slice(cursor));
}

/**
 * Applies the placeholder-safe boundary to a complete localization message tree.
 *
 * Upstream viewer locales are nested HOCON objects, while the application catalogue is
 * flat. Walking values rather than keys covers both without changing lookup identifiers,
 * and non-string facts are copied verbatim. A fresh tree is returned so clearing or
 * replacing the upload can always rebuild from the untouched shipped source.
 */
export function applyVocabularyMessageTree<T>(value: T): T {
    if (typeof value === "string") return applyVocabularyTemplate(value) as T;
    if (Array.isArray(value)) {
        return value.map((entry) => applyVocabularyMessageTree(entry)) as T;
    }
    if (typeof value !== "object" || value === null) return value;

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
            key,
            applyVocabularyMessageTree(entry),
        ]),
    ) as T;
}
