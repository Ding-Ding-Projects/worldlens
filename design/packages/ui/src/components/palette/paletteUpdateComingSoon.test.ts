// @vitest-environment jsdom

/**
 * The "Update coming soon" row in the command palette.
 *
 * It is a destination: choosing it opens Settings at the Updates section and outlines it, and
 * nothing else. It needs no viewer, so it is present with no map open, and it never carries a
 * control that could install or download anything.
 */

import { describe, expect, it } from "vitest";
import { buildPaletteCatalog, type PaletteCatalogInput } from "./paletteCatalog.js";
import type { PaletteItem, Translate } from "./paletteItems.js";

const t = ((_key: string, fallback: unknown) =>
    typeof fallback === "string" ? fallback : _key) as Translate;

function input(revealed: unknown[]): PaletteCatalogInput {
    return {
        t,
        app: null,
        locale: "en",
        actions: {
            openSettings: () => {},
            revealSetting: (target: unknown) => revealed.push(target),
            openConfigScreen: () => {},
            openProfiles: () => {},
            openPage: () => {},
        } as unknown as PaletteCatalogInput["actions"],
        canRouteConfigScreens: false,
        size: "card",
        setSize: () => {},
    };
}

function row(items: readonly PaletteItem[]): PaletteItem | undefined {
    return items.find((item) => item.id === "updates.comingSoon");
}

describe("the Update coming soon row", () => {
    it("is present with no map open, named and explained, and says where it goes", () => {
        const found = row(buildPaletteCatalog(input([])));
        expect(found).toBeDefined();
        expect(found?.kind).toBe("destination");
        expect(found?.title).toBe("Update coming soon");
        expect(found?.description).toMatch(/never installs anything/i);
        expect(found && "where" in found ? found.where : "").not.toBe("");
    });

    it("opens Settings at the Updates section and nothing else", () => {
        const revealed: unknown[] = [];
        const found = row(buildPaletteCatalog(input(revealed)));
        if (found === undefined || found.kind !== "destination") throw new Error("expected a destination");
        found.go();
        expect(revealed).toEqual([{ surface: "settings", anchor: "updates", missing: false }]);
    });

    it("is found by the words someone would type", () => {
        const found = row(buildPaletteCatalog(input([])));
        const words = found?.keywords.join(" ") ?? "";
        for (const word of ["update", "coming soon", "build", "not published yet"]) {
            expect(words).toContain(word);
        }
    });
});
