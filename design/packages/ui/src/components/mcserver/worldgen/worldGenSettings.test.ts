import { describe, expect, it } from "vitest";
import {
    buildGeneratorSettings,
    defaultWorldGenSettings,
    hashSeedString,
    resolveSeedPreview,
    validateWorldGenSettings,
    type WorldGenSettings,
} from "./worldGenSettings.js";

function withVersion(overrides: Partial<WorldGenSettings> = {}): WorldGenSettings {
    return { ...defaultWorldGenSettings(), version: "1.21.4", outputDestination: "C:/out/world.zip", ...overrides };
}

describe("defaultWorldGenSettings", () => {
    it("is valid once a version and destination are supplied", () => {
        const result = validateWorldGenSettings(withVersion());
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual({});
    });

    it("is invalid on its own (no version, no destination)", () => {
        const result = validateWorldGenSettings(defaultWorldGenSettings());
        expect(result.ok).toBe(false);
        expect(result.errors.version).toBeDefined();
        expect(result.errors.outputDestination).toBeDefined();
    });
});

describe("validateWorldGenSettings", () => {
    it("requires a namespaced biome id for single_biome_surface", () => {
        const result = validateWorldGenSettings(
            withVersion({ worldType: "single_biome_surface", singleBiome: "plains" }),
        );
        expect(result.ok).toBe(false);
        expect(result.errors.singleBiome).toBeDefined();
    });

    it("accepts a namespaced biome id", () => {
        const result = validateWorldGenSettings(
            withVersion({ worldType: "single_biome_surface", singleBiome: "minecraft:desert" }),
        );
        expect(result.ok).toBe(true);
    });

    it("rejects an empty superflat layer list", () => {
        const result = validateWorldGenSettings(withVersion({ worldType: "flat", superflatLayers: [] }));
        expect(result.ok).toBe(false);
        expect(result.errors.superflatLayers).toBeDefined();
    });

    it("rejects a superflat layer with a bare (non-namespaced) block id", () => {
        const result = validateWorldGenSettings(
            withVersion({ worldType: "flat", superflatLayers: [{ block: "bedrock", depth: 1 }] }),
        );
        expect(result.ok).toBe(false);
        expect(result.errors.superflatLayers).toBeDefined();
    });

    it("rejects superflat layers taller than the world", () => {
        const result = validateWorldGenSettings(
            withVersion({ worldType: "flat", superflatLayers: [{ block: "minecraft:stone", depth: 400 }] }),
        );
        expect(result.ok).toBe(false);
        expect(result.errors.superflatLayers).toContain("384");
    });

    it("rejects a world border diameter over the vanilla ceiling", () => {
        const result = validateWorldGenSettings(
            withVersion({ worldBorderEnabled: true, worldBorderDiameter: 70_000_000 }),
        );
        expect(result.ok).toBe(false);
        expect(result.errors.worldBorderDiameter).toBeDefined();
    });

    it("ignores the world border diameter when the border is disabled", () => {
        const result = validateWorldGenSettings(
            withVersion({ worldBorderEnabled: false, worldBorderDiameter: 70_000_000 }),
        );
        expect(result.ok).toBe(true);
    });

    it("rejects a pre-generation radius below 16 blocks", () => {
        const result = validateWorldGenSettings(withVersion({ pregenerationRadius: 8 }));
        expect(result.ok).toBe(false);
        expect(result.errors.pregenerationRadius).toBeDefined();
    });

    it("rejects a pre-generation radius above the sane ceiling", () => {
        const result = validateWorldGenSettings(withVersion({ pregenerationRadius: 50_000 }));
        expect(result.ok).toBe(false);
        expect(result.errors.pregenerationRadius).toBeDefined();
    });

    it("rejects a negative random tick speed", () => {
        const result = validateWorldGenSettings(
            withVersion({ gamerules: { ...defaultWorldGenSettings().gamerules, randomTickSpeed: -1 } }),
        );
        expect(result.ok).toBe(false);
        expect(result.errors.randomTickSpeed).toBeDefined();
    });

    it("rejects a blank world name", () => {
        const result = validateWorldGenSettings(withVersion({ worldName: "" }));
        expect(result.ok).toBe(false);
        expect(result.errors.worldName).toBeDefined();
    });

    it("rejects an empty output destination", () => {
        const result = validateWorldGenSettings(withVersion({ outputDestination: "" }));
        expect(result.ok).toBe(false);
        expect(result.errors.outputDestination).toBeDefined();
    });
});

describe("resolveSeedPreview", () => {
    it("is null for a blank seed", () => {
        expect(resolveSeedPreview("")).toBeNull();
        expect(resolveSeedPreview("   ")).toBeNull();
    });

    it("parses a plain integer verbatim", () => {
        expect(resolveSeedPreview("4242424242")).toBe(4242424242);
        expect(resolveSeedPreview("-17")).toBe(-17);
    });

    it("hashes non-numeric text deterministically", () => {
        const first = resolveSeedPreview("worldlens");
        const second = resolveSeedPreview("worldlens");
        expect(first).toBe(second);
        expect(first).not.toBeNull();
    });

    it("gives different text different resolved seeds (no collision for these inputs)", () => {
        expect(resolveSeedPreview("alpha")).not.toBe(resolveSeedPreview("beta"));
    });
});

describe("hashSeedString", () => {
    it("is a non-negative 32-bit integer", () => {
        const hash = hashSeedString("anything");
        expect(Number.isInteger(hash)).toBe(true);
        expect(hash).toBeGreaterThanOrEqual(0);
        expect(hash).toBeLessThan(2 ** 32);
    });

    it("is deterministic", () => {
        expect(hashSeedString("same")).toBe(hashSeedString("same"));
    });
});

describe("buildGeneratorSettings", () => {
    it("is null for the default world type", () => {
        expect(buildGeneratorSettings(withVersion())).toBeNull();
    });

    it("encodes the superflat layers for a flat world", () => {
        const settings = withVersion({
            worldType: "flat",
            superflatLayers: [{ block: "minecraft:bedrock", depth: 1 }],
        });
        expect(buildGeneratorSettings(settings)).toBe("1*minecraft:bedrock");
    });
});
