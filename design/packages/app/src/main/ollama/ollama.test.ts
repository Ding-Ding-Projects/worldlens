import { describe, expect, it, vi } from "vitest";
import { fetchExhaustiveCatalog, assertCatalogCompleteness, mergeInstalledTags } from "./catalog.js";
import { assessHardwareFit } from "./hardwareFit.js";
import { validateHarnessProfile, assertHarnessCompleteness } from "./harness.js";
import { OllamaClient, resolveOllamaRuntime } from "./client.js";

describe("local Ollama suite", () => {
    it("follows every catalog page and records completeness", async () => {
        const snapshot = await fetchExhaustiveCatalog({ fetchPage: vi.fn().mockResolvedValueOnce({ items: [{ name: "a" }], next: "two", revision: "r" }).mockResolvedValueOnce({ items: [{ name: "b" }], next: null, revision: "r" }) }, () => "2026-08-24T00:00:00.000Z");
        expect(snapshot.pages).toBe(2);
        expect(snapshot.complete).toBe(true);
        expect(snapshot.variants.map((item) => item.name)).toEqual(["a", "b"]);
        expect(() => assertCatalogCompleteness(["all-pages-followed"])).toThrow(/variant-level-records/);
        expect(() => assertCatalogCompleteness()).not.toThrow();
    });
    it("returns evidence-backed conservative hardware states", () => {
        expect(assessHardwareFit({ ramBytes: 16e9, vramBytes: null, freeBytes: 1e9, blobBytes: 2e9, parameterCount: null, context: 4096, backend: "cpu" }).fit).toBe("unlikely");
        expect(assessHardwareFit({ ramBytes: 32e9, vramBytes: 8e9, freeBytes: 100e9, blobBytes: 4e9, parameterCount: 7e9, context: 4096, backend: "cuda" }).fit).toBe("runs-well");
        expect(assessHardwareFit({ ramBytes: null, vramBytes: null, freeBytes: null, blobBytes: null, parameterCount: null, context: null, backend: null }).fit).toBe("unknown");
    });
    it("keeps a stale catalog stale when installed tags are reconciled", () => {
        const snapshot = { version: 1 as const, variants: [], fetchedAt: "2020-01-01T00:00:00.000Z", pages: 1, complete: false, revision: "old", stale: true, source: "verified source" };
        const merged = mergeInstalledTags(snapshot, [{ name: "local:tag", size: 1 }]);
        expect(merged.stale).toBe(true);
        expect(merged.fetchedAt).toBe(snapshot.fetchedAt);
        expect(merged.variants[0]?.name).toBe("local:tag");
    });
    it("rejects arbitrary shell syntax and has all harness safety rows", () => {
        expect(validateHarnessProfile({ id: "unsafe", name: "unsafe", executable: "tool", arguments: ["x; rm -rf"], workingDirectory: "C:/work", environmentKeys: [], allowed: true }).ok).toBe(false);
        expect(() => assertHarnessCompleteness(["allowlisted-executable"])).toThrow(/semantic-pickers/);
        expect(() => assertHarnessCompleteness()).not.toThrow();
    });
    it("never turns missing Ollama into a manual-install instruction", async () => {
        const result = resolveOllamaRuntime({});
        expect(result.origin).toBe("unavailable");
        expect(result.reason).toContain("in-app automatic acquisition");
        await expect(new OllamaClient("https://example.com").health()).resolves.toMatchObject({ ok: false });
    });
});
