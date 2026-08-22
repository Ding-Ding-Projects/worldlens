/** Pure classification for files dropped on the application shell. */

export type DroppedWorldKind = "folder" | "archive" | "unknown";

const ARCHIVE_RE = /\.(?:zip|tar\.gz)$/i;

/** Archives can be handed to the desktop extractor; other files cannot contain a world. */
export function isWorldArchive(name: string): boolean {
    return ARCHIVE_RE.test(name.trim());
}

/**
 * True when a set of relative archive/folder entries contains the recognisable Minecraft
 * world markers. Archive tools commonly prefix every entry with one top-level directory, so
 * the check deliberately examines the final path segment rather than requiring a fixed root.
 */
export function looksLikeMinecraftWorld(entries: readonly string[]): boolean {
    const names = new Set(
        entries
            .map((entry) => entry.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase())
            .filter(Boolean),
    );
    const has = (file: string): boolean =>
        [...names].some((entry) => entry === file || entry.endsWith(`/${file}`));
    const hasDirectory = (directory: string): boolean =>
        [...names].some(
            (entry) => entry === directory || entry.startsWith(`${directory}/`) || entry.endsWith(`/${directory}`) || entry.includes(`/${directory}/`),
        );
    return has("level.dat") && (has("level.dat_old") || has("session.lock") || hasDirectory("region") || hasDirectory("entities") || hasDirectory("playerdata"));
}

export function classifyDroppedWorld(name: string, entries: readonly string[] = []): DroppedWorldKind {
    if (isWorldArchive(name)) return "archive";
    return looksLikeMinecraftWorld(entries) ? "folder" : "unknown";
}
