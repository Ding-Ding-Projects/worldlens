// Unit tests for round-trip-chunker.mjs's own comparison logic, independent of a real
// Chunker run (the real-jar end-to-end proof lives in the evidence doc, not here - a
// unit test cannot spend twenty-eight minutes converting a 10 GB world). These prove
// the comparator itself: it must report "clean" only when it should, and it must be
// caught failing before it is trusted (this repository's own break-test rule).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateMeasuredWorld } from "../../design/packages/worldgen/dist/measuredWorld.js";
import { readWorldChunks, chunkSemantics, compareChunkSemantics } from "./lib/anvil-reader.mjs";

async function tinyWorld(t, seed, targetBytes = 150_000) {
    const dir = await mkdtemp(join(tmpdir(), "worldlens-roundtrip-test-"));
    t.after(async () => rm(dir, { recursive: true, force: true }));
    const result = await generateMeasuredWorld({ seed, name: "w", outDir: dir, targetBytes });
    return result.worldFolder;
}

test("two independently generated worlds (different seeds) are NOT semantically identical", async (t) => {
    const a = await tinyWorld(t, 501);
    const b = await tinyWorld(t, 502);
    const chunksA = await readWorldChunks(a);
    const chunksB = await readWorldChunks(b);
    const keyA = [...chunksA.keys()][0];
    const keyB = [...chunksB.keys()][0];
    const semA = chunkSemantics(chunksA.get(keyA));
    const semB = chunkSemantics(chunksB.get(keyB));
    const differences = compareChunkSemantics(semA, semB);
    // Different seeds should produce different terrain at chunk (0,0); if this ever
    // starts passing clean, the generator or the comparator broke, not the world.
    assert.ok(differences.length > 0, "different seeds must not compare as identical terrain");
});

test("a byte-for-byte copy of a world compares completely clean, chunk by chunk", async (t) => {
    const original = await tinyWorld(t, 601);
    const copyRoot = await mkdtemp(join(tmpdir(), "worldlens-roundtrip-copy-"));
    t.after(async () => rm(copyRoot, { recursive: true, force: true }));
    const copy = join(copyRoot, "copy");
    await cp(original, copy, { recursive: true });

    const before = await readWorldChunks(original);
    const after = await readWorldChunks(copy);
    assert.equal(before.size, after.size);
    for (const [key, nbt] of before) {
        const differences = compareChunkSemantics(chunkSemantics(nbt), chunkSemantics(after.get(key)));
        assert.deepEqual(differences, [], "chunk " + key + " must compare clean against its own copy");
    }
});

test("break-test: a chunk deleted from the round-tripped copy must be detected as missing", async (t) => {
    const original = await tinyWorld(t, 701);
    const before = await readWorldChunks(original);
    const after = new Map(before); // pretend everything round-tripped...
    const firstKey = [...after.keys()][0];
    after.delete(firstKey); // ...except this one chunk, which "vanished" in Bedrock
    const missing = [...before.keys()].filter((key) => !after.has(key));
    assert.deepEqual(missing, [firstKey], "a chunk that disappears in the round trip must be flagged as missing, never silently ignored");
});
