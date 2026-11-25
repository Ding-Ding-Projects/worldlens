/**
 * Shared helpers for the tests that run real Git in temporary folders.
 *
 * Not imported by any production code. A test that needs Git is skipped, with the reason
 * printed once, on a machine that has none.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit, type GitResult, type GitRunner } from "../history/git.js";

export const realGit: GitRunner = runGit;

export const gitAvailable: boolean = await (async () => {
    const probe = await runGit(["--version"], { cwd: tmpdir() });
    if (!probe.ok) {
        console.warn(`[dataFolders tests] Git is not available (${probe.spawnError ?? "no output"}), so tests that need real Git are skipped.`);
    }
    return probe.ok;
})();

export async function makeTemporaryFolder(label: string): Promise<{ root: string; dispose: () => Promise<void> }> {
    const root = await mkdtemp(join(tmpdir(), `wl-${label}-`));
    return { root, dispose: () => rm(root, { recursive: true, force: true }) };
}

/** A plain Git call with no isolation, for the test's own setup and inspection. */
export async function git(cwd: string, ...args: string[]): Promise<GitResult> {
    return await runGit(args, {
        cwd,
        env: { GIT_CONFIG_GLOBAL: join(cwd, ".no-global"), GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" },
    });
}

export async function trackedFiles(cwd: string, ref = "HEAD"): Promise<string[]> {
    const listing = await git(cwd, "ls-tree", "-r", "--name-only", ref);
    return listing.stdout.split(/\r?\n/).filter((line) => line !== "").sort();
}
