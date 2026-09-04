/**
 * The record, in the repository, of every world this project has uploaded to it.
 *
 * Rendering already leaves a backup behind. The world is packed, split, and published as
 * GitHub release assets with a `.cheaplfs` pointer and a `backup.json` sidecar, on a
 * release nothing in this codebase can delete or overwrite. That part is done and has
 * been for a while.
 *
 * What was missing is any record of it *in the repository itself*. `backup/catalog.ts`
 * answers "what backups exist" by listing releases over the network every time, so the
 * answer needs a working connection, a credential that can still see the repository, and
 * GitHub being up. Clone the repository and you have no idea what is in it. That is a
 * strange property for a backup: the thing you reach for when something has gone wrong is
 * the thing that only exists while everything is working.
 *
 * So the pointer is also committed. A pointer is a few hundred bytes of text that says
 * which release, which asset, how many bytes and what it must hash to - it is designed to
 * stand in for the large binary, which is exactly what a committed record of a backup
 * needs to be. `git clone` now brings the map of every world backup with it.
 *
 * ## The grammar is not ours to change
 *
 * `pointer.ts` is explicit that the Cheap LFS format is a shipped contract shared with a
 * sibling application, and that this project restates it rather than inventing near-misses
 * of it. The bytes written here are the bytes `serializeCheapLfsPointer` produced, passed
 * through unaltered. Everything this project wants to say *about* a backup goes in the
 * index beside it, for the same reason the sidecar exists: a pointer that gained an extra
 * field would stop being readable by the parser it was copied from, and that readability
 * is the whole value of using the format at all.
 */

import { CHEAP_LFS_POINTER_VERSION, POINTER_ASSET_SUFFIX } from "../backup/pointer.js";

/** Where the committed records live, relative to the repository root. */
export const WORLD_BACKUP_DIRECTORY = "worlds";

/** The machine-readable index. */
export const WORLD_BACKUP_INDEX_FILE = `${WORLD_BACKUP_DIRECTORY}/index.json`;

/** The same information for somebody reading the repository on the web. */
export const WORLD_BACKUP_README_FILE = `${WORLD_BACKUP_DIRECTORY}/README.md`;

/**
 * Bumped only for a change an older reader could not understand.
 *
 * Matches the sidecar's convention deliberately - a versioned integer as the first field,
 * so a reader can refuse a future format instead of misreading it.
 */
export const WORLD_BACKUP_INDEX_VERSION = 1;

/** Far above any real index; bounds a hostile or corrupt file before parsing it. */
export const MAX_INDEX_BYTES = 1024 * 1024;

/** How many entries an index keeps. Old ones are dropped from the index, never deleted. */
export const MAX_INDEX_ENTRIES = 500;

export interface WorldBackupEntry {
    /** The world's own folder name, as the person sees it. */
    readonly label: string;
    /** The release the assets are on. */
    readonly releaseTag: string;
    /** The archive asset the pointer describes. */
    readonly archive: string;
    /** The committed pointer file, relative to the repository root. */
    readonly pointer: string;
    readonly bytes: number;
    readonly sha256: string;
    /** How many assets the archive became. */
    readonly parts: number;
    /** ISO-8601, UTC. */
    readonly createdAt: string;
    /** Which build wrote it, so an old entry can be read in the light of its own version. */
    readonly appVersion: string;
}

export interface WorldBackupIndex {
    readonly indexVersion: number;
    readonly entries: readonly WorldBackupEntry[];
}

/** A file to write into the repository. */
export interface RepositoryFile {
    readonly path: string;
    readonly content: string;
}

/** Reduces a label to something safe in a path, without inventing a new convention. */
function slug(label: string): string {
    const cleaned = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return cleaned === "" ? "world" : cleaned.slice(0, 64);
}

/** The committed pointer's path for one upload. */
export function pointerPathFor(entry: { label: string; releaseTag: string }): string {
    return `${WORLD_BACKUP_DIRECTORY}/${slug(entry.label)}-${slug(entry.releaseTag)}${POINTER_ASSET_SUFFIX}`;
}

/**
 * Reads an existing index, or starts one.
 *
 * A file that cannot be read is replaced rather than repaired, and the caller is told,
 * because a half-understood index is worse than a fresh one: it would silently drop the
 * entries it could not parse while looking complete.
 */
export function parseIndex(text: string | null): { index: WorldBackupIndex; recovered: boolean } {
    if (text === null || text.trim() === "") {
        return { index: { indexVersion: WORLD_BACKUP_INDEX_VERSION, entries: [] }, recovered: false };
    }
    if (text.length > MAX_INDEX_BYTES) {
        return { index: { indexVersion: WORLD_BACKUP_INDEX_VERSION, entries: [] }, recovered: true };
    }
    try {
        const raw = JSON.parse(text) as Partial<WorldBackupIndex>;
        if (typeof raw.indexVersion !== "number" || !Array.isArray(raw.entries)) {
            return { index: { indexVersion: WORLD_BACKUP_INDEX_VERSION, entries: [] }, recovered: true };
        }
        // A newer index is refused rather than truncated to what this build understands.
        if (raw.indexVersion > WORLD_BACKUP_INDEX_VERSION) {
            return { index: { indexVersion: raw.indexVersion, entries: raw.entries }, recovered: false };
        }
        const entries = raw.entries.filter(
            (entry): entry is WorldBackupEntry =>
                entry !== null &&
                typeof entry === "object" &&
                typeof entry.label === "string" &&
                typeof entry.releaseTag === "string" &&
                typeof entry.sha256 === "string",
        );
        return {
            index: { indexVersion: WORLD_BACKUP_INDEX_VERSION, entries },
            recovered: entries.length !== raw.entries.length,
        };
    } catch {
        return { index: { indexVersion: WORLD_BACKUP_INDEX_VERSION, entries: [] }, recovered: true };
    }
}

/** Adds one upload to an index, newest first, without duplicating a re-run. */
export function withEntry(index: WorldBackupIndex, entry: WorldBackupEntry): WorldBackupIndex {
    // Keyed on the release tag: uploading the same world twice makes two releases and two
    // entries, but a retry of the *same* upload must not make two.
    const rest = index.entries.filter((existing) => existing.releaseTag !== entry.releaseTag);
    return {
        indexVersion: WORLD_BACKUP_INDEX_VERSION,
        entries: [entry, ...rest].slice(0, MAX_INDEX_ENTRIES),
    };
}

function humanBytes(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    const units = ["KiB", "MiB", "GiB", "TiB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * The human-readable half.
 *
 * Says plainly what a pointer is and is not, because somebody finding this directory in
 * their own repository should not have to guess whether these small files *are* the
 * backup. They are not - they say where it is.
 */
export function renderReadme(index: WorldBackupIndex, owner: string, repo: string): string {
    const rows = index.entries.map((entry) => {
        const release = `https://github.com/${owner}/${repo}/releases/tag/${entry.releaseTag}`;
        return `| ${entry.label} | ${entry.createdAt} | ${humanBytes(entry.bytes)} | ${String(entry.parts)} | [release](${release}) | \`${entry.pointer}\` |`;
    });

    return [
        "# World backups",
        "",
        "Every render uploads its world here first, so each one leaves a backup behind.",
        "",
        "**These files are not the backup.** Each `.cheaplfs` file is a pointer: a few",
        "hundred bytes naming the release that holds the world, the asset, its size and the",
        "SHA-256 the bytes must hash to. The world itself lives as release assets, which do",
        "not expire, and which this application never deletes or overwrites.",
        "",
        "The pointers are committed so the record survives without a network. Clone this",
        "repository and you can still see every world that was ever uploaded, and verify one",
        "you have a copy of, with no connection and no credential.",
        "",
        "| World | Uploaded | Size | Assets | Release | Pointer |",
        "| --- | --- | --- | --- | --- | --- |",
        ...(rows.length === 0 ? ["| _none yet_ | | | | | |"] : rows),
        "",
        "<sub>Written by Worldlens. Editing this file by hand is safe; it is regenerated",
        "from `index.json` on the next upload.</sub>",
        "",
    ].join("\n");
}

/**
 * The three files one upload adds to the repository.
 *
 * The pointer text is passed through byte for byte. A caller that has not got it should
 * not call this - a pointer this function *composed* would be this project inventing a
 * dialect of somebody else's format, which `pointer.ts` says in as many words not to do.
 */
export function filesForUpload(options: {
    readonly existingIndex: string | null;
    readonly pointerText: string;
    readonly entry: WorldBackupEntry;
    readonly owner: string;
    readonly repo: string;
}): { readonly files: readonly RepositoryFile[]; readonly recoveredIndex: boolean } {
    if (!options.pointerText.startsWith(`version ${CHEAP_LFS_POINTER_VERSION}`)) {
        throw new Error(
            "Refusing to commit a world-backup pointer that is not a Cheap LFS v1 pointer. " +
                "The committed bytes must be the ones the uploader produced.",
        );
    }

    const parsed = parseIndex(options.existingIndex);
    const index = withEntry(parsed.index, options.entry);

    return {
        files: [
            { path: options.entry.pointer, content: options.pointerText },
            { path: WORLD_BACKUP_INDEX_FILE, content: `${JSON.stringify(index, null, 4)}\n` },
            {
                path: WORLD_BACKUP_README_FILE,
                content: renderReadme(index, options.owner, options.repo),
            },
        ],
        recoveredIndex: parsed.recovered,
    };
}
