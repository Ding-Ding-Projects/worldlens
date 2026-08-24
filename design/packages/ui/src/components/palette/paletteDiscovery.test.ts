import { describe, expect, it } from "vitest";
import {
    DEFAULT_DISCOVERY_STATE,
    MAX_DISCOVERY_ID_LENGTH,
    MAX_FAVOURITES,
    MAX_RECENT_DESTINATIONS,
    readPaletteDiscovery,
    recordPaletteDestination,
    prunePaletteDiscovery,
    togglePaletteFavourite,
    writePaletteDiscovery,
} from "./paletteDiscovery.js";

function storage(): {
    data: Map<string, string>;
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
} {
    const data = new Map<string, string>();
    return {
        data,
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, value),
    };
}

describe("palette discovery memory", () => {
    it("keeps an empty, bounded state when storage is malformed", () => {
        const target = storage();
        target.data.set("worldlens-palette-discovery", "not json");
        expect(readPaletteDiscovery(target)).toEqual(DEFAULT_DISCOVERY_STATE);
    });

    it("persists favourites and toggles them without touching catalogue data", () => {
        const target = storage();
        const favourite = togglePaletteFavourite(DEFAULT_DISCOVERY_STATE, "settings.theme");
        writePaletteDiscovery(favourite, target);
        expect(readPaletteDiscovery(target).favourites).toEqual(["settings.theme"]);
        expect(togglePaletteFavourite(favourite, "settings.theme").favourites).toEqual([]);
    });

    it("records destinations newest first and bounds recents", () => {
        let state = DEFAULT_DISCOVERY_STATE;
        for (let index = 0; index < MAX_RECENT_DESTINATIONS + 2; index++) {
            state = recordPaletteDestination(state, { id: `page.${index}`, kind: "destination" });
        }
        expect(state.recentDestinations).toHaveLength(MAX_RECENT_DESTINATIONS);
        expect(state.recentDestinations[0]).toBe(`page.${MAX_RECENT_DESTINATIONS + 1}`);
        expect(recordPaletteDestination(state, { id: "setting.x", kind: "setting" })).toBe(state);
    });

    it("bounds favourite count and id length, then ignores stale ids", () => {
        const target = storage();
        const tooLong = "x".repeat(MAX_DISCOVERY_ID_LENGTH + 1);
        target.data.set(
            "worldlens-palette-discovery",
            JSON.stringify({
                favourites: [tooLong, ...Array.from({ length: MAX_FAVOURITES + 4 }, (_, i) => `f.${i}`)],
                recentDestinations: [tooLong, "page.valid", "page.unknown"],
            }),
        );
        const state = readPaletteDiscovery(target);
        expect(state.favourites).toHaveLength(MAX_FAVOURITES);
        expect(state.favourites).not.toContain(tooLong);
        expect(prunePaletteDiscovery(state, new Set(["f.0", "page.valid"]))).toEqual({
            favourites: ["f.0"],
            recentDestinations: ["page.valid"],
        });
    });
});
