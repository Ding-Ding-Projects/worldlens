import { describe, expect, it } from "vitest";

import {
    SYNTHETIC_TERRAIN_NOTICE,
    WORLD_GEN_ENGINES,
    engineById,
    ignoredSettingsFor,
    syntheticWorldSize,
} from "./worldGenEngine.js";
import { defaultWorldGenSettings, type WorldGenSettings } from "./worldGenSettings.js";

function settings(overrides: Partial<WorldGenSettings> = {}): WorldGenSettings {
    return { ...defaultWorldGenSettings(), ...overrides };
}

describe("WORLD_GEN_ENGINES", () => {
    it("offers exactly one engine that actually runs in this build", () => {
        expect(WORLD_GEN_ENGINES.filter((engine) => engine.wired).map((engine) => engine.id)).toEqual(["synthetic"]);
    });

    it("marks the real-server engine as not wired, so the GUI cannot imply it works", () => {
        expect(engineById("vanilla-server").wired).toBe(false);
    });

    it("refuses an unknown engine id rather than guessing one", () => {
        // @ts-expect-error deliberately outside the union: a stale renderer must not select silently.
        expect(() => engineById("wishful")).toThrow(/Unknown world generation engine/);
    });
});

describe("SYNTHETIC_TERRAIN_NOTICE", () => {
    it("says plainly that the terrain is not Minecraft-accurate", () => {
        expect(SYNTHETIC_TERRAIN_NOTICE).toMatch(/not a Minecraft-accurate world/);
    });

    it("warns that a seed here is unrelated to the same seed in Minecraft", () => {
        expect(SYNTHETIC_TERRAIN_NOTICE).toMatch(/same seed typed into Minecraft/);
    });
});

describe("ignoredSettingsFor", () => {
    it("ignores nothing for the real-server engine, which honours every setting", () => {
        expect(ignoredSettingsFor("vanilla-server", settings())).toEqual([]);
    });

    it("names the version and flavour as ignored by the synthetic engine", () => {
        const fields = ignoredSettingsFor("synthetic", settings()).map((entry) => entry.field);
        expect(fields).toContain("version");
        expect(fields).toContain("flavour");
        expect(fields).toContain("gamerules");
    });

    it("stays quiet about superflat layers until a superflat world is actually chosen", () => {
        const defaultFields = ignoredSettingsFor("synthetic", settings({ worldType: "default" })).map((e) => e.field);
        expect(defaultFields).not.toContain("superflatLayers");

        const flatFields = ignoredSettingsFor("synthetic", settings({ worldType: "flat" })).map((e) => e.field);
        expect(flatFields).toContain("superflatLayers");
    });

    it("stays quiet about the single biome until a single-biome world is chosen", () => {
        const fields = ignoredSettingsFor("synthetic", settings({ worldType: "single_biome_surface" })).map((e) => e.field);
        expect(fields).toContain("singleBiome");
    });

    it("warns about extra dimensions only when one was actually switched on", () => {
        const overworldOnly = ignoredSettingsFor("synthetic", settings({ dimensions: { overworld: true, nether: false, end: false } }));
        expect(overworldOnly.map((e) => e.field)).not.toContain("dimensions");

        const withNether = ignoredSettingsFor("synthetic", settings({ dimensions: { overworld: true, nether: true, end: false } }));
        expect(withNether.map((e) => e.field)).toContain("dimensions");
    });

    it("gives every ignored setting a reason, never a bare label", () => {
        for (const entry of ignoredSettingsFor("synthetic", settings({ worldType: "flat" }))) {
            expect(entry.reason.trim().length).toBeGreaterThan(0);
            expect(entry.label.trim().length).toBeGreaterThan(0);
        }
    });
});

describe("syntheticWorldSize", () => {
    it("converts a radius in blocks to an edge length", () => {
        expect(syntheticWorldSize(500)).toBe(1000);
    });

    it("never asks the generator for a degenerate world", () => {
        expect(syntheticWorldSize(0)).toBe(16);
        expect(syntheticWorldSize(-40)).toBe(16);
    });
});
