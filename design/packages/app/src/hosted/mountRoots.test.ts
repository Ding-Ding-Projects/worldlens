/**
 * The confinement boundary, with the symlink case first because it is the one that matters.
 *
 * A fake `realPath` rather than real symlinks on disk: the behaviour being checked is what
 * happens *after* the operating system has told us where a path really goes, and a fake lets
 * that be stated exactly rather than depending on whether the test runner's filesystem
 * supports links at all - which on Windows depends on developer mode being switched on.
 */
import { describe, expect, it } from "vitest";
import { MountRoots, validateMountRoots, type MountRoot } from "./mountRoots.js";

const WORLDS: MountRoot = {
    id: "worlds",
    label: "Worlds",
    path: "/data/worlds",
    writable: false,
};
const RENDERS: MountRoot = {
    id: "renders",
    label: "Renders",
    path: "/data/renders",
    writable: true,
};

/** Resolves a path the way a filesystem would, given a map of links and existing paths. */
function fakeRealPath(links: Record<string, string>, existing: readonly string[] = []) {
    return async (path: string): Promise<string> => {
        if (path in links) return await Promise.resolve(links[path] as string);
        const known = [...Object.keys(links), ...existing, "/data/worlds", "/data/renders", "/data"];
        if (known.some((candidate) => path === candidate || path.startsWith(`${candidate}/`)))
            return await Promise.resolve(path);
        throw new Error(`ENOENT: ${path}`);
    };
}

/**
 * `/etc` and `/var` are listed as existing because on a real machine they do, and that is the
 * case worth checking: a refusal of a path that exists has to give the useful reason, not the
 * "could not be resolved" one a non-existent path gets. Pretending the whole filesystem is
 * empty except the mounts would test an easier world than the one this runs in.
 */
const roots = (links: Record<string, string> = {}, existing: readonly string[] = ["/etc", "/var"]) =>
    new MountRoots([WORLDS, RENDERS], { realPath: fakeRealPath(links, existing), platform: "linux" });

describe("confining a path to the mounted folders", () => {
    it("allows a path inside a mounted folder", async () => {
        await expect(roots().resolve("/data/worlds/overworld", false)).resolves.toMatchObject({
            ok: true,
            root: { id: "worlds" },
        });
    });

    it("refuses a path outside every mounted folder, and names them", async () => {
        const answer = await roots().resolve("/etc/shadow", false);

        expect(answer.ok).toBe(false);
        if (!answer.ok) {
            expect(answer.reason).toContain("Worlds");
            expect(answer.reason).toContain("Renders");
        }
    });

    it("refuses a symlink that resolves out of a mounted folder", async () => {
        // The case a string comparison cannot catch: the path is inside the root right up
        // until the operating system follows it. This is why both sides go through realpath
        // before being compared, and why this test exists rather than a `startsWith`.
        const escaping = roots({ "/data/worlds/sneaky": "/etc" });

        const answer = await escaping.resolve("/data/worlds/sneaky", false);

        expect(answer.ok).toBe(false);
    });

    it("allows a symlink that resolves back inside a mounted folder", async () => {
        // The other half. Refusing every link would be safe and useless: an operator who
        // symlinks one world into another's folder has done nothing wrong.
        const linked = roots({ "/data/worlds/alias": "/data/worlds/overworld" });

        await expect(linked.resolve("/data/worlds/alias", false)).resolves.toMatchObject({
            ok: true,
        });
    });

    it("refuses traversal out of a root", async () => {
        const answer = await roots().resolve("/data/worlds/../../etc", false);

        expect(answer.ok).toBe(false);
    });

    it("refuses a write into a read-only mount, while still allowing reads from it", async () => {
        await expect(roots().resolve("/data/worlds/overworld", false)).resolves.toMatchObject({
            ok: true,
        });

        const answer = await roots().resolve("/data/worlds/overworld", true);
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.reason).toContain("read-only");
    });

    it("allows a write into a writable mount", async () => {
        await expect(roots().resolve("/data/renders/map", true)).resolves.toMatchObject({
            ok: true,
            root: { id: "renders" },
        });
    });

    it("allows writing a path that does not exist yet inside a mounted folder", async () => {
        // A render writes somewhere that is not there yet. Refusing this would make the
        // deployment read-only in practice while claiming to be writable.
        await expect(roots().resolve("/data/renders/new/deep/tiles", true)).resolves.toMatchObject({
            ok: true,
        });
    });

    it("still refuses a path that does not exist and is outside every mount", async () => {
        // The trap in the previous behaviour: permitting anything absent would let a caller
        // name any path at all simply by naming one that is not there.
        const answer = await roots().resolve("/var/tmp/somewhere/new", true);

        expect(answer.ok).toBe(false);
    });

    it("refuses a path containing a NUL byte", async () => {
        // Truncates at the operating-system boundary, so a string that passes every check
        // here can name a different file by the time it is opened.
        const answer = await roots().resolve("/data/worlds/ok\0/../../etc/shadow", false);

        expect(answer.ok).toBe(false);
    });

    it("refuses everything when nothing is mounted, and says that is why", async () => {
        const empty = new MountRoots([], { realPath: fakeRealPath({}), platform: "linux" });

        const answer = await empty.resolve("/data/worlds/overworld", false);
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.reason).toContain("no folders mounted");
    });

    it("skips a declared root that is not actually mounted rather than matching another", async () => {
        const missing = new MountRoots(
            [{ id: "gone", label: "Gone", path: "/data/gone", writable: true }, RENDERS],
            { realPath: fakeRealPath({}), platform: "linux" },
        );

        await expect(missing.resolve("/data/renders/map", true)).resolves.toMatchObject({
            ok: true,
            root: { id: "renders" },
        });
    });
});

describe("checking what an operator declared", () => {
    it("accepts a well-formed declaration", () => {
        expect(validateMountRoots([WORLDS, RENDERS])).toEqual([]);
    });

    it("rejects a duplicate id, which would shadow the first silently", () => {
        expect(validateMountRoots([WORLDS, { ...RENDERS, id: "worlds" }])).toHaveLength(1);
    });

    it("rejects an id that is not usable as a settings key", () => {
        expect(validateMountRoots([{ ...WORLDS, id: "Worlds Folder" }])).not.toEqual([]);
    });

    it("rejects a root with no label, because nobody could tell what it is", () => {
        expect(validateMountRoots([{ ...WORLDS, label: "  " }])).not.toEqual([]);
    });
});
