/**
 * The lock store's temporal half: sessions that expire, counters that slow a wrong answer
 * down, and the two orderings that decide whether a failure leaves something unopenable.
 *
 * The clock is injected throughout. A test that waited for a real fifteen minutes would be
 * a test nobody runs, and one that mocked `Date` globally would take the rest of the suite
 * with it.
 */

import { describe, expect, it, vi } from "vitest";

import { createLockStore, lockHostMissingReason, type LockHost } from "./lockStore.js";
import type { LockRecord, LockVault } from "./lockModel.js";
import { decodeBase32, totp } from "./totp.js";

const SECRET = "JBSWY3DPEHPK3PXP";

function fakeHost(overrides: Partial<LockHost> = {}): LockHost & { readonly saved: LockRecord[][] } {
    const saved: LockRecord[][] = [];
    let stored: readonly LockRecord[] = [];
    const secrets = new Map<string, string>();
    const vault: LockVault = {
        put: async (id, secret) => void secrets.set(id, secret),
        get: async (id) => secrets.get(id) ?? null,
        remove: async (id) => void secrets.delete(id),
    };
    return {
        saved,
        name: "test",
        dataFolder: "C:/Users/test/AppData/Roaming/Worldlens",
        vault,
        load: async () => stored,
        save: async (locks) => {
            stored = locks;
            saved.push([...locks]);
        },
        ...overrides,
    };
}

const target = { surface: "settings", path: "appearance.fontSize", label: "Font size" };

describe("a build that cannot see the list says so, rather than saying nothing is locked", () => {
    it("reports that it cannot list, which is a different sentence from zero locks", async () => {
        const store = createLockStore({ host: null });
        await store.load();
        expect(store.canList).toBe(false);
        expect(store.locks.value).toEqual([]);
        expect(lockHostMissingReason()).toContain("cannot keep locks");
    });

    it("keeps a failed read as a failure instead of rendering an empty list", async () => {
        const store = createLockStore({
            host: fakeHost({
                load: async () => {
                    throw new Error("the lock file is unreadable");
                },
            }),
        });
        await store.load();
        // The one wrong answer: an empty list reads as "nothing is locked".
        expect(store.failure.value).toContain("unreadable");
        expect(store.loaded.value).toBe(true);
    });

    it("offers password locks but not an authenticator when there is no vault", async () => {
        const store = createLockStore({ host: fakeHost({ vault: null }) });
        await store.load();
        expect(store.canUseAuthenticator).toBe(false);

        const refused = await store.add(target, { method: "totp", secretBase32: SECRET });
        expect(refused.ok).toBe(false);
        expect(refused.ok === false && refused.message).toContain("password");

        const allowed = await store.add(target, { method: "password", password: "x" });
        expect(allowed.ok).toBe(true);
    });
});

describe("making one", () => {
    it("stores the secret before the record, so no lock is listed that nothing can open", async () => {
        const order: string[] = [];
        const host = fakeHost();
        const store = createLockStore({
            host: {
                ...host,
                vault: {
                    put: async (id, secret) => {
                        order.push("vault");
                        await host.vault!.put(id, secret);
                    },
                    get: (id) => host.vault!.get(id),
                    remove: (id) => host.vault!.remove(id),
                },
                save: async (locks) => {
                    order.push("record");
                    await host.save(locks);
                },
            },
        });
        await store.load();
        await store.add(target, { method: "totp", secretBase32: SECRET });
        expect(order).toEqual(["vault", "record"]);
    });

    it("makes no lock at all when the secret cannot be stored", async () => {
        const host = fakeHost();
        const store = createLockStore({
            host: {
                ...host,
                vault: {
                    put: async () => {
                        throw new Error("the credential store refused");
                    },
                    get: async () => null,
                    remove: async () => undefined,
                },
            },
        });
        await store.load();
        const made = await store.add(target, { method: "totp", secretBase32: SECRET });
        expect(made.ok).toBe(false);
        expect(made.ok === false && made.message).toContain("refused");
        expect(store.locks.value).toHaveLength(0);
    });

    it("refuses a second lock on the same element rather than silently replacing the first", async () => {
        const store = createLockStore({ host: fakeHost() });
        await store.load();
        await store.add(target, { method: "password", password: "first" });
        const second = await store.add(target, { method: "password", password: "second" });
        expect(second.ok).toBe(false);
        expect(second.ok === false && second.message).toContain("already has a lock");
        expect(store.locks.value).toHaveLength(1);
        // And the original credential is untouched, which is the point of refusing.
        expect((await store.attempt(store.locks.value[0]!.id, "first")).ok).toBe(true);
    });

    it("survives a reload, because a lock that forgets itself is not a lock", async () => {
        const host = fakeHost();
        const first = createLockStore({ host });
        await first.load();
        await first.add(target, { method: "password", password: "x" });

        const second = createLockStore({ host });
        await second.load();
        expect(second.locks.value).toHaveLength(1);
        expect(second.at("settings", "appearance.fontSize")).toBeDefined();
    });
});

describe("locked on launch", () => {
    it("starts locked even though it was open a moment before the restart", async () => {
        const host = fakeHost();
        const first = createLockStore({ host });
        await first.load();
        const made = await first.add(target, { method: "password", password: "x" }, { kind: "session" });
        expect(made.ok).toBe(true);
        expect((await first.attempt(first.locks.value[0]!.id, "x")).ok).toBe(true);
        expect(first.isLocked("settings", "appearance.fontSize")).toBe(false);

        // A restart is a new store over the same host. An unlock session must not survive it.
        const second = createLockStore({ host });
        await second.load();
        expect(second.isLocked("settings", "appearance.fontSize")).toBe(true);
    });
});

describe("how long an unlock lasts", () => {
    it("expires a minutes unlock at the moment it said it would, checked on read", async () => {
        let clock = 1_000_000;
        const store = createLockStore({ host: fakeHost(), now: () => clock });
        await store.load();
        await store.add(target, { method: "password", password: "x" }, { kind: "minutes", minutes: 5 });
        const id = store.locks.value[0]!.id;

        expect((await store.attempt(id, "x")).ok).toBe(true);
        expect(store.isLocked("settings", "appearance.fontSize")).toBe(false);

        clock += 4 * 60_000;
        expect(store.isLocked("settings", "appearance.fontSize")).toBe(false);
        clock += 61_000;
        expect(store.isLocked("settings", "appearance.fontSize")).toBe(true);
        expect(store.open.value).toEqual([]);
    });

    it("holds a session unlock open indefinitely, which is what it promises", async () => {
        let clock = 0;
        const store = createLockStore({ host: fakeHost(), now: () => clock });
        await store.load();
        await store.add(target, { method: "password", password: "x" }, { kind: "session" });
        await store.attempt(store.locks.value[0]!.id, "x");
        clock += 365 * 24 * 60 * 60_000;
        expect(store.isLocked("settings", "appearance.fontSize")).toBe(false);
    });

    it("closes a surface unlock when the surface is left, and leaves the others alone", async () => {
        const store = createLockStore({ host: fakeHost() });
        await store.load();
        await store.add(target, { method: "password", password: "x" }, { kind: "surface" });
        await store.add(
            { surface: "settings", path: "appearance.color", label: "Colour" },
            { method: "password", password: "y" },
            { kind: "session" },
        );
        const [one, two] = store.locks.value;
        await store.attempt(one!.id, "x");
        await store.attempt(two!.id, "y");
        expect(store.open.value).toHaveLength(2);

        store.relockAll("surface");
        expect(store.open.value).toEqual([two!.id]);
    });

    it("relocks one on request, which is the explicit Lock again", async () => {
        const store = createLockStore({ host: fakeHost() });
        await store.load();
        await store.add(target, { method: "password", password: "x" }, { kind: "session" });
        const id = store.locks.value[0]!.id;
        await store.attempt(id, "x");
        store.relock(id);
        expect(store.isLocked("settings", "appearance.fontSize")).toBe(true);
    });
});

describe("a wrong answer", () => {
    it("counts up and rate-limits, then forgets the count on a success", async () => {
        const store = createLockStore({ host: fakeHost() });
        await store.load();
        await store.add(target, { method: "password", password: "right" });
        const id = store.locks.value[0]!.id;

        for (let attempt = 0; attempt < 3; attempt += 1) {
            expect((await store.attempt(id, "wrong")).ok).toBe(false);
        }
        expect(store.failures(id)).toBe(3);

        const limited = await store.attempt(id, "right");
        expect(limited.ok).toBe(false);
        expect(limited.ok === false && limited.reason).toBe("rate-limited");
    });

    it("never counts a missing secret against the person who typed", async () => {
        const host = fakeHost();
        const store = createLockStore({ host });
        await store.load();
        await store.add(target, { method: "totp", secretBase32: SECRET });
        const id = store.locks.value[0]!.id;
        await host.vault!.remove(id);

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const outcome = await store.attempt(id, "000000");
            expect(outcome.ok === false && outcome.reason).toBe("no-secret");
        }
        // A broken vault must never rate-limit somebody out of a lock they were never
        // given a chance to open.
        expect(store.failures(id)).toBe(0);
    });

    it("opens on a live authenticator code", async () => {
        const clock = 1234567890 * 1000;
        const store = createLockStore({ host: fakeHost(), now: () => clock });
        await store.load();
        await store.add(target, { method: "totp", secretBase32: SECRET });
        const decoded = decodeBase32(SECRET);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;
        const code = await totp(decoded.bytes, clock);
        expect((await store.attempt(store.locks.value[0]!.id, code)).ok).toBe(true);
    });
});

describe("removing one", () => {
    it("takes the record, the session and the secret with it", async () => {
        const host = fakeHost();
        const store = createLockStore({ host });
        await store.load();
        await store.add(target, { method: "totp", secretBase32: SECRET });
        const id = store.locks.value[0]!.id;

        expect(await host.vault!.get(id)).toBe(SECRET);
        await store.remove(id);
        expect(store.locks.value).toHaveLength(0);
        expect(store.open.value).toEqual([]);
        expect(await host.vault!.get(id)).toBeNull();
        expect(store.isLocked("settings", "appearance.fontSize")).toBe(false);
    });

    it("still removes the record when the vault refuses to forget the secret", async () => {
        // An orphaned secret is inert; an orphaned record is a lock nobody can remove.
        const host = fakeHost();
        const store = createLockStore({
            host: {
                ...host,
                vault: {
                    put: (id, secret) => host.vault!.put(id, secret),
                    get: (id) => host.vault!.get(id),
                    remove: async () => {
                        throw new Error("the credential store is locked");
                    },
                },
            },
        });
        await store.load();
        await store.add(target, { method: "totp", secretBase32: SECRET });
        await store.remove(store.locks.value[0]?.id ?? "");
        expect(store.locks.value).toHaveLength(0);
    });
});

describe("finding one", () => {
    it("matches surface and path exactly, never a label", async () => {
        const store = createLockStore({ host: fakeHost() });
        await store.load();
        await store.add(target, { method: "password", password: "x" });
        expect(store.at("settings", "appearance.fontSize")).toBeDefined();
        expect(store.at("project", "appearance.fontSize")).toBeUndefined();
        expect(store.isLocked("project", "appearance.fontSize")).toBe(false);
    });

    it("names the folder that resets every lock, so a prompt can quote a real path", async () => {
        const store = createLockStore({ host: fakeHost() });
        expect(store.dataFolder).toContain("Worldlens");
    });
});

describe("nothing here writes a credential anywhere it could be read", () => {
    it("never hands a password or a secret to the record store", async () => {
        const host = fakeHost();
        const store = createLockStore({ host });
        await store.load();
        await store.add(target, { method: "password", password: "correct horse" });
        await store.add(
            { surface: "settings", path: "appearance.color", label: "Colour" },
            { method: "totp", secretBase32: SECRET },
        );

        const written = JSON.stringify(host.saved);
        expect(written).not.toContain("correct horse");
        expect(written).not.toContain(SECRET);
    });

    it("does not log one either", async () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const store = createLockStore({ host: fakeHost() });
        await store.load();
        await store.add(target, { method: "password", password: "correct horse" });
        await store.attempt(store.locks.value[0]!.id, "correct horse");
        expect(spy).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        spy.mockRestore();
        error.mockRestore();
    });
});
