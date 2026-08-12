/**
 * RFC 6238's own published vectors, plus the encoding and URI work around them.
 *
 * The vectors are the whole point of this file. A TOTP implementation that is subtly wrong
 * produces plausible digits that every server rejects, with no error anywhere to read, so
 * "it looks right" is worth nothing here and an appeal to the RFC is worth everything.
 *
 * The published table gives eight-digit codes for three hashes at six moments in time. The
 * seeds are the ASCII strings the RFC names, repeated to the hash's block size - a detail
 * that is easy to miss and produces a table of near-misses when it is.
 */

import { describe, expect, it } from "vitest";

import {
    TOTP_DEFAULTS,
    decodeBase32,
    encodeBase32,
    generateSecret,
    hotp,
    otpauthUri,
    parseOtpauthUri,
    totp,
    totpCounter,
    totpSecondsRemaining,
    verifyTotp,
    type TotpAlgorithm,
} from "./totp.js";

const encoder = new TextEncoder();

/** RFC 6238's seeds: `12345678901234567890`, cut or repeated to the key length it names. */
function seed(algorithm: TotpAlgorithm): Uint8Array {
    const bytes = algorithm === "SHA-1" ? 20 : algorithm === "SHA-256" ? 32 : 64;
    const base = encoder.encode("12345678901234567890");
    const out = new Uint8Array(bytes);
    for (let index = 0; index < bytes; index += 1) out[index] = base[index % base.length]!;
    return out;
}

/** The RFC 6238 appendix B table, seconds paired with the code each hash produces. */
const VECTORS: readonly {
    seconds: number;
    sha1: string;
    sha256: string;
    sha512: string;
}[] = [
    { seconds: 59, sha1: "94287082", sha256: "46119246", sha512: "90693936" },
    { seconds: 1111111109, sha1: "07081804", sha256: "68084774", sha512: "25091201" },
    { seconds: 1111111111, sha1: "14050471", sha256: "67062674", sha512: "99943326" },
    { seconds: 1234567890, sha1: "89005924", sha256: "91819424", sha512: "93441116" },
    { seconds: 2000000000, sha1: "69279037", sha256: "90698825", sha512: "38618901" },
    { seconds: 20000000000, sha1: "65353130", sha256: "77737706", sha512: "47863826" },
];

describe("RFC 6238, to the letter", () => {
    it("reproduces every published vector for SHA-1 at eight digits", async () => {
        for (const vector of VECTORS) {
            const code = await totp(seed("SHA-1"), vector.seconds * 1000, {
                algorithm: "SHA-1",
                digits: 8,
                period: 30,
            });
            expect(code, `t=${vector.seconds}`).toBe(vector.sha1);
        }
    });

    it("reproduces every published vector for SHA-256 at eight digits", async () => {
        for (const vector of VECTORS) {
            const code = await totp(seed("SHA-256"), vector.seconds * 1000, {
                algorithm: "SHA-256",
                digits: 8,
                period: 30,
            });
            expect(code, `t=${vector.seconds}`).toBe(vector.sha256);
        }
    });

    it("reproduces every published vector for SHA-512 at eight digits", async () => {
        for (const vector of VECTORS) {
            const code = await totp(seed("SHA-512"), vector.seconds * 1000, {
                algorithm: "SHA-512",
                digits: 8,
                period: 30,
            });
            expect(code, `t=${vector.seconds}`).toBe(vector.sha512);
        }
    });

    it("truncates to six digits from the same value rather than computing a different one", async () => {
        // The digit count is a modulus over one dynamically truncated number, not a second
        // algorithm - so the six-digit code is the eight-digit one's last six.
        const eight = await hotp(seed("SHA-1"), 1, { algorithm: "SHA-1", digits: 8, period: 30 });
        const six = await hotp(seed("SHA-1"), 1, { algorithm: "SHA-1", digits: 6, period: 30 });
        expect(six).toBe(eight.slice(-6));
    });

    it("writes a counter past 2^32 into all eight bytes rather than wrapping it", async () => {
        // The RFC's own table never reaches this far - its largest counter is 666,666,666 -
        // so the vectors above prove nothing about the high half of the counter. The
        // property is stated directly instead: two counters differing ONLY above the 32-bit
        // boundary must produce different codes. A naive `counter >>> 8` loop makes them
        // identical, silently, for every counter past 2^32.
        const low = 1;
        const high = 0x100000000 + 1;
        expect(await hotp(seed("SHA-1"), high)).not.toBe(await hotp(seed("SHA-1"), low));
    });
});

describe("the countdown a surface shows", () => {
    it("counts down within a step and resets on the boundary", () => {
        expect(totpSecondsRemaining(0, 30)).toBe(30);
        expect(totpSecondsRemaining(1000, 30)).toBe(29);
        expect(totpSecondsRemaining(29_000, 30)).toBe(1);
        expect(totpSecondsRemaining(30_000, 30)).toBe(30);
    });

    it("never shows zero, because a zero that lingers reads as a stopped clock", () => {
        for (let second = 0; second < 120; second += 1) {
            const left = totpSecondsRemaining(second * 1000, 30);
            expect(left).toBeGreaterThan(0);
            expect(left).toBeLessThanOrEqual(30);
        }
    });
});

describe("accepting a code somebody typed", () => {
    const secret = seed("SHA-1");
    const now = 1111111111 * 1000;

    it("accepts the current code", async () => {
        const code = await totp(secret, now, TOTP_DEFAULTS);
        expect(await verifyTotp(secret, code, now)).toBe(true);
    });

    it("accepts one step either side, because clocks drift and typing takes time", async () => {
        const before = await totp(secret, now - 30_000, TOTP_DEFAULTS);
        const after = await totp(secret, now + 30_000, TOTP_DEFAULTS);
        expect(await verifyTotp(secret, before, now)).toBe(true);
        expect(await verifyTotp(secret, after, now)).toBe(true);
    });

    it("refuses two steps away, so the window is a window rather than a shrug", async () => {
        const far = await totp(secret, now + 90_000, TOTP_DEFAULTS);
        expect(await verifyTotp(secret, far, now)).toBe(false);
    });

    it("ignores the spaces an authenticator puts in for readability", async () => {
        const code = await totp(secret, now, TOTP_DEFAULTS);
        expect(await verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true);
    });

    it("refuses anything that is not the right number of digits", async () => {
        expect(await verifyTotp(secret, "12345", now)).toBe(false);
        expect(await verifyTotp(secret, "1234567", now)).toBe(false);
        expect(await verifyTotp(secret, "abcdef", now)).toBe(false);
        expect(await verifyTotp(secret, "", now)).toBe(false);
    });
});

describe("base32, as a person actually pastes it", () => {
    it("round-trips arbitrary bytes", () => {
        const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 128]);
        const decoded = decodeBase32(encodeBase32(bytes));
        expect(decoded.ok).toBe(true);
        expect(decoded.ok && Array.from(decoded.bytes)).toEqual(Array.from(bytes));
    });

    it("accepts padding, grouping spaces and lower case, which is how it arrives", () => {
        const canonical = decodeBase32("JBSWY3DPEHPK3PXP");
        expect(canonical.ok).toBe(true);
        for (const spelling of ["jbswy3dpehpk3pxp", "JBSW Y3DP EHPK 3PXP", "JBSWY3DPEHPK3PXP="]) {
            const parsed = decodeBase32(spelling);
            expect(parsed.ok, spelling).toBe(true);
            expect(parsed.ok && canonical.ok && Array.from(parsed.bytes)).toEqual(
                canonical.ok ? Array.from(canonical.bytes) : [],
            );
        }
    });

    it("names the offending character rather than failing vaguely", () => {
        const parsed = decodeBase32("JBSW1DP");
        expect(parsed.ok).toBe(false);
        expect(parsed.ok === false && parsed.message).toContain("1");
    });

    it("refuses an empty secret", () => {
        expect(decodeBase32("").ok).toBe(false);
        expect(decodeBase32("   ").ok).toBe(false);
    });

    it("generates a 160-bit secret that decodes back to twenty bytes", () => {
        const parsed = decodeBase32(generateSecret());
        expect(parsed.ok).toBe(true);
        expect(parsed.ok && parsed.bytes.length).toBe(20);
    });
});

describe("the pairing URI", () => {
    it("writes every parameter out, including the ones that match the defaults", () => {
        const uri = otpauthUri({
            issuer: "Worldlens",
            account: "ada@example.test",
            secret: "JBSWY3DPEHPK3PXP",
            parameters: TOTP_DEFAULTS,
        });
        expect(uri).toContain("algorithm=SHA1");
        expect(uri).toContain("digits=6");
        expect(uri).toContain("period=30");
        expect(uri).toContain("issuer=Worldlens");
    });

    it("round-trips, so what is displayed and what is encoded cannot disagree", () => {
        const parts = {
            issuer: "Worldlens",
            account: "ada@example.test",
            secret: "JBSWY3DPEHPK3PXP",
            parameters: { algorithm: "SHA-256" as const, digits: 8, period: 60 },
        };
        const parsed = parseOtpauthUri(otpauthUri(parts));
        expect(parsed.ok).toBe(true);
        expect(parsed.ok && parsed.parts).toEqual(parts);
    });

    it("honours the issuer's parameters rather than overwriting them with our own", () => {
        // The failure this prevents: pairing succeeds, codes are computed with the wrong
        // hash, and every one of them is rejected with nothing to read.
        const parsed = parseOtpauthUri(
            "otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP&algorithm=SHA512&digits=8&period=15",
        );
        expect(parsed.ok && parsed.parts.parameters).toEqual({
            algorithm: "SHA-512",
            digits: 8,
            period: 15,
        });
    });

    it("falls back to the label's issuer when the query carries none", () => {
        const parsed = parseOtpauthUri("otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP");
        expect(parsed.ok && parsed.parts.issuer).toBe("Acme");
        expect(parsed.ok && parsed.parts.account).toBe("ada");
    });

    it("refuses what it cannot honestly pair", () => {
        for (const bad of [
            "not a url",
            "https://example.test/totp?secret=JBSWY3DPEHPK3PXP",
            "otpauth://hotp/Acme:ada?secret=JBSWY3DPEHPK3PXP",
            "otpauth://totp/Acme:ada",
            "otpauth://totp/Acme:ada?secret=1111",
            "otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP&algorithm=MD5",
            "otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP&digits=4",
            "otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP&period=0",
        ]) {
            expect(parseOtpauthUri(bad).ok, bad).toBe(false);
        }
    });
});
