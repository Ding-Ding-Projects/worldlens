import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
export type BuildAction = "build" | "build-run" | "installer";
export interface BuildRequest { readonly checkout: string; readonly action: BuildAction; readonly candidate?: string }
export interface BuildSource {
    readonly checkout: string;
    readonly repositoryId: string;
    readonly checkoutId: string;
    readonly commit: string;
    readonly indexTree: string;
    readonly inputsDigest: string;
}
export interface BuildPlan {
    readonly source: BuildSource;
    readonly action: BuildAction;
    readonly script: "build.bat" | "build-installer.bat";
    readonly args: readonly string[];
}
export type GitQuery = (cwd: string, args: readonly string[]) => Promise<string>;

/** Do not inherit command injection, alternate repository or runtime-loader variables. */
export function buildEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const allowed = new Set([
        "PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "APPDATA",
        "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA",
        "HOMEDRIVE", "HOMEPATH", "PATHEXT", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS",
    ]);
    return Object.fromEntries(Object.entries(input).filter(([key, value]) => allowed.has(key.toUpperCase()) && value !== undefined));
}

const queryGit: GitQuery = async (cwd, args) => {
    const result = await execute("git", ["-C", cwd, ...args], {
        encoding: "utf8", windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024,
        env: buildEnvironment(process.env),
    });
    return result.stdout.trim();
};

function identity(value: string, platform: string): string {
    return platform === "win32" ? value.toLowerCase() : value;
}

/** Select a root, not a subdirectory; all executable inputs must remain inside that root. */
export async function inspectBuildSource(checkout: string, options: { git?: GitQuery; platform?: string } = {}): Promise<BuildSource> {
    if (typeof checkout !== "string" || !path.isAbsolute(checkout) || /[\r\n\0]/u.test(checkout))
        throw new Error("Select an absolute repository root.");
    const platform = options.platform ?? process.platform;
    const root = await realpath(checkout);
    if (!(await stat(root)).isDirectory()) throw new Error("The selected source is not a directory.");
    const git = options.git ?? queryGit;
    const top = await realpath(await git(root, ["rev-parse", "--show-toplevel"]));
    if (identity(top, platform) !== identity(root, platform)) throw new Error("Select the repository root, not a nested directory.");
    const common = await realpath(path.resolve(root, await git(root, ["rev-parse", "--git-common-dir"])));
    const admin = await realpath(path.resolve(root, await git(root, ["rev-parse", "--git-dir"])));
    const commit = await git(root, ["rev-parse", "--verify", "HEAD"]);
    const indexTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
    if (!/^[a-f0-9]{40,64}$/u.test(commit) || !/^[a-f0-9]{40,64}$/u.test(indexTree))
        throw new Error("Source identity could not be verified.");
    // Ordinary status intentionally trusts these index flags and can hide changed bytes.
    // Include initialized submodules and fail closed for sparse or assume-unchanged input.
    const indexFlags = await git(root, ["ls-files", "-v", "-z", "--recurse-submodules"]);
    const entries = indexFlags.split("\0").filter(Boolean);
    if (entries.length === 0 || entries.some((entry) => !entry.startsWith("H ")))
        throw new Error("Hidden index states or unsupported index entries prevent source verification. Remove assume-unchanged/skip-worktree flags and resolve the index before building.");
    if (await git(root, ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"]))
        throw new Error("Save all source changes before starting a candidate-bound build.");
    const digest = createHash("sha256");
    for (const relative of ["build.bat", "build-installer.bat", "design/package.json"]) {
        const requested = path.join(root, relative);
        const resolved = await realpath(requested);
        if (identity(resolved, platform) !== identity(requested, platform)) throw new Error("Build inputs must be regular files inside the selected root.");
        const info = await stat(resolved);
        if (!info.isFile() || info.size === 0 || info.size > 1024 * 1024) throw new Error("A required build input is missing or invalid.");
        const bytes = await readFile(resolved);
        if (relative.endsWith("package.json") && (JSON.parse(bytes.toString("utf8")) as { name?: unknown }).name !== "worldlens")
            throw new Error("The selected workspace is not Worldlens.");
        digest.update(relative).update("\0").update(bytes).update("\0");
    }
    return Object.freeze({ checkout: root, repositoryId: identity(common, platform), checkoutId: identity(admin, platform), commit, indexTree, inputsDigest: digest.digest("hex") });
}

export function actionArguments(action: unknown, candidate?: unknown): { script: BuildPlan["script"]; args: readonly string[] } {
    if (action !== "build" && action !== "build-run" && action !== "installer") throw new Error("Unsupported build action.");
    if (action === "installer") {
        if (typeof candidate !== "string" || !/^[1-9][0-9]{0,8}$/u.test(candidate)) throw new Error("A positive release ordinal without leading zero is required.");
        return { script: "build-installer.bat", args: Object.freeze(["--candidate", candidate, "/s"]) };
    }
    if (candidate !== undefined) throw new Error("Only installer builds accept a release ordinal.");
    return { script: "build.bat", args: Object.freeze([action === "build" ? "/s" : "--run"]) };
}

export async function prepareBuild(request: BuildRequest, options: { platform?: string; inspect?: typeof inspectBuildSource } = {}): Promise<BuildPlan> {
    if ((options.platform ?? process.platform) !== "win32") throw new Error("Companion builds require Windows; no build was started.");
    const action = actionArguments(request.action, request.candidate);
    const source = await (options.inspect ?? inspectBuildSource)(request.checkout);
    return Object.freeze({ source: Object.freeze({ ...source }), action: request.action, ...action });
}
