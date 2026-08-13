import { describe, expect, it } from "vitest";

import {
    REGION_CHUNKS,
    boundsFromBlocks,
    checkBounds,
    chunkCount,
    chunkSurvives,
    parseRegionFileName,
    planPrune,
    planRegion,
    regionChunkBounds,
    regionOfChunk,
} from "./prune.js";

describe("bounds", () => {
    it("counts an inclusive rectangle inclusively", () => {
        expect(chunkCount({ minChunkX: -4, minChunkZ: -4, maxChunkX: 4, maxChunkZ: 4 })).toBe(81);
        expect(chunkCount({ minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 })).toBe(1);
    });

    it("refuses an inverted rectangle instead of swapping the corners", () => {
        const checked = checkBounds({ minChunkX: 5, minChunkZ: 0, maxChunkX: -5, maxChunkZ: 0 });
        expect(checked.ok).toBe(false);
    });

    it("puts a negative block in the chunk below zero rather than rounding toward it", () => {
        expect(boundsFromBlocks(-1, -1, 15, 15)).toEqual({
            minChunkX: -1,
            minChunkZ: -1,
            maxChunkX: 0,
            maxChunkZ: 0,
        });
    });
});

describe("region arithmetic", () => {
    it("puts chunk 31 and chunk 32 in different regions", () => {
        expect(regionOfChunk(31)).toBe(0);
        expect(regionOfChunk(32)).toBe(1);
        expect(regionOfChunk(-1)).toBe(-1);
        expect(regionOfChunk(-32)).toBe(-1);
        expect(regionOfChunk(-33)).toBe(-2);
    });

    it("covers exactly its own 32 by 32 block of chunks", () => {
        expect(regionChunkBounds(-1, 0)).toEqual({
            minChunkX: -32,
            minChunkZ: 0,
            maxChunkX: -1,
            maxChunkZ: 31,
        });
    });

    it("reads a region file name and refuses anything else", () => {
        expect(parseRegionFileName("r.-1.2.mca")).toEqual({ x: -1, z: 2 });
        expect(parseRegionFileName("r.0.0.mca.bak")).toBeNull();
        expect(parseRegionFileName("chunk.dat")).toBeNull();
    });
});

describe("planRegion at a region edge", () => {
    it("keeps region 0 whole when the bounds end exactly on its last chunk", () => {
        const plan = planRegion(0, 0, { minChunkX: 0, minChunkZ: 0, maxChunkX: 31, maxChunkZ: 31 });
        expect(plan.disposition).toBe("keep-whole");
        expect(plan.chunks.length).toBe(REGION_CHUNKS * REGION_CHUNKS);
    });

    it("does not touch region 1 for those same bounds", () => {
        const plan = planRegion(1, 0, { minChunkX: 0, minChunkZ: 0, maxChunkX: 31, maxChunkZ: 31 });
        expect(plan.disposition).toBe("delete");
        expect(plan.chunks).toEqual([]);
    });

    it("keeps exactly one column of region 1 when the bounds reach chunk 32", () => {
        const plan = planRegion(1, 0, { minChunkX: 0, minChunkZ: 0, maxChunkX: 32, maxChunkZ: 31 });
        expect(plan.disposition).toBe("keep-partial");
        expect(plan.chunks.length).toBe(REGION_CHUNKS);
        expect(plan.chunks.every((chunk) => chunk.x === 32)).toBe(true);
    });

    it("keeps the last chunk of region -1 when the bounds start at chunk -1", () => {
        const plan = planRegion(-1, -1, {
            minChunkX: -1,
            minChunkZ: -1,
            maxChunkX: 0,
            maxChunkZ: 0,
        });
        expect(plan.disposition).toBe("keep-partial");
        expect(plan.chunks).toEqual([{ x: -1, z: -1 }]);
    });

    it("agrees with the single-chunk test at every edge chunk", () => {
        const bounds = { minChunkX: 0, minChunkZ: 0, maxChunkX: 31, maxChunkZ: 31 };
        expect(chunkSurvives(31, 31, bounds)).toBe(true);
        expect(chunkSurvives(32, 31, bounds)).toBe(false);
        expect(chunkSurvives(-1, 0, bounds)).toBe(false);
    });
});

describe("planPrune", () => {
    it("plans only over the regions that exist, and ignores stray files", () => {
        const plan = planPrune(
            ["r.0.0.mca", "r.1.0.mca", "r.5.5.mca", "notes.txt", "r.0.0.mca.bak"],
            { minChunkX: 0, minChunkZ: 0, maxChunkX: 32, maxChunkZ: 31 },
        );

        expect(plan.regions.map((region) => region.fileName)).toEqual([
            "r.0.0.mca",
            "r.1.0.mca",
            "r.5.5.mca",
        ]);
        expect(plan.regions[0]?.disposition).toBe("keep-whole");
        expect(plan.regions[1]?.disposition).toBe("keep-partial");
        expect(plan.regions[2]?.disposition).toBe("delete");
        expect(plan.keptChunks).toBe(REGION_CHUNKS * REGION_CHUNKS + REGION_CHUNKS);
        expect(plan.removedChunks).toBe(3 * REGION_CHUNKS * REGION_CHUNKS - plan.keptChunks);
    });
});
