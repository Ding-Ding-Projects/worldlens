import { mkdtempSync, rmSync } from "node:fs";
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
            expect(service.append("updated", ["theme", "displayName"])).not.toBeNull();
            expect(service.list({ action: "updated" })).toHaveLength(1);
            expect(service.list({ query: "theme", regex: true, flags: "i", from: new Date(Date.now() - 1000).toISOString(), to: new Date(Date.now() + 1000).toISOString() })).toHaveLength(1);
            expect(service.diff(service.list()[0]!.id).ok).toBe(true);
            expect(service.restore(service.list()[0]!.id).ok).toBe(true);
            expect(service.exportRedacted("markdown")).toContain("Credentials and private values were omitted.");
            expect(service.verify("wrong-password").ok).toBe(false);
            expect(service.setCredential("replacement-password").ok).toBe(true);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
});
