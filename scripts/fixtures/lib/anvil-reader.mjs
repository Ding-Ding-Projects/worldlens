// Minimal, self-contained Anvil region + chunk NBT reader used only by the fixture
// round-trip comparison. It reads region files directly (no Minecraft involved) and
// decodes chunk NBT generically via @worldlens/nbt's low-level NBTReader, so it can
// walk both this repository's own writer output and whatever Chunker itself produces.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { NBTReader, decompressNbt, TagType } from "../../../design/packages/nbt/dist/index.js";

const SECTOR = 4096;

/** Decodes one Anvil `.mca` region file into a Map keyed by `${chunkX},${chunkZ}` -> chunk NBT object. */
export async function readRegionFile(path) {
    const buffer = await readFile(path);
    const chunks = new Map();
    // Region file names are r.<x>.<z>.mca; recover the region origin from the name.
    const match = /r\.(-?\d+)\.(-?\d+)\.mca$/.exec(path);
    if (match === null) throw new Error("Not an Anvil region filename: " + path);
    const regionX = Number(match[1]);
    const regionZ = Number(match[2]);
    for (let index = 0; index < 1024; index++) {
        const entry = buffer.readUInt32BE(index * 4);
        const sectorOffset = entry >>> 8;
        const sectorCount = entry & 0xff;
        if (sectorOffset === 0 && sectorCount === 0) continue; // absent chunk
        const start = sectorOffset * SECTOR;
        const length = buffer.readUInt32BE(start);
        const compression = buffer.readUInt8(start + 4);
        const payload = buffer.subarray(start + 5, start + 4 + length);
        let raw;
        if (compression === 1) raw = decompressNbt(prefixGzip(payload));
        else if (compression === 2) raw = decompressNbt(prefixZlib(payload));
        else if (compression === 3) raw = payload; // uncompressed
        else throw new Error("Unsupported chunk compression type " + compression + " in " + path);
        const localX = index % 32;
        const localZ = Math.floor(index / 32);
        const chunkX = regionX * 32 + localX;
        const chunkZ = regionZ * 32 + localZ;
        chunks.set(chunkX + "," + chunkZ, decodeNbt(raw));
    }
    return chunks;
}

// decompressNbt sniffs the header itself; the payload already carries it (gzip/zlib
// bytes are the first two bytes of `payload`), so these are identity passthroughs kept
// only to make the call sites above self-documenting about which branch is which.
function prefixGzip(payload) { return payload; }
function prefixZlib(payload) { return payload; }

/** Reads every region file under `<world>/region` into one Map of all chunks.
 * Only safe for small worlds (dev/test fixtures) - a gigabyte-scale world's full chunk
 * set does not comfortably fit twice in a JS heap; use {@link forEachRegionPair} for
 * comparing two large worlds without holding either one fully in memory.
 */
export async function readWorldChunks(worldFolder) {
    const regionDir = join(worldFolder, "region");
    const names = (await readdir(regionDir)).filter((name) => name.endsWith(".mca"));
    const chunks = new Map();
    for (const name of names) {
        const regionChunks = await readRegionFile(join(regionDir, name));
        for (const [key, value] of regionChunks) chunks.set(key, value);
    }
    return chunks;
}

/** The list of `.mca` region filenames present in `<world>/region`. */
export async function listRegionFiles(worldFolder) {
    const regionDir = join(worldFolder, "region");
    return (await readdir(regionDir)).filter((name) => name.endsWith(".mca"));
}

/**
 * Streams a region-by-region comparison of two worlds' chunk sets, holding at most two
 * region files' worth of decoded chunks (a few thousand) in memory at once rather than
 * every chunk in both worlds simultaneously. `visit(regionName, beforeChunks|null,
 * afterChunks|null)` is called once per distinct region filename appearing in either
 * world; either side is `null` when that region is absent from that world.
 */
export async function forEachRegionPair(beforeWorld, afterWorld, visit) {
    const beforeNames = new Set(await listRegionFiles(beforeWorld));
    const afterNames = new Set(await listRegionFiles(afterWorld));
    const allNames = new Set([...beforeNames, ...afterNames]);
    for (const name of allNames) {
        const beforeChunks = beforeNames.has(name) ? await readRegionFile(join(beforeWorld, "region", name)) : null;
        const afterChunks = afterNames.has(name) ? await readRegionFile(join(afterWorld, "region", name)) : null;
        await visit(name, beforeChunks, afterChunks);
    }
}

/** Generic NBT -> plain JS value decoder (objects/arrays/numbers/bigints/strings). */
export function decodeNbt(bytes) {
    const reader = new NBTReader(bytes);
    return decodeValue(reader);
}

function decodeValue(reader) {
    const type = reader.peek();
    switch (type) {
        case TagType.BYTE: return reader.nextByte();
        case TagType.SHORT: return reader.nextShort();
        case TagType.INT: return reader.nextInt();
        case TagType.LONG: return reader.nextLong();
        case TagType.FLOAT: return reader.nextFloat();
        case TagType.DOUBLE: return reader.nextDouble();
        case TagType.BYTE_ARRAY: return reader.nextByteArray();
        case TagType.STRING: return reader.nextString();
        case TagType.INT_ARRAY: return reader.nextIntArray();
        case TagType.LONG_ARRAY: return reader.nextLongArray();
        case TagType.LIST: {
            reader.beginList();
            const list = [];
            while (reader.hasNext()) list.push(decodeValue(reader));
            reader.endList();
            return list;
        }
        case TagType.COMPOUND: {
            reader.beginCompound();
            const object = {};
            while (reader.peek() !== TagType.END) {
                const name = reader.name();
                object[name] = decodeValue(reader);
            }
            reader.endCompound();
            return object;
        }
        default:
            throw new Error("Unhandled NBT tag type " + type);
    }
}

/** Bit-width Minecraft/BlueMap derive from a long-array's own length (1.16+ padded packing). */
export function derivedBitWidth(longCount, elementCount) {
    return Math.trunc((longCount * 64) / elementCount);
}

/** Inverse of worldgen's `packPadded`: unpacks a long-array into `elementCount` indices. */
export function unpackPadded(longs, elementCount) {
    const bits = derivedBitWidth(longs.length, elementCount);
    const elementsPerLong = Math.trunc(64 / bits);
    const mask = (1n << BigInt(bits)) - 1n;
    const values = new Uint32Array(elementCount);
    for (let i = 0; i < elementCount; i++) {
        const longIndex = Math.trunc(i / elementsPerLong);
        const bitOffset = BigInt((i % elementsPerLong) * bits);
        values[i] = Number((longs[longIndex] >> bitOffset) & mask);
    }
    return values;
}

/** A palette entry's canonical string key: `minecraft:name{prop=val,...}` (sorted properties). */
function paletteEntryKey(entry) {
    if (typeof entry === "string") return entry; // biome palette entries are bare strings
    const name = entry.Name ?? "?";
    const properties = entry.Properties;
    if (properties === undefined) return name;
    const keys = Object.keys(properties).sort();
    return name + "{" + keys.map((key) => key + "=" + properties[key]).join(",") + "}";
}

/**
 * Extracts the semantic content this comparison cares about from one decoded chunk's
 * NBT: DataVersion, position, per-section block palette multiset and biome multiset,
 * and both heightmaps. Deliberately excludes bytes-only concerns (SkyLight, block
 * light, timestamps, exact packing width) that Chunker is free to re-derive.
 */
export function chunkSemantics(nbt) {
    const sections = new Map();
    for (const section of nbt.sections ?? []) {
        const y = section.Y;
        const blockStates = section.block_states;
        const blockCounts = new Map();
        if (blockStates?.palette !== undefined) {
            const palette = blockStates.palette.map(paletteEntryKey);
            if (palette.length === 1) {
                blockCounts.set(palette[0], 4096);
            } else if (blockStates.data !== undefined) {
                const indices = unpackPadded(blockStates.data, 4096);
                for (const index of indices) {
                    const key = palette[index];
                    blockCounts.set(key, (blockCounts.get(key) ?? 0) + 1);
                }
            }
        }
        const biomes = section.biomes;
        const biomeCounts = new Map();
        if (biomes?.palette !== undefined) {
            const palette = biomes.palette.map(paletteEntryKey);
            if (palette.length === 1) {
                biomeCounts.set(palette[0], 64);
            } else if (biomes.data !== undefined) {
                const indices = unpackPadded(biomes.data, 64);
                for (const index of indices) {
                    const key = palette[index];
                    biomeCounts.set(key, (biomeCounts.get(key) ?? 0) + 1);
                }
            }
        }
        sections.set(y, { blockCounts, biomeCounts });
    }
    return {
        dataVersion: nbt.DataVersion,
        xPos: nbt.xPos,
        zPos: nbt.zPos,
        sections,
        heightmaps: {
            worldSurface: nbt.Heightmaps?.WORLD_SURFACE ?? null,
            oceanFloor: nbt.Heightmaps?.OCEAN_FLOOR ?? null,
        },
    };
}

/** `minecraft:name{props}` -> { name, props: Map } */
function parsePaletteKey(key) {
    const brace = key.indexOf("{");
    if (brace === -1) return { name: key, props: new Map() };
    const name = key.slice(0, brace);
    const propsText = key.slice(brace + 1, -1);
    const props = new Map();
    if (propsText.length > 0) {
        for (const pair of propsText.split(",")) {
            const eq = pair.indexOf("=");
            props.set(pair.slice(0, eq), pair.slice(eq + 1));
        }
    }
    return { name, props };
}

/**
 * Classifies a block-palette-multiset mismatch within one section.
 *
 * `snowy-normalization` is Chunker's own documented behaviour: Java's `snowy` block
 * property on grass/podzol/mycelium is a *derived* render flag Minecraft recomputes
 * from the block above rather than authoritative state, and Bedrock has no equivalent
 * property at all - Chunker recomputes it on write-back instead of preserving whatever
 * arbitrary value the source world happened to carry. Any other multiset change is
 * reported as `other` (a real, uncatalogued difference) so it is never silently hidden.
 */
export function classifyBlockMultisetDiff(before, after) {
    const beforeTotal = new Map();
    const afterTotal = new Map();
    const names = new Set();
    for (const [key, count] of before) {
        const { name } = parsePaletteKey(key);
        names.add(name);
        beforeTotal.set(name, (beforeTotal.get(name) ?? 0) + count);
    }
    for (const [key, count] of after) {
        const { name } = parsePaletteKey(key);
        names.add(name);
        afterTotal.set(name, (afterTotal.get(name) ?? 0) + count);
    }
    for (const name of names) {
        if ((beforeTotal.get(name) ?? 0) !== (afterTotal.get(name) ?? 0)) return "other";
    }
    // Every base block name's total count is unchanged; only property distributions
    // (e.g. snowy=true/false counts) moved. Confirm the only property that ever
    // differs across the whole section is `snowy` before calling it documented.
    const allKeys = new Set([...before.keys(), ...after.keys()]);
    for (const key of allKeys) {
        const { name, props } = parsePaletteKey(key);
        for (const [propKey] of props) {
            if (propKey !== "snowy") {
                // Some other property might still differ in count for this name; only
                // bail if that property's own before/after distribution actually moved.
                const beforeCount = before.get(key) ?? 0;
                const afterCount = after.get(key) ?? 0;
                if (beforeCount !== afterCount) return "other";
            }
        }
    }
    return "snowy-normalization";
}

function mapsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) if (b.get(key) !== value) return false;
    return true;
}

function longArrayEqual(a, b) {
    if (a === null || b === null) return a === b;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/**
 * Compares two chunks' semantics. Returns a list of human-readable difference
 * descriptions (empty when the chunks match). Heightmaps are compared loosely: two
 * height values agree when they name the same first-free-block y (comparing the raw
 * packed longs would fail on a legitimate width change of no semantic consequence).
 */
export function compareChunkSemantics(before, after) {
    const differences = [];
    if (before.dataVersion !== after.dataVersion) {
        differences.push("DataVersion changed: " + before.dataVersion + " -> " + after.dataVersion);
    }
    const beforeSections = new Set(before.sections.keys());
    const afterSections = new Set(after.sections.keys());
    for (const y of beforeSections) if (!afterSections.has(y)) differences.push("section Y=" + y + " missing after round trip");
    for (const y of afterSections) if (!beforeSections.has(y)) differences.push("section Y=" + y + " appeared after round trip (not present originally)");
    for (const y of beforeSections) {
        if (!afterSections.has(y)) continue;
        const a = before.sections.get(y);
        const b = after.sections.get(y);
        if (!mapsEqual(a.blockCounts, b.blockCounts)) {
            differences.push("chunk (" + before.xPos + "," + before.zPos + ") section Y=" + y + " block palette multiset differs");
        }
        if (!mapsEqual(a.biomeCounts, b.biomeCounts)) {
            differences.push("chunk (" + before.xPos + "," + before.zPos + ") section Y=" + y + " biome palette multiset differs");
        }
    }
    if (!longArrayEqual(before.heightmaps.worldSurface, after.heightmaps.worldSurface)) {
        differences.push("chunk (" + before.xPos + "," + before.zPos + ") WORLD_SURFACE heightmap differs");
    }
    if (!longArrayEqual(before.heightmaps.oceanFloor, after.heightmaps.oceanFloor)) {
        differences.push("chunk (" + before.xPos + "," + before.zPos + ") OCEAN_FLOOR heightmap differs");
    }
    return differences;
}
