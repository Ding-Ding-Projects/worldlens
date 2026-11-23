import { describe, expect, it } from "vitest";
import {
    applyShape,
    boxesFor,
    chunksInShape,
    keyOf,
    maskRecordsFor,
    regionFoldersFor,
    regionOf,
    selectionFromMask,
} from "./chunkPickerModel.js";

const grid = (n: number) => {
    const s = new Set<string>();
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) s.add(keyOf(x, z));
    return s;
};

describe("chunk picker model", () => {
    it("finds region files for each dimension in both world layouts", () => {
        expect(regionOf("region/r.-1.2.mca", regionFoldersFor("minecraft:overworld"))).toEqual({
            x: -1,
            z: 2,
        });
        expect(
            regionOf(
                "dimensions/minecraft/overworld/region/r.0.0.mca",
                regionFoldersFor("minecraft:overworld"),
            ),
        ).toEqual({ x: 0, z: 0 });
        expect(
            regionOf("DIM-1/region/r.0.0.mca", regionFoldersFor("minecraft:overworld")),
        ).toBeNull();
        expect(
            regionOf("DIM-1\\region\\r.3.4.mca", regionFoldersFor("minecraft:the_nether")),
        ).toEqual({ x: 3, z: 4 });
        expect(regionOf("entities/r.0.0.mca", regionFoldersFor("minecraft:overworld"))).toBeNull();
    });

    it("picks only generated chunks inside each shape", () => {
        const present = grid(10);
        present.delete(keyOf(2, 2));
        expect(
            chunksInShape(
                "rectangle",
                [
                    { x: 1.2, z: 1.5 },
                    { x: 3.9, z: 2.1 },
                ],
                present,
            ).sort(),
        ).toEqual(["1,1", "1,2", "2,1", "3,1", "3,2"].sort());
        expect(chunksInShape("single", [{ x: 4.5, z: 4.5 }], present)).toEqual(["4,4"]);
        expect(
            chunksInShape(
                "circle",
                [
                    { x: 5, z: 5 },
                    { x: 6, z: 5 },
                ],
                present,
            ).sort(),
        ).toEqual(["4,4", "4,5", "5,4", "5,5"].sort());
        const tri = chunksInShape(
            "freehand",
            [
                { x: 0, z: 0 },
                { x: 6, z: 0 },
                { x: 0, z: 6 },
            ],
            present,
        );
        expect(tri).toContain("0,0");
        expect(tri).not.toContain("5,5");
        expect(
            chunksInShape(
                "rectangle",
                [
                    { x: 20, z: 20 },
                    { x: 30, z: 30 },
                ],
                present,
            ),
        ).toEqual([]);
    });

    it("adds and removes", () => {
        const a = applyShape(new Set(), ["1,1", "2,2"], false);
        expect([...applyShape(a, ["1,1"], true)]).toEqual(["2,2"]);
    });

    it("merges picked chunks into few boxes and writes block coordinates", () => {
        const sel = new Set<string>();
        for (let z = 0; z < 4; z++) for (let x = -2; x < 3; x++) sel.add(keyOf(x, z));
        sel.add(keyOf(10, 10));
        expect(boxesFor(sel)).toEqual([
            { minX: -2, maxX: 2, minZ: 0, maxZ: 3 },
            { minX: 10, maxX: 10, minZ: 10, maxZ: 10 },
        ]);
        expect(maskRecordsFor(sel)[0]).toEqual({
            "min-x": -32,
            "max-x": 47,
            "min-z": 0,
            "max-z": 63,
        });
    });

    it("reads back chunk-aligned boxes and refuses anything else", () => {
        const sel = new Set(["0,0", "1,0", "0,1", "1,1", "5,5"]);
        expect(selectionFromMask(maskRecordsFor(sel))).toEqual(sel);
        expect(
            selectionFromMask([{ "min-x": 0, "max-x": 10, "min-z": 0, "max-z": 15 }]),
        ).toBeNull();
        expect(
            selectionFromMask([{ type: "circle", "center-x": 0, "center-z": 0, radius: 5 }]),
        ).toBeNull();
        expect(
            selectionFromMask([
                { "min-x": 0, "max-x": 15, "min-z": 0, "max-z": 15, subtract: true },
            ]),
        ).toBeNull();
        expect(selectionFromMask([])).toEqual(new Set());
    });
});
