// Focused tests for the fixture comparison's own reading and comparison logic.
// Bilingual note (poke-guy hunting note, not shipped anywhere public): this proves the
// comparator on tiny synthetic worlds before it is trusted on gigabyte-scale ones.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateMeasuredWorld } from "../../design/packages/worldgen/dist/measuredWorld.js";
import { packPadded, blockStateBitWidth } from "../../design/packages/worldgen/dist/packing.js";
import {
    readWorldChunks,
    chunkSemantics,
    compareChunkSemantics,
    unpackPadded,
} from "./lib/anvil-reader.mjs";

test("unpackPadded inverts packPadded at every derivable bit width worldgen actually emits", () => {
    const count = 4096;
    for (const paletteSize of [1, 2, 5, 17, 300, 5000]) {
        const bits = blockStateBitWidth(paletteSize, count);
        const max = (1 << Math.min(bits, 31)) - 1;
        const values = new Uint32Array(count);
        for (let i = 0; i < count; i++) values[i] = ((i * 2654435761) >>> 1) & max;
        const packed = packPadded(values, count, bits);
        const roundTripped = unpackPadded(packed, count);
        assert.deepEqual(Array.from(roundTripped), Array.from(values), "palette size " + paletteSize + " (" + bits + " bits)");
    }
});

test("a freshly generated tiny world decodes with sane per-chunk semantics", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "worldlens-fixture-test-"));
    t.after(async () => rm(dir, { recursive: true, force: true }));

    const result = await generateMeasuredWorld({
        seed: 42,
        name: "tiny",
        outDir: dir,
        targetBytes: 200_000,
    });
    assert.ok(result.chunkCount > 0, "generated at least one chunk");
    assert.ok(!result.cancelled, "run completed rather than being cancelled");

    const chunks = await readWorldChunks(result.worldFolder);
    assert.equal(chunks.size, result.chunkCount, "decoded chunk count matches the manifest");

    for (const [key, nbt] of chunks) {
        const [x, z] = key.split(",").map(Number);
        assert.equal(nbt.xPos, x, "xPos matches region-derived coordinate");
        assert.equal(nbt.zPos, z, "zPos matches region-derived coordinate");
        assert.equal(nbt.DataVersion, 3700, "chunk declares the 1.20.4 DataVersion");
        const semantics = chunkSemantics(nbt);
        assert.ok(semantics.sections.size > 0, "chunk has at least one section");
        for (const [, section] of semantics.sections) {
            const total = Array.from(section.blockCounts.values()).reduce((a, b) => a + b, 0);
            assert.equal(total, 4096, "a section's block palette multiset always sums to 4096");
            const biomeTotal = Array.from(section.biomeCounts.values()).reduce((a, b) => a + b, 0);
            assert.equal(biomeTotal, 64, "a section's biome palette multiset always sums to 64");
        }
    }
});

test("compareChunkSemantics reports no differences for a chunk against itself", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "worldlens-fixture-test-"));
    t.after(async () => rm(dir, { recursive: true, force: true }));
    const result = await generateMeasuredWorld({ seed: 7, name: "tiny2", outDir: dir, targetBytes: 100_000 });
    const chunks = await readWorldChunks(result.worldFolder);
    for (const [, nbt] of chunks) {
        const semantics = chunkSemantics(nbt);
        const differences = compareChunkSemantics(semantics, semantics);
        assert.deepEqual(differences, [], "identical chunk NBT compares clean");
    }
});

test("compareChunkSemantics detects a deliberately corrupted block palette", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "worldlens-fixture-test-"));
    t.after(async () => rm(dir, { recursive: true, force: true }));
    const result = await generateMeasuredWorld({ seed: 9, name: "tiny3", outDir: dir, targetBytes: 100_000 });
    const chunks = await readWorldChunks(result.worldFolder);
    const [, nbt] = [...chunks][0];
    const before = chunkSemantics(nbt);
    const mutated = structuredClone(nbt);
    // Break the first section's first palette entry's block name (the break-test this
    // repository's rules require: watch the comparator fail before trusting it).
    const firstSection = mutated.sections[0];
    firstSection.block_states.palette[0].Name = "minecraft:definitely_not_the_same_block";
    const after = chunkSemantics(mutated);
    const differences = compareChunkSemantics(before, after);
    assert.ok(differences.length > 0, "a mutated palette must be caught, not silently passed");
    assert.ok(differences.some((d) => d.includes("block palette multiset differs")));
});
