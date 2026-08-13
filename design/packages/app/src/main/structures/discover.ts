/**
 * Finding the structure files a world already has.
 *
 * A structure block's capture is an `.nbt` file. Since Minecraft 1.13 it is written under
 * `<world>/generated/<namespace>/structures/`, one folder per namespace that has ever saved
 * one; an older world (or a save carried forward from before that change) can still hold
 * files directly under `<world>/structures/`, which this scan treats as belonging to the
 * `minecraft` namespace since nothing in that legacy layout names one.
 *
 * This module only walks two shallow directory trees and stats what it finds - it does not
 * open a single `.nbt` file. That is deliberate: `@worldlens/nbt` already owns reading and
 * parsing that format, and a scan whose job is "what is here" should not also decide
 * whether a file's bytes are well formed. `structureModel.ts`'s `deriveStructureName` and
 * `deriveStructureId` turn a namespace and a filename into the shape the interface renders,
 * so this only has to report namespace, filename, absolute path and size - the same three
 * facts `world/catalog.ts` reports about a saves folder, read the same cheap way.
 *
 * ## A missing folder is not a failure
 *
 * Most worlds have never had a structure block used in them, so `generated/` and
 * `structures/` are both very often simply absent. That is "none found", exactly like a
 * `saves` folder with nothing in it, and is reported as an empty list rather than an error -
 * see `checkWorldFolder`'s callers throughout `project/` for the same distinction between
 * "there is nothing here" and "this could not be read".
 */

import { lstat, opendir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { checkWorldFolder } from "../project/file.js";

/** One structure file a scan of a world folder found. */
export interface DiscoveredStructureFile {
    /** `<namespace>:<filename without .nbt>`, matching `structureModel.ts`'s `deriveStructureId`. */
    readonly id: string;
    /** The filename with underscores turned to spaces and `.nbt` dropped. */
    readonly name: string;
    /** The namespace directory the file was found under, `"minecraft"` for the legacy layout. */
    readonly namespace: string;
    /** Absolute path to the `.nbt` file. */
    readonly path: string;
    readonly sizeBytes: number;
}

/** Most structure files one scan will report. A world with more is not a normal world. */
export const MAX_DISCOVERED_STRUCTURES = 4096;

function idFor(namespace: string, filename: string): string {
    return `${namespace}:${filename.endsWith(".nbt") ? filename.slice(0, -4) : filename}`;
}

function nameFor(filename: string): string {
    const withoutExtension = filename.endsWith(".nbt") ? filename.slice(0, -4) : filename;
    return withoutExtension.replace(/_/g, " ").trim();
}

/** Every `.nbt` file directly inside one `structures` directory, with the namespace it was found under. */
async function readStructuresDirectory(
    directory: string,
    namespace: string,
    into: DiscoveredStructureFile[],
    limit: number,
): Promise<void> {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch {
        // Absent, unreadable, or a permission this build does not have - all three are
        // "nothing found here" from the scan's point of view, and the caller's own attempt
        // at the parent `generated/<namespace>` directory already reported whether the
        // namespace itself could be listed at all.
        return;
    }

    for (const entry of entries) {
        if (into.length >= limit) return;
        if (!entry.isFile() || !entry.name.endsWith(".nbt")) continue;
        const path = join(directory, entry.name);
        const stats = await lstat(path).catch(() => null);
        if (stats === null || !stats.isFile()) continue;
        into.push({
            id: idFor(namespace, entry.name),
            name: nameFor(entry.name),
            namespace,
            path,
            sizeBytes: stats.size,
        });
    }
}

/**
 * Every structure file a world folder holds, current layout and legacy layout together.
 *
 * Never rejects for an ordinary reason. A world folder that does not check out at all -
 * relative, or stepping outside itself with `..` - answers with an empty list rather than
 * throwing, because a scan feeding a list on screen has the same obligation `discoverProject`
 * does: one bad path must not take the rest of the interface down with it.
 */
export async function discoverStructures(worldFolder: unknown): Promise<readonly DiscoveredStructureFile[]> {
    const checked = checkWorldFolder(worldFolder);
    if (!checked.ok) return [];

    const found: DiscoveredStructureFile[] = [];

    // The modern layout: one folder per namespace under `generated/`, each optionally
    // holding its own `structures/`. A namespace directory with no `structures` subfolder
    // (it saved some other kind of generated data instead) is simply skipped.
    const generatedRoot = join(checked.folder, "generated");
    let namespaces: string[] = [];
    try {
        const entries = await opendir(generatedRoot);
        for await (const entry of entries) {
            if (entry.isDirectory()) namespaces.push(entry.name);
        }
    } catch {
        namespaces = [];
    }
    for (const namespace of namespaces) {
        if (found.length >= MAX_DISCOVERED_STRUCTURES) break;
        await readStructuresDirectory(
            join(generatedRoot, namespace, "structures"),
            namespace,
            found,
            MAX_DISCOVERED_STRUCTURES,
        );
    }

    // The legacy layout: structure files directly under `<world>/structures/`, with no
    // namespace of their own, so they are reported under `minecraft` - the same namespace
    // `structureModel.ts` falls back to for anything with none.
    if (found.length < MAX_DISCOVERED_STRUCTURES) {
        await readStructuresDirectory(
            join(checked.folder, "structures"),
            "minecraft",
            found,
            MAX_DISCOVERED_STRUCTURES,
        );
    }

    return found;
}
