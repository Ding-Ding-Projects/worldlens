import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

/** A file the editor can open, found by looking in the places Minecraft keeps NBT. */
export interface ProjectFile {
    /** Path from the project folder, always with `/`. */
    readonly relativePath: string;
    readonly name: string;
    /** The folder it was found in, for grouping in the list. */
    readonly group: string;
    readonly kind: "dat" | "nbt" | "region";
    readonly size: number;
}

export interface ProjectListing {
    readonly projectDir: string;
    readonly files: readonly ProjectFile[];
    /** True when more files exist than the cap allows listing. */
    readonly truncated: boolean;
}

const MAX_FILES = 4000;
const MAX_DEPTH = 6;

/** Folders worth looking into, and the file extensions each one's files can have. */
const NBT_EXTENSIONS = new Set([".dat", ".dat_old", ".nbt"]);
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "logs", "cache", "libraries", "versions", "plugins", "mods", "stats", "advancements"]);

function groupOf(relativePath: string): string {
    const parts = relativePath.split("/");
    return parts.length === 1 ? "(world folder)" : parts.slice(0, -1).join("/");
}

/**
 * Finds the world a file belongs to: the nearest folder above it, within a few levels, that
 * holds a `level.dat`. A file with no such world is its own project, rooted at its folder.
 */
export async function inferProjectDir(file: string): Promise<string> {
    let current = dirname(resolve(file));
    for (let depth = 0; depth < 5; depth++) {
        const has = await stat(join(current, "level.dat")).then(
            (s) => s.isFile(),
            () => false,
        );
        if (has) return current;
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return dirname(resolve(file));
}

/** The path of `file` relative to `projectDir` with forward slashes, or null when it is outside. */
export function relativeInside(projectDir: string, file: string): string | null {
    const rel = relative(resolve(projectDir), resolve(file));
    if (rel === "" || rel.startsWith("..") || resolve(rel) === rel) return null;
    return rel.split(sep).join("/");
}

export async function listProjectFiles(projectDir: string): Promise<ProjectListing> {
    const root = resolve(projectDir);
    const files: ProjectFile[] = [];
    let truncated = false;
    const walk = async (directory: string, depth: number): Promise<void> => {
        if (truncated || depth > MAX_DEPTH) return;
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
        for (const entry of entries) {
            if (truncated) return;
            const full = join(directory, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRECTORIES.has(entry.name.toLowerCase())) await walk(full, depth + 1);
                continue;
            }
            if (!entry.isFile()) continue;
            const ext = extname(entry.name).toLowerCase();
            const isRegion = ext === ".mca";
            const isNbt = NBT_EXTENSIONS.has(ext) || entry.name.toLowerCase() === "servers.dat";
            if (!isRegion && !isNbt) continue;
            const rel = relativeInside(root, full);
            if (rel === null) continue;
            const size = await stat(full).then(
                (s) => s.size,
                () => 0,
            );
            if (files.length >= MAX_FILES) {
                truncated = true;
                return;
            }
            files.push({ relativePath: rel, name: basename(full), group: groupOf(rel), kind: isRegion ? "region" : ext === ".nbt" ? "nbt" : "dat", size });
        }
    };
    await walk(root, 0);
    // level.dat first, then everything else grouped by folder.
    files.sort((a, b) => rank(a) - rank(b) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name, "en", { numeric: true }));
    return { projectDir: root, files, truncated };
}

function rank(file: ProjectFile): number {
    if (file.relativePath === "level.dat") return 0;
    if (file.group === "(world folder)") return 1;
    return 2;
}
