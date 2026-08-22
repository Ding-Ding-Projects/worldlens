/**
 * The result type every function in this module answers with.
 *
 * Same shape as `transport/types.ts#Answer`, but with its own failure code union: a
 * config document has failure modes a transport does not (a stale hash, an unparsable
 * file, an alias write) and none of the transport's own (unreachable host, permission
 * refusal). Nothing in this module throws.
 */

export type ConfigFailureCode =
    /** The write's `expectedHash` did not match the document's current hash. Wrote nothing. */
    | "stale-document"
    /** The source text could not be parsed at all. */
    | "parse-error"
    /** The requested path does not exist in the document. */
    | "not-found"
    /** The node at this path is read-only (a YAML alias or merge-key target). */
    | "read-only"
    /** The value does not fit the field's control (wrong type, out of range, not in enum). */
    | "invalid-value";

export interface ConfigFailure {
    readonly code: ConfigFailureCode;
    readonly message: string;
}

export type ConfigAnswer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: ConfigFailure };

export function ok<T>(value: T): ConfigAnswer<T> {
    return { ok: true, value };
}

export function fail<T = never>(code: ConfigFailureCode, message: string): ConfigAnswer<T> {
    return { ok: false, failure: { code, message } };
}
