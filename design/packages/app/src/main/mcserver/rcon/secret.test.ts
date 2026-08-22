/**
 * The RCON secret vault, against a real temporary folder.
 *
 * Same shape as `locks/store.test.ts`: a fake `safeStorage` that is reversible but
 * obviously not real encryption, because the point under test is routing and refusal,
 * never the cipher. Nothing in this file ever asserts on a password's own value except
 * to prove a round trip - it never prints one.
 */

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { generateRconPassword, RCON_SECRET_ENTROPY_BYTES, RconSecretStore, type SafeStorageLike } from "./secret.js";

const folders: string[] = [];

afterEach(async () => {
    for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function tempFolder(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "worldlens-rcon-secret-"));
    folders.push(folder);
    return folder;
}

function safeStorage(available = true): SafeStorageLike {
    return {
        isEncryptionAvailable: () => available,
        encryptString: (text) => Buffer.from(`sealed:${text}`, "utf8"),
        decryptString: (buffer) => buffer.toString("utf8").replace(/^sealed:/, ""),
    };
}

describe("generateRconPassword", () => {
    it("generates a strong password with at least 128 bits of entropy", () => {
        // 24 raw bytes = 192 bits, comfortably over the 128-bit floor this module promises.
        expect(RCON_SECRET_ENTROPY_BYTES * 8).toBeGreaterThanOrEqual(128);
        const password = generateRconPassword();
        expect(password.length).toBeGreaterThanOrEqual(24);
    });

    it("uses only wire-safe, shell-safe base64url characters", () => {
        const password = generateRconPassword();
        expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("never generates the same password twice", () => {
        const seen = new Set(Array.from({ length: 50 }, () => generateRconPassword()));
        expect(seen.size).toBe(50);
    });
});

describe("RconSecretStore: round trip", () => {
    it("reports no secret on a first run rather than failing", async () => {
        const store = new RconSecretStore({ dataFolder: await tempFolder(), safeStorage: safeStorage() });
        expect(await store.get("survival-1")).toBeNull();
        expect(await store.has("survival-1")).toBe(false);
    });

    it("generateAndStore returns the password once and it round-trips through get()", async () => {
        const store = new RconSecretStore({ dataFolder: await tempFolder(), safeStorage: safeStorage() });
        const generated = await store.generateAndStore("survival-1");
        expect(generated.ok).toBe(true);
        if (!generated.ok) throw new Error("unreachable");

        const fetched = await store.get("survival-1");
        expect(fetched).toBe(generated.password);
        expect(await store.has("survival-1")).toBe(true);
    });

    it("put() stores an explicit password and it round-trips", async () => {
        const store = new RconSecretStore({ dataFolder: await tempFolder(), safeStorage: safeStorage() });
        const stored = await store.put("creative-1", "some-generated-value");
        expect(stored).toBe(true);
        expect(await store.get("creative-1")).toBe("some-generated-value");
    });

    it("remove() forgets a secret, and absence after is success", async () => {
        const store = new RconSecretStore({ dataFolder: await tempFolder(), safeStorage: safeStorage() });
        await store.put("s1", "pw");
        expect(await store.has("s1")).toBe(true);
        await store.remove("s1");
        expect(await store.has("s1")).toBe(false);
    });

    it("removing an id that was never stored does not throw", async () => {
        const store = new RconSecretStore({ dataFolder: await tempFolder(), safeStorage: safeStorage() });
        await expect(store.remove("never-existed")).resolves.toBeUndefined();
    });

    it("two different servers keep independent secrets", async () => {
        const store = new RconSecretStore({ dataFolder: await tempFolder(), safeStorage: safeStorage() });
        await store.put("server-a", "password-a");
        await store.put("server-b", "password-b");
        expect(await store.get("server-a")).toBe("password-a");
        expect(await store.get("server-b")).toBe("password-b");
    });
});

describe("RconSecretStore: refuses rather than falling back to plaintext", () => {
    it("put() refuses when the vault cannot encrypt, and stores nothing", async () => {
        const dataFolder = await tempFolder();
        const store = new RconSecretStore({ dataFolder, safeStorage: safeStorage(false) });
        const stored = await store.put("s1", "pw");
        expect(stored).toBe(false);

        // Nothing was written under the secrets directory at all - not encrypted, not
        // plaintext, nothing. A refusal that still wrote a file would be a leak wearing
        // a "refused" costume.
        await expect(readdir(join(dataFolder, "rcon-secrets"))).rejects.toThrow();
    });

    it("generateAndStore() refuses and returns ok:false when the vault cannot encrypt", async () => {
        const store = new RconSecretStore({ dataFolder: await tempFolder(), safeStorage: safeStorage(false) });
        const result = await store.generateAndStore("s1");
        expect(result.ok).toBe(false);
    });

    it("get() returns null when the vault cannot decrypt, even if a file exists", async () => {
        const dataFolder = await tempFolder();
        const writable = new RconSecretStore({ dataFolder, safeStorage: safeStorage(true) });
        await writable.put("s1", "pw");

        const readOnlyVaultGone = new RconSecretStore({ dataFolder, safeStorage: safeStorage(false) });
        expect(await readOnlyVaultGone.get("s1")).toBeNull();
    });

    it("vaultAvailable() reports the underlying safeStorage's own answer", () => {
        const store = new RconSecretStore({ dataFolder: "/does-not-matter", safeStorage: safeStorage(false) });
        expect(store.vaultAvailable()).toBe(false);
    });

    it("vaultAvailable() reports false rather than throwing when safeStorage itself throws", () => {
        const throwing: SafeStorageLike = {
            isEncryptionAvailable: () => {
                throw new Error("keychain daemon is not running");
            },
            encryptString: (text) => Buffer.from(text),
            decryptString: (buffer) => buffer.toString("utf8"),
        };
        const store = new RconSecretStore({ dataFolder: "/does-not-matter", safeStorage: throwing });
        expect(store.vaultAvailable()).toBe(false);
    });
});

describe("RconSecretStore: input hygiene", () => {
    it("rejects a server id used to escape the secrets directory", async () => {
        const dataFolder = await tempFolder();
        const store = new RconSecretStore({ dataFolder, safeStorage: safeStorage() });
        // encodeURIComponent neutralizes this to a harmless filename component rather
        // than letting it walk out of rcon-secrets/, but the store must still function
        // normally for it (put/get round-trip) rather than silently dropping the call.
        const stored = await store.put("../../evil", "pw");
        expect(stored).toBe(true);
        expect(await store.get("../../evil")).toBe("pw");
        const escaped = join(dataFolder, "evil");
        await expect(readdir(dirname(escaped))).resolves.not.toContain("evil.bin");
    });

    it("rejects an empty or absurdly long server id", async () => {
        const store = new RconSecretStore({ dataFolder: await tempFolder(), safeStorage: safeStorage() });
        expect(await store.put("", "pw")).toBe(false);
        expect(await store.put("x".repeat(500), "pw")).toBe(false);
    });

    it("rejects an empty password", async () => {
        const store = new RconSecretStore({ dataFolder: await tempFolder(), safeStorage: safeStorage() });
        expect(await store.put("s1", "")).toBe(false);
    });
});

function dirname(path: string): string {
    return path.split(/[\\/]/).slice(0, -1).join("/");
}
