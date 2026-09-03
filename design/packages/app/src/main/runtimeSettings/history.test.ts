import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RuntimeHistoryService } from "./history.js";

const safe = {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`sealed:${value}`),
    decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ""),
};

describe("runtime history protection", () => {
    it("requires its own credential, appends redacted records and exports without secrets", () => {
        const root = mkdtempSync(join(tmpdir(), "worldlens-runtime-history-"));
        try {
            const service = new RuntimeHistoryService({ file: join(root, "history.json"), credentialFile: join(root, "credential.json"), safeStorage: safe });
            expect(service.list()).toEqual([]);
            expect(service.setCredential("history-password").ok).toBe(true);
            expect(service.append("updated", ["theme", "displayName"], { values: { theme: "light" } }, { values: { theme: "dark" } })).not.toBeNull();
            expect(service.list({ action: "updated" })).toHaveLength(1);
            expect(service.list({ query: "theme", regex: true, flags: "i", from: "2026-01-01", to: "2099-12-31" })).toHaveLength(1);
            expect(service.list({ query: "theme", regex: true, flags: "ig" })).toHaveLength(1);
            expect(service.list({ from: "2026-02-30" })).toHaveLength(0);
            expect(service.diff(service.list()[0]!.id).ok).toBe(true);
            expect(service.restore(service.list()[0]!.id).ok).toBe(true);
            expect(readFileSync(join(root, "history.json"), "utf8")).not.toContain("secret-value");
            expect(service.exportRedacted("markdown")).toContain("Credentials and private values were omitted.");
            expect(service.verify("wrong-password").ok).toBe(false);
            expect(service.setCredential("replacement-password").ok).toBe(true);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
});
