import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    EMPTY_POINTER,
    parsePointer,
    pointerFilePath,
    readPointer,
    readPointerSync,
    resolveProfileFolder,
    writePointer,
    writePointerSync,
} from "./pointer.js";

let root = "";
beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "wl-pointer-"));
});
afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("the data folder pointer", () => {
    it("sits beside the default profile folder, not inside it", () => {
        const file = pointerFilePath(root, "Worldlens");
        expect(file).toBe(join(root, "Worldlens.data-folders.json"));
    });

    it("reads a missing file as 'use the default', without calling it a problem", async () => {
        const readout = await readPointer(pointerFilePath(root, "Worldlens"));
        expect(readout.pointer).toEqual(EMPTY_POINTER);
        expect(readout.invalid).toBe(false);
        expect(readPointerSync(pointerFilePath(root, "Worldlens")).invalid).toBe(false);
    });

    it("round-trips a chosen folder through the asynchronous and synchronous routes", async () => {
        const file = pointerFilePath(root, "Worldlens");
        const chosen = join(root, "elsewhere");
        await writePointer(file, { ...EMPTY_POINTER, profileFolder: chosen, previousProfileFolder: join(root, "old") });
        const asyncReadout = await readPointer(file);
        expect(asyncReadout.pointer.profileFolder).toBe(chosen);
        expect(asyncReadout.pointer.previousProfileFolder).toBe(join(root, "old"));
        writePointerSync(file, { ...EMPTY_POINTER, profileFolder: chosen });
        expect(readPointerSync(file).pointer.profileFolder).toBe(chosen);
    });

    it.each([
        ["text that is not JSON", "not json {"],
        ["JSON that is not an object", "[1,2]"],
        ["an unknown version", JSON.stringify({ version: 9, profileFolder: null })],
        ["a relative folder", JSON.stringify({ version: 1, profileFolder: "relative/path" })],
        ["a folder that is not text", JSON.stringify({ version: 1, profileFolder: 42 })],
    ])("falls back to the default for %s, and says why", async (_name, text) => {
        const file = pointerFilePath(root, "Worldlens");
        await writeFile(file, text, "utf8");
        const readout = await readPointer(file);
        expect(readout.invalid).toBe(true);
        expect(readout.problem).not.toBeNull();
        expect(readout.pointer).toEqual(EMPTY_POINTER);
        expect(readPointerSync(file).invalid).toBe(true);
    });

    it("leaves a bad pointer file on disk instead of deleting it", async () => {
        const file = pointerFilePath(root, "Worldlens");
        await writeFile(file, "garbage", "utf8");
        await readPointer(file);
        expect(readPointerSync(file).invalid).toBe(true);
    });

    it("parses directly from text", () => {
        expect(parsePointer(JSON.stringify({ version: 1, profileFolder: null })).invalid).toBe(false);
    });
});

describe("choosing the profile folder for a launch", () => {
    const defaultFolder = () => join(root, "Worldlens");

    it("uses the default when nothing is chosen", () => {
        const resolved = resolveProfileFolder({
            defaultFolder: defaultFolder(),
            readout: { pointer: EMPTY_POINTER, invalid: false, problem: null },
            isDirectory: () => true,
        });
        expect(resolved.usingDefault).toBe(true);
        expect(resolved.folder).toBe(defaultFolder());
    });

    it("uses the chosen folder when it can be reached", async () => {
        const chosen = join(root, "chosen");
        await mkdir(chosen);
        const resolved = resolveProfileFolder({
            defaultFolder: defaultFolder(),
            readout: { pointer: { ...EMPTY_POINTER, profileFolder: chosen }, invalid: false, problem: null },
            isDirectory: (path) => path === chosen,
        });
        expect(resolved.folder).toBe(chosen);
        expect(resolved.usingDefault).toBe(false);
        expect(resolved.unreachable).toBeNull();
    });

    it("reports a chosen folder that has gone missing instead of silently replacing it", () => {
        const chosen = join(root, "gone");
        const resolved = resolveProfileFolder({
            defaultFolder: defaultFolder(),
            readout: { pointer: { ...EMPTY_POINTER, profileFolder: chosen }, invalid: false, problem: null },
            isDirectory: () => false,
        });
        expect(resolved.folder).toBe(defaultFolder());
        expect(resolved.unreachable).toBe(chosen);
    });

    it("carries a bad pointer's problem through to the status", () => {
        const resolved = resolveProfileFolder({
            defaultFolder: defaultFolder(),
            readout: { pointer: EMPTY_POINTER, invalid: true, problem: "bad pointer" },
            isDirectory: () => true,
        });
        expect(resolved.pointerProblem).toBe("bad pointer");
    });
});
