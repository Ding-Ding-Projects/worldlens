import { describe, expect, it } from "vitest";
import { assertSiteUniversalInventory, SITE_UNIVERSAL_INVENTORY } from "./siteUniversalInventory.js";

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
});
