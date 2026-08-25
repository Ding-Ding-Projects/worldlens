/**
 * Browsing a mounted folder, with the escaping-symlink case first because it is the one that
 * decides whether this is a boundary or a decoration.
 *
 * Same fake `realPath` approach as `mountRoots.test.ts`, and for the same reason: what is
 * being checked is what happens *after* the operating system says where a path really goes,
 * and on Windows real symlinks depend on developer mode being switched on.
 */
import { describe, expect, it } from "vitest";
import { MountRoots, type MountRoot } from "./mountRoots.js";
import { browseMount, MAX_ENTRIES, type BrowseDependencies } from "./mountBrowse.js";

const WORLDS: MountRoot = { id: "worlds", label: "Worlds", path: "/data/worlds", writable: false };
const RENDERS: MountRoot = { id: "renders", label: "Renders", path: "/data/renders", writable: true };

function fakeRealPath(links: Record<string, string>) {
    return async (path: string): Promise<string> => {
        if (path in links) return await Promise.resolve(links[path] as string);
        const known = [...Object.keys(links), "/data/worlds", "/data/renders", "/data", "/etc"];
        if (known.some((candidate) => path === candidate || path.startsWith(`${candidate}/`)))
            return await Promise.resolve(path);
        throw new Error(`ENOENT: ${path}`);
    };
}

const mountsWith = (links: Record<string, string> = {}) =>
    new MountRoots([WORLDS, RENDERS], { realPath: fakeRealPath(links), platform: "linux" });

/** A directory tree stated as a map, so a test says what is there rather than creating it. */
function fakeTree(tree: Record<string, readonly (readonly [string, boolean])[]>): Partial<BrowseDependencies> {
    return {
        readDirectory: async (path) => {
            const found = tree[path];
            if (found === undefined) throw new Error(`ENOENT: ${path}`);
            return await Promise.resolve(found.map(([name, isDirectory]) => ({ name, isDirectory })));
        },
    };
}

describe("browsing a mounted folder", () => {
    it("drops an entry whose symlink resolves out of the root", async () => {
        // The whole point. `escape` is inside the folder by name and outside it in fact.
        const mounts = mountsWith({ "/data/worlds/escape": "/etc/shadow" });
        const deps = fakeTree({
            "/data/worlds": [
                ["overworld", true],
                ["escape", false],
            ],
        });

        const result = await browseMount(mounts, "worlds", null, deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.listing.entries.map((entry) => entry.name)).toEqual(["overworld"]);
    });

    it("lists a root's own contents when no path is given", async () => {
        const deps = fakeTree({
            "/data/worlds": [
                ["overworld", true],
                ["level.dat", false],
            ],
        });

        const result = await browseMount(mountsWith(), "worlds", null, deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.listing.path).toBe("/data/worlds");
        expect(result.listing.parent).toBeNull();
        expect(result.listing.rootLabel).toBe("Worlds");
        expect(result.listing.writable).toBe(false);
        expect(result.listing.entries).toEqual([
            { name: "overworld", kind: "folder", path: "/data/worlds/overworld" },
            { name: "level.dat", kind: "file", path: "/data/worlds/level.dat" },
        ]);
    });

    it("offers a way back up once below the root, and none at it", async () => {
        const deps = fakeTree({
            "/data/worlds": [["overworld", true]],
            "/data/worlds/overworld": [["region", true]],
        });

        const atRoot = await browseMount(mountsWith(), "worlds", null, deps);
        const below = await browseMount(mountsWith(), "worlds", "/data/worlds/overworld", deps);

        expect(atRoot.ok && atRoot.listing.parent).toBeNull();
        expect(below.ok && below.listing.parent).toBe("/data/worlds");
    });

    it("refuses a root this deployment does not have", async () => {
        const result = await browseMount(mountsWith(), "nowhere", null, fakeTree({}));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("nowhere");
    });

    it("refuses a path that is inside a different root than the one named", async () => {
        // Otherwise the id is decorative: ask for `worlds`, hand a `renders` path, and get
        // `renders` back labelled read-only when it is in fact writable.
        const deps = fakeTree({ "/data/renders": [["map", true]] });

        const result = await browseMount(mountsWith(), "worlds", "/data/renders", deps);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("renders");
    });

    it("refuses a path outside every mounted folder", async () => {
        const result = await browseMount(mountsWith(), "worlds", "/etc", fakeTree({ "/etc": [] }));

        expect(result.ok).toBe(false);
    });

    it("says so when a folder held more than it will list, rather than stopping quietly", async () => {
        const many = Array.from(
            { length: MAX_ENTRIES + 5 },
            (_unused, index) => [`w${String(index).padStart(5, "0")}`, true] as const,
        );
        const deps = fakeTree({ "/data/worlds": many });

        const result = await browseMount(mountsWith(), "worlds", null, deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.listing.truncated).toBe(true);
        expect(result.listing.entries).toHaveLength(MAX_ENTRIES);
    });

    it("puts folders before files and orders each the way a person reads", async () => {
        const deps = fakeTree({
            "/data/worlds": [
                ["zeta.dat", false],
                ["Alpha", true],
                ["alpha.dat", false],
                ["beta", true],
            ],
        });

        const result = await browseMount(mountsWith(), "worlds", null, deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.listing.entries.map((entry) => entry.name)).toEqual([
            "Alpha",
            "beta",
            "alpha.dat",
            "zeta.dat",
        ]);
    });

    it("reports an unreadable folder rather than an empty one", async () => {
        // An empty listing and a refused one look identical in an interface, and only one of
        // them means "there is nothing here".
        const result = await browseMount(mountsWith(), "worlds", null, fakeTree({}));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("could not be read");
    });
});
