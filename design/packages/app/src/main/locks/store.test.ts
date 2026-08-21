/**
 * The shell half of the lock host, against a real temporary folder.
 *
 * Written against the filesystem rather than a mock because the two things that can go wrong
 * here are both filesystem behaviour: a record file a person has edited by hand, and a
 * machine whose keychain will not encrypt. Neither is reachable through a fake that simply
 * returns what it was told to.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LockStorage, LOCKS_FILE, parseLocks, type SafeStorageLike } from "./store.js";

const folders: string[] = [];

afterEach(async () => {
    for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function tempFolder(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "worldlens-locks-"));
    folders.push(folder);
    return folder;
}

/** A keychain that works, and one that does not, are both ordinary machines. */
function safeStorage(available = true): SafeStorageLike {
    return {
        isEncryptionAvailable: () => available,
        // Reversible and obviously not encryption - the point under test is the routing and
        // the refusal, never the cipher, which is Electron's to implement and to test.
        encryptString: (text) => Buffer.from(`sealed:${text}`, "utf8"),
        decryptString: (buffer) => buffer.toString("utf8").replace(/^sealed:/, ""),
    };
}

const LOCK = {
    id: "lock-1",
    method: "password",
    target: { surface: "element", path: "settings.fontSize", label: "Font size" },
};

describe("the lock record file", () => {
    it("reports no locks on a first run rather than failing", async () => {
        const storage = new LockStorage({
            dataFolder: await tempFolder(),
            safeStorage: safeStorage(),
        });
        expect(await storage.load()).toEqual([]);
    });

    it("round-trips a saved lock", async () => {
        const storage = new LockStorage({
            dataFolder: await tempFolder(),
            safeStorage: safeStorage(),
        });
        await storage.save([LOCK]);
        expect(await storage.load()).toEqual([LOCK]);
    });

    it("keeps the good records when one in the file is malformed", async () => {
        // One record a person broke by hand must not cost them every other lock they made.
        const folder = await tempFolder();
        await writeFile(
            join(folder, LOCKS_FILE),
            JSON.stringify({ version: 1, locks: [LOCK, { id: "no-method" }, { nonsense: true }] }),
            "utf8",
        );
        const storage = new LockStorage({ dataFolder: folder, safeStorage: safeStorage() });
        expect(await storage.load()).toEqual([LOCK]);
    });

    it("collapses duplicate ids, so no row reappears after being removed", async () => {
        expect(parseLocks(JSON.stringify({ locks: [LOCK, { ...LOCK }] }))).toHaveLength(1);
    });

    it("reads a file that is not JSON as no locks rather than throwing", async () => {
        const folder = await tempFolder();
        await writeFile(join(folder, LOCKS_FILE), "{{{ not json", "utf8");
        const storage = new LockStorage({ dataFolder: folder, safeStorage: safeStorage() });
        expect(await storage.load()).toEqual([]);
    });

    it("refuses a save that is not a list of records, rather than emptying the file", async () => {
        const storage = new LockStorage({
            dataFolder: await tempFolder(),
            safeStorage: safeStorage(),
        });
        await storage.save([LOCK]);
        await storage.save([{ junk: true }]);
        // The junk was dropped; what remains is an honest empty list written deliberately,
        // never a half-written file.
        expect(await storage.load()).toEqual([]);
    });
});

describe("the secret vault", () => {
    it("stores and returns a secret", async () => {
        const storage = new LockStorage({
            dataFolder: await tempFolder(),
            safeStorage: safeStorage(),
        });
        expect(await storage.putSecret("lock-1", "JBSWY3DPEHPK3PXP")).toBe(true);
        expect(await storage.getSecret("lock-1")).toBe("JBSWY3DPEHPK3PXP");
    });

    it("never writes the secret to disk in the clear", async () => {
        // The one failure that would turn a for-fun lock into a real disclosure.
        const folder = await tempFolder();
        const storage = new LockStorage({ dataFolder: folder, safeStorage: safeStorage() });
        await storage.putSecret("lock-1", "JBSWY3DPEHPK3PXP");
        const onDisk = await readFile(join(folder, "lock-secrets", "lock-1.bin"), "utf8");
        expect(onDisk).not.toContain("JBSWY3DPEHPK3PXP");
    });

    it("refuses outright on a machine that cannot encrypt", async () => {
        const storage = new LockStorage({
            dataFolder: await tempFolder(),
            safeStorage: safeStorage(false),
        });
        expect(storage.vaultAvailable()).toBe(false);
        expect(await storage.putSecret("lock-1", "JBSWY3DPEHPK3PXP")).toBe(false);
    });

    it("returns null for a secret that was never stored", async () => {
        const storage = new LockStorage({
            dataFolder: await tempFolder(),
            safeStorage: safeStorage(),
        });
        expect(await storage.getSecret("missing")).toBeNull();
    });

    it("forgets a secret, and forgetting an absent one is not a failure", async () => {
        const storage = new LockStorage({
            dataFolder: await tempFolder(),
            safeStorage: safeStorage(),
        });
        await storage.putSecret("lock-1", "JBSWY3DPEHPK3PXP");
        await storage.removeSecret("lock-1");
        expect(await storage.getSecret("lock-1")).toBeNull();
        await expect(storage.removeSecret("lock-1")).resolves.toBeUndefined();
    });

    it("cannot be talked into writing outside its own folder by a hostile id", async () => {
        const folder = await tempFolder();
        const storage = new LockStorage({ dataFolder: folder, safeStorage: safeStorage() });
        await storage.putSecret("../../escaped", "secret");
        // Encoded rather than trusted, so it landed inside the secrets folder like any other.
        expect(await storage.getSecret("../../escaped")).toBe("secret");
        await expect(readFile(join(folder, "..", "..", "escaped.bin"), "utf8")).rejects.toThrow();
    });
});
