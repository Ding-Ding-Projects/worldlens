import { describe, expect, it } from "vitest";
import {
    blockColour,
    blocksSnbt,
    indexBlocks,
    paint,
    paletteCounts,
    parseBlocks,
    parsePalette,
    splitTopLevel,
    topLevelFields,
    withState,
} from "./nbtStructureModel.js";

describe("structure SNBT reader", () => {
    it("splits members while respecting nesting and quotes", () => {
        expect(splitTopLevel('[{a:1},{b:"x,y"},[1,2]]')).toEqual(["{a:1}", '{b:"x,y"}', "[1,2]"]);
        expect(splitTopLevel("[I;1,2,3]")).toEqual(["1", "2", "3"]);
        expect(topLevelFields("{pos:[1,2,3],state:4,nbt:{Items:[{state:9}]}}").get("state")).toBe(
            "4",
        );
    });

    it("reads the palette with properties and readable labels", () => {
        const p = parsePalette(
            '[{Name:"minecraft:air"},{Name:"minecraft:oak_stairs",Properties:{facing:"north",half:"bottom"}}]',
        );
        expect(p.map((e) => e.label)).toEqual([
            "minecraft:air",
            "minecraft:oak_stairs[facing=north,half=bottom]",
        ]);
    });

    it("reads blocks and rewrites only the top-level state, keeping block data", () => {
        const blocks = parseBlocks(
            "[{pos:[0,0,0],state:1},{nbt:{Items:[{state:9}]},pos:[1,0,0],state:2}]",
        );
        expect(blocks.map((b) => [b.x, b.y, b.z, b.state])).toEqual([
            [0, 0, 0, 1],
            [1, 0, 0, 2],
        ]);
        expect(withState(blocks[1]!.raw, 5)).toBe("{nbt:{Items:[{state:9}]},pos:[1,0,0],state:5}");
    });

    it("paints existing cells, adds new ones, and serialises one list", () => {
        const blocks = parseBlocks("[{pos:[0,0,0],state:1}]");
        const index = indexBlocks(blocks);
        expect(paint(blocks, index, 0, 0, 0, 1)).toBe(false);
        expect(paint(blocks, index, 0, 0, 0, 2)).toBe(true);
        expect(paint(blocks, index, 2, 1, 3, 0)).toBe(true);
        expect(blocksSnbt(blocks)).toBe("[{pos:[0,0,0],state:2},{pos:[2,1,3],state:0}]");
        expect(paletteCounts(blocks, 3)).toEqual([1, 0, 1]);
    });

    it("colours air see-through and stone grey", () => {
        expect(blockColour("minecraft:air")).toBe("transparent");
        expect(blockColour("minecraft:stone_bricks")).toMatch(/hsl\(\d+ 6% /);
    });
});
