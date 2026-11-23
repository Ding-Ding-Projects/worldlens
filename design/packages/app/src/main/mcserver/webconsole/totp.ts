/**
 * Authenticator-app codes (TOTP, RFC 6238) for the server management site.
 *
 * Standard parameters every authenticator app understands: HMAC-SHA1, 30-second steps, six
 * digits, a 160-bit secret shown as base32. A code is accepted one step either side of now
 * (clock drift), and never twice: the last accepted step is returned so the caller stores it
 * and passes it back, which stops a code seen over someone's shoulder being replayed.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
    let bits = 0;
    let value = 0;
    let out = "";
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

export function base32Decode(text: string): Uint8Array {
    const clean = text.toUpperCase().replace(/[\s=-]/g, "");
    const out: number[] = [];
    let bits = 0;
    let value = 0;
    for (const char of clean) {
        const index = ALPHABET.indexOf(char);
        if (index < 0) throw new Error("The secret is not base32.");
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Uint8Array.from(out);
}

export function newTotpSecret(): string {
    return base32Encode(randomBytes(20));
}

/** The code for one time step. */
export function totpAt(secret: string, step: number): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const mac = createHmac("sha1", Buffer.from(base32Decode(secret)))
        .update(counter)
        .digest();
    const offset = mac[mac.length - 1]! & 0x0f;
    const binary =
        ((mac[offset]! & 0x7f) << 24) |
        (mac[offset + 1]! << 16) |
        (mac[offset + 2]! << 8) |
        mac[offset + 3]!;
    return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export const stepFor = (unixMs: number): number => Math.floor(unixMs / 1000 / TOTP_STEP_SECONDS);

/**
 * Checks a code. Returns the accepted step, which the caller stores as `lastStep`, or `null`.
 * A step at or before `lastStep` is refused even when its code is right.
 */
export function verifyTotp(
    secret: string,
    code: string,
    unixMs: number,
    lastStep: number | null,
): number | null {
    const digits = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(digits)) return null;
    const now = stepFor(unixMs);
    for (const step of [now - 1, now, now + 1]) {
        if (lastStep !== null && step <= lastStep) continue;
        const expected = Buffer.from(totpAt(secret, step));
        if (timingSafeEqual(expected, Buffer.from(digits))) return step;
    }
    return null;
}

/** The `otpauth://` link an authenticator app reads from a QR code. */
export function otpauthUri(secret: string, account: string, issuer: string): string {
    const label = encodeURIComponent(`${issuer}:${account}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
