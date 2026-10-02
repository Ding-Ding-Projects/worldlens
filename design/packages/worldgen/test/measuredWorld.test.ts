import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { generateMeasuredWorld, measuredRegionCoordinates, MEASURED_LEDGER } from "../src/measuredWorld.js";
import { TerrainGenerator } from "../src/TerrainGenerator.js";
import { ChunkNbtWriter } from "../src/chunkNbt.js";

const folders: string[] = [];
async function options(targetBytes = 70_000) {
    const outDir = await mkdtemp(join(tmpdir(), "measured-world-"));
    folders.push(outDir);
    return { seed: 20260904, name: "measured", outDir, targetBytes };
}
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }); });

describe("measured real Anvil generation", () => {
    it("meets actual decimal bytes and writes the exact real chunk NBT without padding", async () => {
        const input = await options();
        const result = await generateMeasuredWorld(input);
        const files = await readdir(join(result.worldFolder, "region"));
        const regions = await Promise.all(files.map((file) => readFile(join(result.worldFolder, "region", file))));
        const level = await readFile(join(result.worldFolder, "level.dat"));
        expect(gunzipSync(level)[0]).toBe(10);
        const actual = level.length + regions.reduce((sum, bytes) => sum + bytes.length, 0);
        expect(result.bytes).toBe(actual);
        expect(actual).toBeGreaterThanOrEqual(input.targetBytes);
        expect(result.overshootBytes).toBe(actual - input.targetBytes);
        expect(result.cancelled).toBe(false);
        const region = regions[0]!;
        const offset = region.readUIntBE(0, 3) * 4096;
        const length = region.readUInt32BE(offset);
        expect(region[offset + 4]).toBe(2);
        const nbt = inflateSync(region.subarray(offset + 5, offset + 4 + length));
        expect(nbt).toEqual(Buffer.from(new ChunkNbtWriter().write(new TerrainGenerator(input.seed).generateChunk(0, 0))));
    });

    it("cancellation retains a valid region and resume is byte-identical to uninterrupted generation", async () => {
        const input = await options(180_000);
        let checks = 0;
        const paused = await generateMeasuredWorld({ ...input, isCancelled: () => ++checks > 5 });
        expect(paused.cancelled).toBe(true);
        expect(paused.chunkCount).toBeGreaterThan(0);
        expect(paused.bytes).toBeLessThan(input.targetBytes);
        const resumed = await generateMeasuredWorld({ ...input, resume: true });
        const other = await options(input.targetBytes);
        const uninterrupted = await generateMeasuredWorld(other);
        expect(resumed.manifestSha256).toBe(uninterrupted.manifestSha256);
        expect(resumed.chunkCount).toBe(uninterrupted.chunkCount);
        expect(resumed.bytes).toBe(uninterrupted.bytes);
        expect(resumed.cancelled).toBe(false);
    });

    it("validates all hashes even when a resumed target is already complete", async () => {
        const input = await options();
        const result = await generateMeasuredWorld(input);
        const path = join(result.worldFolder, "region", "r.0.0.mca");
        const bytes = await readFile(path); bytes[9000] = bytes[9000]! ^ 1; await writeFile(path, bytes);
        await expect(generateMeasuredWorld({ ...input, resume: true })).rejects.toThrow("Region content differs");
        expect(await readFile(path)).toEqual(bytes);
    });

    it("refuses different seeds, targets and foreign ledgers without replacing data", async () => {
        const input = await options();
        const result = await generateMeasuredWorld(input);
        await expect(generateMeasuredWorld({ ...input, resume: true, seed: 1 })).rejects.toThrow("original seed");
        await expect(generateMeasuredWorld({ ...input, resume: true, targetBytes: 1 })).rejects.toThrow("original seed");
        const path = join(result.worldFolder, MEASURED_LEDGER);
        const original = await readFile(path, "utf8");
        const ledger = JSON.parse(original); ledger.generator = "foreign"; await writeFile(path, JSON.stringify(ledger));
        await expect(generateMeasuredWorld({ ...input, resume: true })).rejects.toThrow("original seed");
        expect(JSON.parse(await readFile(path, "utf8")).generator).toBe("foreign");
    });

    it("refuses unrelated destinations and untracked files", async () => {
        const input = await options();
        await mkdir(join(input.outDir, input.name));
        const owned = join(input.outDir, input.name, "valuable.txt");
        await writeFile(owned, "keep");
        await expect(generateMeasuredWorld(input)).rejects.toThrow();
        await expect(generateMeasuredWorld({ ...input, resume: true })).rejects.toThrow();
        expect(await readFile(owned, "utf8")).toBe("keep");
        const cleanInput = await options();
        const result = await generateMeasuredWorld(cleanInput);
        await writeFile(join(result.worldFolder, "unrelated"), "keep");
        await expect(generateMeasuredWorld({ ...cleanInput, resume: true })).rejects.toThrow("Unrelated files");
    });

    it("bounds requests and preserves an empty cancelled task for resume", async () => {
        const input = await options();
        for (const targetBytes of [0, -1, NaN, Infinity, 100_000_000_001, 1.5]) {
            await expect(generateMeasuredWorld({ ...input, targetBytes })).rejects.toThrow("Invalid measured-world options");
        }
        await expect(generateMeasuredWorld({ ...input, name: "../escape" })).rejects.toThrow("Invalid measured-world options");
        const paused = await generateMeasuredWorld({ ...input, isCancelled: () => true });
        expect(paused.chunkCount).toBe(0);
        expect((await stat(paused.manifestPath)).size).toBeLessThan(1024);
        expect((await generateMeasuredWorld({ ...input, resume: true })).cancelled).toBe(false);
    });

    it("uses a deterministic nonoverlapping compact square-shell inventory", () => {
        const coordinates = Array.from({ length: 10_000 }, (_, index) => measuredRegionCoordinates(index));
        expect(new Set(coordinates.map((value) => value.join(","))).size).toBe(10_000);
        expect(Math.max(...coordinates.flat())).toBe(99);
    });
});
