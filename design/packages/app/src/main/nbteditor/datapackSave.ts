/**
 * Writes a data pack the data pack studio built into a Java world's `datapacks` folder.
 *
 * The renderer sends the finished .zip as base64 with the file name it wants. Nothing else
 * reaches the disk: the folder has to be a Java world (it holds `level.dat`), the name is one
 * plain file name ending in .zip, the size is capped, and the file is written next to its
 * final name and renamed over it so a half-written pack is never left for the game to load.
 * An existing pack of the same name is replaced; the result says so.
 */
import { randomBytes } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { NbtEditorRefusal } from "./service.js";

/** The largest pack accepted, which no hand-made pack comes near. */
export const MAX_DATAPACK_BYTES = 64 * 1024 * 1024;

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.()-]{0,120}\.zip$/;

export interface SavedDataPack {
    readonly path: string;
    readonly bytes: number;
    readonly replaced: boolean;
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

export async function saveDataPackToWorld(
    worldDir: string,
    fileName: string,
    base64: string,
): Promise<SavedDataPack> {
    if (!isAbsolute(worldDir)) throw new NbtEditorRefusal("The world folder has to be a full path.");
    if (!FILE_NAME.test(fileName) || fileName.includes(".."))
        throw new NbtEditorRefusal(`${fileName} is not a plain .zip file name.`);
    if (!(await exists(join(worldDir, "level.dat"))))
        throw new NbtEditorRefusal("That folder is not a Java world: it has no level.dat.");
    if (base64.length > Math.ceil((MAX_DATAPACK_BYTES * 4) / 3) + 4)
        throw new NbtEditorRefusal("The pack is larger than 64 MiB.");
    const bytes = Buffer.from(base64, "base64");
    // A ZIP starts with a local file header or, for an empty archive, the end record.
    const magic = bytes.subarray(0, 4).toString("hex");
    if (magic !== "504b0304" && magic !== "504b0506")
        throw new NbtEditorRefusal("What was sent is not a .zip file.");
    const folder = join(worldDir, "datapacks");
    await mkdir(folder, { recursive: true });
    const target = join(folder, fileName);
    const replaced = await exists(target);
    const temp = join(folder, `.${fileName}.${randomBytes(6).toString("hex")}.part`);
    try {
        await writeFile(temp, bytes);
        await rename(temp, target);
    } catch (error) {
        await unlink(temp).catch(() => undefined);
        throw error;
    }
    return { path: target, bytes: bytes.length, replaced };
}
