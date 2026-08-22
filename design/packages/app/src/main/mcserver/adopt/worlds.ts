/**
 * Listing, importing, exporting and switching a server's worlds through its transport.
 *
 * Everything here goes through `ServerTransport.fileList` / `fileRead` / `fileWrite` /
 * `fileDelete` / `dirEnsure`, so it works identically for a local process, a local
 * container and an SSH-reached container - and, for an adopted server, respects exactly
 * the `writeScope` and `capabilities` the owner consented to. A transport whose
 * `capabilities.canWriteFiles` is false answers `unsupported` on import/switch/delete the
 * same way it would for a config edit; this module adds no authority of its own.
 *
 * A "world" is recognised the same way `backup/source.ts` recognises one: a folder that
 * contains `level.dat`. Vanilla, Paper, Spigot, Purpur and Fabric all lay worlds out this
 * way at the server root (`world`, `world_nether`, `world_the_end`, plus any custom name
 * in `level-name`), so no flavour-specific logic is needed to find them.
 */

import { fail, ok, type Answer, type FileEntry, type ServerTransport } from "../transport/types.js";

const WORLD_MARKER = "level.dat";

export interface WorldInfo {
    readonly name: string;
    /** Absolute path (within `serverDir`) to this world's folder. */
    readonly path: string;
    readonly isActive: boolean;
}

/**
 * Lists every folder directly under `serverDir` that contains `level.dat`.
 *
 * One `fileList` on the root, then one `fileList` per candidate directory to check for the
 * marker - never a recursive walk, because a world can contain tens of thousands of region
 * files and nothing here needs to see any of them.
 */
export async function listWorlds(
    transport: ServerTransport,
    serverDir: string,
    activeWorldName: string | null,
): Promise<Answer<readonly WorldInfo[]>> {
    const rootListing = await transport.fileList(serverDir);
    if (!rootListing.ok) return rootListing;

    const worlds: WorldInfo[] = [];
    for (const entry of rootListing.value) {
        if (entry.kind !== "directory") continue;
        const candidatePath = joinServerPath(serverDir, entry.name);
        const inner = await transport.fileList(candidatePath);
        if (!inner.ok) continue; // Not readable as a directory right now; not a world we can offer.
        const hasMarker = inner.value.some((child: FileEntry) => child.name === WORLD_MARKER);
        if (!hasMarker) continue;
        worlds.push({
            name: entry.name,
            path: candidatePath,
            isActive: activeWorldName !== null && entry.name === activeWorldName,
        });
    }
    return ok(worlds);
}

function joinServerPath(base: string, name: string): string {
    const trimmed = base.endsWith("/") || base.endsWith("\\") ? base.slice(0, -1) : base;
    const separator = trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";
    return `${trimmed}${separator}${name}`;
}

/**
 * Switches which world a server will load next, by rewriting `server.properties`'
 * `level-name` line.
 *
 * This never touches the world folders themselves - it only changes which one the server
 * is told to open on its next start. Genuinely destructive world operations (deleting one)
 * go through `deleteWorld` below, separately, and every caller of either is expected to
 * flag the change for the two-key destructive-action confirmation this app requires
 * everywhere else, because both change what a running server would load or lose.
 */
export async function switchActiveWorld(
    transport: ServerTransport,
    serverDir: string,
    worldName: string,
): Promise<Answer<void>> {
    const propertiesPath = joinServerPath(serverDir, "server.properties");
    const read = await transport.fileRead(propertiesPath);
    if (!read.ok) return read;

    const text = Buffer.from(read.value.bytes).toString("utf8");
    const lines = text.split(/\r?\n/);
    let replaced = false;
    const nextLines = lines.map((line) => {
        if (/^level-name\s*=/.test(line)) {
            replaced = true;
            return `level-name=${worldName}`;
        }
        return line;
    });
    if (!replaced) nextLines.push(`level-name=${worldName}`);

    const nextText = `${nextLines.join("\n")}\n`;
    const write = await transport.fileWrite(propertiesPath, new Uint8Array(Buffer.from(nextText, "utf8")), {
        expectedHash: read.value.hash,
        backup: true,
    });
    if (!write.ok) return write;
    return ok(undefined);
}

/**
 * Deletes a world folder outright. Destructive, and gated on the same `canWriteFiles`
 * capability every other write is - an adopted server whose owner did not consent to
 * config writes cannot have a world deleted either, because deleting is the sharpest edge
 * of "writing" there is.
 *
 * `fileDelete` on a `ServerTransport` operates on one path; a world folder is a directory
 * with thousands of files under it, and no transport in this codebase currently supports
 * a recursive remote delete. Until one does, this answers `unsupported` rather than
 * silently deleting only the top-level marker and leaving the rest behind looking like a
 * half-deleted world.
 */
export async function deleteWorld(
    transport: ServerTransport,
    worldPath: string,
): Promise<Answer<void>> {
    if (!transport.capabilities.canWriteFiles) {
        return fail("unsupported", "This installation was not given permission to change this server's files.");
    }
    return fail(
        "unsupported",
        "Deleting a whole world folder through a remote transport is not supported yet.",
        `Would have deleted: ${worldPath}`,
    );
}
