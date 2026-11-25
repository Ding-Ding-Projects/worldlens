/**
 * Lists the profile's files that matter for history, so the interface can say whether
 * credential files are present without opening any of them.
 *
 * Only names are read. Volatile entries, rebuildable data and nested repositories are
 * skipped, and the walk stops after a fixed number of entries.
 */

import { lstat, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { REBUILDABLE_DIRECTORIES, isVolatilePath } from "./profileEntries.js";

const MAX_ENTRIES = 100_000;

/** Forward-slash paths of the files under `root` that history would record. */
export async function listProfileFiles(root: string): Promise<string[]> {
    const found: string[] = [];
    let seen = 0;

    async function walk(directory: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (seen >= MAX_ENTRIES) return;
            seen += 1;
            if (entry.name === ".git") continue;
            const absolute = join(directory, entry.name);
            const rel = relative(root, absolute).split(sep).join("/");
            if (isVolatilePath(rel)) continue;
            if (entry.isDirectory()) {
                if (REBUILDABLE_DIRECTORIES.includes(rel)) continue;
                const nested = await lstat(join(absolute, ".git")).then(
                    () => true,
                    () => false,
                );
                if (!nested) await walk(absolute);
            } else if (entry.isFile()) {
                found.push(rel);
            }
        }
    }

    await walk(root);
    return found;
}
