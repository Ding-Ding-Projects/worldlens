/**
 * Hashing bytes, in one place, because two spellings of the same digest is a bug factory.
 *
 * Every transport hands out a `FileBlob.hash` and accepts a `WriteOptions.expectedHash`,
 * and the whole stale-write guard rests on those two being computed identically. If the
 * local transport lowercases its hex and a Docker one does not, every write through the
 * second one is refused as stale against a hash the first one produced, and the symptom -
 * "saving works locally and never in a container" - points at everything except the
 * casing of a string.
 */

import { createHash } from "node:crypto";

/** sha256 of `bytes`, lowercase hex. The only spelling used anywhere in this feature. */
export function hashBytes(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Compares two hashes without caring about case or surrounding space.
 *
 * A hash arriving back from the renderer has been through JSON and a Vue ref, and a hash
 * read out of a receipt file has been through a text editor. Neither should be able to
 * turn a matching digest into a spurious `stale-document` refusal.
 */
export function hashesMatch(left: string | null, right: string | null): boolean {
    if (left === null || right === null) return false;
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}
