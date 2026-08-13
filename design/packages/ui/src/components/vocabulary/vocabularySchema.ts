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

/** JSON.parse produces plain objects and arrays; this bounds how deep either may nest. */
export const VOCABULARY_MAX_DEPTH = 4;

/** How many replacement entries a single file may declare. */
export const VOCABULARY_MAX_ENTRIES = 2_000;

/** Bounds on one entry's key (the term being replaced). */
export const VOCABULARY_MAX_KEY_LENGTH = 200;

/** Bounds on one entry's value (the replacement text). */
export const VOCABULARY_MAX_VALUE_LENGTH = 2_000;

/**
 * Object keys JavaScript treats specially, and which this format refuses to accept as
 * a vocabulary term. A payload naming one of these is rejected rather than merged,
 * because merging it is how a crafted file reaches the store's own prototype.
 */
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

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

/**
 * How deep a parsed JSON value nests. A bare string or number is depth 0; an object or
 * array wrapping one is depth 1, and so on. Only used to reject a payload whose
 * "entries" value hides further nested objects or arrays rather than plain strings,
 * since the contract is a flat map and nothing here needs more than that to render.
 */
function depthOf(value: unknown): number {
    if (value === null || typeof value !== "object") return 0;
    const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
    if (children.length === 0) return 1;
    return 1 + Math.max(...children.map(depthOf));
}

/**
 * Validates the complete byte payload of a candidate vocabulary file before anything
 * from it is displayed or cached. Every check runs before any entry is accepted, so a
 * file that fails on its 900th entry is rejected as a whole rather than applying its
 * first 899 - the "never partially" rule this feature exists under.
 */
export function validateVocabularyPayload(bytes: string): VocabularyValidationResult {
    // `bytes.length` is UTF-16 code units, not bytes, but it is a safe, cheap proxy for
    // an upper bound: no encoding turns fewer UTF-16 units into more UTF-8 bytes by a
    // factor worth worrying about here, and this only needs to reject something clearly
    // too large before the more expensive checks below run.
    if (bytes.length > VOCABULARY_MAX_BYTES) return fail("too-large");

    let parsed: unknown;
    try {
        parsed = JSON.parse(bytes);
    } catch {
        return fail("malformed-json");
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return fail("not-an-object");
    }

    const record = parsed as Record<string, unknown>;
    for (const field of Object.keys(record)) {
        if (!ALLOWED_TOP_LEVEL_KEYS.has(field)) return fail("unexpected-field");
    }

    if (!("schemaVersion" in record)) return fail("missing-schema-version");
    if (record.schemaVersion !== VOCABULARY_SCHEMA_VERSION) return fail("unknown-schema-version");

    if (!("entries" in record)) return fail("missing-entries");
    const entries = record.entries;
    if (entries === null || typeof entries !== "object" || Array.isArray(entries)) {
        return fail("entries-not-an-object");
    }

    if (depthOf(entries) > VOCABULARY_MAX_DEPTH) return fail("too-deeply-nested");

    const entriesRecord = entries as Record<string, unknown>;
    const keys = Object.keys(entriesRecord);
    if (keys.length > VOCABULARY_MAX_ENTRIES) return fail("too-many-entries");

    // `Object.keys` already folds JSON's own duplicate keys down to the last one written,
    // so a JSON-level duplicate cannot be detected after parsing. What is checked here is
    // a duplicate that survives case-insensitive or whitespace-padded comparison, which a
    // parsed object's keys can still carry and which would otherwise let two entries
    // silently disagree about the same rendered term.
    const seenNormalised = new Set<string>();

    for (const key of keys) {
        if (UNSAFE_KEYS.has(key)) return fail("unsafe-key", key);
        if (key.length === 0) return fail("empty-key");
        if (key.length > VOCABULARY_MAX_KEY_LENGTH) return fail("key-too-long", key);

        const normalised = key.trim().toLowerCase();
        if (seenNormalised.has(normalised)) return fail("duplicate-key", key);
        seenNormalised.add(normalised);

        const value = entriesRecord[key];
        if (typeof value !== "string") return fail("value-not-a-string", key);
        if (value.length > VOCABULARY_MAX_VALUE_LENGTH) return fail("value-too-long", key);
    }

    const validated: Record<string, string> = {};
    for (const key of keys) validated[key] = entriesRecord[key] as string;

    return {
        ok: true,
        payload: { schemaVersion: VOCABULARY_SCHEMA_VERSION, entries: validated },
    };
}
