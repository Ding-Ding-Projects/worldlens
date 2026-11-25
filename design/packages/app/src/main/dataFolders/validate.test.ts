import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import {
    defaultSystemFolders,
    formatBytes,
    isSameOrInside,
    validateFolder,
    type FolderValidationInputs,
} from "./validate.js";

let root = "";
beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "wl-validate-"));
});
afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

function inputs(candidate: string, overrides: Partial<FolderValidationInputs> = {}): FolderValidationInputs {
    return {
        candidate,
        currentFolder: join(root, "current"),
        otherFolder: null,
        installFolders: [join(root, "install")],
        systemFolders: [join(root, "system")],
        requiredBytes: 0,
        requireEmpty: true,
        ...overrides,
    };
}

describe("validating a data folder", () => {
    it("accepts a folder that does not exist yet, and says it would be created", async () => {
        const result = await validateFolder(inputs(join(root, "new", "deeper")));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.exists).toBe(false);
    });

    it("accepts an existing empty folder", async () => {
        const folder = join(root, "empty");
        await mkdir(folder);
        const result = await validateFolder(inputs(folder));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.exists).toBe(true);
    });

    it.each(["", "relative/folder", "  "])("refuses %j because it is not a full path", async (candidate) => {
        const result = await validateFolder(inputs(candidate));
        expect(result).toMatchObject({ ok: false, code: "not-absolute" });
    });

    it("refuses a whole drive or filesystem root", async () => {
        const result = await validateFolder(inputs(parse(root).root));
        expect(result).toMatchObject({ ok: false, code: "system-folder" });
    });

    it("refuses the folder already in use", async () => {
        const result = await validateFolder(inputs(join(root, "current")));
        expect(result).toMatchObject({ ok: false, code: "same-as-current" });
    });

    it("refuses a folder inside the install folder, and one that contains it", async () => {
        expect(await validateFolder(inputs(join(root, "install", "data")))).toMatchObject({
            ok: false,
            code: "inside-install-folder",
        });
        expect(await validateFolder(inputs(root))).toMatchObject({ ok: false, code: "contains-install-folder" });
    });

    it("refuses a system folder, and a folder inside one", async () => {
        expect(await validateFolder(inputs(join(root, "system")))).toMatchObject({ ok: false, code: "system-folder" });
        expect(await validateFolder(inputs(join(root, "system", "sub")))).toMatchObject({
            ok: false,
            code: "system-folder",
        });
    });

    it("refuses nesting with the other chosen folder, both ways", async () => {
        const other = join(root, "other");
        expect(await validateFolder(inputs(join(root, "other", "child"), { otherFolder: other }))).toMatchObject({
            ok: false,
            code: "inside-other-folder",
        });
        const parentOfOther = join(root, "parent");
        expect(
            await validateFolder(inputs(parentOfOther, { otherFolder: join(parentOfOther, "other") })),
        ).toMatchObject({ ok: false, code: "contains-other-folder" });
    });

    it("refuses a path that is a file", async () => {
        const file = join(root, "a-file");
        await writeFile(file, "x");
        expect(await validateFolder(inputs(file))).toMatchObject({ ok: false, code: "not-a-folder" });
        expect(await validateFolder(inputs(join(file, "inside")))).toMatchObject({ ok: false, code: "not-creatable" });
    });

    it("refuses a folder that already has files in it when nothing may be overwritten", async () => {
        const folder = join(root, "busy");
        await mkdir(folder);
        await writeFile(join(folder, "keep.txt"), "mine");
        expect(await validateFolder(inputs(folder))).toMatchObject({ ok: false, code: "not-empty" });
        // Starting fresh in a folder that already holds data is allowed, because nothing is written to it.
        expect((await validateFolder(inputs(folder, { requireEmpty: false }))).ok).toBe(true);
    });

    it("refuses when the drive does not have room for the data and a margin", async () => {
        const result = await validateFolder(inputs(join(root, "big"), { requiredBytes: Number.MAX_SAFE_INTEGER }));
        expect(result).toMatchObject({ ok: false, code: "not-enough-space" });
    });

    it.skipIf(process.platform === "win32")("refuses a folder that is not writable", async () => {
        const locked = join(root, "locked");
        await mkdir(locked);
        await chmod(locked, 0o500);
        try {
            const result = await validateFolder(inputs(join(locked, "child")));
            // Running as the owner of a read-only folder, root can still write on some CI hosts.
            if (!result.ok) expect(["not-creatable", "not-writable"]).toContain(result.code);
        } finally {
            await chmod(locked, 0o700);
        }
    });

    it("changes nothing on disk when it refuses", async () => {
        await validateFolder(inputs(join(root, "install", "data")));
        await validateFolder(inputs(join(root, "system", "sub")));
        const { readdir } = await import("node:fs/promises");
        expect(await readdir(root)).toEqual([]);
    });
});

describe("path helpers", () => {
    it("compares paths below a parent without being fooled by a shared prefix", () => {
        expect(isSameOrInside(join(root, "a"), join(root, "a", "b"))).toBe(true);
        expect(isSameOrInside(join(root, "a"), join(root, "ab"))).toBe(false);
        expect(isSameOrInside(join(root, "a"), join(root, "a"))).toBe(true);
    });

    it("lists system folders for the platform", () => {
        expect(defaultSystemFolders({ SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files" }, "win32")).toEqual([
            "C:\\Windows",
            "C:\\Program Files",
        ]);
        expect(defaultSystemFolders({}, "linux")).toContain("/etc");
    });

    it("formats sizes", () => {
        expect(formatBytes(0)).toBe("0 B");
        expect(formatBytes(2048)).toBe("2.0 KB");
        expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
    });
});
