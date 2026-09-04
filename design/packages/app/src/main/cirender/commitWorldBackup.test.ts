/**
 * The race is the interesting part. Two renders finishing close together both read the
 * index, both append, and the loser would overwrite the winner - erasing an entry from
 * the one file whose job is not to lose things.
 */

import { describe, expect, it } from "vitest";

import { CHEAP_LFS_POINTER_VERSION } from "../backup/pointer.js";
import { CiAtomicCommitConflictError } from "./transport.js";
import {
    MAX_COMMIT_ATTEMPTS,
    commitWorldBackup,
    type CommitWorldBackupTransport,
} from "./commitWorldBackup.js";
import { WORLD_BACKUP_INDEX_FILE, parseIndex } from "./worldBackupIndex.js";

const POINTER = [
    `version ${CHEAP_LFS_POINTER_VERSION}`,
    "release-tag wl-world-1",
    "asset-name w.zip",
    "size 10",
    "sha256 " + "b".repeat(64),
    "",
].join("\n");

const ENTRY = {
    label: "Overworld",
    releaseTag: "wl-world-1",
    archive: "w.zip",
    bytes: 10,
    sha256: "b".repeat(64),
    parts: 1,
    createdAt: "2026-09-04T00:00:00.000Z",
    appVersion: "1.0.0",
};

/** A repository that accepts commits, with a head that a test can move underneath. */
function fakeRepo(options: { conflictsBeforeSuccess?: number } = {}) {
    const files = new Map<string, string>();
    let head = "head-0";
    let conflictsLeft = options.conflictsBeforeSuccess ?? 0;
    const commits: { files: readonly { path: string; content: string }[] }[] = [];

    const transport: CommitWorldBackupTransport = {
        readFile: async (_o, _r, path) => files.get(path) ?? null,
        readHead: async () => head,
        commitFiles: async (_o, _r, request) => {
            if (conflictsLeft > 0) {
                conflictsLeft -= 1;
                // Somebody else landed first: move the head and write their entry, exactly
                // as a real losing race would leave the repository.
                head = `head-${String(commits.length + 1)}`;
                files.set(
                    WORLD_BACKUP_INDEX_FILE,
                    JSON.stringify({
                        indexVersion: 1,
                        entries: [{ ...ENTRY, label: "Someone else", releaseTag: "other", pointer: "worlds/other.cheaplfs" }],
                    }),
                );
                throw new CiAtomicCommitConflictError("head moved");
            }
            for (const file of request.files) files.set(file.path, file.content);
            commits.push({ files: request.files });
            head = `head-${String(commits.length + 10)}`;
            return { commitSha: `sha-${String(commits.length)}` };
        },
    };

    return { transport, files, commits };
}

const run = (transport: CommitWorldBackupTransport) =>
    commitWorldBackup({
        transport,
        owner: "an-owner",
        repo: "a-repo",
        branch: "main",
        pointerText: POINTER,
        entry: ENTRY,
    });

describe("committing the record of a world backup", () => {
    it("writes the pointer, the index and the readme in one commit", async () => {
        const repo = fakeRepo();
        const result = await run(repo.transport);

        expect(result.ok).toBe(true);
        expect(repo.commits).toHaveLength(1);
        expect(repo.commits[0]?.files.map((f) => f.path).sort()).toEqual([
            "worlds/index.json",
            "worlds/overworld-wl-world-1.cheaplfs",
            "worlds/README.md",
        ].sort());
    });

    it("re-reads and retries when it loses the race, keeping the winner's entry", async () => {
        // The whole reason this is optimistic rather than a plain write. Retrying with the
        // index it already had would re-lose the entry it just lost to.
        const repo = fakeRepo({ conflictsBeforeSuccess: 1 });
        const result = await run(repo.transport);

        expect(result.ok).toBe(true);
        const index = parseIndex(repo.files.get(WORLD_BACKUP_INDEX_FILE) ?? null).index;
        expect(index.entries.map((e) => e.label).sort()).toEqual(["Overworld", "Someone else"]);
    });

    it("gives up after a bounded number of losses, and says the world is still safe", async () => {
        const repo = fakeRepo({ conflictsBeforeSuccess: MAX_COMMIT_ATTEMPTS + 1 });
        const result = await run(repo.transport);

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.reason).toMatch(/uploaded and safe/);
    });

    it("does not retry a pointer that is not a pointer", async () => {
        // No number of retries turns bad bytes into a valid pointer, and committing them
        // would leave a record that reads as a backup and restores nothing.
        const repo = fakeRepo();
        const result = await commitWorldBackup({
            transport: repo.transport,
            owner: "o",
            repo: "r",
            branch: "main",
            pointerText: "not a pointer",
            entry: ENTRY,
        });

        expect(result.ok).toBe(false);
        expect(repo.commits).toHaveLength(0);
    });

    it("reports a read failure rather than committing over an index it could not see", async () => {
        const repo = fakeRepo();
        const result = await commitWorldBackup({
            transport: {
                ...repo.transport,
                readFile: async () => {
                    throw new Error("network down");
                },
            },
            owner: "o",
            repo: "r",
            branch: "main",
            pointerText: POINTER,
            entry: ENTRY,
        });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.reason).toMatch(/network down/);
        expect(repo.commits).toHaveLength(0);
    });
});
