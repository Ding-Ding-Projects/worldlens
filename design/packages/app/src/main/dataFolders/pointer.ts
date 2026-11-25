/**
 * The pointer that says where the application's profile folder lives.
 *
 * The profile folder is Electron's `userData`, and it has to be chosen before anything reads
 * it, so the choice cannot live inside it. It is kept in one small JSON file that sits
 * beside the default profile location (in the per-user application-data root), where it is
 * found at the same place no matter where the profile has been moved to.
 *
 * Reading never throws and never guesses: a missing file means "use the default", and a file
 * that is damaged, names a relative path or names something that is not a path is reported as
 * invalid and also means "use the default". Nothing is deleted when a pointer is bad.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const POINTER_VERSION = 1;

export interface DataFolderPointer {
    readonly version: typeof POINTER_VERSION;
    /** The chosen profile folder, or null for the default location. */
    readonly profileFolder: string | null;
    /** The folder the profile was moved away from, kept until its removal is offered and done. */
    readonly previousProfileFolder: string | null;
}

export const EMPTY_POINTER: DataFolderPointer = Object.freeze({
    version: POINTER_VERSION,
    profileFolder: null,
    previousProfileFolder: null,
});

export interface PointerReadout {
    readonly pointer: DataFolderPointer;
    /** True when a file exists but could not be trusted, so the default is in use. */
    readonly invalid: boolean;
    /** Why the file was not trusted. Null when it was fine or absent. */
    readonly problem: string | null;
}

/** The pointer file for a given application-data root and default profile folder name. */
export function pointerFilePath(appDataRoot: string, dataDirectoryName: string): string {
    return join(appDataRoot, `${dataDirectoryName}.data-folders.json`);
}

function folderOrNull(value: unknown): string | null | undefined {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) return undefined;
    return isAbsolute(value) ? resolve(value) : undefined;
}

function invalid(problem: string): PointerReadout {
    return { pointer: EMPTY_POINTER, invalid: true, problem };
}

/** Turns file text into a pointer, or says exactly why it cannot be one. */
export function parsePointer(text: string): PointerReadout {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return invalid("The data folder pointer is not valid JSON.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return invalid("The data folder pointer is not an object.");
    }
    const record = parsed as Record<string, unknown>;
    if (record["version"] !== POINTER_VERSION) {
        return invalid("The data folder pointer is from an unknown version.");
    }
    const profileFolder = folderOrNull(record["profileFolder"]);
    const previous = folderOrNull(record["previousProfileFolder"]);
    if (profileFolder === undefined || previous === undefined) {
        return invalid("The data folder pointer names a folder that is not a full path.");
    }
    return {
        pointer: { version: POINTER_VERSION, profileFolder, previousProfileFolder: previous },
        invalid: false,
        problem: null,
    };
}

/** Synchronous, because it runs before the application is ready and decides `userData`. */
export function readPointerSync(file: string): PointerReadout {
    let text: string;
    try {
        text = readFileSync(file, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return { pointer: EMPTY_POINTER, invalid: false, problem: null };
        }
        return invalid("The data folder pointer could not be read.");
    }
    return parsePointer(text);
}

export async function readPointer(file: string): Promise<PointerReadout> {
    let text: string;
    try {
        text = await readFile(file, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return { pointer: EMPTY_POINTER, invalid: false, problem: null };
        }
        return invalid("The data folder pointer could not be read.");
    }
    return parsePointer(text);
}

function serialise(pointer: DataFolderPointer): string {
    return `${JSON.stringify(pointer, null, 2)}\n`;
}

/** Writes through a temporary file so a crash never leaves half a pointer. */
export async function writePointer(file: string, pointer: DataFolderPointer): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, serialise(pointer), "utf8");
    await rename(temporary, file);
}

export function writePointerSync(file: string, pointer: DataFolderPointer): void {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, serialise(pointer), "utf8");
    renameSync(temporary, file);
}

export interface ResolvedProfileFolder {
    /** The folder `userData` should be set to for this launch. */
    readonly folder: string;
    readonly defaultFolder: string;
    readonly usingDefault: boolean;
    /** A chosen folder that could not be reached, so the default is in use this launch. */
    readonly unreachable: string | null;
    readonly pointerProblem: string | null;
}

/**
 * Picks the profile folder for this launch.
 *
 * A chosen folder that is gone is never silently replaced: it is reported in `unreachable`
 * so Settings can offer to point at it again or return to the default, and the default is
 * only used for this launch.
 */
export function resolveProfileFolder(options: {
    readonly defaultFolder: string;
    readonly readout: PointerReadout;
    readonly isDirectory: (path: string) => boolean;
}): ResolvedProfileFolder {
    const chosen = options.readout.pointer.profileFolder;
    const base = {
        defaultFolder: options.defaultFolder,
        pointerProblem: options.readout.problem,
    };
    if (chosen === null || resolve(chosen) === resolve(options.defaultFolder)) {
        return { ...base, folder: options.defaultFolder, usingDefault: true, unreachable: null };
    }
    if (options.isDirectory(chosen)) {
        return { ...base, folder: chosen, usingDefault: false, unreachable: null };
    }
    return { ...base, folder: options.defaultFolder, usingDefault: true, unreachable: chosen };
}
