import { describe, expect, it } from "vitest";
import { nonNegativeInteger, safeProgressPercent } from "./shellNumbers.js";

describe("shell number boundaries", () => {
    it("keeps badge counts finite, integral and non-negative", () => {
        expect(nonNegativeInteger(Number.NaN)).toBe(0);
        expect(nonNegativeInteger(Number.POSITIVE_INFINITY)).toBe(0);
        expect(nonNegativeInteger(-3)).toBe(0);
        expect(nonNegativeInteger(0)).toBe(0);
        expect(nonNegativeInteger(3.9)).toBe(3);
        expect(nonNegativeInteger(42)).toBe(42);
    });

    it("clamps external render progress to the ARIA percentage range", () => {
        expect(safeProgressPercent(undefined)).toBeNull();
        expect(safeProgressPercent(null)).toBeNull();
        expect(safeProgressPercent(Number.NaN)).toBeNull();
        expect(safeProgressPercent(Number.POSITIVE_INFINITY)).toBeNull();
        expect(safeProgressPercent(-20)).toBe(0);
        expect(safeProgressPercent(41.4)).toBe(41);
        expect(safeProgressPercent(140)).toBe(100);
    });

    it("reads the percentage scale this application actually produces", () => {
        // `ProgressLevel.percent` is 0-100, so a real mid-render value must stay mid-range.
        // The previous 0..1 contract turned every one of these into a finished-looking bar.
        expect(safeProgressPercent(41)).toBe(41);
        expect(safeProgressPercent(1)).toBe(1);
        expect(safeProgressPercent(99.6)).toBe(100);
    });
});
