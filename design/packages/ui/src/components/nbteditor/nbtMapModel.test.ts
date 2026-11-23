import { describe, expect, it } from "vitest";
import {
    MAP_BASE_COLORS,
    MAP_PIXELS,
    colorId,
    colorsSnbt,
    floodFill,
    imageToColors,
    linePixels,
    nearestColorId,
    rgbaForColorId,
    signedByte,
} from "./nbtMapModel.js";

describe("map colours", () => {
    it("has the 61 base colours plus transparent, with grass and glow lichen where the game puts them", () => {
        expect(MAP_BASE_COLORS).toHaveLength(62);
        expect(MAP_BASE_COLORS[1]).toEqual(["Grass", 127, 178, 56]);
        expect(MAP_BASE_COLORS[61]).toEqual(["Glow lichen", 127, 167, 150]);
    });

    it("applies the four shade multipliers and treats base 0 as transparent", () => {
        expect(rgbaForColorId(colorId(1, 2))).toEqual([127, 178, 56, 255]);
        expect(rgbaForColorId(colorId(1, 0))).toEqual([89, 125, 39, 255]);
        expect(rgbaForColorId(colorId(1, 3))).toEqual([67, 94, 29, 255]);
        expect(rgbaForColorId(0)[3]).toBe(0);
        // Signed bytes from the file read the same as unsigned ones.
        expect(rgbaForColorId(signedByte(colorId(61, 2)))).toEqual(rgbaForColorId(colorId(61, 2)));
    });

    it("finds the nearest map colour and never picks transparent", () => {
        expect(nearestColorId(127, 178, 56)).toBe(colorId(1, 2));
        expect(nearestColorId(0, 0, 0) >> 2).not.toBe(0);
    });
});

describe("painting", () => {
    it("draws lines with both ends and fills only the connected area", () => {
        expect(linePixels(0, 0, 3, 0)).toEqual([
            [0, 0],
            [1, 0],
            [2, 0],
            [3, 0],
        ]);
        expect(linePixels(0, 0, 2, 2)).toEqual([
            [0, 0],
            [1, 1],
            [2, 2],
        ]);
        const colors = new Array<number>(MAP_PIXELS).fill(4);
        for (let y = 0; y < 128; y++) colors[y * 128 + 10] = 8;
        expect(floodFill(colors, 0, 0, 12)).toBe(128 * 10);
        expect(colors[11]).toBe(4);
        expect(floodFill(colors, 0, 0, 12)).toBe(0);
    });

    it("writes the whole array as one byte-array SNBT with signed bytes", () => {
        const snbt = colorsSnbt([0, 255, 200]);
        expect(snbt).toBe("[B;0b,-1b,-56b]");
    });

    it("turns a picture into map colours, transparent where the picture is", () => {
        const rgba = new Uint8ClampedArray(MAP_PIXELS * 4);
        rgba.set([127, 178, 56, 255], 0);
        const out = imageToColors(rgba);
        expect(out[0]).toBe(signedByte(colorId(1, 2)));
        expect(out[1]).toBe(0);
    });
});
