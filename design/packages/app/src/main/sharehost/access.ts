/**
 * Viewer access codes for a hosted map.
 *
 * The code is generated here, shown to the person once, and turned into a salted scrypt
 * verifier before it goes anywhere else. The map's settings file carries the verifier only,
 * and the registry records that a code exists but never what it was. A lost code is replaced
 * by hosting again, which is honest; a stored one would be a secret kept forever for a
 * convenience nobody asked for.
 *
 * Verifier format: `scrypt$N$r$p$<salt hex>$<hash hex>`, read by the map server.
 */
import { randomBytes, randomInt, scryptSync } from "node:crypto";

const WORDS_A = ["kite", "amber", "river", "maple", "cedar", "lunar", "ember", "coral", "alpine", "quiet", "bright", "swift"];
const WORDS_B = ["harbor", "meadow", "falcon", "lantern", "summit", "willow", "garnet", "comet", "orchard", "pebble", "thistle", "anchor"];

export const ACCESS_NAME = "viewer";
const N = 16384;
const R = 8;
const P = 1;

export interface AccessSecrets {
    readonly name: string;
    /** Shown once. */
    readonly code: string;
    readonly verifier: string;
}

export function verifierFor(code: string, salt: Buffer = randomBytes(16)): string {
    const hash = scryptSync(code, salt, 32, { N, r: R, p: P });
    return `scrypt$${String(N)}$${String(R)}$${String(P)}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Three short words and four digits: easy to read aloud and still about 28 bits of choice. */
export function generateAccess(): AccessSecrets {
    const a = WORDS_A[randomInt(WORDS_A.length)] as string;
    const b = WORDS_B[randomInt(WORDS_B.length)] as string;
    const code = `${a}-${b}-${String(randomInt(1000, 10000))}`;
    return { name: ACCESS_NAME, code, verifier: verifierFor(code) };
}
