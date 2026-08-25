/**
 * Listing what is inside a mounted folder, so a browser tab has something to choose from.
 *
 * ## Why this exists at all
 *
 * On a desktop, choosing a folder is a native dialog. In a container there is no desktop to
 * draw one on, so `capabilityProfile.ts` refuses `dialog:*` and `config:pick*` and tells the
 * caller to "choose from the folders the operator mounted" instead. That sentence was a
 * promise with nothing behind it until this: the refusal named a replacement that did not
 * exist, which is worse than refusing plainly, because it reads as a feature the person
 * failed to find.
 *
 * ## The one thing that must not go wrong
 *
 * `MountRoots.resolve` already decides whether a path is inside a mounted folder, and it does
 * it properly: through `realpath`, so a symlink that points out of the root is caught by
 * where it lands rather than by how it is spelled. This does not re-implement any of that. It
 * calls it, once for the folder being listed and once per entry, and drops anything that
 * comes back refused.
 *
 * Resolving every entry rather than only the folder is deliberate and is the expensive
 * choice. A directory can contain a symlink pointing anywhere, so a listing that only
 * confined its own path would happily print the names of files outside the mount. Names are
 * not contents, but a listing is exactly how somebody learns what exists, and "you cannot
 * open it, you can only see that it is there" is not a boundary anybody should have to
 * explain.
 *
 * ## The root id is checked, not just the path
 *
 * A caller naming root `A` with a path that happens to sit inside root `B` gets refused
 * rather than getting `B`'s contents back labelled as `A`. Without that, the id becomes
 * decorative and two mounts with different writability quietly become one.
 */
import type { MountRoot, MountRoots } from "./mountRoots.js";

export interface MountEntry {
    readonly name: string;
    readonly kind: "folder" | "file";
    /** Absolute path inside the container. Already confined; safe to hand back to `resolve`. */
    readonly path: string;
}

export interface MountListing {
    readonly rootId: string;
    readonly rootLabel: string;
    readonly writable: boolean;
    /** The folder that was listed. */
    readonly path: string;
    /** The folder above, or `null` when this is the mount root itself and there is no up. */
    readonly parent: string | null;
    readonly entries: readonly MountEntry[];
    /**
     * Set when the directory held more than {@link MAX_ENTRIES}.
     *
     * Reported rather than silently cut, because a listing that quietly stops reads as "that
     * file is not here" to the one person who came looking for it.
     */
    readonly truncated: boolean;
}

export type BrowseResult =
    | { readonly ok: true; readonly listing: MountListing }
    | { readonly ok: false; readonly reason: string };

/**
 * A ceiling on one listing, so a folder with a hundred thousand region files cannot turn one
 * click into a hundred thousand `realpath` calls and an unusable interface.
 */
export const MAX_ENTRIES = 2000;

export interface BrowseDependencies {
    readonly readDirectory: (
        path: string,
    ) => Promise<readonly { readonly name: string; readonly isDirectory: boolean }[]>;
    readonly parentOf: (path: string) => string;
    readonly join: (parent: string, child: string) => string;
}

const defaultDependencies: BrowseDependencies = {
    readDirectory: async (path) => {
        const { readdir } = await import("node:fs/promises");
        const entries = await readdir(path, { withFileTypes: true });
        // A symlink reports as neither file nor directory here. Ask the filesystem what it
        // points at rather than guessing, and treat an unreadable link as a plain entry so a
        // broken link is visible rather than silently missing.
        return await Promise.all(
            entries.map(async (entry) => {
                if (!entry.isSymbolicLink()) {
                    return { name: entry.name, isDirectory: entry.isDirectory() };
                }
                const { stat } = await import("node:fs/promises");
                const { join } = await import("node:path");
                try {
                    const target = await stat(join(path, entry.name));
                    return { name: entry.name, isDirectory: target.isDirectory() };
                } catch {
                    return { name: entry.name, isDirectory: false };
                }
            }),
        );
    },
    parentOf: (path) => {
        const separator = path.includes("\\") ? "\\" : "/";
        const cut = path.lastIndexOf(separator);
        if (cut <= 0) return separator;
        return path.slice(0, cut);
    },
    join: (parent, child) => {
        const separator = parent.includes("\\") ? "\\" : "/";
        return parent.endsWith(separator) ? `${parent}${child}` : `${parent}${separator}${child}`;
    },
};

/** Folders first, then files, each ordered the way a person reads a list rather than by byte. */
function inReadingOrder(left: MountEntry, right: MountEntry): number {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function rootById(mounts: MountRoots, rootId: string): MountRoot | null {
    return mounts.list().find((root) => root.id === rootId) ?? null;
}

/**
 * List one folder inside one mounted root.
 *
 * `path` of `null` means the root itself, which is what a first open asks for and saves the
 * caller having to know a path before it can ask for one.
 */
export async function browseMount(
    mounts: MountRoots,
    rootId: string,
    path: string | null,
    dependencies: Partial<BrowseDependencies> = {},
): Promise<BrowseResult> {
    const deps = { ...defaultDependencies, ...dependencies };

    const root = rootById(mounts, rootId);
    if (root === null)
        return {
            ok: false,
            reason: `There is no mounted folder called "${rootId}" in this deployment.`,
        };

    const target = path ?? root.path;

    // Reading, not writing: browsing a read-only mount is exactly what it is for.
    const resolved = await mounts.resolve(target, false);
    if (!resolved.ok) return { ok: false, reason: resolved.reason };
    if (resolved.root.id !== rootId)
        return {
            ok: false,
            reason: `That folder is inside "${resolved.root.id}" rather than "${rootId}".`,
        };

    let raw: readonly { readonly name: string; readonly isDirectory: boolean }[];
    try {
        raw = await deps.readDirectory(target);
    } catch {
        return { ok: false, reason: "That folder could not be read." };
    }

    const truncated = raw.length > MAX_ENTRIES;
    const considered = truncated ? raw.slice(0, MAX_ENTRIES) : raw;

    const entries: MountEntry[] = [];
    for (const entry of considered) {
        const child = deps.join(target, entry.name);
        // The load-bearing line. An entry that resolves out of this root is dropped rather
        // than listed-and-then-refused, because a name in a list is already information.
        const inside = await mounts.resolve(child, false);
        if (!inside.ok || inside.root.id !== rootId) continue;
        entries.push({
            name: entry.name,
            kind: entry.isDirectory ? "folder" : "file",
            path: child,
        });
    }
    entries.sort(inReadingOrder);

    return {
        ok: true,
        listing: {
            rootId: root.id,
            rootLabel: root.label,
            writable: root.writable,
            path: target,
            parent: target === root.path ? null : deps.parentOf(target),
            entries,
            truncated,
        },
    };
}
