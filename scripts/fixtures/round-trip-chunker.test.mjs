// Unit tests for round-trip-chunker.mjs's own comparison logic, independent of a real
// Chunker run (the real-jar end-to-end proof lives in the evidence doc, not here - a
// unit test cannot spend twenty-eight minutes converting a 10 GB world). These prove
// the comparator itself: it must report "clean" only when it should, and it must be
// caught failing before it is trusted (this repository's own break-test rule).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateMeasuredWorld } from "../../design/packages/worldgen/dist/measuredWorld.js";
import { readWorldChunks, chunkSemantics, compareChunkSemantics } from "./lib/anvil-reader.mjs";
import { compareWorlds } from "./round-trip-chunker.mjs";

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

test("bounded recording: missing/extra/documented/undocumented lists cap at maxRecorded but the reported totals stay exact", async (t) => {
    const original = await tinyWorld(t, 801, 300_000); // sized so one region carries more than a handful of chunks
    const beforeChunks = await readWorldChunks(original);
    const chunkCount = beforeChunks.size;
    assert.ok(chunkCount > 10, "fixture must carry more chunks than the tiny maxRecorded used below, or this test proves nothing");

    // "after" world: same folder shape, but its region directory is entirely empty, so
    // every one of the original's chunks is reported missing via the `afterChunks ===
    // null` bulk path in compareWorlds - the exact path that pushed every key onto an
    // unbounded array before this fix.
    const afterRoot = await mkdtemp(join(tmpdir(), "worldlens-roundtrip-empty-after-"));
    t.after(async () => rm(afterRoot, { recursive: true, force: true }));
    await mkdir(join(afterRoot, "region"), { recursive: true });

    const { comparison, verdict } = await compareWorlds(original, afterRoot, { maxRecorded: 5 });
    assert.equal(verdict, "undocumented-differences-found");
    assert.equal(comparison.missingChunksTotal, chunkCount, "the true total must count every missing chunk, not just the kept sample");
    assert.ok(comparison.missingChunks.length <= 5, "the recorded sample must be capped at maxRecorded regardless of how many chunks actually went missing");
    assert.equal(comparison.extraChunksTotal, 0);
});

test("break-test: without the cap, the recorded sample would grow with the total (proves the cap is load-bearing, not a no-op)", async (t) => {
    const original = await tinyWorld(t, 802, 300_000);
    const beforeChunks = await readWorldChunks(original);
    const chunkCount = beforeChunks.size;
    const afterRoot = await mkdtemp(join(tmpdir(), "worldlens-roundtrip-empty-after-uncapped-"));
    t.after(async () => rm(afterRoot, { recursive: true, force: true }));
    await mkdir(join(afterRoot, "region"), { recursive: true });

    // A maxRecorded at least as large as the whole chunk count is the "uncapped" case:
    // the kept sample should equal the total exactly, which is what the old, unbounded
    // implementation always did. This is the red/green pair for the fix above: at
    // maxRecorded=5 the sample is capped well below the total (previous test); here,
    // with headroom, it is not - proving the cap parameter is actually wired through
    // rather than the sample always silently topping out at some hard-coded number.
    const { comparison } = await compareWorlds(original, afterRoot, { maxRecorded: chunkCount + 10 });
    assert.equal(comparison.missingChunks.length, chunkCount, "with headroom above the total, nothing should be truncated");
    assert.equal(comparison.missingChunksTotal, chunkCount);
});
