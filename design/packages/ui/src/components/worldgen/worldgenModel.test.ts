import { describe, expect, it } from "vitest";

import {
    chunkCount,
    decodeSuperflatPreset,
    defaultWorldGenerationSettings,
    describeRunner,
    encodeSuperflatLayers,
    estimateGeneration,
    formatEstimatedBytes,
    formatEstimatedSeconds,
    resolveNumericSeed,
    runnerKey,
    validateSuperflatLayers,
    validateWorldGenerationSettings,
    type RunnerChoice,
    type WorldGenerationSettings,
} from "./worldgenModel.js";

function validSettings(overrides: Partial<WorldGenerationSettings> = {}): WorldGenerationSettings {
    return { ...defaultWorldGenerationSettings(), version: "1.21.4", output: { kind: "folder", destination: "/tmp/out" }, ...overrides };
}

describe("worldgenModel (UI mirror)", () => {
    it("encodes and round-trips a superflat preset", () => {
        const layers = [
            { block: "minecraft:bedrock", depth: 1 },
            { block: "minecraft:dirt", depth: 2 },
        ];
        const encoded = encodeSuperflatLayers(layers);
        expect(encoded).toBe("minecraft:bedrock;minecraft:dirt*2");
        const decoded = decodeSuperflatPreset(encoded);
        expect(decoded.ok).toBe(true);
        if (decoded.ok) expect(decoded.layers).toEqual(layers);
    });

    it("rejects an empty layer list", () => {
        expect(validateSuperflatLayers([]).length).toBeGreaterThan(0);
    });

    it("accepts default settings once version and destination are set", () => {
        expect(validateWorldGenerationSettings(validSettings())).toEqual([]);
    });

    it("rejects zero dimensions selected", () => {
        const errors = validateWorldGenerationSettings(
            validSettings({ dimensions: { overworld: false, nether: false, end: false } }),
        );
        expect(errors.some((e) => e.field === "dimensions")).toBe(true);
    });

    it("resolves a random seed to null and a numeric seed to itself", () => {
        expect(resolveNumericSeed({ mode: "random", text: "" })).toBeNull();
        expect(resolveNumericSeed({ mode: "chosen", text: "7" })).toBe(7);
    });

    it("computes chunk counts for radius and bounds extents", () => {
        expect(chunkCount({ kind: "radius", radiusChunks: 1, minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 })).toBe(9);
        expect(chunkCount({ kind: "bounds", radiusChunks: 0, minChunkX: -1, minChunkZ: -1, maxChunkX: 1, maxChunkZ: 1 })).toBe(9);
    });

    it("produces a size/time estimate scaled by dimension count", () => {
        const extent = { kind: "radius" as const, radiusChunks: 2, minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 };
        const one = estimateGeneration(extent, 1);
        const two = estimateGeneration(extent, 2);
        expect(two.estimatedBytes).toBe(one.estimatedBytes * 2);
        expect(formatEstimatedBytes(one.estimatedBytes)).toMatch(/[A-Z]{1,2}$/);
        expect(formatEstimatedSeconds(90)).toBe("1m 30s");
    });

    it("describes and keys every runner kind distinctly", () => {
        const runners: RunnerChoice[] = [
            { kind: "local" },
            { kind: "remote", label: "Remote host (h)", key: "h" },
            { kind: "github-actions", owner: "acme", repo: "worlds" },
        ];
        expect(new Set(runners.map(describeRunner)).size).toBe(3);
        expect(new Set(runners.map(runnerKey)).size).toBe(3);
    });
});
