/**
 * Decides whether a folder may become the profile folder or the save folder.
 *
 * Every refusal names its exact reason and changes nothing: this module only inspects the
 * disk (and writes then removes one probe file to prove the folder is writable).
 */

import { randomBytes } from "node:crypto";
import { readdir, rm, stat, statfs, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, parse, relative, resolve } from "node:path";

export type FolderRefusalCode =
    | "not-absolute"
    | "same-as-current"
    | "inside-install-folder"
    | "contains-install-folder"
    | "system-folder"
    | "inside-other-folder"
    | "contains-other-folder"
    | "not-a-folder"
    | "not-creatable"
    | "not-writable"
    | "not-enough-space"
    | "not-empty";

export type FolderValidation =
    | {
          readonly ok: true;
          /** The resolved absolute folder. */
          readonly folder: string;
          /** True when the folder already exists (it would otherwise be created). */
          readonly exists: boolean;
          /** Free bytes where the folder lives, or null when the platform did not say. */
          readonly freeBytes: number | null;
      }
    | { readonly ok: false; readonly code: FolderRefusalCode; readonly message: string };

export interface FolderValidationInputs {
    readonly candidate: string;
    /** The folder this setting uses now. Choosing it again is refused as a no-op. */
    readonly currentFolder: string;
    /** The other chosen folder (profile versus save), which may not nest with this one. */
    readonly otherFolder: string | null;
    /** The folder(s) the application is installed in. */
    readonly installFolders: readonly string[];
    /** Folders that belong to the operating system. */
    readonly systemFolders: readonly string[];
    /** Bytes that will be copied in, for the free-space check. Zero when nothing moves. */
    readonly requiredBytes: number;
    /** When true the folder must not exist or must be empty, so nothing is overwritten. */
    readonly requireEmpty: boolean;
    readonly platform?: NodeJS.Platform;
}

/** Extra room demanded on top of the data itself, so a move never fills the disk. */
export const FREE_SPACE_MARGIN_BYTES = 64 * 1024 * 1024;

function comparable(path: string, platform: NodeJS.Platform): string {
    const full = resolve(path);
    return platform === "win32" ? full.toLowerCase() : full;
}

/** True when `child` is `parent` or lies below it. */
export function isSameOrInside(parent: string, child: string, platform: NodeJS.Platform = process.platform): boolean {
    const rel = relative(comparable(parent, platform), comparable(child, platform));
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** The folders that belong to the operating system on this platform. */
export function defaultSystemFolders(
    environment: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): readonly string[] {
    if (platform === "win32") {
        const listed = [
            environment["SystemRoot"],
            environment["windir"],
            environment["ProgramFiles"],
            environment["ProgramFiles(x86)"],
            environment["ProgramW6432"],
            environment["ProgramData"],
        ];
        return listed.filter((entry): entry is string => typeof entry === "string" && entry !== "");
    }
    return [
        "/bin",
        "/boot",
        "/dev",
        "/etc",
        "/lib",
        "/lib64",
        "/proc",
        "/sbin",
        "/sys",
        "/usr",
        "/var",
        "/root",
        "/System",
        "/Library",
        "/Applications",
    ];
}

function refuse(code: FolderRefusalCode, message: string): FolderValidation {
    return { ok: false, code, message };
}

async function nearestExistingAncestor(path: string): Promise<{ folder: string; isDirectory: boolean } | null> {
    let current = resolve(path);
    for (let guard = 0; guard < 64; guard += 1) {
        try {
            const info = await stat(current);
            return { folder: current, isDirectory: info.isDirectory() };
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "ENOENT" && code !== "ENOTDIR") return null;
        }
        const parent = dirname(current);
        if (parent === current) return null;
        current = parent;
    }
    return null;
}

async function proveWritable(folder: string): Promise<boolean> {
    const probe = resolve(folder, `.worldlens-write-test-${randomBytes(6).toString("hex")}`);
    try {
        await writeFile(probe, "ok", { flag: "wx" });
        await rm(probe, { force: true });
        return true;
    } catch {
        return false;
    }
}

async function freeBytesAt(folder: string): Promise<number | null> {
    try {
        const info = await statfs(folder);
        return Number(info.bavail) * Number(info.bsize);
    } catch {
        return null;
    }
}

export async function validateFolder(inputs: FolderValidationInputs): Promise<FolderValidation> {
    const platform = inputs.platform ?? process.platform;
    const raw = inputs.candidate.trim();
    if (raw === "" || raw.includes("\0") || !isAbsolute(raw)) {
        return refuse("not-absolute", "Choose a full folder path, starting from the top of a drive.");
    }
    const folder = resolve(raw);

    if (parse(folder).root === folder) {
        return refuse("system-folder", "A whole drive cannot be used. Choose a folder on it.");
    }
    if (comparable(folder, platform) === comparable(inputs.currentFolder, platform)) {
        return refuse("same-as-current", "That is the folder already in use.");
    }
    for (const install of inputs.installFolders) {
        if (isSameOrInside(install, folder, platform)) {
            return refuse(
                "inside-install-folder",
                "That folder is inside the folder the application is installed in, which an update can replace.",
            );
        }
        if (isSameOrInside(folder, install, platform)) {
            return refuse(
                "contains-install-folder",
                "That folder contains the folder the application is installed in.",
            );
        }
    }
    for (const system of inputs.systemFolders) {
        if (isSameOrInside(system, folder, platform) || isSameOrInside(folder, system, platform)) {
            return refuse("system-folder", "That is a system folder, or contains one. Choose a different folder.");
        }
    }
    if (inputs.otherFolder !== null) {
        if (isSameOrInside(inputs.otherFolder, folder, platform)) {
            return refuse(
                "inside-other-folder",
                "That folder is the same as, or inside, the other data folder. The two must be separate.",
            );
        }
        if (isSameOrInside(folder, inputs.otherFolder, platform)) {
            return refuse(
                "contains-other-folder",
                "That folder contains the other data folder. The two must be separate.",
            );
        }
    }

    const ancestor = await nearestExistingAncestor(folder);
    if (ancestor === null) {
        return refuse("not-creatable", "That folder cannot be created because none of its parents can be reached.");
    }
    const exists = comparable(ancestor.folder, platform) === comparable(folder, platform);
    if (!ancestor.isDirectory) {
        return refuse(
            exists ? "not-a-folder" : "not-creatable",
            exists ? "That path is a file, not a folder." : "That folder cannot be created inside a file.",
        );
    }
    if (exists && inputs.requireEmpty) {
        const entries = await readdir(folder).catch(() => null);
        if (entries === null) {
            return refuse("not-writable", "That folder cannot be read.");
        }
        if (entries.length > 0) {
            return refuse(
                "not-empty",
                "That folder already has files in it. Nothing is overwritten, so choose an empty or new folder.",
            );
        }
    }
    if (!(await proveWritable(ancestor.folder))) {
        return refuse(
            exists ? "not-writable" : "not-creatable",
            exists ? "That folder is not writable." : "That folder cannot be created because its parent is not writable.",
        );
    }
    const freeBytes = await freeBytesAt(ancestor.folder);
    if (freeBytes !== null && inputs.requiredBytes > 0 && freeBytes < inputs.requiredBytes + FREE_SPACE_MARGIN_BYTES) {
        return refuse(
            "not-enough-space",
            `That drive has ${formatBytes(freeBytes)} free, and the data needs ${formatBytes(
                inputs.requiredBytes + FREE_SPACE_MARGIN_BYTES,
            )}.`,
        );
    }
    return { ok: true, folder, exists, freeBytes };
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}
