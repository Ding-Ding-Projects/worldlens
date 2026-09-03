// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createCreativeDocument, setCreativeLogo, undoCreative } from "./creativeDocument.js";
import { renderCreativeSvg } from "./creativeRenderer.js";
import { applyCreativeLogoVariant, resetCreativeLogoPipeline, syncCreativeLogoStore } from "./creativeLogoPipeline.js";
import { logoStore, resetLogoToShipped, setLogoPersistence } from "../../appLogo/logoStore.js";

describe("creative logo pipeline", () => {
    it("validates a generated SVG variant, updates the shared logo store, and resets it", () => {
        setLogoPersistence(false);
        const document = setCreativeLogo(createCreativeDocument(), { target: "app-logo" });
        const svg = renderCreativeSvg(document);
        const variant = { id: "logo-128", width: 128, height: 128, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
        const next = applyCreativeLogoVariant(document, variant);
        expect(logoStore.custom?.dataUrl).toBe(variant.dataUrl);
        expect(logoStore.custom?.width).toBe(128);
        expect(next.logo.activeVariantId).toBe("logo-128");
        expect(next.logo.target).toBe("app-logo");
        syncCreativeLogoStore(undoCreative(next));
        expect(logoStore.custom).toBeNull();
        syncCreativeLogoStore(next);
        expect(logoStore.custom?.dataUrl).toBe(variant.dataUrl);
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

    it("does not mutate app chrome when the composition target is not app-logo", () => {
        setLogoPersistence(false);
        resetLogoToShipped();
        const document = setCreativeLogo(createCreativeDocument(), { target: "appearance-target" });
        const svg = renderCreativeSvg(document);
        const variant = { id: "appearance-only", width: 64, height: 64, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
        const next = applyCreativeLogoVariant(document, variant);
        expect(next.logo.activeVariantId).toBe("appearance-only");
        expect(logoStore.custom).toBeNull();
        setLogoPersistence(true);
    });
});
