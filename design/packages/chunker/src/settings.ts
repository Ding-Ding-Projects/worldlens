import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { NBTReader, NBTWriter, TagType } from "@worldlens/nbt";

import { LEVEL_DAT_FILE } from "./formats.js";

/**
 * A typed NBT value tree.
 *
 * The reflective object mapper in `@worldlens/nbt` reads NBT into plain JavaScript values,
 * which is exactly right for a consumer that knows the schema it wants. Editing world
 * settings is the other case: the file holds hundreds of entries this package has no
 * opinion about, and every one of them has to be written back with the tag type it arrived
 * with. A JavaScript number cannot say whether it was a byte, an int or a float, so the
 * type travels with the value here rather than being inferred on the way out. Inferring it
 * is how a `Difficulty` byte becomes an int and the world stops loading.
 *
 * The codec underneath is the shared `NBTReader` and `NBTWriter`. Nothing in this file
 * touches bytes directly.
 */
export type NbtValue =
    | { readonly type: "byte"; readonly value: number }
    | { readonly type: "short"; readonly value: number }
    | { readonly type: "int"; readonly value: number }
    | { readonly type: "long"; readonly value: bigint }
    | { readonly type: "float"; readonly value: number }
    | { readonly type: "double"; readonly value: number }
    | { readonly type: "string"; readonly value: string }
    | { readonly type: "byteArray"; readonly value: Int8Array }
    | { readonly type: "intArray"; readonly value: Int32Array }
    | { readonly type: "longArray"; readonly value: BigInt64Array }
    | { readonly type: "list"; readonly itemType: TagType; readonly items: readonly NbtValue[] }
    | { readonly type: "compound"; readonly entries: ReadonlyMap<string, NbtValue> };

/** a compound, narrowed, so callers can hold the root without re-checking its type */
export type NbtCompound = Extract<NbtValue, { type: "compound" }>;

function readValue(reader: NBTReader, type: TagType): NbtValue {
    switch (type) {
        case TagType.BYTE:
            return { type: "byte", value: reader.nextByte() };
        case TagType.SHORT:
            return { type: "short", value: reader.nextShort() };
        case TagType.INT:
            return { type: "int", value: reader.nextInt() };
        case TagType.LONG:
            return { type: "long", value: reader.nextLong() };
        case TagType.FLOAT:
            return { type: "float", value: reader.nextFloat() };
        case TagType.DOUBLE:
            return { type: "double", value: reader.nextDouble() };
        case TagType.STRING:
            return { type: "string", value: reader.nextString() };
        case TagType.BYTE_ARRAY:
            return { type: "byteArray", value: reader.nextByteArray() };
        case TagType.INT_ARRAY:
            return { type: "intArray", value: reader.nextIntArray() };
        case TagType.LONG_ARRAY:
            return { type: "longArray", value: reader.nextLongArray() };
        case TagType.LIST: {
            const length = reader.beginList();
            const items: NbtValue[] = [];
            // An empty list carries no element type on the wire, and the reader reports END
            // for it. END is not a value, so the list is rebuilt as an empty byte list, which
            // is what every writer emits for an empty list anyway.
            let itemType: TagType = TagType.BYTE;
            for (let index = 0; index < length; index++) {
                itemType = reader.peek();
                items.push(readValue(reader, itemType));
            }
            reader.endList();
            return { type: "list", itemType, items };
        }
        case TagType.COMPOUND: {
            reader.beginCompound();
            const entries = new Map<string, NbtValue>();
            while (reader.hasNext()) {
                const name = reader.name();
                entries.set(name, readValue(reader, reader.peek()));
            }
            reader.endCompound();
            return { type: "compound", entries };
        }
        default:
            throw new Error("Tag type " + type + " cannot appear as a value.");
    }
}

function writeValue(writer: NBTWriter, value: NbtValue): void {
    switch (value.type) {
        case "byte":
            writer.valueByte(value.value);
            return;
        case "short":
            writer.valueShort(value.value);
            return;
        case "int":
            writer.valueInt(value.value);
            return;
        case "long":
            writer.valueLong(value.value);
            return;
        case "float":
            writer.valueFloat(value.value);
            return;
        case "double":
            writer.valueDouble(value.value);
            return;
        case "string":
            writer.valueString(value.value);
            return;
        case "byteArray":
            writer.valueByteArray(value.value);
            return;
        case "intArray":
            writer.valueIntArray(value.value);
            return;
        case "longArray":
            writer.valueLongArray(value.value);
            return;
        case "list":
            writer.beginList(value.items.length, value.itemType);
            for (const item of value.items) writeValue(writer, item);
            writer.endList();
            return;
        case "compound":
            writer.beginCompound();
            for (const [name, entry] of value.entries) {
                writer.name(name);
                writeValue(writer, entry);
            }
            writer.endCompound();
            return;
    }
}

/** reads a whole uncompressed NBT document into the typed tree */
export function readNbtDocument(bytes: Uint8Array): NbtValue {
    const reader = new NBTReader(bytes);
    return readValue(reader, reader.peek());
}

/** writes a typed tree back to uncompressed NBT */
export function writeNbtDocument(value: NbtValue): Uint8Array {
    const writer = new NBTWriter();
    writeValue(writer, value);
    writer.close();
    return writer.toUint8Array();
}

/** the world settings this package can read and change */
export interface WorldSettings {
    readonly name: string;
    readonly seed: bigint;
    readonly spawnX: number;
    readonly spawnY: number;
    readonly spawnZ: number;
    /** game rules, as the strings the file stores them as */
    readonly gameRules: Readonly<Record<string, string>>;
}

/** the subset of settings a caller wants changed; anything omitted is left as it was */
export interface WorldSettingsOverrides {
    readonly name?: string;
    readonly seed?: bigint;
    readonly spawnX?: number;
    readonly spawnY?: number;
    readonly spawnZ?: number;
    readonly gameRules?: Readonly<Record<string, string>>;
}

/** a settings read or write that could not be done, reported rather than thrown */
export interface SettingsFailure {
    readonly ok: false;
    readonly reason: string;
}

/** a settings read that succeeded */
export interface SettingsRead {
    readonly ok: true;
    readonly settings: WorldSettings;
}

export type SettingsReadResult = SettingsRead | SettingsFailure;

/** a settings write that succeeded, carrying what the file now says */
export interface SettingsWritten {
    readonly ok: true;
    readonly settings: WorldSettings;
}

export type SettingsWriteResult = SettingsWritten | SettingsFailure;

function compoundOf(value: NbtValue | undefined): NbtCompound | null {
    return value !== undefined && value.type === "compound" ? value : null;
}

function numberOf(value: NbtValue | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (value.type === "int" || value.type === "byte" || value.type === "short") return value.value;
    if (value.type === "double" || value.type === "float") return Math.trunc(value.value);
    if (value.type === "long") return Number(value.value);
    return fallback;
}

/**
 * Pulls the settings out of a parsed `level.dat` tree.
 *
 * The `Data` compound is where Java keeps all of this. A file without one is not a Java
 * `level.dat`, and saying so is more useful than returning a record of defaults that would
 * later be written back over whatever the file really held.
 */
export function readSettingsFrom(root: NbtValue): SettingsReadResult {
    const rootCompound = compoundOf(root);
    if (rootCompound === null)
        return { ok: false, reason: "The level data root is not a compound." };

    const data = compoundOf(rootCompound.entries.get("Data"));
    if (data === null)
        return {
            ok: false,
            reason: "The level data has no 'Data' compound, so it is not a Java level.dat.",
        };

    const nameEntry = data.entries.get("LevelName");
    const seedEntry = data.entries.get("RandomSeed");
    const worldGen = compoundOf(data.entries.get("WorldGenSettings"));
    const worldGenSeed = worldGen?.entries.get("seed");

    // Java moved the seed into WorldGenSettings in 1.16 and left the old key behind in some
    // worlds. Preferring the newer location matters: on a converted or upgraded world the
    // stale RandomSeed can disagree with the one generation actually uses.
    const seed =
        worldGenSeed !== undefined && worldGenSeed.type === "long"
            ? worldGenSeed.value
            : seedEntry !== undefined && seedEntry.type === "long"
              ? seedEntry.value
              : 0n;

    const gameRules: Record<string, string> = {};
    const rules = compoundOf(data.entries.get("GameRules"));
    if (rules !== null)
        for (const [rule, value] of rules.entries)
            if (value.type === "string") gameRules[rule] = value.value;

    return {
        ok: true,
        settings: {
            name: nameEntry !== undefined && nameEntry.type === "string" ? nameEntry.value : "",
            seed,
            spawnX: numberOf(data.entries.get("SpawnX"), 0),
            spawnY: numberOf(data.entries.get("SpawnY"), 64),
            spawnZ: numberOf(data.entries.get("SpawnZ"), 0),
            gameRules,
        },
    };
}

/**
 * Applies overrides to a parsed tree, returning a new tree.
 *
 * The tree is rebuilt rather than mutated so that a caller holding the original still has
 * the original, which is what makes a dry run showing the before and the after possible.
 * Entries this package does not understand are copied across untouched, including their tag
 * types, so editing the world name cannot quietly rewrite anything else in the file.
 */
export function applySettings(root: NbtValue, overrides: WorldSettingsOverrides): NbtValue {
    const rootCompound = compoundOf(root);
    if (rootCompound === null) return root;

    const data = compoundOf(rootCompound.entries.get("Data"));
    if (data === null) return root;

    const dataEntries = new Map(data.entries);

    if (overrides.name !== undefined)
        dataEntries.set("LevelName", { type: "string", value: overrides.name });
    if (overrides.spawnX !== undefined)
        dataEntries.set("SpawnX", { type: "int", value: overrides.spawnX });
    if (overrides.spawnY !== undefined)
        dataEntries.set("SpawnY", { type: "int", value: overrides.spawnY });
    if (overrides.spawnZ !== undefined)
        dataEntries.set("SpawnZ", { type: "int", value: overrides.spawnZ });

    if (overrides.seed !== undefined) {
        dataEntries.set("RandomSeed", { type: "long", value: overrides.seed });
        const worldGen = compoundOf(dataEntries.get("WorldGenSettings"));
        if (worldGen !== null) {
            const worldGenEntries = new Map(worldGen.entries);
            worldGenEntries.set("seed", { type: "long", value: overrides.seed });
            dataEntries.set("WorldGenSettings", { type: "compound", entries: worldGenEntries });
        }
    }

    if (overrides.gameRules !== undefined) {
        const existing = compoundOf(dataEntries.get("GameRules"));
        const ruleEntries = new Map<string, NbtValue>(existing?.entries ?? []);
        for (const [rule, value] of Object.entries(overrides.gameRules))
            ruleEntries.set(rule, { type: "string", value });
        dataEntries.set("GameRules", { type: "compound", entries: ruleEntries });
    }

    const rootEntries = new Map(rootCompound.entries);
    rootEntries.set("Data", { type: "compound", entries: dataEntries });
    return { type: "compound", entries: rootEntries };
}

/** reads the settings of the Java world in `worldFolder` */
export async function readWorldSettings(worldFolder: string): Promise<SettingsReadResult> {
    const path = join(worldFolder, LEVEL_DAT_FILE);
    let bytes: Uint8Array;
    try {
        bytes = await readFile(path);
    } catch (error) {
        return { ok: false, reason: "Could not read " + path + ": " + String(error) };
    }

    try {
        const raw =
            bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
        return readSettingsFrom(readNbtDocument(raw));
    } catch (error) {
        return { ok: false, reason: "Could not parse " + path + ": " + String(error) };
    }
}

/**
 * Writes changed settings back to the world in `worldFolder`.
 *
 * The file is written gzip-compressed, which is what Minecraft writes and what every tool
 * reading it expects. The read happens first and the whole document is rewritten from the
 * tree, so a failure to parse leaves the original file exactly as it was rather than
 * truncating it.
 */
export async function writeWorldSettings(
    worldFolder: string,
    overrides: WorldSettingsOverrides,
): Promise<SettingsWriteResult> {
    const path = join(worldFolder, LEVEL_DAT_FILE);
    let bytes: Uint8Array;
    try {
        bytes = await readFile(path);
    } catch (error) {
        return { ok: false, reason: "Could not read " + path + ": " + String(error) };
    }

    let updated: NbtValue;
    let settings: WorldSettings;
    try {
        const raw =
            bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
        updated = applySettings(readNbtDocument(raw), overrides);
        const read = readSettingsFrom(updated);
        if (!read.ok) return read;
        settings = read.settings;
    } catch (error) {
        return { ok: false, reason: "Could not parse " + path + ": " + String(error) };
    }

    try {
        await writeFile(path, gzipSync(writeNbtDocument(updated)));
    } catch (error) {
        return { ok: false, reason: "Could not write " + path + ": " + String(error) };
    }

    return { ok: true, settings };
}
