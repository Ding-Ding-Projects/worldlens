import { describe, expect, it } from "vitest";
import { assertConverterCompleteness, buildAdapterRegistry, CONVERTER_CATEGORIES, detectAdapter, detectAdapters, KNOWN_ADAPTERS, validateAdapterRegistry, type ConverterAdapter } from "./registry.js";

describe("converter registry", () => {
    it("detects byte signatures rather than trusting a filename", async () => {
        const registry = await buildAdapterRegistry({ bundledFiles: Object.fromEntries((await import("./registry.js")).KNOWN_ADAPTERS.map((item) => [item.id, item.id])) , fileExists: async () => true });
        expect(detectAdapter(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), registry)?.id).toBe("image-png");
        expect(detectAdapter(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), registry)?.id).toBe("archive-zip");
        expect(detectAdapter(new Uint8Array([0x4e, 0x4f, 0x50, 0x45]), registry)?.id).toBe("binary-base64");
        const ambiguous = detectAdapters(new TextEncoder().encode("[1,2,3]"), registry);
        expect(ambiguous.map((item) => item.id)).toContain("data-json");
    });
    it("keeps every category visible and missing dependencies disabled", async () => {
        const registry = await buildAdapterRegistry({ bundledFiles: {}, fileExists: async () => false });
        expect(new Set(registry.map((item) => item.category))).toEqual(new Set(CONVERTER_CATEGORIES));
        expect(registry.filter((item) => item.builtIn).every((item) => item.available)).toBe(true);
        expect(registry.filter((item) => !item.builtIn).every((item) => !item.available && item.unavailableReason)).toBe(true);
    });
    it("refuses an enabled adapter without bundled proof", () => {
        const registry = KNOWN_ADAPTERS.map((item) => ({ ...item, bundled: false, available: false, unavailableReason: "missing" })) as ConverterAdapter[];
        registry[0] = { ...registry[0]!, available: true, unavailableReason: null };
        expect(() => validateAdapterRegistry(registry)).toThrow(/bundled proof/);
    });
    it("negative completeness regression turns red when an item disappears", () => {
        expect(() => assertConverterCompleteness(["byte-signature-detection"])).toThrow(/categorized-adapter-catalog/);
        expect(() => assertConverterCompleteness()).not.toThrow();
    });
});
