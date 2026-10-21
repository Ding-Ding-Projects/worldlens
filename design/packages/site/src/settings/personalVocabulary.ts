import { validateVocabularyPayload, VOCABULARY_MAX_BYTES, VOCABULARY_SCHEMA_VERSION } from "@worldlens/shared/vocabulary";
import type { Preferences } from "../platform/Preferences.js";

const RECORD_KEY = "vocabulary.record";

export { VOCABULARY_SCHEMA_VERSION };
export const MAX_VOCABULARY_BYTES = VOCABULARY_MAX_BYTES;

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

function validateText(text: string): VocabularyLoad {
    const result = validateVocabularyPayload(text);
    if (result.ok) return { ok: true, count: Object.keys(result.payload.entries).length };
    const reason = result.reason;
    if (reason === "malformed-json") return { ok: false, reason: "not-json" };
    if (reason === "missing-schema-version" || reason === "unknown-schema-version") return { ok: false, reason: "unknown-version" };
    if (reason === "too-large" || reason === "duplicate-key" || reason === "unsafe-key" || reason === "too-deeply-nested") return { ok: false, reason };
    return { ok: false, reason: "wrong-shape" };
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
            const result = validateVocabularyPayload(this.prefs.read(RECORD_KEY, ""));
            this.compiled = result.ok ? Object.entries(result.payload.entries).map(([from, to]) => ({ from, to })) : [];
        }
        return this.compiled;
    }

    private emit(): void {
        for (const listener of [...this.listeners]) listener();
    }
}
