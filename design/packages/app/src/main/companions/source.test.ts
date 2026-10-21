import { mkdtemp, mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { actionArguments, buildEnvironment, inspectBuildSource, prepareBuild } from "./source.js";
import type { GitQuery } from "./source.js";
import { batchCommand } from "./process.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
async function fixture(dirty = "") {
    const directory = await mkdtemp(path.join(tmpdir(), "companion-source-"));
    directories.push(directory);
    const root = await realpath(directory);
    await mkdir(path.join(root, ".git"));
    await mkdir(path.join(root, "design"));
    await writeFile(path.join(root, "build.bat"), "@echo off\r\nexit /b 0\r\n");
    await writeFile(path.join(root, "build-installer.bat"), "@echo off\r\nexit /b 0\r\n");
    await writeFile(path.join(root, "design/package.json"), JSON.stringify({ name: "worldlens" }));
    const git: GitQuery = async (_cwd, args) => {
        if (args[0] === "ls-files") return "H build.bat\0H build-installer.bat\0H design/package.json\0";
        if (args[0] === "status") return dirty;
        if (args.includes("--show-toplevel")) return root;
        if (args.includes("--git-common-dir") || args.includes("--git-dir")) return ".git";
        return "a".repeat(40);
    };
    return { root, git };
}
describe("companion source and command boundaries", () => {
    it.each(["--assume-unchanged", "--skip-worktree"])("rejects %s even when ordinary status hides edited tracked source", async (flag) => {
        const { root, git } = await fixture();
        const run = async (args: string[]) => (await execute("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true })).stdout;
        await run(["init", "--quiet"]);
        await writeFile(path.join(root, "source.ts"), "original");
        await run(["add", "."]);
        await run(["update-index", flag, "source.ts"]);
        await writeFile(path.join(root, "source.ts"), "changed after index flag");
        const actualIndex: GitQuery = async (cwd, args) => args[0] === "ls-files" ? run([...args]) : git(cwd, args);
        await expect(inspectBuildSource(root, { git: actualIndex })).rejects.toThrow("Hidden index states");
        await writeFile(path.join(root, "source.ts"), "original");
        await run(["update-index", flag === "--assume-unchanged" ? "--no-assume-unchanged" : "--no-skip-worktree", "source.ts"]);
        await expect(inspectBuildSource(root, { git: actualIndex })).resolves.toMatchObject({ commit: "a".repeat(40) });
    });
    it("resolves source identity and binds the three input files", async () => {
        const { root, git } = await fixture();
        const first = await inspectBuildSource(root, { git });
        expect(first.commit).toBe("a".repeat(40));
        expect(first.repositoryId.toLowerCase()).toBe(path.join(root, ".git").toLowerCase());
        await writeFile(path.join(root, "build.bat"), "changed");
        expect((await inspectBuildSource(root, { git })).inputsDigest).not.toBe(first.inputsDigest);
    });
    it("rejects dirty source, a nested folder and the wrong workspace", async () => {
        const { root, git } = await fixture(" M build.bat");
        await expect(inspectBuildSource(root, { git })).rejects.toThrow("Save all source");
        const clean = await fixture();
        await expect(inspectBuildSource(path.join(clean.root, "design"), { git: clean.git })).rejects.toThrow("nested directory");
        await writeFile(path.join(clean.root, "design/package.json"), '{"name":"other"}');
        await expect(inspectBuildSource(clean.root, { git: clean.git })).rejects.toThrow("not Worldlens");
    });
    it("has only fixed batch commands and bounded positive ordinals", () => {
        expect(actionArguments("build")).toEqual({ script: "build.bat", args: ["/s"] });
        expect(actionArguments("build-run")).toEqual({ script: "build.bat", args: ["--run"] });
        expect(actionArguments("installer", "12").args).toEqual(["--candidate", "12", "/s"]);
        for (const value of ["0", "01", "1 & calc", "-1", "1\n", "1000000000", 1]) expect(() => actionArguments("installer", value)).toThrow();
        expect(() => actionArguments("arbitrary-shell")).toThrow();
        expect(() => actionArguments("build", "12")).toThrow();
    });
    it("omits loader, alternate repository, credential and build-mode overrides", () => {
        expect(buildEnvironment({ Path: "tools", SystemRoot: "C:\\Windows", TOKEN: "do-not-copy", NODE_OPTIONS: "loader", GIT_DIR: "elsewhere", SILENT: "1", RUN_AFTER_BUILD: "1" }))
            .toEqual({ Path: "tools", SystemRoot: "C:\\Windows" });
    });
    it("blocks unsupported hosts before reading the selected source", async () => {
        await expect(prepareBuild({ checkout: "/any", action: "build" }, { platform: "linux", inspect: async () => { throw new Error("must not inspect"); } })).rejects.toThrow("require Windows");
    });
    it("never inserts a selected path into the command string or accepts a forged plan", async () => {
        const { root, git } = await fixture();
        const plan = await prepareBuild({ checkout: root, action: "installer", candidate: "12" }, { platform: "win32", inspect: (input) => inspectBuildSource(input, { git }) });
        expect(batchCommand(plan)).toBe("build-installer.bat --candidate 12 /s");
        expect(Object.isFrozen(plan)).toBe(true);
        expect(Object.isFrozen(plan.args)).toBe(true);
        expect(() => batchCommand({ ...plan, args: ["--candidate", "12 & calc", "/s"] })).toThrow();
    });
});
