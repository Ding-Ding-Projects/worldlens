// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { JOB_IDS } from "../shell/jobRegistry.js";
import { SETTINGS_SECTIONS } from "../settings/settingsSections.js";
import type { PaletteItem } from "./paletteItems.js";
import { buildPaletteCatalog, type PaletteCatalogInput, type PalettePageRef } from "./paletteCatalog.js";

/**
 * Fails when a job the shell can hold, or a settings section the settings surface
 * renders, exists but the palette cannot reach it - derived from the real
 * registries (`JOB_IDS`, `SETTINGS_SECTIONS`) rather than a hand-copied list, so
 * a job or section added later fails this test without anyone remembering to
 * update it here.
 *
 * `memory` is deliberately excluded: it is capability-gated with no public
 * implementation in this checkout (see `jobRegistry.ts`), so no page for it can
 * genuinely exist to be reached.
 */

const t = (_key: string, ...rest: unknown[]): string => {
    const fallback = rest[rest.length - 1];
    return typeof fallback === "string" ? fallback : String(rest[0] ?? "");
};

function baseInput(pages: readonly PalettePageRef[]): PaletteCatalogInput {
    return {
        t,
        app: null,
        locale: "en",
        pages,
        canRouteConfigScreens: false,
        size: "card",
        setSize: () => {},
        actions: {
            revealSetting: () => {},
            openSettings: () => {},
            openConfig: () => {},
            openProfiles: () => {},
            openPage: () => {},
        },
    };
}

describe("the palette reaches every job the shell can hold", () => {
    const reachableJobIds = JOB_IDS.filter((id) => id !== "memory");
    const pages: PalettePageRef[] = reachableJobIds.map((id) => ({ id, label: id }));
    const items: PaletteItem[] = buildPaletteCatalog(baseInput(pages));
    const destinationIds = new Set(items.filter((item) => item.kind === "destination").map((item) => item.id));

    it.each(reachableJobIds)("has a destination row for job %s", (jobId) => {
        expect(destinationIds.has(`page.${jobId}`)).toBe(true);
    });
});

describe("the palette reaches every settings section", () => {
    const items: PaletteItem[] = buildPaletteCatalog(baseInput([]));
    const destinationIds = new Set(items.filter((item) => item.kind === "destination").map((item) => item.id));

    it.each(SETTINGS_SECTIONS)("has a destination row for settings section %s", (anchor) => {
        expect(destinationIds.has(`settings.${anchor}`)).toBe(true);
    });
});
