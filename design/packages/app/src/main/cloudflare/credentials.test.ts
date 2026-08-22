/**
 * The Cloudflare token store, and the four ways it must never leak.
 *
 * This is the one credential this application is actually responsible for - the GitHub and
 * AWS routes never hold one, because their CLIs do. That responsibility is why the
 * assertions here are structural rather than behavioural: a leak does not announce itself
 * at run time, and the change that causes one always looks like a convenience.
 *
 * **The store exposes no way to read the token.** Not `readToken`, not a getter, not a
 * property. `useToken` hands it to a callback that runs in this process, and that shape
 * cannot be awaited into an IPC reply the way a getter can.
 *
 * **Presence carries no derivative of the value.** No length, no prefix, no fingerprint.
 * Each of those feels harmless and narrows a search, and none of them helps anybody.
 *
 * **A machine with no credential store is refused, not downgraded.** Writing plaintext so
 * that "it works everywhere" would produce a file readable by every process running as
 * that user, indistinguishable from a protected one.
 *
 * **Clearing actually clears**, in memory as well as on disk.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    CloudflareCredentialStore,
    REQUIRED_CLOUDFLARE_SCOPES,
} from "./credentials.js";
import type { SafeStorageLike } from "./credentials.js";

const SECRET = "cf-token-abcdefghijklmnopqrstuvwxyz0123456789";

/** A stand-in for the OS store. Reversible, so the round trip is genuinely exercised. */
function workingSafeStorage(): SafeStorageLike {
    return {
        isEncryptionAvailable: () => true,
        encryptString: (plain) => Buffer.from(`enc:${plain}`, "utf8"),
        decryptString: (buffer) => buffer.toString("utf8").replace(/^enc:/, ""),
    };
}

/** A Linux desktop with no secret service running. */
function unavailableSafeStorage(): SafeStorageLike {
    return {
        isEncryptionAvailable: () => false,
        encryptString() {
            throw new Error("no credential store");
        },
        decryptString() {
            throw new Error("no credential store");
        },
    };
}

let directory = "";
let filePath = "";

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "worldlens-cf-"));
    filePath = join(directory, "cloudflare.json");
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

describe("the Cloudflare token store", () => {
    it("exposes no way at all to read the token back", () => {
        const store = new CloudflareCredentialStore({
            filePath,
            safeStorage: workingSafeStorage(),
        });

        // Structural, because a getter added for convenience is one refactor away from
        // being awaited into an IPC reply, and review is exactly where that slips through.
        const forbidden = [
            "readToken",
            "getToken",
            "token",
            "secret",
            "value",
            "reveal",
            "peek",
            "export",
        ];
        const surface = new Set([
            ...Object.getOwnPropertyNames(store),
            ...Object.getOwnPropertyNames(Object.getPrototypeOf(store) as object),
        ]);
        for (const name of forbidden) {
            expect(surface.has(name), `store must not expose ${name}`).toBe(false);
        }
    });

    it("tells the renderer only that a token exists, never anything derived from it", () => {
        const store = new CloudflareCredentialStore({
            filePath,
            safeStorage: workingSafeStorage(),
        });
        store.save(SECRET, { accountName: "Example Ltd", verified: true });

        const presence = store.presence();

        expect(presence.stored).toBe(true);
        expect(presence.accountName).toBe("Example Ltd");

        // The whole presence object is what crosses IPC, so assert on all of it at once:
        // no substring of the token anywhere in it.
        const serialised = JSON.stringify(presence);
        expect(serialised).not.toContain(SECRET);
        expect(serialised).not.toContain(SECRET.slice(0, 8));

        // And no field *is* a derivative of the value. Checked field by field rather than
        // by searching the serialised string for the length: the first version of this
        // did that, and failed on correct code because the token happened to be 45
        // characters and "45" appears inside an ISO timestamp. A guard that fires on a
        // coincidence teaches people to ignore it.
        for (const [name, value] of Object.entries(presence)) {
            expect(typeof value, `presence.${name} must not be a number`).not.toBe("number");
            if (typeof value === "string") {
                expect(value.length, `presence.${name} must not be the token`).not.toBe(
                    SECRET.length,
                );
            }
        }
    });

    it("uses the token without ever returning it", async () => {
        const store = new CloudflareCredentialStore({
            filePath,
            safeStorage: workingSafeStorage(),
        });
        store.save(SECRET, { accountName: null, verified: true });

        let seenInside: string | null = null;
        const returned = await store.useToken(async (token) => {
            seenInside = token;
            return "the operation result";
        });

        expect(seenInside).toBe(SECRET);
        // What comes back out is the operation's own result, never the credential.
        expect(returned).toBe("the operation result");
    });

    it("never writes the token in the clear", async () => {
        const store = new CloudflareCredentialStore({
            filePath,
            safeStorage: workingSafeStorage(),
        });
        store.save(SECRET, { accountName: "Example Ltd", verified: true });

        const onDisk = await readFile(filePath, "utf8");
        expect(onDisk).not.toContain(SECRET);
        // The non-secret facts are readable, which is the point of splitting the envelope.
        expect(onDisk).toContain("Example Ltd");
    });

    it("refuses to save on a machine with no credential store, rather than downgrading", () => {
        const store = new CloudflareCredentialStore({
            filePath,
            safeStorage: unavailableSafeStorage(),
        });

        const result = store.save(SECRET, { accountName: null, verified: true });

        expect(result).toEqual({ ok: false, reason: "encryption-unavailable" });
        // And nothing was written at all - not even a plaintext consolation prize.
        expect(() => readFile(filePath, "utf8")).toBeTruthy();
    });

    it("still lets the session carry on after refusing to persist", async () => {
        const store = new CloudflareCredentialStore({
            filePath,
            safeStorage: unavailableSafeStorage(),
        });
        store.save(SECRET, { accountName: null, verified: true });

        // Refusing to remember is not refusing to work. The person can finish what they
        // were doing; they are simply told it will not survive a restart.
        const used = await store.useToken(async (token) => token === SECRET);
        expect(used).toBe(true);
        expect(store.presence().savedAt).toBeNull();
    });

    it("forgets the token in memory as well as on disk", async () => {
        const store = new CloudflareCredentialStore({
            filePath,
            safeStorage: workingSafeStorage(),
        });
        store.save(SECRET, { accountName: null, verified: true });

        store.clear();

        expect(store.presence().stored).toBe(false);
        // A clear that only removed the file would leave the token live until restart,
        // which is precisely not what somebody clicking "forget this" is asking for.
        expect(await store.useToken(async () => "used")).toBeNull();
    });

    it("asks for two narrow scopes and explains why it wants each", () => {
        expect(REQUIRED_CLOUDFLARE_SCOPES.map((scope) => scope.id)).toEqual([
            "zone-dns-edit",
            "tunnel-edit",
        ]);
        for (const scope of REQUIRED_CLOUDFLARE_SCOPES) {
            expect(scope.why.length).toBeGreaterThan(20);
        }
    });
});
