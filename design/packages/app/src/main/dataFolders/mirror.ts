/**
 * Sending the profile history to a remote Git repository, without credential files and
 * without ever forcing anything.
 *
 * ## How credential files stay out
 *
 * The local history records every file as it sits on disk. What is sent is a different
 * branch, `worldlens-remote`, whose commits are built from the local history with the
 * credential paths removed from each tree. Each new mirror commit has the previous mirror
 * commit as its parent, so the remote only ever sees fast-forward updates. The local history
 * itself is never rewritten and the working folder is never touched: the filtering happens in
 * a temporary index file.
 *
 * ## Why there is no force
 *
 * The push uses a plain `<local ref>:<remote ref>` refspec with no leading `+` and no force
 * option, and {@link assertNoForce} throws if any argument would turn it into one. A remote
 * that has moved on is reported as rejected, with the reason, and left alone.
 */

import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { GitResult, GitRunner } from "../history/git.js";
import { isCredentialPath } from "./profileEntries.js";
import {
    PROFILE_AUTHOR_EMAIL,
    PROFILE_AUTHOR_NAME,
    profileGit,
    profileHeadSha,
} from "./profileRepo.js";

/** The local branch that holds the filtered history. */
export const MIRROR_BRANCH = "worldlens-remote";

/** The branch name used on the remote. Never `main`, so an existing remote branch is untouched. */
export const REMOTE_BRANCH = "worldlens-profile";

/** How many paths one `git rm` receives, so a long list cannot overflow a command line. */
const REMOVE_BATCH = 150;

export type RemoteUrlProblem =
    | "empty"
    | "embedded-credentials"
    | "unsupported-scheme"
    | "http-needs-local-network";

/** The host part of a remote, or null for a local path or something unreadable. */
export function remoteHost(url: string): string | null {
    const trimmed = url.trim();
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
        try {
            const parsed = new URL(trimmed);
            return parsed.protocol === "file:" ? null : parsed.hostname.replace(/^\[|\]$/g, "");
        } catch {
            // An address that cannot be read is never treated as a local one.
            return "";
        }
    }
    // scp-like `user@host:path`. A Windows drive such as `C:\x` is a path, not a host.
    if (/^[a-z]:[\\/]/i.test(trimmed)) return null;
    return /^(?:[^@\s/]+@)?([^:\s/\\]+):/.exec(trimmed)?.[1] ?? null;
}

/** True for a host on the person's own network (or this computer), never a public host. */
export function isLanHost(host: string | null): boolean {
    if (host === null) return true; // A local path or file URL stays on this computer.
    const name = host.toLowerCase();
    if (name === "") return false;
    if (name === "localhost" || name === "::1") return true;
    if (/\.(local|lan|home\.arpa|internal)$/.test(name)) return true;
    if (!name.includes(".") && !name.includes(":")) return true;
    const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name);
    if (octets !== null) {
        const a = Number(octets[1]);
        const b = Number(octets[2]);
        return (
            a === 10 ||
            a === 127 ||
            (a === 192 && b === 168) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 169 && b === 254)
        );
    }
    return /^f[cd][0-9a-f]{2}:/.test(name) || /^fe80:/.test(name);
}

export function isLanRemote(url: string): boolean {
    return isLanHost(remoteHost(url));
}

/** Names the first thing wrong with a remote address, or null when it may be used. */
export function remoteUrlProblem(url: string): RemoteUrlProblem | null {
    const trimmed = url.trim();
    if (trimmed === "" || trimmed.includes("\0") || /[\r\n]/.test(trimmed)) return "empty";
    if (/^[a-z][a-z0-9+.-]*:\/\/[^/@\s]*:[^/@\s]*@/i.test(trimmed)) return "embedded-credentials";
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase() ?? null;
    if (scheme === null) return null; // scp-like address or a local path.
    if (scheme === "https" || scheme === "ssh" || scheme === "file") return null;
    if (scheme === "http") return isLanRemote(trimmed) ? null : "http-needs-local-network";
    return "unsupported-scheme";
}

export function describeRemoteUrlProblem(problem: RemoteUrlProblem): string {
    switch (problem) {
        case "empty":
            return "Give the address of a Git repository.";
        case "embedded-credentials":
            return "Leave the user name and password out of the address. Sign in through GitHub CLI or your Git credential manager instead.";
        case "unsupported-scheme":
            return "Use an https, ssh or file address.";
        case "http-needs-local-network":
            return "Plain http is only allowed for a host on your own network. Use https for anything else.";
    }
}

/** Throws when an argument list could force a push. A guard the tests also pin. */
export function assertNoForce(args: readonly string[]): void {
    for (const argument of args) {
        if (argument === "-f" || /^--force/.test(argument) || argument.startsWith("+")) {
            throw new Error("A forced push is never made.");
        }
        if (/^[^:]*:\+/.test(argument)) throw new Error("A forced push is never made.");
    }
}

function lines(output: string): string[] {
    return output.split("\0").filter((entry) => entry !== "");
}

export interface MirrorOutcome {
    readonly ok: boolean;
    /** The mirror tip after this call, or null when nothing could be built. */
    readonly sha: string | null;
    /** True when the mirror already matched the profile, so no new commit was made. */
    readonly unchanged: boolean;
    /** Paths left out of the tree. Always empty when credentials are included. */
    readonly excluded: readonly string[];
    readonly reason: string | null;
}

/**
 * Builds (or extends) the filtered mirror branch from the profile's current history.
 *
 * Nothing in the working folder or the real index changes.
 */
export async function updateMirrorBranch(
    run: GitRunner,
    root: string,
    options: { readonly includeCredentials: boolean },
): Promise<MirrorOutcome> {
    const head = await profileHeadSha(run, root);
    if (head === null) {
        return { ok: false, sha: null, unchanged: false, excluded: [], reason: "There are no saved versions to send yet." };
    }
    const indexFile = join(root, ".git", `worldlens-mirror-index-${randomBytes(4).toString("hex")}`);
    const env = { GIT_INDEX_FILE: indexFile };
    try {
        const read = await profileGit(run, root, ["read-tree", head], { env });
        if (!read.ok) return failure("The saved versions could not be read.");

        const listing = await profileGit(run, root, ["ls-tree", "-r", "-z", "--name-only", head]);
        if (!listing.ok) return failure("The list of saved files could not be read.");
        const excluded = options.includeCredentials ? [] : lines(listing.stdout).filter(isCredentialPath);

        for (let start = 0; start < excluded.length; start += REMOVE_BATCH) {
            const batch = excluded.slice(start, start + REMOVE_BATCH);
            const removal = await profileGit(
                run,
                root,
                ["--literal-pathspecs", "rm", "--cached", "-q", "--ignore-unmatch", "--", ...batch],
                { env },
            );
            if (!removal.ok) return failure("Credential files could not be removed from what is sent, so nothing was sent.");
        }

        const tree = await profileGit(run, root, ["write-tree"], { env });
        if (!tree.ok || tree.stdout.trim() === "") return failure("The filtered snapshot could not be built.");
        const treeId = tree.stdout.trim();

        const tip = await profileGit(run, root, ["rev-parse", "--verify", "-q", `refs/heads/${MIRROR_BRANCH}`]);
        const tipId = tip.ok && tip.stdout.trim() !== "" ? tip.stdout.trim() : null;
        if (tipId !== null) {
            const tipTree = await profileGit(run, root, ["rev-parse", `${tipId}^{tree}`]);
            if (tipTree.ok && tipTree.stdout.trim() === treeId) {
                return { ok: true, sha: tipId, unchanged: true, excluded, reason: null };
            }
        }

        const message = options.includeCredentials
            ? "Profile snapshot (credential files included by choice)"
            : "Profile snapshot (credential files left out)";
        const commit = await profileGit(
            run,
            root,
            ["commit-tree", treeId, ...(tipId === null ? [] : ["-p", tipId]), "-m", `${message}\n\nSource: ${head}`],
            {
                env: {
                    GIT_AUTHOR_NAME: PROFILE_AUTHOR_NAME,
                    GIT_AUTHOR_EMAIL: PROFILE_AUTHOR_EMAIL,
                    GIT_COMMITTER_NAME: PROFILE_AUTHOR_NAME,
                    GIT_COMMITTER_EMAIL: PROFILE_AUTHOR_EMAIL,
                },
            },
        );
        if (!commit.ok || commit.stdout.trim() === "") return failure("The filtered snapshot could not be saved.");
        const newTip = commit.stdout.trim();
        // The old value is checked, so a concurrent update cannot be overwritten.
        const update = await profileGit(run, root, [
            "update-ref",
            `refs/heads/${MIRROR_BRANCH}`,
            newTip,
            ...(tipId === null ? [""] : [tipId]),
        ]);
        if (!update.ok) return failure("The filtered snapshot could not be recorded.");
        return { ok: true, sha: newTip, unchanged: false, excluded, reason: null };
    } finally {
        await rm(indexFile, { force: true }).catch(() => undefined);
    }

    function failure(reason: string): MirrorOutcome {
        return { ok: false, sha: null, unchanged: false, excluded: [], reason };
    }
}

/** Runs Git for a push, with whatever sign-in the caller supplies. */
export type PushRunner = (args: readonly string[], cwd: string) => Promise<GitResult>;

export type PushStatus =
    | "pushed"
    | "up-to-date"
    | "rejected"
    | "refused"
    | "failed";

export interface PushOutcome {
    readonly status: PushStatus;
    readonly message: string;
    /** The mirror tip that was sent, or null when nothing was sent. */
    readonly sha: string | null;
    /** True only when the remote was read back and its branch is exactly `sha`. */
    readonly verified: boolean;
    readonly excluded: readonly string[];
}

function refused(message: string): PushOutcome {
    return { status: "refused", message, sha: null, verified: false, excluded: [] };
}

/**
 * Sends the filtered history to the remote and reads the remote back to prove it arrived.
 * Never forces, and never claims a send it did not verify.
 */
export async function pushProfile(options: {
    readonly run: GitRunner;
    readonly push: PushRunner;
    readonly root: string;
    readonly remoteUrl: string;
    readonly includeCredentials: boolean;
}): Promise<PushOutcome> {
    const problem = remoteUrlProblem(options.remoteUrl);
    if (problem !== null) return refused(describeRemoteUrlProblem(problem));
    const url = options.remoteUrl.trim();
    if (options.includeCredentials && !isLanRemote(url)) {
        return refused(
            "Credential files are only sent to a Git server on your own network. Turn that choice off, or use a local server.",
        );
    }
    if (!isAbsolute(options.root)) return refused("The profile folder is not a full path.");

    const mirror = await updateMirrorBranch(options.run, options.root, {
        includeCredentials: options.includeCredentials,
    });
    if (!mirror.ok || mirror.sha === null) {
        return { status: "failed", message: mirror.reason ?? "Nothing could be prepared to send.", sha: null, verified: false, excluded: [] };
    }

    const remoteRef = `refs/heads/${REMOTE_BRANCH}`;
    const before = await options.push(["ls-remote", url, remoteRef], options.root);
    if (before.ok && before.stdout.trim().split(/\s+/)[0] === mirror.sha) {
        return {
            status: "up-to-date",
            message: "The remote already has the latest saved version.",
            sha: mirror.sha,
            verified: true,
            excluded: mirror.excluded,
        };
    }

    const pushArgs = ["push", "--porcelain", url, `refs/heads/${MIRROR_BRANCH}:${remoteRef}`];
    assertNoForce(pushArgs);
    const pushed = await options.push(pushArgs, options.root);
    if (!pushed.ok) {
        const text = `${pushed.stderr}\n${pushed.stdout}`;
        const rejected = /rejected|non-fast-forward|fetch first|stale info/i.test(text);
        return {
            status: rejected ? "rejected" : "failed",
            message: rejected
                ? "The remote has changes this profile does not have, so nothing was sent. Nothing was forced."
                : `The push did not finish (${firstLine(pushed.stderr) ?? pushed.spawnError ?? "no reason given"}).`,
            sha: null,
            verified: false,
            excluded: mirror.excluded,
        };
    }

    const after = await options.push(["ls-remote", url, remoteRef], options.root);
    const remoteSha = after.ok ? (after.stdout.trim().split(/\s+/)[0] ?? "") : "";
    const verified = remoteSha === mirror.sha;
    return {
        status: "pushed",
        message: verified
            ? "Sent, and the remote was read back to confirm it."
            : "The push reported success, but the remote could not be read back to confirm it.",
        sha: mirror.sha,
        verified,
        excluded: mirror.excluded,
    };
}

function firstLine(text: string): string | null {
    const line = text.trim().split(/\r?\n/)[0];
    return line === undefined || line === "" ? null : line;
}
