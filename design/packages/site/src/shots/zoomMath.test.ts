import { describe, expect, it } from "vitest";

import {
    ZOOM_RANGE_ABOVE_FIT,
    clampPan,
    clampScale,
    computeFitScale,
    computeMaxScale,
    computeMinScale,
    sizeFromAspectRatio,
    zoomPercent,
} from "./zoomMath.js";

describe("computeFitScale", () => {
    it("scales a capture down to fit a viewport that is smaller than it", () => {
        // A 1920x1080 capture inside an 800x600 stage: the height is the tighter constraint
        // (600/1080 ≈ 0.556 vs 800/1920 ≈ 0.417), so the width constraint wins the min().
        expect(computeFitScale({ width: 1920, height: 1080 }, { width: 800, height: 600 })).toBeCloseTo(
            800 / 1920,
        );
    });

    it("scales a capture UP to fill a viewport that is larger than it -- 'as large as the viewport allows'", () => {
        // The notification-panel and regex-builder captures are natively small (440x545,
        // 440x560). A viewer that only ever shrinks would leave them tiny in the middle of a
        // dark screen, which is exactly the "postage stamp" failure the feature exists to fix.
        expect(computeFitScale({ width: 440, height: 545 }, { width: 1200, height: 900 })).toBeCloseTo(
            900 / 545,
        );
    });

    it("returns 1 rather than Infinity or NaN when the image size is not known yet", () => {
        expect(computeFitScale({ width: 0, height: 0 }, { width: 800, height: 600 })).toBe(1);
        expect(computeFitScale({ width: -4, height: 10 }, { width: 800, height: 600 })).toBe(1);
        expect(computeFitScale({ width: 100, height: 100 }, { width: 0, height: 0 })).toBe(1);
    });

    it("treats a square capture in a square stage as an exact 1:1 fit", () => {
        expect(computeFitScale({ width: 500, height: 500 }, { width: 500, height: 500 })).toBe(1);
    });
});

describe("computeMaxScale", () => {
    it("is at least four times the fit scale when fit is already above natural size", () => {
        // fitScale 2 (a small capture blown up to fill the stage): the ceiling must still be a
        // real 4x on top of that, not 4x natural size (which would be smaller than fit itself).
        expect(computeMaxScale(2)).toBe(2 * ZOOM_RANGE_ABOVE_FIT);
    });

    it("is at least four times natural size when fit is tiny", () => {
        // A capture whose fit scale is 0.02 (the tall changelog scroll, scaled down to a
        // sliver): 4x of that (0.08) would still be unreadable. The guaranteed floor is 4x
        // natural size instead, so the ceiling is always big enough to make text legible.
        expect(computeMaxScale(0.02)).toBe(1 * ZOOM_RANGE_ABOVE_FIT);
    });

    it("never returns a ceiling below the guaranteed floor of natural size times four", () => {
        for (const fit of [0, 0.001, 0.5, 0.999]) {
            expect(computeMaxScale(fit)).toBeGreaterThanOrEqual(ZOOM_RANGE_ABOVE_FIT);
        }
    });
});

describe("computeMinScale", () => {
    it("is the fit scale when the capture is at least as large as the viewport (fit <= 1)", () => {
        expect(computeMinScale(0.2)).toBe(0.2);
        expect(computeMinScale(1)).toBe(1);
    });

    it("is natural size (1), not the fit scale, when a small capture's fit scales it up past 1", () => {
        // This is the exact case that broke the double-click-to-natural-size toggle: a
        // 440x545 notification-panel capture in an 800x600 stage has a fit scale of
        // 600/545 ≈ 1.10. Flooring the zoom range at that fit scale would make "100%" (scale
        // 1) unreachable -- clampScale would clamp it straight back up to ≈1.10 -- so the
        // floor has to be the smaller of the two instead.
        expect(computeMinScale(1.1009174311926606)).toBe(1);
        expect(computeMinScale(4)).toBe(1);
    });
});

describe("clampScale", () => {
    it("keeps a requested scale inside [min, max]", () => {
        expect(clampScale(2, 1, 4)).toBe(2);
    });

    it("floors at the given minimum", () => {
        expect(clampScale(0.1, 1, 4)).toBe(1);
        expect(clampScale(-5, 1, 4)).toBe(1);
    });

    it("ceils at the max scale", () => {
        expect(clampScale(100, 1, 4)).toBe(4);
    });

    it("falls back to the minimum for a non-finite request rather than propagating NaN", () => {
        expect(clampScale(Number.NaN, 1.5, 6)).toBe(1.5);
        expect(clampScale(Number.POSITIVE_INFINITY, 1.5, 6)).toBe(1.5);
    });
});

describe("clampPan", () => {
    const viewport: { width: number; height: number } = { width: 800, height: 600 };

    it("allows no pan at all when the displayed image exactly fits the viewport", () => {
        // At scale 1, an 800x600 image exactly covers an 800x600 stage: any requested offset
        // in either axis clamps straight back to zero, because there is no slack to pan into.
        const image = { width: 800, height: 600 };
        expect(clampPan({ x: 500, y: 500 }, image, viewport, 1)).toEqual({ x: 0, y: 0 });
        expect(clampPan({ x: -500, y: -500 }, image, viewport, 1)).toEqual({ x: 0, y: 0 });
    });

    it("bounds the offset so the image edge can never cross the middle of the stage", () => {
        // A 1000x800 image at scale 2 displays at 2000x1600, well past the 800x600 stage in
        // both axes. maxX = (2000-800)/2 = 600, maxY = (1600-600)/2 = 500.
        const image = { width: 1000, height: 800 };
        expect(clampPan({ x: 10000, y: 10000 }, image, viewport, 2)).toEqual({ x: 600, y: 500 });
        expect(clampPan({ x: -10000, y: -10000 }, image, viewport, 2)).toEqual({ x: -600, y: -500 });
    });

    it("passes an in-range offset through unchanged", () => {
        const image = { width: 1000, height: 800 };
        expect(clampPan({ x: 200, y: -150 }, image, viewport, 2)).toEqual({ x: 200, y: -150 });
    });

    it("clamps a wide, short capture to zero vertical pan while still allowing horizontal pan", () => {
        // The site's own 1200x66 tab-strip capture, scaled up 3x, displays at 3600x198 --
        // narrower than the 600px-tall viewport in height (so no vertical slack at all) but
        // far wider than 800px (so horizontal pan is real). Regression target: a clamp that
        // used one shared bound for both axes would either trap the tall dimension away from
        // zero or let the wide dimension escape.
        const image = { width: 1200, height: 66 };
        expect(clampPan({ x: 0, y: 900 }, image, viewport, 3)).toEqual({ x: 0, y: 0 });
        const wide = clampPan({ x: 10000, y: 0 }, image, viewport, 3);
        expect(wide.y).toBe(0);
        expect(wide.x).toBeGreaterThan(0);
    });
});

describe("zoomPercent", () => {
    it("rounds to the nearest whole-number percentage", () => {
        expect(zoomPercent(1)).toBe(100);
        expect(zoomPercent(0.5)).toBe(50);
        expect(zoomPercent(4)).toBe(400);
        expect(zoomPercent(1.006)).toBe(101);
    });
});

describe("sizeFromAspectRatio", () => {
    it("parses the site's own CSS aspect-ratio literal format", () => {
        expect(sizeFromAspectRatio("8 / 5")).toEqual({ width: 8, height: 5 });
        expect(sizeFromAspectRatio("55 / 62")).toEqual({ width: 55, height: 62 });
        // No spaces, and a decimal value: both are still valid CSS aspect-ratio syntax.
        expect(sizeFromAspectRatio("16/9")).toEqual({ width: 16, height: 9 });
        expect(sizeFromAspectRatio("1.5 / 1")).toEqual({ width: 1.5, height: 1 });
    });

    it("returns null for text that is not a ratio, rather than a guessed size", () => {
        for (const invalid of ["", "not-a-ratio", "16 / 0", "-4 / 3", "16", "16 / -9", "NaN / NaN"]) {
            expect(sizeFromAspectRatio(invalid)).toBeNull();
        }
    });
});
