import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { countRegionChunks, countWorldChunks } from "./chunks.js";

const directories: string[] = [];
afterEach(() => {
    while (directories.length > 0) {
        const directory = directories.pop();
        if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
    }
});

function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "bluemap-worlddownloader-chunks-"));
    directories.push(directory);
    return directory;
}

const HEADER_BYTES = 4096;

/**
 * Writes a region file whose header claims exactly `present` chunks.
 *
 * Built by hand rather than copied from a real world, because the assertion being made is
 * about the header arithmetic and a fixture would hide the one thing under test: which
 * four bytes belong to which chunk. The payload past the header is filler, since nothing
 * in this module is allowed to read it.
 */
function writeRegion(folder: string, name: string, present: number, payloadBytes = 8192): void {
    mkdirSync(folder, { recursive: true });
    const header = Buffer.alloc(HEADER_BYTES);
    for (let entry = 0; entry < present; entry += 1) {
        // Three bytes of sector offset then one byte of sector count, so a real entry is
        // never simply "1" in the low byte.
        header.writeUInt32BE(((entry + 2) << 8) | 1, entry * 4);
    }
    writeFileSync(join(folder, name), Buffer.concat([header, Buffer.alloc(payloadBytes, 0x5a)]));
}

describe("countRegionChunks", () => {
    it("counts exactly the non-zero header entries", async () => {
        const directory = temporaryDirectory();
        writeRegion(directory, "r.0.0.mca", 37);
        expect(await countRegionChunks(join(directory, "r.0.0.mca"))).toBe(37);
    });

    it("counts a completely full region", async () => {
        const directory = temporaryDirectory();
        writeRegion(directory, "r.1.1.mca", 1024);
        expect(await countRegionChunks(join(directory, "r.1.1.mca"))).toBe(1024);
    });

    it("counts an allocated but empty region as zero", async () => {
        const directory = temporaryDirectory();
        writeRegion(directory, "r.0.0.mca", 0);
        expect(await countRegionChunks(join(directory, "r.0.0.mca"))).toBe(0);
    });

    it("returns zero for a file shorter than the header rather than crashing", async () => {
        // Exactly what a region file the downloader is creating right now looks like.
        const directory = temporaryDirectory();
        const file = join(directory, "r.0.0.mca");
        writeFileSync(file, Buffer.alloc(100, 0xff));
        expect(await countRegionChunks(file)).toBe(0);
    });

    it("returns zero for a file that is not there", async () => {
        const directory = temporaryDirectory();
        expect(await countRegionChunks(join(directory, "r.9.9.mca"))).toBe(0);
    });
});

describe("countWorldChunks", () => {
    it("returns a zeroed count for a world folder that does not exist yet", async () => {
        const directory = temporaryDirectory();
        const count = await countWorldChunks(join(directory, "not-downloaded-yet"));

        expect(count.total).toBe(0);
        expect(count.bytes).toBe(0);
        expect(count.dimensions).toEqual([]);
        expect(Number.isNaN(Date.parse(count.countedAt))).toBe(false);
    });

    it("totals every region file in the overworld", async () => {
        const world = join(temporaryDirectory(), "Andyville");
        writeRegion(join(world, "region"), "r.0.0.mca", 12);
        writeRegion(join(world, "region"), "r.-1.0.mca", 30);

        const count = await countWorldChunks(world);

        expect(count.total).toBe(42);
        expect(count.dimensions).toHaveLength(1);
        expect(count.dimensions[0]?.dimension).toBe("overworld");
        expect(count.dimensions[0]?.regionFiles).toBe(2);
        expect(count.dimensions[0]?.chunks).toBe(42);
        expect(count.bytes).toBe(2 * (HEADER_BYTES + 8192));
    });

    it("picks up the nether and the end when those folders exist", async () => {
        const world = join(temporaryDirectory(), "Andyville");
        writeRegion(join(world, "region"), "r.0.0.mca", 5);
        writeRegion(join(world, "DIM-1", "region"), "r.0.0.mca", 7);
        writeRegion(join(world, "DIM1", "region"), "r.0.0.mca", 11);

        const count = await countWorldChunks(world);

        expect(count.total).toBe(23);
        expect(count.dimensions.map((entry) => entry.dimension)).toEqual([
            "overworld",
            "nether",
            "end",
        ]);
        expect(count.dimensions.map((entry) => entry.chunks)).toEqual([5, 7, 11]);
    });

    it("omits a dimension the player has never visited rather than reporting it as empty", async () => {
        const world = join(temporaryDirectory(), "Andyville");
        writeRegion(join(world, "region"), "r.0.0.mca", 3);
        writeRegion(join(world, "DIM1", "region"), "r.0.0.mca", 4);

        const count = await countWorldChunks(world);

        expect(count.dimensions.map((entry) => entry.dimension)).toEqual(["overworld", "end"]);
    });

    it("ignores files that are not region files", async () => {
        const world = join(temporaryDirectory(), "Andyville");
        const region = join(world, "region");
        writeRegion(region, "r.0.0.mca", 9);
        writeFileSync(join(region, "r.0.0.mca_tmp"), Buffer.alloc(HEADER_BYTES + 16, 0xff));
        writeFileSync(join(region, "r.0.0.mcr"), Buffer.alloc(HEADER_BYTES + 16, 0xff));
        writeFileSync(join(region, "notes.txt"), "not a region file");

        const count = await countWorldChunks(world);

        // Every ignored file is 4096 bytes of 0xff, so counting one would have added 1024
        // phantom chunks and quadrupled the byte total.
        expect(count.total).toBe(9);
        expect(count.dimensions[0]?.regionFiles).toBe(1);
        expect(count.bytes).toBe(HEADER_BYTES + 8192);
    });

    it("counts a region file that is still being written as zero without failing the world", async () => {
        const world = join(temporaryDirectory(), "Andyville");
        const region = join(world, "region");
        writeRegion(region, "r.0.0.mca", 6);
        writeFileSync(join(region, "r.1.0.mca"), Buffer.alloc(64, 0x00));

        const count = await countWorldChunks(world);

        expect(count.total).toBe(6);
        // The half-written file is still a region file that exists and occupies space, so
        // it is counted as a file and as bytes; only its chunks are unknowable yet.
        expect(count.dimensions[0]?.regionFiles).toBe(2);
        expect(count.bytes).toBe(HEADER_BYTES + 8192 + 64);
    });
});
