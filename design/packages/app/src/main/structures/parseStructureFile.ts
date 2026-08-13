/**
 * Reading the block data out of a dropped structure or schematic file.
 *
 * A structure block's `.nbt` export and WorldEdit's Sponge `.schem` format are both,
 * underneath, a flat list of "this block-state sits at this offset". Everything else in
 * either format - block entities, entity lists, metadata compounds - is read past with
 * `NBTReader.skip()` and never materialised, because none of it is needed to mesh a
 * render: BlueMap only ever asks a world for the block-state at a coordinate.
 *
 * Only the two modern formats are read. `.schematic` (the pre-WorldEdit MCEdit format)
 * stores blocks as numeric ids 0-255 against the pre-1.13 block/data-value table, and
 * `.litematic` packs its palette indices as *unpadded* bit-packed longs (vanilla's own
 * chunk sections pad to a whole long per row; litematica does not). Both are real formats
 * with real users, but turning either into modern block-state strings needs its own
 * mapping table or its own bit-reader, and this lane's job is proving one dropped file can
 * reach the map screen, not shipping every structure tool that has ever existed. They are
 * refused here with a message that says exactly that, rather than pretending to read them
 * and rendering nothing.
 */

import { NBTReader, decompressNbt } from "@worldlens/nbt";

/** One block worth of a parsed structure: an absolute offset from the structure's own origin. */
export interface StructureBlock {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** A full block-state string, e.g. `minecraft:oak_stairs[facing=north]`. */
    readonly state: string;
}

export interface ParsedStructure {
    readonly sizeX: number;
    readonly sizeY: number;
    readonly sizeZ: number;
    /** Every non-air block. Air is left out - a chunk section defaults to it already. */
    readonly blocks: readonly StructureBlock[];
}

export type ParseStructureFailureCode =
    | "unsupported-format"
    | "empty"
    | "unreadable"
    | "too-large";

export interface ParseStructureFailure {
    readonly ok: false;
    readonly code: ParseStructureFailureCode;
    readonly message: string;
}

export type ParseStructureResult = { readonly ok: true; readonly structure: ParsedStructure } | ParseStructureFailure;

/**
 * A structure this large would need tens of thousands of chunks to hold, which is a sign
 * the file is not really a hand-built structure at all. Refused up front rather than
 * spending minutes writing a synthetic world nobody meant to generate.
 */
const MAX_AXIS_BLOCKS = 512;

export function parseStructureFile(name: string, bytes: Uint8Array): ParseStructureResult {
    const extension = extensionOf(name);
    if (bytes.length === 0) {
        return { ok: false, code: "empty", message: `"${name}" has no bytes to read.` };
    }

    try {
        const nbt = decompressNbt(bytes);
        const reader = new NBTReader(nbt);
        if (extension === "nbt") return finish(readStructureNbt(reader), name);
        if (extension === "schem") return finish(readSpongeSchem(reader), name);
        return {
            ok: false,
            code: "unsupported-format",
            message:
                `".${extension ?? "?"}" structures are not yet rendered by this build. ` +
                "Only .nbt (a structure block's export) and .schem (WorldEdit's Sponge " +
                "schematic) carry their blocks in a shape this render pipeline can read " +
                "today; .schematic and .litematic need their own converters that have not " +
                "been written yet.",
        };
    } catch (error) {
        return {
            ok: false,
            code: "unreadable",
            message: `"${name}" could not be read as NBT: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

function finish(structure: ParsedStructure, name: string): ParseStructureResult {
    if (structure.sizeX <= 0 || structure.sizeY <= 0 || structure.sizeZ <= 0) {
        return { ok: false, code: "empty", message: `"${name}" describes a structure with no volume.` };
    }
    if (
        structure.sizeX > MAX_AXIS_BLOCKS ||
        structure.sizeY > MAX_AXIS_BLOCKS ||
        structure.sizeZ > MAX_AXIS_BLOCKS
    ) {
        return {
            ok: false,
            code: "too-large",
            message:
                `"${name}" is ${structure.sizeX}x${structure.sizeY}x${structure.sizeZ} blocks, ` +
                `and this render pipeline caps a structure at ${MAX_AXIS_BLOCKS} blocks per axis.`,
        };
    }
    return { ok: true, structure };
}

function extensionOf(name: string): string | null {
    const dot = name.lastIndexOf(".");
    if (dot <= 0 || dot === name.length - 1) return null;
    return name.slice(dot + 1).toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Structure block `.nbt`                                                     */
/* -------------------------------------------------------------------------- */

function readStructureNbt(reader: NBTReader): ParsedStructure {
    reader.beginCompound();

    let sizeX = 0;
    let sizeY = 0;
    let sizeZ = 0;
    const palette: string[] = [];
    const entries: { x: number; y: number; z: number; paletteIndex: number }[] = [];

    while (reader.hasNext()) {
        const field = reader.name();
        if (field === "size") {
            const values = readIntList(reader);
            sizeX = values[0] ?? 0;
            sizeY = values[1] ?? 0;
            sizeZ = values[2] ?? 0;
        } else if (field === "palette") {
            const count = reader.beginList();
            for (let i = 0; i < count; i++) palette.push(readPaletteEntry(reader));
            reader.endList();
        } else if (field === "blocks") {
            const count = reader.beginList();
            for (let i = 0; i < count; i++) entries.push(readStructureBlockEntry(reader));
            reader.endList();
        } else {
            reader.skip();
        }
    }
    reader.endCompound();

    const blocks: StructureBlock[] = [];
    for (const entry of entries) {
        const state = palette[entry.paletteIndex];
        if (state === undefined || state === "minecraft:air") continue;
        blocks.push({ x: entry.x, y: entry.y, z: entry.z, state });
    }
    return { sizeX, sizeY, sizeZ, blocks };
}

function readPaletteEntry(reader: NBTReader): string {
    reader.beginCompound();
    let name = "minecraft:air";
    const properties: [string, string][] = [];
    while (reader.hasNext()) {
        const field = reader.name();
        if (field === "Name") {
            name = reader.nextString();
        } else if (field === "Properties") {
            reader.beginCompound();
            while (reader.hasNext()) properties.push([reader.name(), reader.nextString()]);
            reader.endCompound();
        } else {
            reader.skip();
        }
    }
    reader.endCompound();
    if (properties.length === 0) return name;
    return `${name}[${properties.map(([key, value]) => `${key}=${value}`).join(",")}]`;
}

function readStructureBlockEntry(
    reader: NBTReader,
): { x: number; y: number; z: number; paletteIndex: number } {
    reader.beginCompound();
    let x = 0;
    let y = 0;
    let z = 0;
    let paletteIndex = 0;
    while (reader.hasNext()) {
        const field = reader.name();
        if (field === "state") {
            paletteIndex = reader.nextInt();
        } else if (field === "pos") {
            const values = readIntList(reader);
            x = values[0] ?? 0;
            y = values[1] ?? 0;
            z = values[2] ?? 0;
        } else {
            reader.skip();
        }
    }
    reader.endCompound();
    return { x, y, z, paletteIndex };
}

function readIntList(reader: NBTReader): number[] {
    const values: number[] = [];
    const count = reader.beginList();
    for (let i = 0; i < count; i++) values.push(reader.nextInt());
    reader.endList();
    return values;
}

/* -------------------------------------------------------------------------- */
/* WorldEdit Sponge `.schem` (v1/v2 layout: a flat root, not the v3 "Schematic"  */
/* wrapper compound - the common case a drop is most likely to carry)          */
/* -------------------------------------------------------------------------- */

function readSpongeSchem(reader: NBTReader): ParsedStructure {
    reader.beginCompound();

    let width = 0;
    let height = 0;
    let length = 0;
    const paletteByIndex = new Map<number, string>();
    let blockData: Int8Array | null = null;

    while (reader.hasNext()) {
        const field = reader.name();
        if (field === "Width") {
            width = reader.nextShort();
        } else if (field === "Height") {
            height = reader.nextShort();
        } else if (field === "Length") {
            length = reader.nextShort();
        } else if (field === "Palette") {
            reader.beginCompound();
            while (reader.hasNext()) {
                const state = reader.name();
                paletteByIndex.set(reader.nextInt(), state);
            }
            reader.endCompound();
        } else if (field === "BlockData") {
            blockData = reader.nextByteArray();
        } else {
            reader.skip();
        }
    }
    reader.endCompound();

    const blocks: StructureBlock[] = [];
    if (blockData !== null) {
        // Sponge packs one varint per block, in y-major, then z, then x order - see the
        // format's own spec. Decoding walks the same order the encoder wrote, so the
        // running index into `blockData` and the (x, y, z) being decoded always agree.
        let offset = 0;
        for (let y = 0; y < height && offset < blockData.length; y++) {
            for (let z = 0; z < length && offset < blockData.length; z++) {
                for (let x = 0; x < width && offset < blockData.length; x++) {
                    const [value, consumed] = readVarInt(blockData, offset);
                    offset += consumed;
                    const state = paletteByIndex.get(value);
                    if (state !== undefined && state !== "minecraft:air") {
                        blocks.push({ x, y, z, state });
                    }
                }
            }
        }
    }

    return { sizeX: width, sizeY: height, sizeZ: length, blocks };
}

/** Sponge's varint: unsigned LEB128, matching WorldEdit's own `VarInt` reader. */
function readVarInt(data: Int8Array, start: number): readonly [value: number, consumed: number] {
    let value = 0;
    let shift = 0;
    let index = start;
    for (;;) {
        const byte = data[index] ?? 0;
        index++;
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
    }
    return [value >>> 0, index - start];
}
