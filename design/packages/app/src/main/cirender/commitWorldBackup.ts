/**
 * Committing the record of a world backup into the repository it was uploaded to.
 *
 * The write itself is an append: read the index that is there, add one entry, write it
 * back. Two renders finishing close together therefore race, and the loser would
 * otherwise overwrite the winner's entry with an index that never knew about it - which
 * is the worst possible outcome for a record whose entire job is not to lose things.
 *
 * So the commit is optimistic and the conflict is expected rather than exceptional. The
 * transport already refuses a commit whose parent has moved, with a typed error; this
 * re-reads the index and tries again on that error, a bounded number of times.
 *
 * A failure here never fails the render. The world is already uploaded and already
 * durable at that point - the release assets are the backup, and this is a convenience
 * that makes them findable offline. Turning "the record could not be committed" into "the
 * render failed" would be trading something valuable for something merely nice.
 */

import { CiAtomicCommitConflictError } from "./transport.js";
import {
    WORLD_BACKUP_INDEX_FILE,
    filesForUpload,
    pointerPathFor,
    type WorldBackupEntry,
} from "./worldBackupIndex.js";

/** How many times to lose the race before giving up and saying so. */
export const MAX_COMMIT_ATTEMPTS = 3;

export interface CommitWorldBackupTransport {
    /** The current text of a file, or null when it is not there yet. */
    readFile: (owner: string, repo: string, path: string) => Promise<string | null>;
    /** The branch's current head, which the commit is made against. */
    readHead: (owner: string, repo: string) => Promise<string>;
    commitFiles: (
        owner: string,
        repo: string,
        request: {
            branch: string;
            expectedHeadSha: string;
            files: readonly { path: string; content: string }[];
            message: string;
        },
    ) => Promise<{ commitSha: string }>;
}

export type CommitWorldBackupResult =
    | { readonly ok: true; readonly commitSha: string; readonly pointerPath: string }
    | { readonly ok: false; readonly reason: string };

export interface CommitWorldBackupOptions {
    readonly transport: CommitWorldBackupTransport;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly pointerText: string;
    readonly entry: Omit<WorldBackupEntry, "pointer">;
}

/**
 * Writes the pointer, the index and the readme, retrying a lost race.
 *
 * Returns a reason rather than throwing, for the same reason the uploader does: the
 * caller has one shape to handle and a bad outcome here is not fatal to what it was
 * actually doing.
 */
export async function commitWorldBackup(
    options: CommitWorldBackupOptions,
): Promise<CommitWorldBackupResult> {
    const { transport, owner, repo, branch } = options;
    const pointerPath = pointerPathFor(options.entry);
    const entry: WorldBackupEntry = { ...options.entry, pointer: pointerPath };

    let lastConflict: string | null = null;

    for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt += 1) {
        // Re-read inside the loop, not outside it. Retrying with the index we already had
        // would re-lose the entry we just lost the race to.
        let existingIndex: string | null;
        let head: string;
        try {
            existingIndex = await transport.readFile(owner, repo, WORLD_BACKUP_INDEX_FILE);
            head = await transport.readHead(owner, repo);
        } catch (error) {
            return {
                ok: false,
                reason: `could not read the repository: ${describe(error)}`,
            };
        }

        let files;
        try {
            ({ files } = filesForUpload({
                existingIndex,
                pointerText: options.pointerText,
                entry,
                owner,
                repo,
            }));
        } catch (error) {
            // A refusal from filesForUpload means the pointer was not a pointer, and no
            // number of retries changes that.
            return { ok: false, reason: describe(error) };
        }

        try {
            const { commitSha } = await transport.commitFiles(owner, repo, {
                branch,
                expectedHeadSha: head,
                files: files.map((file) => ({ path: file.path, content: file.content })),
                message: `Record the ${entry.label} world backup\n\nRelease ${entry.releaseTag}, ${String(entry.bytes)} bytes, sha256 ${entry.sha256}.`,
            });
            return { ok: true, commitSha, pointerPath };
        } catch (error) {
            if (error instanceof CiAtomicCommitConflictError) {
                lastConflict = error.message;
                continue;
            }
            return { ok: false, reason: `could not commit: ${describe(error)}` };
        }
    }

    return {
        ok: false,
        reason:
            `the repository moved under this commit ${String(MAX_COMMIT_ATTEMPTS)} times` +
            (lastConflict === null ? "" : ` (${lastConflict})`) +
            ". The world itself is uploaded and safe; only the committed record is missing.",
    };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
