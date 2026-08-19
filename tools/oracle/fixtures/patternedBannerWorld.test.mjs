import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPatternedBannerWorld } from "./patternedBannerWorld.mjs";

test("patterned-banner oracle fixture contains two eras and ordered layers", async () => {
    const out = await mkdtemp(join(tmpdir(), "worldlens-banner-fixture-"));
    try {
        const world = await createPatternedBannerWorld(out);
        const manifest = JSON.parse(
            await readFile(join(world, "patterned-banner-manifest.json"), "utf8"),
        );
        assert.equal(manifest.fixture, "patterned-banner");
        assert.deepEqual(manifest.banners.map((banner) => banner.field), ["Patterns", "patterns"]);
        assert.deepEqual(manifest.banners[0].layers, [["bs", 15], ["cre", 4], ["tts", 11], ["bri", 1]]);
        assert.deepEqual(manifest.banners[1].layers, [
            ["minecraft:stripe_bottom", "minecraft:black"],
            ["minecraft:creeper", "minecraft:red"],
            ["minecraft:triangles_top", "minecraft:blue"],
        ]);

        const region = await readFile(join(world, "region", "r.0.0.mca"));
        assert.ok(region.length > 8192, "fixture must contain a compressed chunk payload");
        assert.equal(region.readUIntBE(0, 3), 2, "chunk payload starts at sector 2");
        assert.equal(region[3], 1, "fixture contains exactly one chunk sector");
        const payload = region.subarray(8192, 8192 + region.readUInt32BE(8192) + 4);
        assert.equal(payload[4], 2, "chunk uses zlib compression");
        const text = (await import("node:zlib")).inflateSync(payload.subarray(5)).toString("utf8");
        for (const expected of ["minecraft:banner", "Patterns", "patterns", "minecraft:stripe_bottom", "minecraft:triangles_top"]) {
            assert.ok(text.includes(expected), `chunk payload contains ${expected}`);
        }
    } finally {
        await rm(out, { recursive: true, force: true });
    }
});

