import { describe, expect, it } from "vitest";
import {
    addSuperflatLayer,
    decodeSuperflatLayers,
    encodeSuperflatLayers,
    moveSuperflatLayer,
    removeSuperflatLayer,
    totalSuperflatDepth,
    updateSuperflatLayer,
    type SuperflatLayer,
} from "./superflatLayers.js";

const LAYERS: readonly SuperflatLayer[] = [
    { block: "minecraft:bedrock", depth: 1 },
    { block: "minecraft:dirt", depth: 2 },
    { block: "minecraft:grass_block", depth: 1 },
];

describe("encodeSuperflatLayers / decodeSuperflatLayers", () => {
    it("encodes bottom-to-top as depth*block,depth*block,...", () => {
        expect(encodeSuperflatLayers(LAYERS)).toBe("1*minecraft:bedrock,2*minecraft:dirt,1*minecraft:grass_block");
    });

    it("round-trips through decode", () => {
        const encoded = encodeSuperflatLayers(LAYERS);
        const decoded = decodeSuperflatLayers(encoded);
        expect(decoded.ok).toBe(true);
        expect(decoded.layers).toEqual(LAYERS);
    });

    it("decodes an empty string to no layers", () => {
        expect(decodeSuperflatLayers("")).toEqual({ ok: true, layers: [], error: null });
    });

    it("rejects a part with no depth separator", () => {
        const result = decodeSuperflatLayers("minecraft:stone,1*minecraft:dirt");
        expect(result.ok).toBe(false);
        expect(result.error).toContain("minecraft:stone");
    });

    it("rejects a zero or negative depth", () => {
        expect(decodeSuperflatLayers("0*minecraft:stone").ok).toBe(false);
        expect(decodeSuperflatLayers("-1*minecraft:stone").ok).toBe(false);
    });

    it("rejects a non-integer depth", () => {
        expect(decodeSuperflatLayers("1.5*minecraft:stone").ok).toBe(false);
    });
});

describe("totalSuperflatDepth", () => {
    it("sums every layer's depth", () => {
        expect(totalSuperflatDepth(LAYERS)).toBe(4);
    });

    it("is 0 for no layers", () => {
        expect(totalSuperflatDepth([])).toBe(0);
    });
});

describe("addSuperflatLayer", () => {
    it("appends by default", () => {
        const next = addSuperflatLayer(LAYERS, { block: "minecraft:sand", depth: 3 });
        expect(next).toHaveLength(4);
        expect(next[3]).toEqual({ block: "minecraft:sand", depth: 3 });
    });

    it("inserts at a given index", () => {
        const next = addSuperflatLayer(LAYERS, { block: "minecraft:sand", depth: 3 }, 1);
        expect(next.map((l) => l.block)).toEqual([
            "minecraft:bedrock",
            "minecraft:sand",
            "minecraft:dirt",
            "minecraft:grass_block",
        ]);
    });

    it("does not mutate the input array", () => {
        const before = LAYERS.length;
        addSuperflatLayer(LAYERS, { block: "minecraft:sand", depth: 3 });
        expect(LAYERS.length).toBe(before);
    });
});

describe("removeSuperflatLayer", () => {
    it("removes exactly the requested index", () => {
        const next = removeSuperflatLayer(LAYERS, 1);
        expect(next.map((l) => l.block)).toEqual(["minecraft:bedrock", "minecraft:grass_block"]);
    });
});

describe("moveSuperflatLayer", () => {
    it("reorders a layer to a new position", () => {
        const next = moveSuperflatLayer(LAYERS, 0, 2);
        expect(next.map((l) => l.block)).toEqual(["minecraft:dirt", "minecraft:grass_block", "minecraft:bedrock"]);
    });

    it("clamps an out-of-range target", () => {
        const next = moveSuperflatLayer(LAYERS, 0, 99);
        expect(next.map((l) => l.block)).toEqual(["minecraft:dirt", "minecraft:grass_block", "minecraft:bedrock"]);
    });

    it("is a no-op for an out-of-range source", () => {
        expect(moveSuperflatLayer(LAYERS, -1, 1)).toBe(LAYERS);
        expect(moveSuperflatLayer(LAYERS, 99, 1)).toBe(LAYERS);
    });
});

describe("updateSuperflatLayer", () => {
    it("patches exactly one layer", () => {
        const next = updateSuperflatLayer(LAYERS, 1, { depth: 5 });
        expect(next[1]).toEqual({ block: "minecraft:dirt", depth: 5 });
        expect(next[0]).toEqual(LAYERS[0]);
        expect(next[2]).toEqual(LAYERS[2]);
    });
});
