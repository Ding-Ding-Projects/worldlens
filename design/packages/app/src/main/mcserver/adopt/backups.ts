/**
 * Manual and scheduled world backups, built on `main/backup/` - never reimplemented here.
 *
 * `main/backup/` already knows how to pack a folder, split it, publish a Cheap LFS
 * release, upload it with progress and resume, list what is on a repository, and restore
 * a backup back onto disk. Every one of those jobs is delegated straight through to
 * `BackupRunner.backup`, `listBackups` and `BackupRestoreRunner.restore`; this file's whole
 * job is translating "back up this server's world" into the folder-shaped request that
 * machinery already accepts, and saying plainly when it cannot, rather than inventing a
 * second way to pack a zip.
 *
 * The one thing `main/backup/` cannot do on its own is find the folder: it backs up a
 * folder path, and a server's world folder is only a bare filesystem path when the
 * transport genuinely has one on this machine - a local process, or a container whose
 * bind mount this app can see directly. An SSH-reached container's world lives on a
 * different machine's disk, and this module says so rather than guessing at a path that
 * would silently back up nothing or the wrong thing.
 */

import { BackupRestoreRunner, type BackupRestoreRunnerOptions, type RestoreRequest, type RestoreResult } from "../../backup/restore.js";
import { BackupRunner, type BackupRequest, type BackupResult, type BackupRunnerOptions } from "../../backup/runner.js";
import { listBackups, type BackupListing } from "../../backup/catalog.js";
import type { GitHubCallOptions } from "../../backup/github.js";
import { inspectBackupSource } from "../../backup/source.js";
import { fail, ok, type Answer, type TransportRef } from "../transport/types.js";

/** Whether a server's `TransportRef` names a folder this machine's filesystem can pack
 *  directly. `local-process` always does; `local-docker` does whenever its `serverDir` is
 *  the host side of a bind mount, which is how every server this app creates is wired -
 *  but is not guaranteed for an adopted container, so a caller should still expect this to
 *  fail at the actual pack step if the path turns out not to exist here. `ssh-docker`
 *  never does: that folder lives on a different machine's disk. */
export function hasLocallyPackableWorld(ref: TransportRef): boolean {
    return ref.kind === "local-process" || ref.kind === "local-docker";
}

export interface ServerBackupRequest {
    readonly ref: TransportRef;
    readonly worldFolder: string;
    readonly owner: string;
    readonly repo: string;
    readonly accountId?: string | undefined;
    readonly acknowledgePublic?: boolean | undefined;
    readonly resumeTag?: string | undefined;
    /** Named so an event log or a UI can say whose files these actually are. A backup
     *  only reads the world, so this is informational, not a gate this function enforces -
     *  the caller's own destructive-action and consent checks decide whether to call this
     *  at all. */
    readonly adopted: boolean;
}

/**
 * Packs and uploads one server's world through `BackupRunner.backup`, unchanged.
 *
 * Refuses up front, before packing anything, when the transport's world folder is not one
 * this machine can read directly - see `hasLocallyPackableWorld`.
 */
export async function createServerBackup(
    runnerOptions: BackupRunnerOptions,
    request: ServerBackupRequest,
): Promise<Answer<BackupResult>> {
    if (!hasLocallyPackableWorld(request.ref)) {
        return fail(
            "unsupported",
            "This server's world lives on a machine this app cannot back up directly.",
            `Transport kind: ${request.ref.kind}`,
        );
    }

    const inspected = await inspectBackupSource("world", request.worldFolder);
    if (!inspected.ok) {
        return fail("not-found", inspected.failure.message, inspected.failure.code);
    }

    const runner = new BackupRunner(runnerOptions);
    const backupRequest: BackupRequest = {
        kind: "world",
        folder: inspected.source.folder,
        owner: request.owner,
        repo: request.repo,
        ...(request.accountId === undefined ? {} : { accountId: request.accountId }),
        ...(request.acknowledgePublic === undefined ? {} : { acknowledgePublic: request.acknowledgePublic }),
        ...(request.resumeTag === undefined ? {} : { resumeTag: request.resumeTag }),
    };
    const result = await runner.backup(backupRequest);
    return ok(result);
}

/** Lists the finished backups on a repository. A straight pass-through to
 *  `backup/catalog.ts`'s `listBackups`, kept here only so callers in `mcserver/` do not
 *  need to import across two directories for one call. */
export async function listServerBackups(
    owner: string,
    repo: string,
    options: GitHubCallOptions & { readonly maxPages?: number; readonly onProblem?: (tag: string, message: string) => void },
): Promise<Answer<readonly BackupListing[]>> {
    try {
        const listings = await listBackups(owner, repo, options);
        return ok(listings);
    } catch (error) {
        return fail("command-failed", "This server's backups could not be listed.", String(error));
    }
}

export interface ServerRestoreRequest extends RestoreRequest {
    readonly ref: TransportRef;
    /** Named for the same reason as `ServerBackupRequest.adopted` - informational only.
     *  Restoring overwrites the live world, which is a destructive write; the caller's own
     *  two-key confirmation gate and `consent.configWrite` check must already have
     *  happened before this is called. */
    readonly adopted: boolean;
}

/**
 * Restores a world backup back onto disk through `BackupRestoreRunner.restore`, unchanged.
 */
export async function restoreServerBackup(
    runnerOptions: BackupRestoreRunnerOptions,
    request: ServerRestoreRequest,
): Promise<Answer<RestoreResult>> {
    if (!hasLocallyPackableWorld(request.ref)) {
        return fail(
            "unsupported",
            "This server's world lives on a machine this app cannot restore directly.",
            `Transport kind: ${request.ref.kind}`,
        );
    }
    const runner = new BackupRestoreRunner(runnerOptions);
    const result = await runner.restore(request);
    return ok(result);
}
