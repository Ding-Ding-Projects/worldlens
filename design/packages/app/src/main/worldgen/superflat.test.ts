import { describe, expect, it } from "vitest";

import {
    MAX_SUPERFLAT_LAYERS,
    MAX_TOTAL_HEIGHT,
    decodeSuperflatPreset,
    encodeSuperflatLayers,
    validateSuperflatLayers,
    type SuperflatLayer,
} from "./superflat.js";

describe("encodeSuperflatLayers", () => {
    it("encodes the classic bedrock/dirt/grass preset", () => {
        const layers: SuperflatLayer[] = [
            { block: "minecraft:bedrock", depth: 1 },
            { block: "minecraft:dirt", depth: 2 },
            { block: "minecraft:grass_block", depth: 1 },
        ];
        expect(encodeSuperflatLayers(layers)).toBe("minecraft:bedrock;minecraft:dirt*2;minecraft:grass_block");
    });

    it("merges consecutive runs of the same block into one", () => {
        const layers: SuperflatLayer[] = [
            { block: "minecraft:stone", depth: 1 },
            { block: "minecraft:stone", depth: 2 },
        ];
        expect(encodeSuperflatLayers(layers)).toBe("minecraft:stone*3");
    });

    it("round-trips through decode", () => {
        const layers: SuperflatLayer[] = [
            { block: "minecraft:bedrock", depth: 1 },
            { block: "minecraft:stone", depth: 5 },
            { block: "minecraft:grass_block", depth: 1 },
        ];
        const encoded = encodeSuperflatLayers(layers);
        const decoded = decodeSuperflatPreset(encoded);
        expect(decoded.ok).toBe(true);
        if (decoded.ok) expect(decoded.layers).toEqual(layers);
    });
});

describe("decodeSuperflatPreset", () => {
    it("decodes a bare block with no depth as depth 1", () => {
        const result = decodeSuperflatPreset("minecraft:grass_block");
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.layers).toEqual([{ block: "minecraft:grass_block", depth: 1 }]);
    });

    it("rejects an empty string", () => {
        const result = decodeSuperflatPreset("");
        expect(result.ok).toBe(false);
    });

    it("rejects a malformed block id", () => {
        const result = decodeSuperflatPreset("not a block id*2");
        expect(result.ok).toBe(false);
    });

    it("rejects an empty segment between semicolons", () => {
        const result = decodeSuperflatPreset("minecraft:dirt;;minecraft:grass_block");
        expect(result.ok).toBe(false);
    });

    it("rejects a non-numeric depth", () => {
        const result = decodeSuperflatPreset("minecraft:dirt*abc");
        expect(result.ok).toBe(false);
    });
});

describe("validateSuperflatLayers", () => {
    it("requires at least one layer", () => {
        const errors = validateSuperflatLayers([]);
        expect(errors.some((e) => e.message.includes("at least one"))).toBe(true);
    });

    it("accepts a well-formed layer list with no errors", () => {
        const errors = validateSuperflatLayers([
            { block: "minecraft:bedrock", depth: 1 },
            { block: "minecraft:dirt", depth: 2 },
        ]);
        expect(errors).toEqual([]);
    });

    it("rejects a layer over the max count", () => {
        const layers: SuperflatLayer[] = Array.from({ length: MAX_SUPERFLAT_LAYERS + 1 }, (_, i) => ({
            block: `minecraft:block${i}`,
            depth: 1,
        }));
        const errors = validateSuperflatLayers(layers);
        expect(errors.some((e) => e.message.includes(String(MAX_SUPERFLAT_LAYERS)))).toBe(true);
    });

    it("rejects total height above the world limit", () => {
        const errors = validateSuperflatLayers([
            { block: "minecraft:stone", depth: MAX_TOTAL_HEIGHT },
            { block: "minecraft:dirt", depth: 1 },
        ]);
        expect(errors.some((e) => e.message.includes("exceeds"))).toBe(true);
    });

    it("rejects a non-integer or non-positive depth", () => {
        const errors = validateSuperflatLayers([{ block: "minecraft:stone", depth: 0 }]);
        expect(errors.some((e) => e.field === "depth")).toBe(true);
    });

    it("rejects an invalid block id shape", () => {
        const errors = validateSuperflatLayers([{ block: "bad id", depth: 1 }]);
        expect(errors.some((e) => e.field === "block")).toBe(true);
    });
});
