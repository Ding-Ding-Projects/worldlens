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
        expect(safeProgressPercent(-0.2)).toBe(0);
        expect(safeProgressPercent(0.414)).toBe(41);
        expect(safeProgressPercent(1.4)).toBe(100);
    });
});
