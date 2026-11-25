import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyTree, hashFile, measureTree, treeIsContainedIn, type MoveProgress } from "./move.js";

let root = "";
let source = "";
beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "wl-move-"));
    source = join(root, "source");
    await mkdir(join(source, "nested", "deep"), { recursive: true });
    await mkdir(join(source, "Cache"), { recursive: true });
    await writeFile(join(source, "settings.json"), '{"a":1}');
    await writeFile(join(source, "nested", "one.bin"), Buffer.from([1, 2, 3, 4]));
    await writeFile(join(source, "nested", "deep", "two.txt"), "two");
    await writeFile(join(source, "Cache", "junk"), "volatile");
});
afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

const skipCache = (path: string) => path.split("/").includes("Cache");

async function listing(folder: string): Promise<string[]> {
    const names = await readdir(folder, { recursive: true });
    return names.map((name) => String(name).replace(/\\/g, "/")).sort();
}

describe("copying a folder tree", () => {
    it("copies every file, verifies each by hash, and leaves the source as it was", async () => {
        const target = join(root, "target");
        const before = await listing(source);
        const result = await copyTree({ source, target, skip: skipCache });
        expect(result).toMatchObject({ ok: true, verified: true, copiedFiles: 3, cancelled: false });
        expect(await readFile(join(target, "nested", "deep", "two.txt"), "utf8")).toBe("two");
        expect(await hashFile(join(target, "nested", "one.bin"))).toBe(await hashFile(join(source, "nested", "one.bin")));
        expect(await listing(source)).toEqual(before);
    });

    it("leaves out skipped entries and names them", async () => {
        const target = join(root, "target");
        const result = await copyTree({ source, target, skip: skipCache });
        expect(await listing(target)).not.toContain("Cache");
        expect(result.skipped.map((entry) => entry.path)).toContain("Cache");
    });

    it("reports progress through measuring, copying, verifying and finished", async () => {
        const phases = new Set<string>();
        await copyTree({
            source,
            target: join(root, "target"),
            skip: skipCache,
            onProgress: (progress: MoveProgress) => phases.add(progress.phase),
        });
        expect([...phases]).toEqual(["measuring", "copying", "verifying", "finished"]);
    });

    it("never overwrites a file that is already in the target, and removes only what it created", async () => {
        const target = join(root, "target");
        await mkdir(target);
        await writeFile(join(target, "settings.json"), "PRECIOUS");
        const result = await copyTree({ source, target, skip: skipCache });
        expect(result.ok).toBe(false);
        expect(result.rolledBack).toBe(true);
        // The pre-existing file is exactly as it was, and nothing else this run made is left.
        expect(await readFile(join(target, "settings.json"), "utf8")).toBe("PRECIOUS");
        expect(await listing(target)).toEqual(["settings.json"]);
    });

    it("cancelling leaves the target as it was, including the folders it created", async () => {
        const target = join(root, "fresh", "target");
        const controller = new AbortController();
        const result = await copyTree({
            source,
            target,
            skip: skipCache,
            signal: controller.signal,
            onProgress: (progress) => {
                if (progress.phase === "copying" && progress.filesDone >= 1) controller.abort();
            },
        });
        expect(result.cancelled).toBe(true);
        expect(result.ok).toBe(false);
        await expect(readdir(join(root, "fresh"))).rejects.toMatchObject({ code: "ENOENT" });
        // The source is untouched by the cancel.
        expect(await readFile(join(source, "settings.json"), "utf8")).toBe('{"a":1}');
    });

    it("measures what a copy would move, without the skipped entries", async () => {
        expect(await measureTree(source, skipCache)).toBe(7 + 4 + 3);
        expect(await measureTree(join(root, "missing"))).toBe(0);
    });

    it("proves an old folder is contained in the new one, and notices when it is not", async () => {
        const target = join(root, "target");
        await copyTree({ source, target, skip: skipCache });
        expect((await treeIsContainedIn(source, target, skipCache)).contained).toBe(true);
        await writeFile(join(target, "nested", "one.bin"), Buffer.from([9, 9, 9, 9]));
        const proof = await treeIsContainedIn(source, target, skipCache);
        expect(proof).toEqual({ contained: false, firstMismatch: "nested/one.bin" });
    });
});
