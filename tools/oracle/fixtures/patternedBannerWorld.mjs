import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync, gzipSync } from "node:zlib";
import { join } from "node:path";
import { NBTWriter } from "../../../design/packages/nbt/dist/index.js";

const CHUNK_SIZE = 4096;
const SECTION_SIZE = 16;
const BANNER_X = 8;
const BANNER_Y = 64;
const BANNER_Z = 8;

function blockIndex(x, y, z) {
    return ((y & 0xf) << 8) | ((z & 0xf) << 4) | (x & 0xf);
}

function packPadded(values, bits) {
    const perLong = Math.floor(64 / bits);
    const result = new BigInt64Array(Math.ceil(values.length / perLong));
    const mask = (1n << BigInt(bits)) - 1n;
    for (let i = 0; i < values.length; i++) {
        const long = Math.floor(i / perLong);
        const shift = BigInt((i % perLong) * bits);
        result[long] = BigInt.asIntN(64, result[long] | ((BigInt(values[i]) & mask) << shift));
    }
    return result;
}

function writeSection(writer, sectionY, palette, blocks) {
    writer.beginCompound();
    writer.name("Y").valueByte(sectionY);
    writer.name("block_states");
    writer.beginCompound();
    writer.name("palette").beginList(palette.length);
    for (const name of palette) {
        writer.beginCompound();
        writer.name("Name").valueString(name);
        writer.endCompound();
    }
    writer.endList();
    if (palette.length > 1) {
        const indices = new Array(CHUNK_SIZE).fill(0);
        for (const [index, value] of blocks) indices[index] = value;
        writer.name("data").valueLongArray(packPadded(indices, 2));
    }
    writer.endCompound();
    writer.name("biomes");
    writer.beginCompound();
    writer.name("palette");
    writer.beginList(1);
    writer.valueString("minecraft:plains");
    writer.endList();
    writer.endCompound();
    writer.name("SkyLight").valueByteArray(new Int8Array(2048).fill(-1));
    writer.endCompound();
}

function chunkNbt() {
    const writer = new NBTWriter();
    writer.beginCompound();
    writer.name("DataVersion").valueInt(3839);
    writer.name("xPos").valueInt(0);
    writer.name("zPos").valueInt(0);
    writer.name("yPos").valueInt(-4);
    writer.name("Status").valueString("minecraft:full");
    writer.name("InhabitedTime").valueLong(0n);
    writer.name("isLightOn").valueByte(1);
    writer.name("sections");
    writer.beginList(2);
    writeSection(writer, 3, ["minecraft:air", "minecraft:stone"], [
        [blockIndex(BANNER_X, 63, BANNER_Z), 1],
    ]);
    writeSection(writer, 4, ["minecraft:air", "minecraft:white_banner", "minecraft:red_banner"], [
        [blockIndex(BANNER_X, 64, BANNER_Z), 1],
        [blockIndex(BANNER_X + 2, 64, BANNER_Z), 2],
    ]);
    writer.endList();
    writer.name("block_entities");
    writer.beginList(2);
    for (const banner of [
        {
            x: BANNER_X,
            blockKey: "Patterns",
            layers: [["bs", 15], ["cre", 4], ["tts", 11], ["bri", 1]],
        },
        {
            x: BANNER_X + 2,
            blockKey: "patterns",
            layers: [
                ["minecraft:stripe_bottom", "minecraft:black"],
                ["minecraft:creeper", "minecraft:red"],
                ["minecraft:triangles_top", "minecraft:blue"],
            ],
        },
    ]) {
        writer.beginCompound();
        writer.name("id").valueString("minecraft:banner");
        writer.name("x").valueInt(banner.x);
        writer.name("y").valueInt(BANNER_Y);
        writer.name("z").valueInt(BANNER_Z);
        writer.name(banner.blockKey);
        writer.beginList(banner.layers.length);
        for (const [pattern, color] of banner.layers) {
        writer.beginCompound();
            writer.name(banner.blockKey === "Patterns" ? "Pattern" : "pattern").valueString(pattern);
            writer.name(banner.blockKey === "Patterns" ? "Color" : "color");
            typeof color === "number" ? writer.valueInt(color) : writer.valueString(color);
        writer.endCompound();
        }
        writer.endList();
        writer.endCompound();
    }
    writer.endList();
    writer.endCompound();
    writer.close();
    return writer.toUint8Array();
}

function regionFile(nbt) {
    const compressed = deflateSync(nbt);
    const payload = Buffer.alloc(5 + compressed.length);
    payload.writeInt32BE(compressed.length + 1, 0);
    payload.writeUInt8(2, 4);
    compressed.copy(payload, 5);
    const sectors = Math.ceil(payload.length / 4096);
    const body = Buffer.alloc(sectors * 4096);
    payload.copy(body);
    const header = Buffer.alloc(8192);
    header.writeUIntBE(2, 0, 3);
    header.writeUInt8(sectors, 3);
    header.writeUInt32BE(1, 4096);
    return Buffer.concat([header, body]);
}

async function levelDat() {
    const writer = new NBTWriter();
    writer.beginCompound();
    writer.name("Data");
    writer.beginCompound();
    writer.name("LevelName").valueString("patterned-banner-world");
    writer.name("DataVersion").valueInt(3839);
    writer.name("SpawnX").valueInt(BANNER_X);
    writer.name("SpawnY").valueInt(BANNER_Y + 1);
    writer.name("SpawnZ").valueInt(BANNER_Z);
    writer.name("WorldGenSettings");
    writer.beginCompound();
    writer.name("seed").valueLong(89n);
    writer.name("dimensions");
    writer.beginCompound();
    writer.name("minecraft:overworld");
    writer.beginCompound();
    writer.name("type").valueString("minecraft:overworld");
    writer.name("generator");
    writer.beginCompound();
    writer.name("type").valueString("minecraft:flat");
    writer.name("settings");
    writer.beginCompound();
    writer.name("layers");
    writer.beginList(1);
    writer.beginCompound();
    writer.name("height").valueInt(1);
    writer.name("block").valueString("minecraft:stone");
    writer.endCompound();
    writer.endList();
    writer.name("biome").valueString("minecraft:plains");
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.close();
    return gzipSync(writer.toUint8Array());
}

/** Create a tiny, valid Anvil world whose only banner has four ordered layers. */
export async function createPatternedBannerWorld(outDir) {
    const worldFolder = join(outDir, "patterned-banner-world");
    await mkdir(join(worldFolder, "region"), { recursive: true });
    await writeFile(join(worldFolder, "level.dat"), await levelDat());
    await writeFile(join(worldFolder, "region", "r.0.0.mca"), regionFile(chunkNbt()));
    await writeFile(
        join(worldFolder, "patterned-banner-manifest.json"),
        JSON.stringify(
            {
                fixture: "patterned-banner",
                banners: [
                    {
                        era: "legacy-1.12-to-1.20",
                        position: [BANNER_X, BANNER_Y, BANNER_Z],
                        field: "Patterns",
                        layers: [["bs", 15], ["cre", 4], ["tts", 11], ["bri", 1]],
                    },
                    {
                        era: "current-components",
                        position: [BANNER_X + 2, BANNER_Y, BANNER_Z],
                        field: "patterns",
                        layers: [
                            ["minecraft:stripe_bottom", "minecraft:black"],
                            ["minecraft:creeper", "minecraft:red"],
                            ["minecraft:triangles_top", "minecraft:blue"],
                        ],
                    },
                ],
                resourcePaths: [
                    "minecraft:entity/banner_base",
                    "minecraft:entity/banner/stripe_bottom",
                    "minecraft:entity/banner/creeper",
                    "minecraft:entity/banner/triangles_top",
                ],
            },
            null,
            2,
        ) + "\n",
    );
    return worldFolder;
}
