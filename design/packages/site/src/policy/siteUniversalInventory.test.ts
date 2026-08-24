import { describe, expect, it } from "vitest";
import { assertGlobalPagesCrossCheck, assertSiteUniversalInventory, SITE_UNIVERSAL_INVENTORY } from "./siteUniversalInventory.js";
import { PAGES_FEATURE_COVERAGE } from "./globalFeatureCoverage.js";

describe("site universal inventory", () => {
    it("keeps every canonical row explicit", () => {
        expect(() => assertSiteUniversalInventory()).not.toThrow();
        expect(SITE_UNIVERSAL_INVENTORY.length).toBeGreaterThanOrEqual(10);
    });

    it("turns red when one required row is removed, then green when restored", () => {
        const broken = SITE_UNIVERSAL_INVENTORY.slice(0, -1);
        expect(() => assertSiteUniversalInventory(broken)).toThrow(/inventory drifted/);
        expect(() => assertSiteUniversalInventory(SITE_UNIVERSAL_INVENTORY)).not.toThrow();
    });

    it("rejects a renamed row instead of accepting a substring lookalike", () => {
        const renamed = SITE_UNIVERSAL_INVENTORY.map((row, index) =>
            index === 0 ? { ...row, id: `${row.id}-removed` } : row,
        );
        expect(() => assertSiteUniversalInventory(renamed)).toThrow(/Missing site universal/);
    });

    it("cross-checks every existing Pages inventory row, with a red then green mutation", () => {
        expect(() => assertGlobalPagesCrossCheck(PAGES_FEATURE_COVERAGE)).not.toThrow();
        expect(() => assertGlobalPagesCrossCheck(PAGES_FEATURE_COVERAGE.slice(1))).toThrow(/missing/);
        expect(() => assertGlobalPagesCrossCheck(PAGES_FEATURE_COVERAGE)).not.toThrow();
    });

    it("turns red for pending or stale evidence and green when restored", () => {
        const pending = SITE_UNIVERSAL_INVENTORY.map((row, index) => index === 0 ? { ...row, status: "pending" as const } : row);
        expect(() => assertSiteUniversalInventory(pending)).toThrow(/pending/);
        const stale = SITE_UNIVERSAL_INVENTORY.map((row, index) => index === 0 ? { ...row, freshness: "old" as "candidate" } : row);
        expect(() => assertSiteUniversalInventory(stale)).toThrow(/stale/);
        expect(() => assertSiteUniversalInventory(SITE_UNIVERSAL_INVENTORY)).not.toThrow();
    });
});
