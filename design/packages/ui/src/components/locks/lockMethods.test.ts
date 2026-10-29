/**
 * Every way a lock can open, through the one validator and the one attempt budget.
 *
 * Six methods are offered for a new lock: PIN, password, PIN plus password, password plus
 * authenticator, PIN plus authenticator, and all three. Each is made and opened here, each
 * is refused when any one part is wrong, and each spends the same budget whichever way its
 * PIN was entered. The older authenticator-only method is kept for records that already
 * carry it, and those records are read back exactly as written.
 */

import { describe, expect, it } from "vitest";

import {
    ATTEMPT_BASE_DELAY_MS,
    FRESH_BUDGET,
    LOCK_METHODS,
    OFFERED_LOCK_METHODS,
    PIN_MAX_LENGTH,
    PIN_MIN_LENGTH,
    budgetAfterFailure,
    budgetAfterSkip,
    budgetWait,
    createLock,
    lockFactors,
    makePasswordVerifier,
    migrateLockRecord,
    pinDigits,
    pinProblem,
    verifyUnlock,
    type LockCreation,
    type LockMethod,
    type LockRecord,
    type LockVault,
    type UnlockAnswer,
} from "./lockModel.js";
import { createLockStore, type LockHost } from "./lockStore.js";
import { decodeBase32, totp } from "./totp.js";

const SECRET = "JBSWY3DPEHPK3PXP";
const AT = 1_700_000_000_000;
const target = { surface: "settings", path: "appearance.fontSize", label: "Font size" };

function vaultWith(secret: string | null): LockVault {
    return {
        put: async () => undefined,
        get: async () => secret,
        remove: async () => undefined,
    };
}

async function liveCode(atMs = AT): Promise<string> {
    const decoded = decodeBase32(SECRET);
    if (!decoded.ok) throw new Error("bad test secret");
    return totp(decoded.bytes, atMs);
}

function creationFor(method: LockMethod): LockCreation {
    return { method, password: "open sesame", pin: "482916", secretBase32: SECRET };
}

async function rightAnswer(method: LockMethod): Promise<UnlockAnswer> {
    const factors = lockFactors(method);
    return {
        ...(factors.includes("password") ? { password: "open sesame" } : {}),
        ...(factors.includes("pin") ? { pin: "482916" } : {}),
        ...(factors.includes("totp") ? { code: await liveCode() } : {}),
    };
}

async function made(method: LockMethod): Promise<LockRecord> {
    const result = await createLock(target, creationFor(method), { id: method, iterations: 1000 });
    if (!result.ok) throw new Error(result.message);
    return result.record;
}

describe("the methods on offer", () => {
    it("offers exactly the six credential mixes, and keeps the old authenticator-only one readable", () => {
        expect([...OFFERED_LOCK_METHODS].sort()).toEqual(
            [
                "password",
                "password+pin+totp",
                "password+totp",
                "pin",
                "pin+password",
                "pin+totp",
            ].sort(),
        );
        expect(LOCK_METHODS).toContain("totp");
        expect(OFFERED_LOCK_METHODS as readonly string[]).not.toContain("totp");
    });
});

describe("the one PIN rule", () => {
    it("accepts digits only, within the bounded length", () => {
        expect(pinProblem("")).toBe("empty");
        expect(pinProblem("12a4")).toBe("not-digits");
        expect(pinProblem("12 34")).toBe("not-digits");
        expect(pinProblem("１２３４")).toBe("not-digits");
        expect(pinProblem("1".repeat(PIN_MIN_LENGTH - 1))).toBe("too-short");
        expect(pinProblem("1".repeat(PIN_MIN_LENGTH))).toBeNull();
        expect(pinProblem("1".repeat(PIN_MAX_LENGTH))).toBeNull();
        expect(pinProblem("1".repeat(PIN_MAX_LENGTH + 1))).toBe("too-long");
    });

    it("filters typed text to digits and caps it, which is what both entry routes go through", () => {
        expect(pinDigits("48-29 16")).toBe("482916");
        expect(pinDigits("9".repeat(40))).toHaveLength(PIN_MAX_LENGTH);
    });
});

describe.each(OFFERED_LOCK_METHODS.map((method) => [method]))("a %s lock", (method) => {
    it("stores only salted verifiers and never a credential", async () => {
        const record = await made(method);
        const text = JSON.stringify(record);
        expect(text).not.toContain("open sesame");
        expect(text).not.toContain("482916");
        expect(text).not.toContain(SECRET);
        const factors = lockFactors(method);
        expect(record.verifier !== null).toBe(factors.includes("password"));
        expect(record.pinVerifier !== null).toBe(factors.includes("pin"));
        expect(record.totp !== null).toBe(factors.includes("totp"));
        for (const verifier of [record.verifier, record.pinVerifier]) {
            if (verifier !== null) {
                expect(verifier.kind).toBe("pbkdf2");
                expect(verifier.salt.length).toBeGreaterThan(0);
            }
        }
    });

    it("opens when every part is right", async () => {
        const record = await made(method);
        const outcome = await verifyUnlock(record, await rightAnswer(method), {
            vault: vaultWith(SECRET),
            atMs: AT,
        });
        expect(outcome.ok).toBe(true);
    });

    it("refuses when any single part is wrong, with the same answer whichever part it was", async () => {
        const record = await made(method);
        const right = await rightAnswer(method);
        for (const factor of lockFactors(method)) {
            const wrong: UnlockAnswer =
                factor === "password"
                    ? { ...right, password: "open sesam" }
                    : factor === "pin"
                      ? { ...right, pin: "482917" }
                      : { ...right, code: right.code === "000000" ? "111111" : "000000" };
            const outcome = await verifyUnlock(record, wrong, {
                vault: vaultWith(SECRET),
                atMs: AT,
            });
            expect(outcome, `${method} with a wrong ${factor}`).toEqual({
                ok: false,
                reason: "mismatch",
            });
        }
    });

    it("refuses when a part is missing altogether", async () => {
        const record = await made(method);
        const outcome = await verifyUnlock(record, {}, { vault: vaultWith(SECRET), atMs: AT });
        expect(outcome.ok).toBe(false);
    });
});

describe("making a lock refuses one nothing could open", () => {
    it("refuses an unusable PIN before hashing anything", async () => {
        for (const pin of ["", "12a456", "123"]) {
            const result = await createLock(target, { method: "pin", pin }, { iterations: 1000 });
            expect(result.ok, pin).toBe(false);
        }
        const tooLong = await createLock(
            target,
            { method: "pin+password", pin: "1".repeat(PIN_MAX_LENGTH + 1), password: "x" },
            { iterations: 1000 },
        );
        expect(tooLong.ok).toBe(false);
    });

    it("refuses a combined lock with an empty password or an unreadable secret", async () => {
        expect(
            (await createLock(target, { method: "pin+password", pin: "123456", password: "" })).ok,
        ).toBe(false);
        expect(
            (
                await createLock(target, {
                    method: "pin+totp",
                    pin: "123456",
                    secretBase32: "not!base32",
                })
            ).ok,
        ).toBe(false);
    });

    it("refuses a method this build does not know", async () => {
        const result = await createLock(target, {
            method: "fingerprint" as unknown as LockMethod,
            password: "x",
        });
        expect(result.ok).toBe(false);
    });
});

describe("authenticator codes", () => {
    it("accept the neighbouring time step on either side, and not two away", async () => {
        const record = await made("pin+totp");
        for (const [offset, expected] of [
            [-30_000, true],
            [30_000, true],
            [-60_000, false],
            [60_000, false],
        ] as const) {
            const outcome = await verifyUnlock(
                record,
                { pin: "482916", code: await liveCode(AT + offset) },
                { vault: vaultWith(SECRET), atMs: AT },
            );
            expect(outcome.ok, `skew ${offset}`).toBe(expected);
        }
    });

    it("blame the vault, never the person, when a combined lock's secret has gone", async () => {
        const record = await made("password+totp");
        const outcome = await verifyUnlock(
            record,
            { password: "wrong", code: "000000" },
            { vault: vaultWith(null), atMs: AT },
        );
        // Reported the same whatever the password was, so it reveals nothing about it.
        expect(outcome).toEqual({ ok: false, reason: "no-secret" });
    });
});

describe("one attempt budget per lock", () => {
    it("gives three free attempts, then a wait that doubles and stops at half a minute", () => {
        let budget = FRESH_BUDGET;
        for (let index = 0; index < 2; index += 1) budget = budgetAfterFailure(budget, AT);
        expect(budgetWait(budget, AT)).toBe(0);
        budget = budgetAfterFailure(budget, AT);
        expect(budgetWait(budget, AT)).toBe(ATTEMPT_BASE_DELAY_MS);
        budget = budgetAfterFailure(budget, AT);
        expect(budgetWait(budget, AT)).toBe(ATTEMPT_BASE_DELAY_MS * 2);
        for (let index = 0; index < 50; index += 1) budget = budgetAfterFailure(budget, AT);
        expect(budgetWait(budget, AT)).toBe(30_000);
        expect(budgetWait(budget, AT + 30_000)).toBe(0);
    });

    it("checks nothing while the budget says to wait, so a right answer cannot be learned early", async () => {
        const record = await made("pin");
        const outcome = await verifyUnlock(
            record,
            { pin: "482916" },
            {
                vault: null,
                atMs: AT,
                budget: { failures: 4, blockedUntil: AT + 1000 },
            },
        );
        expect(outcome).toEqual({ ok: false, reason: "rate-limited", retryInMs: 1000 });
    });

    it("keeps the failure count when a wait is skipped, so the next wait is just as long", () => {
        let budget = FRESH_BUDGET;
        for (let index = 0; index < 4; index += 1) budget = budgetAfterFailure(budget, AT);
        const skipped = budgetAfterSkip(budget);
        expect(budgetWait(skipped, AT)).toBe(0);
        expect(skipped.failures).toBe(budget.failures);
        // The next wrong answer waits exactly as long as it would have after the full wait.
        expect(budgetWait(budgetAfterFailure(skipped, AT), AT)).toBe(
            budgetWait(budgetAfterFailure(budget, AT), AT),
        );
    });

    function host(): LockHost {
        let stored: readonly LockRecord[] = [];
        return {
            name: "test",
            dataFolder: null,
            vault: vaultWith(SECRET),
            load: async () => stored,
            save: async (locks) => void (stored = locks),
        };
    }

    it("is shared by every part of a combined lock, so parts cannot be probed one at a time", async () => {
        let clock = AT;
        const store = createLockStore({ host: host(), now: () => clock });
        await store.load();
        await store.add(target, { method: "pin+password", pin: "482916", password: "open sesame" });
        const id = store.locks.value[0]!.id;

        await store.attempt(id, { pin: "000000", password: "open sesame" });
        await store.attempt(id, { pin: "482916", password: "wrong" });
        await store.attempt(id, { pin: "000000", password: "wrong" });
        expect(store.failures(id)).toBe(3);
        const limited = await store.attempt(id, { pin: "482916", password: "open sesame" });
        expect(limited.ok === false && limited.reason).toBe("rate-limited");
        // A refused-unchecked try does not count.
        expect(store.failures(id)).toBe(3);

        clock += 30_000;
        expect((await store.attempt(id, { pin: "482916", password: "open sesame" })).ok).toBe(true);
        expect(store.failures(id)).toBe(0);
    });

    it("is one budget per lock: failing one lock never slows another", async () => {
        const store = createLockStore({ host: host(), now: () => AT });
        await store.load();
        await store.add(target, { method: "pin", pin: "482916" });
        await store.add(
            { ...target, path: "other", label: "Other" },
            { method: "pin", pin: "482916" },
        );
        const [first, second] = store.locks.value;
        for (let index = 0; index < 4; index += 1)
            await store.attempt(first!.id, { pin: "000000" });
        expect(store.waitMs(first!.id)).toBeGreaterThan(0);
        expect(store.waitMs(second!.id)).toBe(0);
        expect((await store.attempt(second!.id, { pin: "482916" })).ok).toBe(true);
    });
});

describe("locks written by an older build", () => {
    it("read back unchanged, with no PIN verifier, and open with the same password", async () => {
        const verifier = await makePasswordVerifier("legacy pass", 1000);
        const old = {
            id: "old-1",
            target,
            method: "password",
            duration: { kind: "session" },
            createdAt: "2026-01-01T00:00:00.000Z",
            verifier,
            totp: null,
        };
        const record = migrateLockRecord(JSON.parse(JSON.stringify(old)));
        expect(record).toEqual({ ...old, pinVerifier: null });
        const outcome = await verifyUnlock(record!, "legacy pass", { vault: null, atMs: AT });
        expect(outcome.ok).toBe(true);
    });

    it("keeps an authenticator-only lock opening with a bare code", async () => {
        const old = {
            id: "old-2",
            target,
            method: "totp",
            duration: { kind: "surface" },
            createdAt: "2026-01-01T00:00:00.000Z",
            verifier: null,
            totp: { algorithm: "SHA-1", digits: 6, period: 30 },
        };
        const record = migrateLockRecord(old);
        expect(record?.method).toBe("totp");
        expect(record?.pinVerifier).toBeNull();
        const outcome = await verifyUnlock(record!, await liveCode(), {
            vault: vaultWith(SECRET),
            atMs: AT,
        });
        expect(outcome.ok).toBe(true);
    });

    it("drops what is not a lock rather than inventing one", () => {
        expect(migrateLockRecord(null)).toBeNull();
        expect(migrateLockRecord({ id: "x", method: "magic", target })).toBeNull();
        expect(migrateLockRecord({ method: "pin", target })).toBeNull();
        expect(migrateLockRecord({ id: "x", method: "pin" })).toBeNull();
    });

    it("are migrated by the store on load, so the list shows them unchanged", async () => {
        const verifier = await makePasswordVerifier("legacy pass", 1000);
        const store = createLockStore({
            host: {
                name: "test",
                dataFolder: null,
                vault: null,
                load: async () =>
                    [
                        {
                            id: "old-1",
                            target,
                            method: "password",
                            duration: { kind: "surface" },
                            createdAt: "x",
                            verifier,
                            totp: null,
                        },
                        { id: "junk", method: "nope" },
                    ] as unknown as LockRecord[],
                save: async () => undefined,
            },
        });
        await store.load();
        expect(store.locks.value.map((lock) => lock.id)).toEqual(["old-1"]);
        expect((await store.attempt("old-1", "legacy pass")).ok).toBe(true);
    });
});
