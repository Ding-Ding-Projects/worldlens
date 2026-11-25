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

import { toRaw } from "vue";
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
 * The pattern source for one key, refusing to match inside a longer word.
 *
 * Lookarounds rather than `\b`, because `\b` is defined against word characters on BOTH
 * sides and a key like `working tree` or `--flag` has edges that are not word characters
 * at all - there, `\b` would refuse matches that should be made.
 *
 * The first letter matches in either case. Vocabulary files are written in lower case,
 * while labels are written in sentence case, so "universal features" has to reach the
 * "Universal features" a heading actually shows. Only the first letter is relaxed: the
 * rest of the key still has to match exactly as the person wrote it.
 */
function patternSource(key: string): string {
    const before = WORD_EDGE.test(key[0] ?? "") ? String.raw`(?<![A-Za-z0-9_])` : "";
    const after = WORD_EDGE.test(key[key.length - 1] ?? "") ? String.raw`(?![A-Za-z0-9_])` : "";
    const first = key[0] ?? "";
    const lower = first.toLowerCase();
    const upper = first.toUpperCase();
    const head = lower !== upper ? `[${escapeForPattern(lower)}${escapeForPattern(upper)}]` : escapeForPattern(first);
    return `${before}${head}${escapeForPattern(key.slice(1))}${after}`;
}

function flipFirst(text: string): string {
    const first = text[0] ?? "";
    const flipped = first === first.toLowerCase() ? first.toUpperCase() : first.toLowerCase();
    return flipped + text.slice(1);
}

interface CompiledVocabulary {
    readonly entries: Readonly<Record<string, string>>;
    readonly pattern: RegExp;
    readonly results: Map<string, string>;
}

/** Bounds the memo, so a long session of changing text cannot grow it without limit. */
const MEMO_LIMIT = 4000;

let compiled: CompiledVocabulary | null = null;

/**
 * One alternation for the whole file, built once per loaded file.
 *
 * This used to build one pattern per key on every call. With a few hundred keys that is a
 * few hundred regular expressions compiled for every label, and typing into the command
 * palette re-renders every row it shows - so each keystroke compiled hundreds of
 * thousands of patterns and the window stopped responding. Keys go longest first, so with
 * both `repo` and `repository` mapped the shorter cannot win, and one left-to-right pass
 * means a replacement is never itself rewritten by a later key.
 */
function compile(entries: Readonly<Record<string, string>>): CompiledVocabulary {
    if (compiled !== null && compiled.entries === entries) return compiled;
    const keys = Object.keys(entries)
        .filter((key) => key.length > 0)
        .sort((left, right) => right.length - left.length);
    compiled = {
        entries,
        pattern: new RegExp(keys.map(patternSource).join("|"), "g"),
        results: new Map(),
    };
    return compiled;
}

/**
 * The characters vue-i18n's message format reads as syntax: placeholders, linked messages,
 * plural branches and modifiers. A vocabulary value is somebody's own wording, so each one is
 * written as a literal interpolation (`{'@'}`) before it enters a message. Without this a
 * value containing `@` made the compiler throw "Invalid linked format" for every message it
 * landed in, and a page whose labels all threw rendered nothing at all.
 */
const MESSAGE_SYNTAX = /[{}@$|]/g;

/** A vocabulary value, safe to place inside a vue-i18n message. */
export function escapeForMessageFormat(value: string): string {
    return value.replace(MESSAGE_SYNTAX, (character) => `{'${character}'}`);
}

/** {@link applyVocabulary} for text that is about to be compiled as a vue-i18n message. */
function applyVocabularyToMessageText(text: string): string {
    if (schoolModeEnabled()) return text;
    const entries = vocabularyStore.entries;
    if (typeof text !== "string" || text.length === 0) return text;
    if (Object.keys(entries).length === 0) return text;

    const vocabulary = compile(toRaw(entries));
    // Only the inserted value is escaped: the surrounding text is the shipped message and
    // its own placeholders and plural branches must keep working.
    return text.replace(vocabulary.pattern, (match) => {
        const replacement = vocabulary.entries[match] ?? vocabulary.entries[flipFirst(match)];
        return replacement === undefined ? match : escapeForMessageFormat(replacement);
    });
}

export function applyVocabulary(text: string): string {
    // School mode makes personal-vocabulary capability behave as if it is not installed.
    // The validated cache remains untouched so the user's choices return immediately after
    // the shared mode is disabled.
    if (schoolModeEnabled()) return text;
    const entries = vocabularyStore.entries;
    if (typeof text !== "string" || text.length === 0) return text;
    if (Object.keys(entries).length === 0) return text;

    const vocabulary = compile(toRaw(entries));
    const known = vocabulary.results.get(text);
    if (known !== undefined) return known;

    // A function replacement, so a `$&` or `$1` inside somebody's own vocabulary value
    // is inserted literally rather than being read as a backreference.
    const result = text.replace(vocabulary.pattern, (match) => {
        const exact = vocabulary.entries[match];
        if (exact !== undefined) return exact;
        return vocabulary.entries[flipFirst(match)] ?? match;
    });
    if (vocabulary.results.size >= MEMO_LIMIT) vocabulary.results.clear();
    vocabulary.results.set(text, result);
    return result;
}

/**
 * Applies replacements to a localization message before its named values are interpolated.
 * Placeholder tokens stay literal, so a user-supplied mapping cannot alter a runtime path,
 * URL, command, identifier, count, or other factual value passed through `{name}`.
 */
export function applyVocabularyTemplate(
    template: string,
    options: { readonly forMessageFormat?: boolean } = {},
): string {
    const apply = options.forMessageFormat === true ? applyVocabularyToMessageText : applyVocabulary;
    const protectedSpan =
        /\{[A-Za-z_][A-Za-z0-9_]*\}|`[^`\r\n]*`|https:\/\/[^\s<>"']+|[A-Za-z]:[\\/][^\s<>"']+|\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+|--[A-Za-z0-9][A-Za-z0-9-]*|\b(?:Ctrl|Alt|Shift|Meta|Cmd)(?:\+[A-Za-z0-9]+)+\b|\b[A-Z][A-Z0-9_]{1,}\b|\b[\w.-]+\.(?:json|jsonl|ndjson|ya?ml|toml|xml|csv|tsv|md|html?|sql|ts|js|mjs|cjs|py|go|rs|proto|conf|dat|jar|exe|zip|7z|nupkg|png|jpe?g|webp|svg|ico)\b|\b[\w.-]+:[\w./-]+\b|\bv?\d+(?:\.\d+){1,3}\b|\b\d+(?:[.,]\d+)*\b/g;
    let cursor = 0;
    let result = "";

    for (const match of template.matchAll(protectedSpan)) {
        const index = match.index ?? cursor;
        result += apply(template.slice(cursor, index));
        result += match[0];
        cursor = index + match[0].length;
    }

    return result + apply(template.slice(cursor));
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
    // These strings are compiled by vue-i18n, so inserted wording is escaped for its syntax.
    if (typeof value === "string") {
        return applyVocabularyTemplate(value, { forMessageFormat: true }) as T;
    }
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
