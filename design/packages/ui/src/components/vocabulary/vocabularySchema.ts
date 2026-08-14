/**
 * The versioned, bounded contract for a user-supplied personal-vocabulary JSON file.
 *
 * Nothing here ships a real mapping. The limits and the validator exist so a file
 * somebody picks from their own disk can be trusted enough to cache and render, and
 * so a file that is too large, too deep, too crowded, or shaped wrong is rejected
 * whole rather than applied in part. A partial application is the one outcome a
 * private replacement list must never produce: it would mean some of the user's own
 * words made it onto screen and some did not, with no way to tell which from looking
 * at the result.
 *
 * The schema is deliberately flat and small. A vocabulary entry replaces one piece of
 * rendered text with another; it is not a place to smuggle markup, a URL, or anything
 * that could be mistaken for a command, a path, or an identifier, because those stay
 * verbatim per the same rule that keeps a locked tab's label readable and a changelog
 * entry's commit SHA exact.
 */

export const VOCABULARY_SCHEMA_VERSION = 1 as const;

/** Hard ceiling on the raw file, in bytes, read before anything is parsed. */
export const VOCABULARY_MAX_BYTES = 262_144; // 256 KiB

/** The complete payload is a top-level object containing one flat entries object. */
export const VOCABULARY_MAX_DEPTH = 2;

/** How many replacement entries a single file may declare. */
export const VOCABULARY_MAX_ENTRIES = 4_096;

/** Bounds on one entry's key (the term being replaced). */
export const VOCABULARY_MAX_KEY_LENGTH = 160;

/** Bounds on one entry's value (the replacement text). */
export const VOCABULARY_MAX_VALUE_LENGTH = 1_000;

/**
 * Object keys JavaScript treats specially, and which this format refuses to accept as
 * a vocabulary term. A payload naming one of these is rejected rather than merged,
 * because merging it is how a crafted file reaches the store's own prototype.
 */
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Control code points do not belong in labels or accessible names. */
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;

/** The only top-level shape a payload may declare. Extra fields are rejected outright. */
const ALLOWED_TOP_LEVEL_KEYS = new Set(["schemaVersion", "entries"]);

export interface VocabularyPayload {
    readonly schemaVersion: typeof VOCABULARY_SCHEMA_VERSION;
    /** Term to replacement text. Both sides are plain strings, never markup or HTML. */
    readonly entries: Readonly<Record<string, string>>;
}

export type VocabularyRejectionReason =
    | "too-large"
    | "malformed-json"
    | "not-an-object"
    | "unexpected-field"
    | "missing-schema-version"
    | "unknown-schema-version"
    | "missing-entries"
    | "entries-not-an-object"
    | "too-many-entries"
    | "too-deeply-nested"
    | "unsafe-key"
    | "key-too-long"
    | "empty-key"
    | "duplicate-key"
    | "control-character"
    | "value-not-a-string"
    | "value-too-long"
    /** Not a validation outcome: the chosen file's bytes could not be read from disk. */
    | "read-failed";

export interface VocabularyValidationFailure {
    readonly ok: false;
    readonly reason: VocabularyRejectionReason;
    /** Which entry key the failure names, when the failure is about one entry. */
    readonly key?: string;
}

export interface VocabularyValidationSuccess {
    readonly ok: true;
    readonly payload: VocabularyPayload;
}

export type VocabularyValidationResult = VocabularyValidationFailure | VocabularyValidationSuccess;

function fail(reason: VocabularyRejectionReason, key?: string): VocabularyValidationFailure {
    return key === undefined ? { ok: false, reason } : { ok: false, reason, key };
}

/** Counts Unicode code points rather than UTF-16 code units for the contract's text limits. */
function characterCount(value: string): number {
    return Array.from(value).length;
}

/**
 * Returns true as soon as the parsed value would exceed the contract's allowed nesting.
 * The iterative walk stays bounded even when an adversarial payload is deeply nested.
 */
function exceedsMaximumDepth(value: unknown): boolean {
    const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
    while (pending.length > 0) {
        const current = pending.pop() as { value: unknown; depth: number };
        if (current.value === null || typeof current.value !== "object") continue;

        const nextDepth = current.depth + 1;
        if (nextDepth > VOCABULARY_MAX_DEPTH) return true;
        const children = Array.isArray(current.value)
            ? current.value
            : Object.values(current.value as Record<string, unknown>);
        for (const child of children) pending.push({ value: child, depth: nextDepth });
    }
    return false;
}

/**
 * `JSON.parse` keeps only the last occurrence of a repeated object key. Scan the already
 * syntax-checked JSON once as well so duplicate keys are rejected instead of silently folded.
 */
function hasDuplicateJsonObjectKey(source: string): boolean {
    let cursor = 0;
    let duplicate = false;

    const skipWhitespace = (): void => {
        while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    };

    const scanString = (): string => {
        const start = cursor;
        cursor += 1; // opening quote
        while (cursor < source.length) {
            const character = source[cursor] as string;
            cursor += 1;
            if (character === "\\") {
                cursor += 1;
                continue;
            }
            if (character === '"') return JSON.parse(source.slice(start, cursor)) as string;
        }
        // JSON.parse has already verified syntax, so this is defensive only.
        return "";
    };

    const scanValue = (): void => {
        skipWhitespace();
        const character = source[cursor];
        if (character === "{") {
            cursor += 1;
            const keys = new Set<string>();
            skipWhitespace();
            if (source[cursor] === "}") {
                cursor += 1;
                return;
            }
            while (cursor < source.length) {
                skipWhitespace();
                const key = scanString();
                if (keys.has(key)) duplicate = true;
                keys.add(key);
                skipWhitespace();
                cursor += 1; // colon
                scanValue();
                skipWhitespace();
                if (source[cursor] === "}") {
                    cursor += 1;
                    return;
                }
                cursor += 1; // comma
            }
            return;
        }
        if (character === "[") {
            cursor += 1;
            skipWhitespace();
            if (source[cursor] === "]") {
                cursor += 1;
                return;
            }
            while (cursor < source.length) {
                scanValue();
                skipWhitespace();
                if (source[cursor] === "]") {
                    cursor += 1;
                    return;
                }
                cursor += 1; // comma
            }
            return;
        }
        if (character === '"') {
            scanString();
            return;
        }
        while (cursor < source.length && !/[\s,}\]]/u.test(source[cursor] as string)) {
            cursor += 1;
        }
    };

    scanValue();
    return duplicate;
}

/**
 * Validates the complete byte payload of a candidate vocabulary file before anything
 * from it is displayed or cached. Every check runs before any entry is accepted, so a
 * file that fails on its 900th entry is rejected as a whole rather than applying its
 * first 899 - the "never partially" rule this feature exists under.
 */
export function validateVocabularyPayload(bytes: string): VocabularyValidationResult {
    if (new TextEncoder().encode(bytes).byteLength > VOCABULARY_MAX_BYTES) return fail("too-large");

    let parsed: unknown;
    try {
        parsed = JSON.parse(bytes);
    } catch {
        return fail("malformed-json");
    }

    if (hasDuplicateJsonObjectKey(bytes)) return fail("duplicate-key");

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return fail("not-an-object");
    }

    const record = parsed as Record<string, unknown>;
    for (const field of Object.keys(record)) {
        if (!ALLOWED_TOP_LEVEL_KEYS.has(field)) return fail("unexpected-field");
    }

    if (exceedsMaximumDepth(parsed)) return fail("too-deeply-nested");

    if (!("schemaVersion" in record)) return fail("missing-schema-version");
    if (record.schemaVersion !== VOCABULARY_SCHEMA_VERSION) return fail("unknown-schema-version");

    if (!("entries" in record)) return fail("missing-entries");
    const entries = record.entries;
    if (entries === null || typeof entries !== "object" || Array.isArray(entries)) {
        return fail("entries-not-an-object");
    }

    const entriesRecord = entries as Record<string, unknown>;
    const keys = Object.keys(entriesRecord);
    if (keys.length > VOCABULARY_MAX_ENTRIES) return fail("too-many-entries");

    for (const key of keys) {
        if (UNSAFE_KEYS.has(key)) return fail("unsafe-key", key);
        if (key.length === 0) return fail("empty-key");
        if (characterCount(key) > VOCABULARY_MAX_KEY_LENGTH) return fail("key-too-long", key);
        if (CONTROL_CHARACTER.test(key)) return fail("control-character", key);

        const value = entriesRecord[key];
        if (typeof value !== "string") return fail("value-not-a-string", key);
        if (characterCount(value) > VOCABULARY_MAX_VALUE_LENGTH) return fail("value-too-long", key);
        if (CONTROL_CHARACTER.test(value)) return fail("control-character", key);
    }

    const validated: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const key of keys) validated[key] = entriesRecord[key] as string;

    return {
        ok: true,
        payload: { schemaVersion: VOCABULARY_SCHEMA_VERSION, entries: validated },
    };
}
