import { describe, expect, it } from "vitest";
import { Preferences } from "../platform/Preferences.js";
import {
    SiteContractStore,
    decodeBase32,
    generateTotp,
    makeOtpAuthUri,
    parseOtpAuthUri,
    sha256,
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
        const digest = await sha256("correct horse battery staple");
        const lock = store.addLock({ target: "button", scope: "element", method: "password", credentialDigest: digest, duration: "session" });
        expect(storage.getItem("mbm-site:site.universal.contracts.v1")).not.toContain("correct horse battery staple");
        store.beginLadderWait(1000);
        expect(store.snapshot.ladder.waitingUntil).toBeGreaterThan(Date.now());
        expect(await store.verifyLock(lock.id, "correct horse battery staple")).toBe(true);
        store.clearLadderWaiting();
        expect(store.snapshot.ladder.waitingUntil).toBe(0);
    });
});
