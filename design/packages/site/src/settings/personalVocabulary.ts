/**
 * The mechanism for a visitor-supplied private vocabulary, and nothing else.
 *
 * The governing rule is unusual and worth stating plainly, because it shapes every decision
 * in this file: personal vocabulary exists **only** when the visitor supplies an explicit
 * private file, and until they do, the site must expose **no vocabulary feature at all** — not
 * a disabled control, not an empty list, not a menu entry that explains what a vocabulary
 * would be. So `installed` is the gate every surface asks first, and a `false` there means the
 * surfaces render as though this module had never been written.
 *
 * The second rule is why this file contains no vocabulary. This repository is public, and no
 * term, mapping, template, example or schema document may be committed to it. What is
 * committed here is only the transport and the safety rails: bounded parsing, validation,
 * whole-token replacement, and the exclusions that keep replacement away from anything a
 * machine has to read literally. The visitor's file supplies the content, it is held in this
 * browser and nowhere else, and it is deliberately unreachable from the settings export —
 * `SettingsStore.snapshot()` walks the declared settings, and this is not one of them, so a
 * visitor sharing an export file cannot leak their vocabulary by accident.
 *
 * Replacement happens at the user-facing text boundary and reaches accessible names, because
 * a vocabulary that renamed the visible label and left the screen-reader name saying something
 * else would make the site say two different things at once. It stops at commands, URLs,
 * identifiers, code, file paths and factual external records, which stay verbatim. That
 * exclusion is not politeness: a rewritten command is a command that fails, and a rewritten
 * path points at a file that does not exist.
 */

import type { Preferences } from "../platform/Preferences.js";

const RECORD_KEY = "vocabulary.record";

/**
 * A ceiling on the supplied file, enforced before parsing rather than after.
 *
 * `JSON.parse` on a hostile or accidentally enormous file is a main-thread stall the visitor
 * experiences as a frozen page, and there is no useful vocabulary that needs more than this.
 * Checking the length first means the worst case is a refusal, not a hang.
 */
export const MAX_VOCABULARY_BYTES = 64 * 1024;

/** A ceiling on the number of replacements, for the same reason the byte ceiling exists. */
export const MAX_VOCABULARY_ENTRIES = 500;
export const VOCABULARY_SCHEMA_VERSION = 1 as const;
export const MAX_VOCABULARY_DEPTH = 2;

/** A ceiling on one term, chosen so a "term" cannot smuggle in a paragraph of markup. */
export const MAX_TERM_LENGTH = 120;

/**
 * One replacement, in the only shape this module accepts.
 *
 * Deliberately the minimum that can express a substitution — a source token and what it
 * becomes. Anything richer would be a schema, and a schema is one of the things that must not
 * be committed to a public repository.
 */
interface VocabularyEntry {
    readonly from: string;
    readonly to: string;
}

export type VocabularyLoad =
    | { readonly ok: true; readonly count: number }
    | { readonly ok: false; readonly reason: VocabularyRefusal };

/**
 * Why a file was refused, as a code the surface turns into a sentence.
 *
 * Codes rather than sentences here so the module stays free of user-facing English, which
 * would otherwise have to live in a public string table beside the vocabulary machinery.
 */
export type VocabularyRefusal =
    | "too-large" | "not-json" | "wrong-shape" | "empty" | "too-many"
    | "unknown-version" | "duplicate-key" | "unsafe-key" | "too-deeply-nested";

/**
 * Tokens this module refuses to touch however the visitor's file is written.
 *
 * A token containing a slash, a backslash, a colon-slash-slash, a dot-with-no-space or a
 * leading dash is doing a job other than reading: it is a path, a URL, a flag, a version, a
 * file name or an identifier. Replacing inside one produces text that still looks like a
 * command and no longer is, which is a far worse outcome than a term going untranslated.
 */
function isLiteralToken(token: string): boolean {
    return (
        token.includes("/") ||
        token.includes("\\") ||
        token.includes("://") ||
        token.startsWith("-") ||
        token.startsWith("--") ||
        token.startsWith("#") ||
        token.startsWith("@") ||
        /\.[A-Za-z0-9]+$/.test(token) ||
        /[_$]/.test(token)
    );
}

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;

function hasDuplicateJsonObjectKey(source: string): boolean {
    let cursor = 0;
    let duplicate = false;
    const skip = (): void => { while (/\s/u.test(source[cursor] ?? "")) cursor += 1; };
    const stringValue = (): string => {
        const start = cursor++;
        while (cursor < source.length) {
            const c = source[cursor++];
            if (c === "\\") cursor += 1;
            else if (c === '"') return JSON.parse(source.slice(start, cursor)) as string;
        }
        return "";
    };
    const scan = (): void => {
        skip();
        const c = source[cursor];
        if (c === "{") {
            cursor += 1; const keys = new Set<string>(); skip();
            if (source[cursor] === "}") { cursor += 1; return; }
            while (cursor < source.length) {
                skip(); const key = stringValue(); if (keys.has(key)) duplicate = true; keys.add(key);
                skip(); cursor += 1; scan(); skip();
                if (source[cursor] === "}") { cursor += 1; return; } cursor += 1;
            }
            return;
        }
        if (c === "[") {
            cursor += 1; skip(); if (source[cursor] === "]") { cursor += 1; return; }
            while (cursor < source.length) { scan(); skip(); if (source[cursor] === "]") { cursor += 1; return; } cursor += 1; }
            return;
        }
        if (c === '"') { stringValue(); return; }
        while (cursor < source.length && !/[\s,}\]]/u.test(source[cursor] as string)) cursor += 1;
    };
    scan();
    return duplicate;
}

function exceedsDepth(value: unknown): boolean {
    const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
    while (pending.length > 0) {
        const current = pending.pop() as { value: unknown; depth: number };
        if (current.value === null || typeof current.value !== "object") continue;
        const depth = current.depth + 1;
        if (depth > MAX_VOCABULARY_DEPTH) return true;
        for (const child of Object.values(current.value as Record<string, unknown>)) pending.push({ value: child, depth });
    }
    return false;
}

function validate(parsed: unknown): readonly VocabularyEntry[] | null {
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== VOCABULARY_SCHEMA_VERSION) return null;
    if (typeof record.entries !== "object" || record.entries === null || Array.isArray(record.entries)) return null;
    const entries: VocabularyEntry[] = [];
    for (const [from, rawTo] of Object.entries(record.entries as Record<string, unknown>)) {
        if (UNSAFE_KEYS.has(from) || from.trim() === "" || from.length > MAX_TERM_LENGTH) return null;
        if (CONTROL_CHARACTER.test(from) || typeof rawTo !== "string" || rawTo.length > MAX_TERM_LENGTH) return null;
        if (CONTROL_CHARACTER.test(rawTo)) return null;
        entries.push({ from: from.trim(), to: rawTo });
    }
    return entries;
}

function validateText(text: string): VocabularyLoad {
    if (text.length > MAX_VOCABULARY_BYTES) return { ok: false, reason: "too-large" };
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return { ok: false, reason: "not-json" }; }
    if (hasDuplicateJsonObjectKey(text)) return { ok: false, reason: "duplicate-key" };
    if (exceedsDepth(parsed)) return { ok: false, reason: "too-deeply-nested" };
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { ok: false, reason: "wrong-shape" };
    if ((parsed as Record<string, unknown>).schemaVersion !== VOCABULARY_SCHEMA_VERSION) return { ok: false, reason: "unknown-version" };
    const entries = validate(parsed);
    if (entries === null) return { ok: false, reason: "wrong-shape" };
    if (entries.length === 0) return { ok: false, reason: "empty" };
    if (entries.length > MAX_VOCABULARY_ENTRIES) return { ok: false, reason: "too-many" };
    return { ok: true, count: entries.length };
}

export type VocabularyListener = () => void;

export class PersonalVocabulary {
    private readonly prefs: Preferences;
    private readonly listeners = new Set<VocabularyListener>();
    /**
     * The compiled replacement list, rebuilt only when the stored record changes.
     *
     * Cached because `apply` is called once per rendered string on every language change, and
     * re-reading and re-parsing storage on each of those would make the funny-level slider
     * feel like it was doing work. `null` means "not yet read", which is distinct from an
     * empty list meaning "read, and there is nothing installed".
     */
    private compiled: readonly VocabularyEntry[] | null = null;

    constructor(prefs: Preferences) {
        this.prefs = prefs;
    }

    /**
     * The gate every surface asks before rendering anything vocabulary-shaped.
     *
     * False is the ordinary state, and in that state the correct behaviour is not "show an
     * empty vocabulary panel" but "behave as though this module does not exist".
     */
    get installed(): boolean {
        return this.entries().length > 0;
    }

    get entryCount(): number {
        return this.entries().length;
    }

    /**
     * Accept a file the visitor supplied.
     *
     * Every refusal path returns a reason rather than throwing, because a visitor who picked
     * the wrong file needs to be told which wrong thing it was, and an exception crossing this
     * boundary would reach a `catch` that can only say "something failed".
     */
    load(text: string): VocabularyLoad {
        const result = validateText(text);
        if (!result.ok) return result;
        const parsed = JSON.parse(text) as { entries: Record<string, string> };
        this.prefs.writeJson(RECORD_KEY, parsed);
        const entries = Object.entries(parsed.entries).map(([from, to]) => ({ from, to }));
        this.compiled = entries;
        this.emit();
        return { ok: true, count: entries.length };
    }

    /** Forget the supplied file, returning the site to its shipped wording everywhere. */
    clear(): void {
        this.prefs.remove(RECORD_KEY);
        this.compiled = [];
        this.emit();
    }

    /**
     * Rewrite one user-facing string.
     *
     * Whole-token matching rather than substring matching, because a substring rule turns a
     * term that happens to appear inside a longer word into a mangled word, and a visitor
     * cannot debug a rule they did not know was substring-based. Punctuation around a token is
     * preserved by matching on word boundaries and putting the surrounding characters back.
     */
    apply(text: string): string {
        const entries = this.entries();
        if (entries.length === 0 || text === "") return text;
        return text.replace(/[^\s]+/g, (token) => {
            if (isLiteralToken(token)) return token;
            const leading = /^[^\p{L}\p{N}]*/u.exec(token)?.[0] ?? "";
            const trailing = /[^\p{L}\p{N}]*$/u.exec(token)?.[0] ?? "";
            const core = token.slice(leading.length, token.length - trailing.length);
            if (core === "") return token;
            const match = entries.find(
                (entry) => entry.from.toLocaleLowerCase() === core.toLocaleLowerCase(),
            );
            return match === undefined ? token : `${leading}${match.to}${trailing}`;
        });
    }

    subscribe(listener: VocabularyListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private entries(): readonly VocabularyEntry[] {
        if (this.compiled === null) {
            this.compiled = this.prefs.readJson(RECORD_KEY, (value) => validate(value) ?? undefined) ?? [];
        }
        return this.compiled;
    }

    private emit(): void {
        for (const listener of [...this.listeners]) listener();
    }
}
