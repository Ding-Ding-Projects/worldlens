/**
 * The toy locks' model, including the properties that make them safe to be a toy.
 *
 * Two of these matter more than the rest and are worth naming here rather than only in the
 * test titles: **a record never holds a credential**, and **one lock's credential never
 * opens another**. The first is what lets a lock go into settings, history and an export;
 * the second is the entire design. Both are the sort of property that a refactor breaks
 * silently and no screenshot ever reveals.
 */

import { describe, expect, it } from "vitest";

import {
    DEFAULT_LOCK_DURATION,
    MAX_LOCK_MINUTES,
    attemptDelayMs,
    createLock,
    lockFor,
    lockSearchText,
    locksUnder,
    unlockExpiry,
    verifyUnlock,
    type LockRecord,
    type LockVault,
} from "./lockModel.js";
import { decodeBase32, generateSecret, totp, TOTP_DEFAULTS } from "./totp.js";

/** A low iteration count: this suite checks behaviour, not how slow PBKDF2 is. */
const FAST = 1_000;

const target = { surface: "settings", path: "appearance.fontSize", label: "Font size" };

async function passwordLock(password = "correct horse", id = "l1"): Promise<LockRecord> {
    const made = await createLock(target, { method: "password", password }, { id, iterations: FAST });
    if (!made.ok) throw new Error(made.message);
    return made.record;
}

function memoryVault(): LockVault & { readonly stored: Map<string, string> } {
    const stored = new Map<string, string>();
    return {
        stored,
        put: async (id, secret) => void stored.set(id, secret),
        get: async (id) => stored.get(id) ?? null,
        remove: async (id) => void stored.delete(id),
    };
}

describe("a record carries no credential, so it can go anywhere a setting goes", () => {
    it("keeps a verifier for a password lock and never the password", async () => {
        const record = await passwordLock("correct horse battery staple");
        const serialised = JSON.stringify(record);
        expect(serialised).not.toContain("correct horse");
        expect(serialised).not.toContain("battery");
        expect(record.verifier?.kind).toBe("pbkdf2");
    });

    it("keeps no secret at all for a TOTP lock - only its shape", async () => {
        const secret = generateSecret();
        const made = await createLock(target, { method: "totp", secretBase32: secret }, { id: "t1" });
        expect(made.ok).toBe(true);
        if (!made.ok) return;
        expect(JSON.stringify(made.record)).not.toContain(secret);
        expect(made.record.verifier).toBeNull();
        expect(made.record.totp).toEqual(TOTP_DEFAULTS);
    });

    it("salts each lock separately, so two locks with one password do not look alike", async () => {
        const first = await passwordLock("same", "a");
        const second = await passwordLock("same", "b");
        expect(first.verifier?.salt).not.toBe(second.verifier?.salt);
        expect(first.verifier?.derived).not.toBe(second.verifier?.derived);
    });

    it("records the iteration count it used, so an older record keeps verifying", async () => {
        const record = await passwordLock();
        expect(record.verifier?.iterations).toBe(FAST);
        // Verification reads the count off the record rather than off today's constant.
        expect(await verifyUnlock(record, "correct horse", { vault: null, atMs: 0 })).toEqual({
            ok: true,
            until: null,
        });
    });
});

describe("one lock's credential never opens another", () => {
    it("refuses the password that opens the lock beside it", async () => {
        const mine = await passwordLock("mine", "a");
        const yours = await passwordLock("yours", "b");
        expect(await verifyUnlock(mine, "yours", { vault: null, atMs: 0 })).toEqual({
            ok: false,
            reason: "mismatch",
        });
        expect(await verifyUnlock(yours, "mine", { vault: null, atMs: 0 })).toEqual({
            ok: false,
            reason: "mismatch",
        });
    });

    it("keeps each TOTP lock's secret under its own id in the vault", async () => {
        const vault = memoryVault();
        const first = generateSecret();
        const second = generateSecret();
        await vault.put("a", first);
        await vault.put("b", second);

        const lockA = await createLock(target, { method: "totp", secretBase32: first }, { id: "a" });
        const lockB = await createLock(target, { method: "totp", secretBase32: second }, { id: "b" });
        expect(lockA.ok && lockB.ok).toBe(true);
        if (!lockA.ok || !lockB.ok) return;

        const now = 1111111111 * 1000;
        const secretB = decodeBase32(second);
        expect(secretB.ok).toBe(true);
        if (!secretB.ok) return;
        const codeForB = await totp(secretB.bytes, now);
        // B's live code, offered to A, is simply wrong - there is no shared anything.
        expect(await verifyUnlock(lockA.record, codeForB, { vault, atMs: now })).toEqual({
            ok: false,
            reason: "mismatch",
        });
        expect(await verifyUnlock(lockB.record, codeForB, { vault, atMs: now })).toEqual({
            ok: true,
            until: null,
        });
    });
});

describe("opening one", () => {
    it("accepts the right password and refuses everything else", async () => {
        const record = await passwordLock("open sesame");
        expect(await verifyUnlock(record, "open sesame", { vault: null, atMs: 0 })).toEqual({
            ok: true,
            until: null,
        });
        for (const wrong of ["Open sesame", "open sesam", "open sesame ", "", "opensesame"]) {
            expect(await verifyUnlock(record, wrong, { vault: null, atMs: 0 })).toEqual({
                ok: false,
                reason: "mismatch",
            });
        }
    });

    it("accepts a live authenticator code and one step of drift either side", async () => {
        const vault = memoryVault();
        const secret = "JBSWY3DPEHPK3PXP";
        await vault.put("t1", secret);
        const made = await createLock(target, { method: "totp", secretBase32: secret }, { id: "t1" });
        expect(made.ok).toBe(true);
        if (!made.ok) return;

        const now = 1234567890 * 1000;
        const decoded = decodeBase32(secret);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;

        for (const offset of [-30_000, 0, 30_000]) {
            const code = await totp(decoded.bytes, now + offset);
            expect(
                (await verifyUnlock(made.record, code, { vault, atMs: now })).ok,
                `drift ${offset}`,
            ).toBe(true);
        }
        const far = await totp(decoded.bytes, now + 120_000);
        expect((await verifyUnlock(made.record, far, { vault, atMs: now })).ok).toBe(false);
    });

    it("says the secret is missing rather than blaming the person who typed", async () => {
        // A TOTP lock whose secret was cleared out of the vault underneath it. Reporting
        // that as a wrong code would send somebody to re-check an authenticator that is
        // working perfectly.
        const vault = memoryVault();
        const made = await createLock(
            target,
            { method: "totp", secretBase32: "JBSWY3DPEHPK3PXP" },
            { id: "gone" },
        );
        expect(made.ok).toBe(true);
        if (!made.ok) return;
        expect(await verifyUnlock(made.record, "000000", { vault, atMs: 0 })).toEqual({
            ok: false,
            reason: "no-secret",
        });
    });

    it("says so when this build has no vault at all, rather than failing open", async () => {
        const made = await createLock(
            target,
            { method: "totp", secretBase32: "JBSWY3DPEHPK3PXP" },
            { id: "t1" },
        );
        expect(made.ok).toBe(true);
        if (!made.ok) return;
        expect(await verifyUnlock(made.record, "000000", { vault: null, atMs: 0 })).toEqual({
            ok: false,
            reason: "no-secret",
        });
    });
});

describe("a wrong answer slows down and never escalates", () => {
    it("gives three free attempts before any delay at all", () => {
        expect(attemptDelayMs(0, 500)).toBe(0);
        expect(attemptDelayMs(2, 500)).toBe(0);
        expect(attemptDelayMs(3, 500)).toBe(500);
        expect(attemptDelayMs(4, 500)).toBe(1000);
    });

    it("stops growing, so a toy lock never becomes a half-hour punishment", () => {
        expect(attemptDelayMs(50, 500)).toBe(30_000);
        expect(attemptDelayMs(500, 500)).toBe(30_000);
    });

    it("reports the wait in words rather than silently refusing a correct password", async () => {
        const record = await passwordLock("right");
        const outcome = await verifyUnlock(record, "right", {
            vault: null,
            atMs: 0,
            failures: 5,
            minDelayMs: 500,
        });
        expect(outcome).toEqual({ ok: false, reason: "rate-limited", retryInMs: 2000 });
    });
});

describe("how long an unlock lasts", () => {
    it("defaults to this surface only, the tightest of the three", () => {
        expect(DEFAULT_LOCK_DURATION).toEqual({ kind: "surface" });
        expect(unlockExpiry({ kind: "surface" }, 1000)).toBeNull();
        expect(unlockExpiry({ kind: "session" }, 1000)).toBeNull();
    });

    it("expires a minutes unlock at the moment it says it will", () => {
        expect(unlockExpiry({ kind: "minutes", minutes: 15 }, 1000)).toBe(1000 + 15 * 60_000);
    });

    it("refuses a duration that is not a whole number of minutes inside the bound", async () => {
        for (const minutes of [0, -5, 1.5, MAX_LOCK_MINUTES + 1]) {
            const made = await createLock(
                target,
                { method: "password", password: "x" },
                { duration: { kind: "minutes", minutes }, iterations: FAST },
            );
            expect(made.ok, String(minutes)).toBe(false);
        }
    });
});

describe("refusing a lock nothing could ever open", () => {
    it("refuses an empty password", async () => {
        const made = await createLock(target, { method: "password", password: "" }, { iterations: FAST });
        expect(made.ok).toBe(false);
        expect(made.ok === false && made.message).toContain("nothing opens");
    });

    it("refuses a secret that is not readable base32, naming why", async () => {
        const made = await createLock(target, { method: "totp", secretBase32: "not!base32" });
        expect(made.ok).toBe(false);
        expect(made.ok === false && made.message).toContain("base32");
    });
});

describe("the list", () => {
    const locks: LockRecord[] = [];

    it("finds a lock by surface and path together, never by label", async () => {
        locks.push(await passwordLock("a", "one"));
        expect(lockFor(locks, "settings", "appearance.fontSize")?.id).toBe("one");
        expect(lockFor(locks, "project", "appearance.fontSize")).toBeUndefined();
        expect(lockFor(locks, "settings", "appearance.fontsize")).toBeUndefined();
    });

    it("searches label, surface, path and method - and cannot search a credential", async () => {
        const text = lockSearchText(locks[0]!);
        expect(text).toContain("Font size");
        expect(text).toContain("settings");
        expect(text).toContain("password");
        expect(text).not.toContain(locks[0]!.verifier?.derived ?? " ");
    });

    it("gathers a subtree without letting a prefix claim its neighbour", async () => {
        const made = await Promise.all([
            createLock(
                { surface: "settings", path: "appearance", label: "Appearance" },
                { method: "password", password: "x" },
                { id: "root", iterations: FAST },
            ),
            createLock(
                { surface: "settings", path: "appearance.color", label: "Colour" },
                { method: "password", password: "x" },
                { id: "child", iterations: FAST },
            ),
            createLock(
                { surface: "settings", path: "appearanceEditor", label: "Editor" },
                { method: "password", password: "x" },
                { id: "sibling", iterations: FAST },
            ),
        ]);
        const all = made.flatMap((one) => (one.ok ? [one.record] : []));
        const under = locksUnder(all, "settings", "appearance").map((lock) => lock.id);
        expect(under).toContain("root");
        expect(under).toContain("child");
        // The near-miss a bulk preview gets quietly wrong.
        expect(under).not.toContain("sibling");
    });
});
