/**
 * A local Git repository per project, so every NBT save is a commit that can be listed,
 * compared and restored.
 *
 * ## Why a mirror and not the world folder itself
 *
 * A world is gigabytes of region files. The repository here lives under the application's
 * data directory, outside the world, and holds only copies of the files the editor has
 * saved (and, for a region chunk, the chunk's own decompressed NBT). The world folder
 * never gains a `.git` directory, nothing the game or a render tool scans changes, and
 * deleting the history is deleting one folder. This is the same separation
 * `worldrepo/` keeps between a world and the repository that carries it to GitHub; that
 * module publishes a world, this one records edits to it, so they share the process runner
 * and the `git` command rather than the repository.
 *
 * ## What a commit holds
 *
 * - A whole `.dat` or `.nbt` file is stored as it is on disk, compression and all, so a
 *   restore writes back exactly the bytes that were saved.
 * - A region chunk is stored as `<region>.chunks/<x>.<z>.nbt`, the chunk's uncompressed NBT.
 *   A region file is megabytes of other chunks nobody edited; diffing and restoring one chunk
 *   should not drag them along.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

/** The same `git` executable every other module here runs; kept local so this folder loads without the pages publisher. */
const GIT_COMMAND = "git";

export interface ProcessResult {
    /** False when the executable could not be started at all, such as Git not being installed. */
    readonly started: boolean;
    readonly code: number | null;
    readonly stdout: string;
    readonly stderr: string;
}

/**
 * How the Git command is run. An interface so a test can script it, in the same shape the
 * other modules' runners have; the real one spawns with an argument array and never a shell.
 */
export interface ProcessRunner {
    run(command: string, args: readonly string[]): Promise<ProcessResult>;
    /** Streams stdout into a file, for blob content that is binary. */
    runToFile(command: string, args: readonly string[], destination: string): Promise<{ started: boolean; code: number | null; stderr: string }>;
}

export function nodeProcessRunner(): ProcessRunner {
    return {
        run(command, args) {
            return new Promise<ProcessResult>((resolvePromise) => {
                const child = spawn(command, [...args], { shell: false, windowsHide: true });
                let stdout = "";
                let stderr = "";
                let started = true;
                child.stdout?.setEncoding("utf8");
                child.stderr?.setEncoding("utf8");
                child.stdout?.on("data", (chunk: string) => (stdout += chunk));
                child.stderr?.on("data", (chunk: string) => (stderr += chunk));
                child.on("error", (error: NodeJS.ErrnoException) => {
                    started = error.code !== "ENOENT";
                    resolvePromise({ started, code: null, stdout, stderr: stderr + error.message });
                });
                child.on("close", (code) => resolvePromise({ started, code, stdout, stderr }));
                child.stdin?.end();
            });
        },
        async runToFile(command, args, destination) {
            await mkdir(dirname(destination), { recursive: true });
            const child = spawn(command, [...args], { shell: false, windowsHide: true });
            let stderr = "";
            child.stderr?.setEncoding("utf8");
            child.stderr?.on("data", (chunk: string) => (stderr += chunk));
            child.stdin?.end();
            const closed = new Promise<{ started: boolean; code: number | null; stderr: string }>((resolvePromise) => {
                child.on("error", (error: NodeJS.ErrnoException) => resolvePromise({ started: error.code !== "ENOENT", code: null, stderr: stderr + error.message }));
                child.on("close", (code) => resolvePromise({ started: true, code, stderr }));
            });
            if (child.stdout === null) return closed;
            const written = pipeline(child.stdout, createWriteStream(destination)).then(
                () => null,
                (error: Error) => error,
            );
            const result = await closed;
            const failure = await written;
            return failure === null ? result : { started: result.started, code: result.code ?? 1, stderr: `${result.stderr}${failure.message}` };
        },
    };
}

export interface HistoryCommit {
    readonly sha: string;
    readonly shortSha: string;
    /** Seconds since the epoch. */
    readonly time: number;
    readonly message: string;
    /** History paths this commit touched. */
    readonly files: readonly string[];
}

export class HistoryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "HistoryError";
    }
}

const COMMIT_IDENTITY = ["-c", "user.name=Worldlens NBT editor", "-c", "user.email=nbt-history@worldlens.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "core.safecrlf=false"];

/** A stable folder name for a project directory. */
export function projectKey(projectDir: string): string {
    const normal = process.platform === "win32" ? projectDir.toLowerCase() : projectDir;
    return createHash("sha1").update(normal.replace(/[\\/]+$/u, "")).digest("hex").slice(0, 16);
}

/** The path a chunk's NBT is stored under in history. */
export function chunkHistoryPath(regionRelativePath: string, x: number, z: number): string {
    return `${regionRelativePath}.chunks/${x}.${z}.nbt`;
}

export interface ProjectHistoryOptions {
    /** Where all project histories live, normally under the application's data directory. */
    readonly root: string;
    readonly runner?: ProcessRunner;
}

export class ProjectHistory {
    private readonly runner: ProcessRunner;
    private readonly queues = new Map<string, Promise<unknown>>();

    constructor(private readonly options: ProjectHistoryOptions) {
        this.runner = options.runner ?? nodeProcessRunner();
    }

    keyDirectory(projectDir: string): string {
        return join(this.options.root, projectKey(projectDir));
    }

    repositoryDirectory(projectDir: string): string {
        return join(this.keyDirectory(projectDir), "repo");
    }

    backupDirectory(projectDir: string): string {
        return join(this.keyDirectory(projectDir), "backups");
    }

    /** Runs git operations for one project one at a time, so two saves cannot interleave. */
    private serialised<T>(projectDir: string, work: () => Promise<T>): Promise<T> {
        const key = projectKey(projectDir);
        const previous = this.queues.get(key) ?? Promise.resolve();
        const next = previous.then(work, work);
        this.queues.set(
            key,
            next.catch(() => undefined),
        );
        return next;
    }

    private async git(projectDir: string, args: readonly string[]): Promise<ProcessResult> {
        const result = await this.runner.run(GIT_COMMAND, ["-C", this.repositoryDirectory(projectDir), ...COMMIT_IDENTITY, ...args]);
        if (!result.started) throw new HistoryError("Git is not installed, so this project's history cannot be recorded. Install Git and try again.");
        return result;
    }

    private async ensure(projectDir: string): Promise<void> {
        const repo = this.repositoryDirectory(projectDir);
        const head = await stat(join(repo, ".git", "HEAD")).then(
            () => true,
            () => false,
        );
        if (head) return;
        await mkdir(repo, { recursive: true });
        const init = await this.runner.run(GIT_COMMAND, ["init", "-q", repo]);
        if (!init.started) throw new HistoryError("Git is not installed, so this project's history cannot be recorded. Install Git and try again.");
        if (init.code !== 0) throw new HistoryError(`Could not start this project's history: ${init.stderr.trim() || init.stdout.trim()}`);
        await writeFile(join(this.keyDirectory(projectDir), "project.json"), `${JSON.stringify({ projectDir }, null, 2)}\n`, "utf8");
    }

    /** True once `historyPath` has at least one commit. */
    async hasHistory(projectDir: string, historyPath: string): Promise<boolean> {
        return this.serialised(projectDir, async () => {
            const repo = this.repositoryDirectory(projectDir);
            const exists = await stat(join(repo, ".git", "HEAD")).then(
                () => true,
                () => false,
            );
            if (!exists) return false;
            const result = await this.git(projectDir, ["log", "-1", "--format=%H", "--", historyPath]);
            return result.code === 0 && result.stdout.trim().length > 0;
        });
    }

    /**
     * Records `bytes` as the new content of `historyPath`.
     * Returns null when the content is identical to what is already recorded.
     */
    async record(projectDir: string, historyPath: string, bytes: Uint8Array, message: string): Promise<HistoryCommit | null> {
        return this.serialised(projectDir, async () => {
            await this.ensure(projectDir);
            const target = join(this.repositoryDirectory(projectDir), ...historyPath.split("/"));
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, bytes);
            const added = await this.git(projectDir, ["add", "--", historyPath]);
            if (added.code !== 0) throw new HistoryError(`Could not stage the file for history: ${added.stderr.trim()}`);
            const committed = await this.git(projectDir, ["commit", "-q", "-m", message, "--", historyPath]);
            if (committed.code !== 0) {
                if (/nothing (added )?to commit|no changes added/iu.test(`${committed.stdout}${committed.stderr}`)) return null;
                throw new HistoryError(`Could not record the change: ${committed.stderr.trim() || committed.stdout.trim()}`);
            }
            const head = await this.git(projectDir, ["log", "-1", "--format=%H%x1f%h%x1f%at%x1f%s"]);
            const parsed = parseHeader(head.stdout.trim());
            if (parsed === null) throw new HistoryError("The change was recorded but its commit could not be read back.");
            return { ...parsed, files: [historyPath] };
        });
    }

    /** Newest first. With a path, only commits that touched it. */
    async list(projectDir: string, historyPath: string | null, limit = 200): Promise<HistoryCommit[]> {
        return this.serialised(projectDir, async () => {
            const exists = await stat(join(this.repositoryDirectory(projectDir), ".git", "HEAD")).then(
                () => true,
                () => false,
            );
            if (!exists) return [];
            const args = ["log", `-n${Math.max(1, Math.min(limit, 1000))}`, "--format=%x1e%H%x1f%h%x1f%at%x1f%s", "--name-only"];
            if (historyPath !== null) args.push("--", historyPath);
            const result = await this.git(projectDir, args);
            if (result.code !== 0) return [];
            const commits: HistoryCommit[] = [];
            for (const record of result.stdout.split("\u001e")) {
                if (record.trim() === "") continue;
                const lines = record.split(/\r?\n/u);
                const parsed = parseHeader(lines[0] ?? "");
                if (parsed === null) continue;
                commits.push({ ...parsed, files: lines.slice(1).map((l) => l.trim()).filter((l) => l.length > 0) });
            }
            return commits;
        });
    }

    /** The bytes `historyPath` had at `sha`. */
    async read(projectDir: string, sha: string, historyPath: string): Promise<Uint8Array> {
        if (!/^[0-9a-f]{7,40}$/u.test(sha)) throw new HistoryError("That is not a commit name.");
        return this.serialised(projectDir, async () => {
            const scratch = join(this.keyDirectory(projectDir), "scratch", `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
            try {
                const result = await this.runner.runToFile(
                    GIT_COMMAND,
                    ["-C", this.repositoryDirectory(projectDir), "show", `${sha}:${historyPath}`],
                    scratch,
                );
                if (!result.started) throw new HistoryError("Git is not installed, so this version cannot be read.");
                if (result.code !== 0) throw new HistoryError(`That version could not be read: ${result.stderr.trim()}`);
                return new Uint8Array(await readFile(scratch));
            } finally {
                await rm(scratch, { force: true });
            }
        });
    }

    /** The commit before `sha` for the same path, or null when `sha` is the first. */
    async parentVersion(projectDir: string, sha: string, historyPath: string): Promise<HistoryCommit | null> {
        const all = await this.list(projectDir, historyPath, 1000);
        const at = all.findIndex((c) => c.sha === sha || c.sha.startsWith(sha));
        return at >= 0 ? (all[at + 1] ?? null) : null;
    }
}

function parseHeader(line: string): Omit<HistoryCommit, "files"> | null {
    const parts = line.split("\u001f");
    if (parts.length < 4 || parts[0] === undefined || parts[0].length < 7) return null;
    return { sha: parts[0], shortSha: parts[1] ?? parts[0].slice(0, 7), time: Number(parts[2]) || 0, message: parts.slice(3).join("\u001f") };
}
