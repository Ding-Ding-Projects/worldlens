/**
 * Time-based one-time passwords, to the letter of RFC 6238 over RFC 4226.
 *
 * Two features in this application need this and they are not the same feature. The toy
 * locks let somebody put a per-element lock behind an authenticator, and the built-in
 * authenticator holds arbitrary TOTP secrets for whatever accounts a person likes. Both
 * would otherwise grow their own implementation, and the second one to drift would be the
 * one nobody noticed had drifted.
 *
 * ## Why the test vectors matter more than the code
 *
 * A subtly wrong TOTP implementation does not throw, does not warn, and does not look
 * wrong. It produces six perfectly plausible digits that every server on earth rejects,
 * and the person holding them has no error message to read - they simply cannot get in.
 * So `totp.test.ts` runs RFC 6238's own published vectors for SHA-1, SHA-256 and SHA-512
 * at eight digits, and a change that breaks any of them fails there rather than in
 * somebody's hands.
 *
 * ## What is deliberately not here
 *
 * No storage, no clock skew policy, no rate limiting, no key generation. Those are
 * decisions the surfaces above make differently - a toy lock is forgiving where an account
 * factor is not - and burying one of them here would quietly impose it on both.
 */

/** The hash a TOTP secret was issued for. SHA-1 is what the world actually issues. */
export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

/** Everything a code depends on, named rather than assumed. */
export interface TotpParameters {
    readonly algorithm: TotpAlgorithm;
    /** 6 to 8. Six is what almost every issuer uses. */
    readonly digits: number;
    /** Seconds per step. Thirty is the near-universal default. */
    readonly period: number;
}

export const TOTP_DEFAULTS: TotpParameters = { algorithm: "SHA-1", digits: 6, period: 30 };

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type Base32Result =
    | { readonly ok: true; readonly bytes: Uint8Array }
    | { readonly ok: false; readonly message: string };

/**
 * RFC 4648 base32, which is the one encoding every authenticator agrees on.
 *
 * Padding, spaces and lower case are all accepted because that is how a secret arrives when
 * a person copies it off a web page - grouped in fours, sometimes lower case, sometimes with
 * a trailing `=`. Refusing those would reject secrets that are perfectly valid, which reads
 * to the person typing as "this app is broken" rather than "this app is strict".
 */
export function decodeBase32(text: string): Base32Result {
    const cleaned = text.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
    if (cleaned === "") return { ok: false, message: "A secret cannot be empty." };

    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const character of cleaned) {
        const index = BASE32_ALPHABET.indexOf(character);
        if (index < 0) {
            return {
                ok: false,
                message: `"${character}" is not part of a base32 secret. A secret uses A-Z and 2-7 only.`,
            };
        }
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            out.push((value >> bits) & 0xff);
        }
    }
    if (out.length === 0) return { ok: false, message: "That secret is too short to hold a key." };
    return { ok: true, bytes: new Uint8Array(out) };
}

/** The inverse, used when this application generates a secret for somebody to scan or type. */
export function encodeBase32(bytes: Uint8Array): string {
    let bits = 0;
    let value = 0;
    let out = "";
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            out += BASE32_ALPHABET[(value >>> bits) & 31];
        }
    }
    if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

/**
 * One HOTP value for an explicit counter - RFC 4226 section 5.3, dynamic truncation and all.
 *
 * Exported because the RFC 6238 vectors are stated as counter values, so the test can check
 * this directly rather than reconstructing a timestamp and hoping the arithmetic above it
 * agrees.
 */
export async function hotp(
    secret: Uint8Array,
    counter: number,
    parameters: TotpParameters = TOTP_DEFAULTS,
): Promise<string> {
    const message = new Uint8Array(8);
    // A JavaScript number holds a counter far past any real clock, but bit operators are
    // 32-bit, so the high and low halves are written separately rather than shifted.
    let high = Math.floor(counter / 0x100000000);
    let low = counter >>> 0;
    for (let index = 7; index >= 4; index -= 1) {
        message[index] = low & 0xff;
        low = low >>> 8;
    }
    for (let index = 3; index >= 0; index -= 1) {
        message[index] = high & 0xff;
        high = Math.floor(high / 256);
    }

    const key = await crypto.subtle.importKey(
        "raw",
        secret as unknown as ArrayBuffer,
        { name: "HMAC", hash: parameters.algorithm },
        false,
        ["sign"],
    );
    const mac = new Uint8Array(
        await crypto.subtle.sign("HMAC", key, message as unknown as ArrayBuffer),
    );

    const offset = mac[mac.length - 1]! & 0x0f;
    const truncated =
        ((mac[offset]! & 0x7f) << 24) |
        ((mac[offset + 1]! & 0xff) << 16) |
        ((mac[offset + 2]! & 0xff) << 8) |
        (mac[offset + 3]! & 0xff);

    return String(truncated % 10 ** parameters.digits).padStart(parameters.digits, "0");
}

/** Which step a moment in time falls in. Exported so a countdown can be derived from it. */
export function totpCounter(atMs: number, period: number): number {
    return Math.floor(atMs / 1000 / period);
}

/** Seconds left in the current step, so a countdown never has to guess. */
export function totpSecondsRemaining(atMs: number, period: number): number {
    return period - Math.floor(atMs / 1000) % period;
}

/** The code for a moment in time. */
export async function totp(
    secret: Uint8Array,
    atMs: number,
    parameters: TotpParameters = TOTP_DEFAULTS,
): Promise<string> {
    return await hotp(secret, totpCounter(atMs, parameters.period), parameters);
}

/**
 * Whether a typed code is one this secret produced, within a window of steps either side.
 *
 * The window exists because clocks drift, and a person typing six digits at the very end of
 * a step will submit them in the next one. One step either side is the conventional
 * allowance; a caller wanting stricter or looser says so rather than this deciding for it.
 *
 * Compared digit by digit over the whole window rather than short-circuiting on the first
 * mismatch. The timing signal here is small and the stakes are a for-fun lock, but writing
 * the comparison the careful way once is cheaper than remembering which of the two callers
 * needed it.
 */
export async function verifyTotp(
    secret: Uint8Array,
    code: string,
    atMs: number,
    parameters: TotpParameters = TOTP_DEFAULTS,
    windowSteps = 1,
): Promise<boolean> {
    const typed = code.replace(/[\s-]/g, "");
    if (!new RegExp(`^\\d{${parameters.digits}}$`).test(typed)) return false;

    const counter = totpCounter(atMs, parameters.period);
    let matched = false;
    for (let step = -windowSteps; step <= windowSteps; step += 1) {
        const candidate = await hotp(secret, counter + step, parameters);
        matched = equalStrings(candidate, typed) || matched;
    }
    return matched;
}

function equalStrings(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index += 1) {
        difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
    }
    return difference === 0;
}

/* -------------------------------------------------------------------------- */
/* The pairing URI                                                            */
/* -------------------------------------------------------------------------- */

export interface OtpauthParts {
    readonly issuer: string;
    readonly account: string;
    readonly secret: string;
    readonly parameters: TotpParameters;
}

/**
 * The `otpauth://totp/` URI an authenticator scans.
 *
 * Every parameter is written out rather than left to the reader's default, including the
 * ones that happen to match the defaults today. An authenticator that assumes SHA-1/6/30
 * for a secret issued as SHA-256 produces codes that are rejected with no explanation, and
 * six characters of URI is a cheap price for never having that conversation.
 */
export function otpauthUri(parts: OtpauthParts): string {
    const label = `${parts.issuer}:${parts.account}`;
    const query = new URLSearchParams({
        secret: parts.secret,
        issuer: parts.issuer,
        algorithm: parts.parameters.algorithm.replace("-", ""),
        digits: String(parts.parameters.digits),
        period: String(parts.parameters.period),
    });
    return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}

export type OtpauthParseResult =
    | { readonly ok: true; readonly parts: OtpauthParts }
    | { readonly ok: false; readonly message: string };

/**
 * The inverse, so pasting a URI is a first-class way to register a secret.
 *
 * Parameters carried by the URI win over the defaults - an issuer that says SHA-512 means
 * SHA-512, and overwriting that with this application's own preference is exactly how a
 * pairing ends up producing codes nobody accepts.
 */
export function parseOtpauthUri(text: string): OtpauthParseResult {
    let url: URL;
    try {
        url = new URL(text.trim());
    } catch {
        return { ok: false, message: "That is not a link an authenticator would produce." };
    }
    if (url.protocol !== "otpauth:") {
        return { ok: false, message: "An authenticator link starts with otpauth://." };
    }
    if (url.host.toLowerCase() !== "totp") {
        return { ok: false, message: `Only time-based codes are supported, not ${url.host}.` };
    }

    const secret = url.searchParams.get("secret");
    if (secret === null || decodeBase32(secret).ok === false) {
        return { ok: false, message: "That link carries no readable secret." };
    }

    const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const colon = label.indexOf(":");
    const labelIssuer = colon < 0 ? "" : label.slice(0, colon).trim();
    const account = (colon < 0 ? label : label.slice(colon + 1)).trim();

    const algorithmText = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase();
    const algorithm: TotpAlgorithm | null =
        algorithmText === "SHA1"
            ? "SHA-1"
            : algorithmText === "SHA256"
              ? "SHA-256"
              : algorithmText === "SHA512"
                ? "SHA-512"
                : null;
    if (algorithm === null) {
        return { ok: false, message: `${algorithmText} is not a hash this build can compute.` };
    }

    const digits = Number(url.searchParams.get("digits") ?? "6");
    if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
        return { ok: false, message: "A code has to be 6, 7 or 8 digits long." };
    }
    const period = Number(url.searchParams.get("period") ?? "30");
    if (!Number.isInteger(period) || period < 1 || period > 600) {
        return { ok: false, message: "A step has to be between 1 and 600 seconds." };
    }

    return {
        ok: true,
        parts: {
            issuer: url.searchParams.get("issuer")?.trim() ?? labelIssuer,
            account,
            secret,
            parameters: { algorithm, digits, period },
        },
    };
}

/** A fresh 160-bit secret, which is what RFC 4226 recommends and what issuers use. */
export function generateSecret(bytes = 20): string {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);
    return encodeBase32(buffer);
}
