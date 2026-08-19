import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { NBTReader, TagType } from "../../../design/packages/nbt/dist/index.js";
import { createPatternedBannerWorld } from "./patternedBannerWorld.mjs";

function readBlockStateSections(bytes) {
    const reader = new NBTReader(bytes);
    const sections = [];
    reader.beginCompound();
    while (reader.hasNext()) {
        const name = reader.name();
        if (name !== "sections") {
            reader.skip();
            continue;
        }
        const count = reader.beginList();
        for (let sectionIndex = 0; sectionIndex < count; sectionIndex++) {
            const section = { y: null, palette: [], data: null };
            reader.beginCompound();
            while (reader.hasNext()) {
                const field = reader.name();
                if (field === "Y") {
                    section.y = reader.nextByte();
                } else if (field !== "block_states") {
                    reader.skip();
                } else {
                    reader.beginCompound();
                    while (reader.hasNext()) {
                        const blockField = reader.name();
                        if (blockField === "palette") {
                            const paletteCount = reader.beginList();
                            for (let i = 0; i < paletteCount; i++) {
                                reader.beginCompound();
                                let state = null;
                                while (reader.hasNext()) {
                                    const paletteField = reader.name();
                                    if (paletteField === "Name") state = reader.nextString();
                                    else reader.skip();
                                }
                                reader.endCompound();
                                section.palette.push(state);
                            }
                            reader.endList();
                        } else if (blockField === "data") {
                            assert.equal(reader.peek(), TagType.LONG_ARRAY);
                            section.data = reader.nextLongArray();
                        } else {
                            reader.skip();
                        }
                    }
                    reader.endCompound();
                }
            }
            reader.endCompound();
            sections.push(section);
        }
        reader.endList();
    }
    reader.endCompound();
    return sections;
}

function packedIndex(data, index, bits) {
    const perLong = Math.floor(64 / bits);
    const long = data[Math.floor(index / perLong)];
    const shift = BigInt((index % perLong) * bits);
    return Number((BigInt.asUintN(64, long) >> shift) & ((1n << BigInt(bits)) - 1n));
}

test("patterned-banner oracle fixture contains two eras and ordered layers", async () => {
    const out = await mkdtemp(join(tmpdir(), "worldlens-banner-fixture-"));
    try {
        const world = await createPatternedBannerWorld(out);
        const manifest = JSON.parse(
            await readFile(join(world, "patterned-banner-manifest.json"), "utf8"),
        );
        assert.equal(manifest.fixture, "patterned-banner");
        assert.deepEqual(manifest.blockStates.map(({ state }) => state), [
            "minecraft:white_banner[rotation=0]",
            "minecraft:red_banner[rotation=0]",
            "minecraft:blue_wall_banner[facing=north]",
        ]);
        assert.ok(manifest.blockStates.every(({ position }) => position[1] > 0));
        assert.deepEqual(manifest.banners.map((banner) => banner.field), ["Patterns", "patterns", "Patterns"]);
        assert.deepEqual(manifest.banners[0].layers, [["bs", 15], ["cre", 4], ["tts", 11], ["bri", 1]]);
        assert.deepEqual(manifest.banners[1].layers, [
            ["minecraft:stripe_bottom", "minecraft:black"],
            ["minecraft:creeper", "minecraft:red"],
            ["minecraft:triangles_top", "minecraft:blue"],
        ]);
        assert.deepEqual(manifest.banners[2].position.slice(0, 1).concat(manifest.banners[2].position.slice(2)), [12, 8]);
        assert.ok(manifest.banners[2].position[1] > 0);

        const region = await readFile(join(world, "region", "r.0.0.mca"));
        assert.ok(region.length > 8192, "fixture must contain a compressed chunk payload");
        assert.equal(region.readUIntBE(0, 3), 2, "chunk payload starts at sector 2");
        let populatedChunks = 0;
        for (let slot = 0; slot < 1024; slot++) {
            const offset = region.readUIntBE(slot * 4, 3);
            const sectors = region[slot * 4 + 3];
            if (offset !== 0 && sectors !== 0) populatedChunks++;
        }
        assert.equal(populatedChunks, 16, "fixture contains all 4x4 generated chunks");
        const payload = region.subarray(8192, 8192 + region.readUInt32BE(8192) + 4);
        assert.equal(payload[4], 2, "chunk uses zlib compression");
        const chunkBytes = inflateSync(payload.subarray(5));
        const sections = readBlockStateSections(chunkBytes);
        const floor = sections.find((section) => section.palette.includes("minecraft:stone"));
        const banners = sections.find((section) => section.palette.includes("minecraft:white_banner"));
        assert.ok(floor && banners, "fixture has floor and banner sections");
        assert.ok(floor.palette.includes("minecraft:stone"));
        const white = banners.palette.indexOf("minecraft:white_banner");
        const red = banners.palette.indexOf("minecraft:red_banner");
        const wall = banners.palette.indexOf("minecraft:blue_wall_banner");
        assert.ok(white > 0 && red > 0 && wall > 0);
        const localY = manifest.blockStates[0].position[1] & 0xf;
        assert.equal(packedIndex(banners.data, (localY << 8) | (8 << 4) | 8, 4), white);
        assert.equal(packedIndex(banners.data, ((manifest.blockStates[1].position[1] & 0xf) << 8) | (8 << 4) | 10, 4), red);
        assert.equal(packedIndex(banners.data, ((manifest.blockStates[2].position[1] & 0xf) << 8) | (8 << 4) | 12, 4), wall);
        const text = chunkBytes.toString("utf8");
        for (const expected of [
            "minecraft:banner",
            "minecraft:white_banner",
            "minecraft:blue_wall_banner",
            "Patterns",
            "patterns",
            "minecraft:stripe_bottom",
            "minecraft:triangles_top",
        ]) {
            assert.ok(text.includes(expected), `chunk payload contains ${expected}`);
        }
    } finally {
        await rm(out, { recursive: true, force: true });
    }
});
