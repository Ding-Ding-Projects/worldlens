// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createCreativeDocument } from "./creativeDocument.js";
import { renderCreativeSvg } from "./creativeRenderer.js";
import { applyCreativeLogoVariant, resetCreativeLogoPipeline } from "./creativeLogoPipeline.js";
import { logoStore, resetLogoToShipped, setLogoPersistence } from "../../appLogo/logoStore.js";

describe("creative logo pipeline", () => {
    it("validates a generated SVG variant, updates the shared logo store, and resets it", () => {
        setLogoPersistence(false);
        const document = createCreativeDocument();
        const svg = renderCreativeSvg(document);
        const variant = { id: "logo-128", width: 128, height: 128, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
        const next = applyCreativeLogoVariant(document, variant);
        expect(logoStore.custom?.dataUrl).toBe(variant.dataUrl);
        expect(logoStore.custom?.width).toBe(128);
        expect(next.logo.target).toBe("app-logo");
        const reset = resetCreativeLogoPipeline(next);
        expect(logoStore.custom).toBeNull();
        expect(reset.logo.enabled).toBe(false);
        resetLogoToShipped();
        setLogoPersistence(true);
    });

    it("rejects non-SVG or unsafe generated variants before touching the active mark", () => {
        setLogoPersistence(false);
        resetLogoToShipped();
        const document = createCreativeDocument();
        expect(() => applyCreativeLogoVariant(document, { id: "bad", width: 128, height: 128, dataUrl: "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3Cscript%3Ebad%3C/script%3E%3C/svg%3E" })).toThrow(/validation/);
        expect(logoStore.custom).toBeNull();
        setLogoPersistence(true);
    });
});
