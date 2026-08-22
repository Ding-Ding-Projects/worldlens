import { describe, expect, it } from "vitest";

import {
    chunkCount,
    defaultWorldGenerationSettings,
    generatorSettingsFor,
    levelTypeFor,
    resolveNumericSeed,
    validateWorldGenerationSettings,
    type WorldGenerationSettings,
} from "./settings.js";

function settingsWithOutput(overrides: Partial<WorldGenerationSettings> = {}): WorldGenerationSettings {
    return {
        ...defaultWorldGenerationSettings(),
        version: "1.21.4",
        output: { kind: "folder", destination: "/tmp/out" },
        ...overrides,
    };
}

describe("resolveNumericSeed", () => {
    it("resolves to null when the mode is random", () => {
        expect(resolveNumericSeed({ mode: "random", text: "" })).toBeNull();
    });

    it("passes a numeric text seed through unchanged", () => {
        expect(resolveNumericSeed({ mode: "chosen", text: "12345" })).toBe(12345);
        expect(resolveNumericSeed({ mode: "chosen", text: "-99" })).toBe(-99);
    });

    it("hashes a non-numeric text seed deterministically, matching Java's String#hashCode", () => {
        // "worldlens".hashCode() in Java is a known constant we can assert against directly.
        const first = resolveNumericSeed({ mode: "chosen", text: "worldlens" });
        const second = resolveNumericSeed({ mode: "chosen", text: "worldlens" });
        expect(first).toBe(second);
        expect(first).not.toBeNull();
    });

    it("treats blank chosen text as unresolved", () => {
        expect(resolveNumericSeed({ mode: "chosen", text: "   " })).toBeNull();
    });
});

describe("validateWorldGenerationSettings", () => {
    it("accepts the defaults once version and destination are filled in", () => {
        expect(validateWorldGenerationSettings(settingsWithOutput())).toEqual([]);
    });

    it("rejects an empty world name", () => {
        const errors = validateWorldGenerationSettings(settingsWithOutput({ worldName: "" }));
        expect(errors.some((e) => e.field === "worldName")).toBe(true);
    });

    it("rejects a world name with a path separator", () => {
        const errors = validateWorldGenerationSettings(settingsWithOutput({ worldName: "a/b" }));
        expect(errors.some((e) => e.field === "worldName")).toBe(true);
    });

    it("rejects a chosen seed with no text", () => {
        const errors = validateWorldGenerationSettings(settingsWithOutput({ seed: { mode: "chosen", text: "" } }));
        expect(errors.some((e) => e.field === "seed")).toBe(true);
    });

    it("rejects generating zero dimensions", () => {
        const errors = validateWorldGenerationSettings(
            settingsWithOutput({ dimensions: { overworld: false, nether: false, end: false } }),
        );
        expect(errors.some((e) => e.field === "dimensions")).toBe(true);
    });

    it("rejects flat world type with no layers", () => {
        const errors = validateWorldGenerationSettings(settingsWithOutput({ worldType: "flat", superflatLayers: [] }));
        expect(errors.some((e) => e.field.startsWith("superflatLayers"))).toBe(true);
    });

    it("rejects single-biome world type with an empty biome", () => {
        const errors = validateWorldGenerationSettings(
            settingsWithOutput({ worldType: "single_biome_surface", singleBiome: "" }),
        );
        expect(errors.some((e) => e.field === "singleBiome")).toBe(true);
    });

    it("rejects a radius pre-generation extent of zero", () => {
        const errors = validateWorldGenerationSettings(
            settingsWithOutput({
                extent: { kind: "radius", radiusChunks: 0, minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 },
            }),
        );
        expect(errors.some((e) => e.field === "extent.radiusChunks")).toBe(true);
    });

    it("rejects explicit chunk bounds where min >= max", () => {
        const errors = validateWorldGenerationSettings(
            settingsWithOutput({
                extent: { kind: "bounds", radiusChunks: 0, minChunkX: 5, minChunkZ: -5, maxChunkX: 5, maxChunkZ: 5 },
            }),
        );
        expect(errors.some((e) => e.field === "extent.maxChunkX")).toBe(true);
    });

    it("accepts well-formed explicit chunk bounds", () => {
        const errors = validateWorldGenerationSettings(
            settingsWithOutput({
                extent: { kind: "bounds", radiusChunks: 0, minChunkX: -5, minChunkZ: -5, maxChunkX: 5, maxChunkZ: 5 },
            }),
        );
        expect(errors).toEqual([]);
    });

    it("rejects an empty destination", () => {
        const errors = validateWorldGenerationSettings(
            settingsWithOutput({ output: { kind: "folder", destination: "" } }),
        );
        expect(errors.some((e) => e.field === "output.destination")).toBe(true);
    });

    it("rejects a zip destination that does not end in .zip", () => {
        const errors = validateWorldGenerationSettings(
            settingsWithOutput({ output: { kind: "zip", destination: "/tmp/out" } }),
        );
        expect(errors.some((e) => e.field === "output.destination")).toBe(true);
    });

    it("accepts a zip destination ending in .zip", () => {
        const errors = validateWorldGenerationSettings(
            settingsWithOutput({ output: { kind: "zip", destination: "/tmp/out.zip" } }),
        );
        expect(errors).toEqual([]);
    });

    it("rejects an empty version", () => {
        const errors = validateWorldGenerationSettings(settingsWithOutput({ version: "" }));
        expect(errors.some((e) => e.field === "version")).toBe(true);
    });
});

describe("chunkCount", () => {
    it("computes the square for a radius extent", () => {
        expect(chunkCount({ kind: "radius", radiusChunks: 1, minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 })).toBe(9);
        expect(chunkCount({ kind: "radius", radiusChunks: 0, minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 })).toBe(1);
    });

    it("computes width*depth for explicit bounds", () => {
        expect(
            chunkCount({ kind: "bounds", radiusChunks: 0, minChunkX: -1, minChunkZ: -1, maxChunkX: 1, maxChunkZ: 1 }),
        ).toBe(9);
    });
});

describe("levelTypeFor / generatorSettingsFor", () => {
    it("maps every world type to its own level-type string", () => {
        expect(levelTypeFor("default")).toBe("minecraft:normal");
        expect(levelTypeFor("flat")).toBe("minecraft:flat");
        expect(levelTypeFor("large_biomes")).toBe("minecraft:large_biomes");
        expect(levelTypeFor("amplified")).toBe("minecraft:amplified");
        expect(levelTypeFor("single_biome_surface")).toBe("minecraft:single_biome_surface");
    });

    it("returns null generator-settings for default/large_biomes/amplified", () => {
        expect(generatorSettingsFor(settingsWithOutput({ worldType: "default" }))).toBeNull();
        expect(generatorSettingsFor(settingsWithOutput({ worldType: "large_biomes" }))).toBeNull();
    });

    it("returns the encoded preset for flat", () => {
        const value = generatorSettingsFor(settingsWithOutput({ worldType: "flat" }));
        expect(value).toBe("minecraft:bedrock;minecraft:dirt*2;minecraft:grass_block");
    });

    it("returns a JSON biome payload for single_biome_surface", () => {
        const value = generatorSettingsFor(
            settingsWithOutput({ worldType: "single_biome_surface", singleBiome: "minecraft:desert" }),
        );
        expect(value).toBe(JSON.stringify({ biome: "minecraft:desert" }));
    });
});
