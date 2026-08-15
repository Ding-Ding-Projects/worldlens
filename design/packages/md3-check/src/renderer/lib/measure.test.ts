import { describe, expect, it } from "vitest";
import { contrastRatio, diffMeasurements, parseRgb, relativeLuminance, type ComponentMeasurement } from "./measure.js";

/**
 * `measureComponent()` itself is deliberately NOT unit-tested here: it reads
 * `getBoundingClientRect()`, and jsdom (this workspace's DOM stand-in for plain unit tests -
 * see `design/vitest.config.ts`) has no real layout engine, so every rect it returns is zero
 * regardless of what CSS is applied. A test built on that would either assert 0-against-0
 * (proving nothing about real paint) or mock the rect (proving nothing about the real
 * function). The honest place to prove `measureComponent` reads real paint is against a real
 * Chromium layout - `scripts/capture.mjs` does exactly that, live, every time it runs, by
 * calling the identical function through `window.__MD3_CHECK__.measureAll()` inside a real
 * Electron window. This file instead proves the parts that do NOT depend on layout at all:
 * the colour arithmetic, and the diffing logic built on top of it.
 */

describe("parseRgb", () => {
    it("reads an rgb() computed-style string", () => {
        expect(parseRgb("rgb(255, 0, 128)")).toEqual([255, 0, 128]);
    });

    it("reads an rgba() computed-style string, ignoring alpha", () => {
        expect(parseRgb("rgba(10, 20, 30, 0.5)")).toEqual([10, 20, 30]);
    });

    it("returns null for a keyword or malformed value", () => {
        expect(parseRgb("transparent")).toBeNull();
        expect(parseRgb("currentcolor")).toBeNull();
        expect(parseRgb("")).toBeNull();
    });
});

describe("relativeLuminance", () => {
    it("is 0 for black and 1 for white - the WCAG formula's own defined endpoints", () => {
        expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
        expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
    });
});

describe("contrastRatio", () => {
    it("is exactly 21:1 for black against white - WCAG's own worked example", () => {
        expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 2);
    });

    it("is 1:1 for a colour against itself", () => {
        expect(contrastRatio([120, 60, 200], [120, 60, 200])).toBeCloseTo(1, 5);
    });

    it("is order-independent (a vs b equals b vs a)", () => {
        const ab = contrastRatio([255, 255, 255], [0, 99, 155]);
        const ba = contrastRatio([0, 99, 155], [255, 255, 255]);
        expect(ab).toBeCloseTo(ba, 10);
    });

    it("matches WCAG's own #767676-on-white worked example (~4.54:1, the AA text floor's edge case)", () => {
        // #767676 is the grey WCAG's own documentation uses to demonstrate a ratio that
        // just clears 4.5:1 against white - a real, citable value rather than an arbitrary
        // pair, useful here as a second independent check beyond the pure black/white case.
        expect(contrastRatio([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 1);
    });
});

function measurement(overrides: Partial<ComponentMeasurement> = {}): ComponentMeasurement {
    return {
        heightPx: 40,
        widthPx: 120,
        cornerRadiusPx: 20,
        declaredCornerRadiusPx: 9999,
        cornerRadiusUniform: true,
        isPill: true,
        fontFamily: "Roboto, sans-serif",
        fontSizePx: 14,
        fontWeight: "500",
        lineHeightPx: 20,
        letterSpacingPx: 0.1,
        textColor: "rgb(255, 255, 255)",
        backgroundColor: "rgb(0, 99, 155)",
        backgroundSource: "self",
        contrastRatio: 5.2,
        minVisibleTargetPx: 40,
        ...overrides,
    };
}

describe("diffMeasurements", () => {
    it("reports no field as differing when both sides are identical", () => {
        const m = measurement();
        const diff = diffMeasurements(m, m);
        expect(diff.cornerRadiusPx.differs).toBe(false);
        expect(diff.heightPx.differs).toBe(false);
        expect(diff.fontSizePx.differs).toBe(false);
        expect(diff.contrastRatio.differs).toBe(false);
    });

    it("flags a real corner-radius divergence - Worldlens's 12px text field against the 4px baseline", () => {
        const reference = measurement({ cornerRadiusPx: 4, isPill: false, declaredCornerRadiusPx: 4 });
        const worldlens = measurement({ cornerRadiusPx: 12, isPill: false, declaredCornerRadiusPx: 12 });
        const diff = diffMeasurements(reference, worldlens);
        expect(diff.cornerRadiusPx.differs).toBe(true);
        expect(diff.cornerRadiusPx.deltaNumeric).toBe(8);
    });

    it("does not flag a sub-tolerance rounding difference as differing", () => {
        const reference = measurement({ heightPx: 40 });
        const worldlens = measurement({ heightPx: 40.2 });
        expect(diffMeasurements(reference, worldlens).heightPx.differs).toBe(false);
    });

    it("flags a font-family mismatch even though it carries no numeric delta", () => {
        const reference = measurement({ fontFamily: "Roboto, sans-serif" });
        const worldlens = measurement({ fontFamily: "Arial, sans-serif" });
        const diff = diffMeasurements(reference, worldlens);
        expect(diff.fontFamily.differs).toBe(true);
        expect(diff.fontFamily.deltaNumeric).toBeNull();
    });
});
