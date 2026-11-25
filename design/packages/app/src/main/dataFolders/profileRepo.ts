/**
 * The profile folder as a Git repository: initialise it, keep its ignore rules current, and
 * record settled changes as commits.
 *
 * Everything here answers with a value and never rejects. A history problem (no Git on the
 * machine, a locked file, a failed commit) is reported as a result for the interface to show,
 * and it never reaches the code that wrote the setting or the file in the first place.
 *
 * Credential files are recorded in this local repository exactly as they sit on disk: they
 * are never opened, decrypted or copied into another form. What is left out of what is sent
 * to a remote is decided in `mirror.ts`, not here.
 */

import { lstat, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
    BASE_CONFIG,
    isolationEnv,
    probeGit,
    type GitAvailability,
    type GitResult,
    type GitRunner,
} from "../history/git.js";
import {
    REBUILDABLE_DIRECTORIES,
    VOLATILE_DIRECTORY_NAMES,
    isVolatilePath,
    mergeManagedIgnore,
} from "./profileEntries.js";

export const PROFILE_AUTHOR_NAME = "WorldLens";
export const PROFILE_AUTHOR_EMAIL = "worldlens@localhost";

/** Files larger than this are left out of history, so one download never bloats it. */
export const LARGE_FILE_BYTES = 25 * 1024 * 1024;

/** The most directory entries one scan will look at, so a huge folder cannot stall start-up. */
const MAX_SCANNED_ENTRIES = 200_000;

const IDENTITY_CONFIG: readonly string[] = [
    ...BASE_CONFIG,
    "-c",
    `user.name=${PROFILE_AUTHOR_NAME}`,
    "-c",
    `user.email=${PROFILE_AUTHOR_EMAIL}`,
];

export function profileGitArgs(args: readonly string[]): readonly string[] {
    return [...IDENTITY_CONFIG, ...args];
}

/** Runs one Git command in the profile folder under the application's isolated configuration. */
export function profileGit(
    run: GitRunner,
    root: string,
    args: readonly string[],
    extra: { readonly env?: Readonly<Record<string, string>>; readonly stdin?: string } = {},
): Promise<GitResult> {
    return run(profileGitArgs(args), {
        cwd: root,
        env: { ...isolationEnv(root), ...(extra.env ?? {}) },
        ...(extra.stdin === undefined ? {} : { stdin: extra.stdin }),
    });
}

export interface ProfileScan {
    /** Forward-slash paths of folders that are Git repositories of their own. */
    readonly nestedRepositories: readonly string[];
    /** Forward-slash paths of files over {@link LARGE_FILE_BYTES}. */
    readonly largeFiles: readonly string[];
    readonly truncated: boolean;
}

/** One walk of the profile folder that finds what the ignore rules need to know about. */
export async function scanProfile(root: string): Promise<ProfileScan> {
    const nested: string[] = [];
    const large: string[] = [];
    let seen = 0;
    let truncated = false;

    async function walk(directory: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (seen >= MAX_SCANNED_ENTRIES) {
                truncated = true;
                return;
            }
            seen += 1;
            const absolute = join(directory, entry.name);
            const rel = relative(root, absolute).split(sep).join("/");
            if (entry.name === ".git") continue;
            if (isVolatilePath(rel) || VOLATILE_DIRECTORY_NAMES.includes(entry.name)) continue;
            if (entry.isDirectory()) {
                const topLevel = rel.split("/")[0] as string;
                if (REBUILDABLE_DIRECTORIES.includes(topLevel)) continue;
                const hasGit = await lstat(join(absolute, ".git")).then(
                    () => true,
                    () => false,
                );
                if (hasGit) {
                    nested.push(rel);
                    continue;
                }
                await walk(absolute);
            } else if (entry.isFile()) {
                const info = await stat(absolute).catch(() => null);
                if (info !== null && info.size > LARGE_FILE_BYTES && !rel.endsWith(".jar")) large.push(rel);
            }
        }
    }

    await walk(root);
    return { nestedRepositories: nested.sort(), largeFiles: large.sort(), truncated };
}

export type EnsureResult =
    | {
          readonly ready: true;
          readonly git: GitAvailability;
          readonly initialised: boolean;
          readonly scan: ProfileScan;
      }
    | { readonly ready: false; readonly git: GitAvailability; readonly reason: string };

/**
 * Makes the profile folder a Git repository (reusing one that is already there, with its
 * history untouched) and writes the managed ignore rules beside whatever else the
 * `.gitignore` already says.
 */
export async function ensureProfileRepository(run: GitRunner, root: string): Promise<EnsureResult> {
    const git = await probeGit(run, root);
    if (!git.available) {
        return {
            ready: false,
            git,
            reason:
                git.reason ??
                "Git is not available, so the profile folder keeps no history. Everything else works as usual.",
        };
    }
    try {
        const existing = await lstat(join(root, ".git")).then(
            () => true,
            () => false,
        );
        let initialised = false;
        if (!existing) {
            const init = await profileGit(run, root, ["init", "--quiet"]);
            if (!init.ok) {
                return { ready: false, git, reason: "Git could not start a repository in the profile folder." };
            }
            // `init -b` needs a newer Git than this has to assume.
            await profileGit(run, root, ["symbolic-ref", "HEAD", "refs/heads/main"]);
            initialised = true;
        }
        await profileGit(run, root, ["config", "user.name", PROFILE_AUTHOR_NAME]);
        await profileGit(run, root, ["config", "user.email", PROFILE_AUTHOR_EMAIL]);
        await profileGit(run, root, ["config", "core.autocrlf", "false"]);
        const scan = await scanProfile(root);
        await writeIgnoreFile(root, scan);
        return { ready: true, git, initialised, scan };
    } catch (error) {
        return {
            ready: false,
            git,
            reason: `The profile history could not be prepared (${(error as NodeJS.ErrnoException).code ?? "unknown"}).`,
        };
    }
}

async function writeIgnoreFile(root: string, scan: ProfileScan): Promise<void> {
    const file = join(root, ".gitignore");
    const current = await readFile(file, "utf8").catch(() => null);
    const next = mergeManagedIgnore(current, [...scan.nestedRepositories]);
    const withLarge =
        scan.largeFiles.length === 0
            ? next
            : next.replace(
                  /# <<< Worldlens managed ignore rules <<</,
                  (end) =>
                      `# Files over ${Math.round(LARGE_FILE_BYTES / 1024 / 1024)} MB.\n${scan.largeFiles
                          .map((path) => `/${path}`)
                          .join("\n")}\n${end}`,
              );
    if (withLarge !== current) await writeFile(file, withLarge, "utf8");
}

export interface CommitOutcome {
    readonly committed: boolean;
    readonly sha: string | null;
    readonly subject: string | null;
    /** Why nothing was committed, in a sentence. Null when a commit was made. */
    readonly reason: string | null;
    /** True when the reason is a failure rather than "nothing changed". */
    readonly failed: boolean;
}

const NOTHING_CHANGED: CommitOutcome = {
    committed: false,
    sha: null,
    subject: null,
    reason: "Nothing has changed since the last saved version.",
    failed: false,
};

/** Describes staged changes in one line: what changed, not that something did. */
export function describeStagedChanges(nameStatus: string): string {
    const lines = nameStatus
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== "");
    if (lines.length === 0) return "Update profile";
    const names = lines.map((line) => {
        const parts = line.split("\t");
        return (parts[parts.length - 1] ?? line).trim();
    });
    const added = lines.filter((line) => line.startsWith("A")).length;
    const removed = lines.filter((line) => line.startsWith("D")).length;
    const shown = names.slice(0, 4).join(", ");
    const more = names.length > 4 ? ` and ${names.length - 4} more` : "";
    const verb =
        added === lines.length ? "Add" : removed === lines.length ? "Remove" : "Update";
    return `${verb} profile files: ${shown}${more}`;
}

/** Records the profile's settled changes as one commit, or says why not. Never rejects. */
export async function commitSettledChanges(run: GitRunner, root: string): Promise<CommitOutcome> {
    try {
        const prepared = await ensureProfileRepository(run, root);
        if (!prepared.ready) {
            return { committed: false, sha: null, subject: null, reason: prepared.reason, failed: true };
        }
        // While the application is running, the browser engine holds some files open
        // exclusively. Without `--ignore-errors`, one such file makes `add` abort and stage
        // nothing at all, which then reads as "nothing changed". With it, every readable file
        // is staged, so the staged result decides, not the exit code.
        await profileGit(run, root, ["add", "-A", "--ignore-errors"]);
        const names = await profileGit(run, root, ["diff", "--cached", "--name-status"]);
        if (!names.ok) {
            return {
                committed: false,
                sha: null,
                subject: null,
                reason: "The staged changes could not be read.",
                failed: true,
            };
        }
        if (names.stdout.trim() === "") return NOTHING_CHANGED;
        const subject = describeStagedChanges(names.stdout);
        const commit = await profileGit(run, root, ["commit", "--no-verify", "-q", "-m", subject]);
        if (!commit.ok) {
            return {
                committed: false,
                sha: null,
                subject,
                reason: `Git did not save the version (${commit.stderr.trim().split(/\r?\n/)[0] ?? "unknown reason"}).`,
                failed: true,
            };
        }
        const head = await profileGit(run, root, ["rev-parse", "HEAD"]);
        return { committed: true, sha: head.ok ? head.stdout.trim() : null, subject, reason: null, failed: false };
    } catch (error) {
        return {
            committed: false,
            sha: null,
            subject: null,
            reason: `The history write failed (${(error as NodeJS.ErrnoException).code ?? "unknown"}).`,
            failed: true,
        };
    }
}

export interface LastVersion {
    readonly sha: string;
    readonly at: string;
    readonly subject: string;
}

export async function lastProfileVersion(run: GitRunner, root: string): Promise<LastVersion | null> {
    const log = await profileGit(run, root, ["log", "-1", "--format=%H%x1f%cI%x1f%s"]);
    if (!log.ok) return null;
    const [sha, at, subject] = log.stdout.trim().split("\u001f");
    if (sha === undefined || at === undefined || subject === undefined || sha === "") return null;
    return { sha, at, subject };
}

export async function profileHeadSha(run: GitRunner, root: string): Promise<string | null> {
    const head = await profileGit(run, root, ["rev-parse", "--verify", "-q", "HEAD"]);
    return head.ok && head.stdout.trim() !== "" ? head.stdout.trim() : null;
}
