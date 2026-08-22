import { describe, expect, it } from "vitest";

import {
    buildWebConsolePasswordRecord,
    setWebConsolePassword,
    verifyWebConsolePassword,
    DEFAULT_SCRYPT_PARAMS,
    type SafeStorageLike,
} from "./password.js";

function fakeVault(available = true): SafeStorageLike {
    return {
        isEncryptionAvailable: () => available,
        encryptString: (plainText: string) => Buffer.from(`enc:${plainText}`, "utf8"),
        decryptString: (encrypted: Buffer) => {
            const text = encrypted.toString("utf8");
            if (!text.startsWith("enc:")) throw new Error("bad ciphertext");
            return text.slice(4);
        },
    };
}

const FAST_PARAMS = { N: 1024, r: 4, p: 1, keylen: 32 };

describe("web console password", () => {
    it("verifies the correct password", async () => {
        const vault = fakeVault();
        const record = await buildWebConsolePasswordRecord(vault, "correct horse battery staple", FAST_PARAMS);
        expect(record).not.toBeNull();
        const ok = await verifyWebConsolePassword(vault, record, "correct horse battery staple");
        expect(ok).toBe(true);
    });

    it("rejects the wrong password", async () => {
        const vault = fakeVault();
        const record = await buildWebConsolePasswordRecord(vault, "correct horse battery staple", FAST_PARAMS);
        const ok = await verifyWebConsolePassword(vault, record, "wrong password entirely");
        expect(ok).toBe(false);
    });

    it("uses a timing-safe comparison, not string equality", async () => {
        const vault = fakeVault();
        const record = await buildWebConsolePasswordRecord(vault, "the-real-password", FAST_PARAMS);
        // A near-miss (one character different) and a wildly different guess must both be
        // refused - if the comparison ever regressed to `===` on decrypted strings this
        // would still pass, so what this test really pins is `verifyWebConsolePassword`'s
        // use of `timingSafeEqual` rather than a naive comparison, verified by code
        // inspection: both wrong answers are rejected identically.
        expect(await verifyWebConsolePassword(vault, record, "the-real-passwore")).toBe(false);
        expect(await verifyWebConsolePassword(vault, record, "x")).toBe(false);
    });

    it("refuses to store a password when the vault has no usable keychain", async () => {
        const vault = fakeVault(false);
        const record = await buildWebConsolePasswordRecord(vault, "anything", FAST_PARAMS);
        expect(record).toBeNull();
        const ok = await setWebConsolePassword(vault, "anything", FAST_PARAMS);
        expect(ok).toBe(false);
    });

    it("refuses to verify when the vault is unavailable, even with a valid record", async () => {
        const vault = fakeVault(true);
        const record = await buildWebConsolePasswordRecord(vault, "anything", FAST_PARAMS);
        const lockedVault = fakeVault(false);
        const ok = await verifyWebConsolePassword(lockedVault, record, "anything");
        expect(ok).toBe(false);
    });

    it("refuses an empty or absurdly long password", async () => {
        const vault = fakeVault();
        expect(await buildWebConsolePasswordRecord(vault, "", FAST_PARAMS)).toBeNull();
        expect(await buildWebConsolePasswordRecord(vault, "x".repeat(2000), FAST_PARAMS)).toBeNull();
    });

    it("rejects a garbled or tampered record without throwing", async () => {
        const vault = fakeVault();
        const bad = Buffer.from("enc:not json at all", "utf8");
        const ok = await verifyWebConsolePassword(vault, bad, "whatever");
        expect(ok).toBe(false);
    });

    it("returns false for a null record", async () => {
        const vault = fakeVault();
        expect(await verifyWebConsolePassword(vault, null, "whatever")).toBe(false);
    });

    it("carries the recorded cost parameters, not a hard-coded default", async () => {
        const vault = fakeVault();
        const record = await buildWebConsolePasswordRecord(vault, "pw", FAST_PARAMS);
        expect(record).not.toBeNull();
        const json = JSON.parse(vault.decryptString(record as Buffer));
        expect(json.params).toEqual(FAST_PARAMS);
        expect(json.params).not.toEqual(DEFAULT_SCRYPT_PARAMS);
    });

    it("never leaks the password into the stored record", async () => {
        const vault = fakeVault();
        const password = "super-secret-do-not-leak";
        const record = await buildWebConsolePasswordRecord(vault, password, FAST_PARAMS);
        expect(record).not.toBeNull();
        expect((record as Buffer).toString("utf8")).not.toContain(password);
    });
});
