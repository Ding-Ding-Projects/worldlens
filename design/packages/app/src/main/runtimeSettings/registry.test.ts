import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RuntimeSourceRegistry } from "./registry.js";
import type { SafeStorageLike } from "../worlddownloader/credentialStore.js";

function safe(): SafeStorageLike {
    return {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`sealed:${value}`, "utf8"),
        decryptString: (value) => value.toString("utf8").replace(/^sealed:/, ""),
    };
}

describe("runtime source registry", () => {
    it("persists bounded Home Assistant metadata while keeping the credential encrypted", async () => {
        const root = mkdtempSync(join(tmpdir(), "worldlens-runtime-registry-"));
        try {
            const registry = new RuntimeSourceRegistry({ file: join(root, "sources.json"), safeStorage: safe() });
            const saved = registry.saveHomeAssistant({ id: "night", url: "http://127.0.0.1:8123/api", entityId: "input_boolean.night", credential: "secret-value" });
            expect(saved.ok).toBe(true);
            expect(registry.list()[0]).toMatchObject({ id: "night", entityId: "input_boolean.night" });
            const raw = readFileSync(join(root, "sources.json"), "utf8");
            expect(raw).not.toContain("secret-value");
            await expect(registry.useCredential("night", async (value) => value)).resolves.toBe("secret-value");
            expect(registry.remove("night").ok).toBe(true);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });

    it("refuses plaintext persistence when the operating-system vault is unavailable", () => {
        const root = mkdtempSync(join(tmpdir(), "worldlens-runtime-registry-"));
        try {
            const unavailable = { ...safe(), isEncryptionAvailable: () => false };
            const registry = new RuntimeSourceRegistry({ file: join(root, "sources.json"), safeStorage: unavailable });
            expect(registry.saveHomeAssistant({ id: "night", url: "http://127.0.0.1:8123/api", entityId: "input_boolean.night", credential: "secret-value" }).ok).toBe(false);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });

    it("allows an explicitly configured private LAN Home Assistant source", () => {
        const root = mkdtempSync(join(tmpdir(), "worldlens-runtime-registry-"));
        try {
            const registry = new RuntimeSourceRegistry({ file: join(root, "sources.json"), safeStorage: safe() });
            expect(registry.saveHomeAssistant({ id: "lan", url: "http://192.168.50.242:8123/api", entityId: "input_boolean.night", credential: "secret-value" }).ok).toBe(true);
            expect(registry.get("lan")?.url).toContain("192.168.50.242");
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
});
