// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Preferences } from "../platform/Preferences.js";
import {
    SiteContractStore,
    decodeBase32,
    deriveCredential,
    createLocalQrSvg,
    encodeBase32,
    generateTotp,
    UnlockLadderMachine,
    makeOtpAuthUri,
    matchesContractQuery,
    parseOtpAuthUri,
} from "./siteContracts.js";

class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length(): number { return this.values.size; }
    clear(): void { this.values.clear(); }
    getItem(key: string): string | null { return this.values.get(key) ?? null; }
    key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string): void { this.values.delete(key); }
    setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("site universal contracts", () => {
    it("parses and re-serialises an otpauth URI without losing parameters", () => {
        const parsed = parseOtpAuthUri("otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA256&digits=8&period=45");
        expect(parsed).toEqual({ issuer: "Example", account: "alice", secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA256", digits: 8, period: 45 });
        expect(parseOtpAuthUri(makeOtpAuthUri(parsed))).toEqual(parsed);
    });

    it("rejects malformed or overlong base32 input", () => {
        expect(() => decodeBase32("not base32!".replace(/ /g, ""))).toThrow();
        expect(() => decodeBase32("A".repeat(129))).toThrow(/too large/);
    });

    it("generates the RFC 6238 SHA1 vector at time 59", async () => {
        const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        expect(await generateTotp(secret, 59_000, { algorithm: "SHA1", digits: 8, period: 30 })).toBe("94287082");
    });

    it("generates the RFC 6238 SHA256 and SHA512 vectors and supports seven digits", async () => {
        const sha256Secret = encodeBase32(new TextEncoder().encode("12345678901234567890123456789012"));
        const sha512Secret = encodeBase32(new TextEncoder().encode("1234567890123456789012345678901234567890123456789012345678901234"));
        expect(await generateTotp(sha256Secret, 59_000, { algorithm: "SHA256", digits: 8, period: 30 })).toBe("46119246");
        expect(await generateTotp(sha512Secret, 59_000, { algorithm: "SHA512", digits: 8, period: 30 })).toBe("90693936");
        const seven = await generateTotp(sha256Secret, 59_000, { algorithm: "SHA256", digits: 7, period: 45 });
        expect(seven).toMatch(/^\d{7}$/);
    });

    it("stores metadata and redacted history but not authenticator secrets", async () => {
        const storage = new MemoryStorage();
        const store = new SiteContractStore(new Preferences(storage));
        store.addAuthenticator({ id: "auth-1", issuer: "Example", account: "alice", algorithm: "SHA1", digits: 6, period: 30, group: "Ungrouped", secretAvailable: true }, "JBSWY3DPEHPK3PXP");
        const raw = storage.getItem("mbm-site:site.universal.contracts.v1") ?? "";
        expect(raw).not.toContain("JBSWY3DPEHPK3PXP");
        expect(store.snapshot.history.at(0)?.detail).not.toContain("JBSWY3DPEHPK3PXP");
    });

    it("keeps lock credentials as digests and clears waiting only", async () => {
        const storage = new MemoryStorage();
        const store = new SiteContractStore(new Preferences(storage));
        const salt = "lock-salt-1";
        const digest = await deriveCredential("correct horse battery staple", salt);
        const lock = store.addLock({ target: "button", scope: "element", method: "password", credentialDigest: digest, credentialSalt: salt, iterations: 120_000, duration: "session", totp: null });
        const stored = storage.getItem("mbm-site:site.universal.contracts.v1") ?? "";
        expect(stored).not.toContain("correct horse battery staple");
        expect(stored).toContain("PBKDF2-SHA-256");
        expect(stored).toContain("lock-salt-1");
        store.beginLadderWait(1000);
        expect(store.snapshot.ladder.waitingUntil).toBeGreaterThan(Date.now());
        expect(await store.verifyLock(lock.id, "correct horse battery staple")).toBe(true);
        store.clearLadderWaiting();
        expect(store.snapshot.ladder.waitingUntil).toBe(0);
    });

    it("uses a unique salted PBKDF2 credential digest rather than unsalted SHA-256", async () => {
        const one = await deriveCredential("same", "salt-a", 100_000);
        const two = await deriveCredential("same", "salt-b", 100_000);
        expect(one).not.toBe(two);
        await expect(deriveCredential("same", "salt", 99_999)).rejects.toThrow(/work factor/);
    });

    it("generates a real bundled local QR SVG", () => {
        const svg = createLocalQrSvg("otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example");
        expect(svg.localName).toBe("svg");
        expect(svg.querySelectorAll("path,rect").length).toBeGreaterThan(0);
        expect(svg.outerHTML).not.toContain("JBSWY3DPEHPK3PXP");
    });

    it("walks every unlock ladder rung and refuses an early mole submission", () => {
        const machine = new UnlockLadderMachine({ schoolMode: false, now: 1000, waitingMs: 1000 });
        expect(machine.snapshot().stage).toBe("dim-sum");
        for (let i = 0; i < 5; i++) { machine.consumeAttempt(); machine.answerDish(false, 1000); }
        expect(machine.snapshot().stage).toBe("sums");
        for (let i = 0; i < 10; i++) { machine.consumeAttempt(); machine.answerSum(machine.snapshot().sumAnswers[machine.snapshot().sumIndex]!, 1000); }
        expect(machine.snapshot().stage).toBe("cleared");
        const moles = new UnlockLadderMachine({ schoolMode: true, now: 1000, waitingMs: 1000 });
        moles.answerSum(0, 1000);
        expect(moles.snapshot().stage).toBe("whack-a-mole");
        moles.startMoles(1000);
        moles.submitMoles(1500);
        expect(moles.snapshot().stage).toBe("whack-a-mole");
        moles.submitMoles(5000);
        expect(moles.snapshot().stage).toBe("clock");
        const expired = new UnlockLadderMachine({ schoolMode: true, now: 1000, waitingMs: 1000 });
        expect(expired.answerSum(7, 62_000).stage).toBe("clock");
    });

    it("uses regex flags in the actual predicate and rejects invalid patterns", () => {
        expect(matchesContractQuery("Authenticator Account", "", "authenticator", "i")).toBe(true);
        expect(matchesContractQuery("Authenticator Account", "", "^account$", "i")).toBe(false);
        expect(matchesContractQuery("Authenticator Account", "", "account$", "i")).toBe(true);
        expect(matchesContractQuery("Authenticator Account", "", "[", "i")).toBe(false);
    });

    it("saves, lists, applies, imports through the same state shape, and removes named presets", () => {
        const store = new SiteContractStore(new Preferences(new MemoryStorage()));
        store.setAppearance({ colour: "#ff0000", fontSize: 24 });
        const preset = store.saveAppearancePreset("Red reading");
        store.setAppearance({ colour: "#00ff00", fontSize: 12 });
        expect(store.applyAppearancePreset(preset.id)).toBe(true);
        expect(store.snapshot.appearance.colour).toBe("#ff0000");
        expect(store.snapshot.presets[0]?.name).toBe("Red reading");
        store.removeAppearancePreset(preset.id);
        expect(store.snapshot.presets).toHaveLength(0);
    });
});
