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

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BackupRestoreRunner, type BackupRestoreRunnerOptions, type RestoreRequest, type RestoreResult } from "../../backup/restore.js";
import { BackupRunner, type BackupRequest, type BackupResult, type BackupRunnerOptions } from "../../backup/runner.js";
import { listBackups, type BackupListing } from "../../backup/catalog.js";
import type { GitHubCallOptions } from "../../backup/github.js";
import { inspectBackupSource } from "../../backup/source.js";
import { fail, ok, type Answer, type BackupProgress, type ServerTransport, type TransportRef } from "../transport/types.js";

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
    /** Required for ssh-docker: the transport is the only byte-safe route to remote files. */
    readonly transport?: ServerTransport;
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: BackupProgress) => void;
}

export async function materializeRemoteFolder(transport: ServerTransport, remoteRoot: string, localRoot: string, signal?: AbortSignal): Promise<Answer<void>> {
    const walk = async (remote: string, local: string): Promise<Answer<void>> => {
        if (signal?.aborted) return fail("timeout", "The remote backup was cancelled before all bytes arrived.");
        const listing = await transport.fileList(remote);
        if (!listing.ok) return listing;
        await mkdir(local, { recursive: true });
        for (const entry of listing.value) {
            if (entry.name === "." || entry.name === ".." || /[\\/\0\r\n]/.test(entry.name)) return fail("invalid-request", "The remote backup contained an invalid file name.");
            const remotePath = `${remote.replace(/[\\/]$/, "")}/${entry.name}`;
            const localPath = join(local, entry.name);
            if (entry.kind === "symlink") return fail("unsupported", "The remote backup contains a symbolic link, so it was not copied.");
            if (entry.kind === "directory") {
                const nested = await walk(remotePath, localPath);
                if (!nested.ok) return nested;
                continue;
            }
            const read = await transport.fileRead(remotePath, {
                maxBytes: 16 * 1024 * 1024,
                ...(signal === undefined ? {} : { signal }),
            });
            if (!read.ok) return read;
            if (read.value.truncated) return fail("unsupported", `The remote backup file ${entry.name} is larger than the safe in-memory limit.`);
            await writeFile(localPath, read.value.bytes);
        }
        return ok(undefined);
    };
    return walk(remoteRoot, localRoot);
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
    if (request.ref.kind === "ssh-docker") {
        if (request.transport === undefined) return fail("unsupported", "A remote backup needs its scoped SSH Docker transport.");
        const stagingParent = runnerOptions.storageDir();
        await mkdir(stagingParent, { recursive: true });
        const staging = await mkdtemp(join(stagingParent, "remote-server-backup-"));
        try {
            const materialized = request.transport.copyDirectoryToLocal === undefined
                ? await materializeRemoteFolder(request.transport, request.worldFolder, staging, request.signal)
                : await request.transport.copyDirectoryToLocal(request.worldFolder, staging, {
                    ...(request.signal === undefined ? {} : { signal: request.signal }),
                    ...(request.onProgress === undefined ? {} : { onProgress: request.onProgress }),
                });
            if (!materialized.ok) return materialized;
            const { transport: _remoteTransport, ...localRequest } = request;
            return createServerBackup(runnerOptions, {
                ...localRequest,
                ref: { kind: "local-process", serverDir: staging },
                worldFolder: staging,
            });
        } finally {
            await rm(staging, { recursive: true, force: true });
        }
    }
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
    readonly targetFolder?: string;
    readonly transport?: ServerTransport;
}

/**
 * Restores a world backup back onto disk through `BackupRestoreRunner.restore`, unchanged.
 */
export async function restoreServerBackup(
    runnerOptions: BackupRestoreRunnerOptions,
    request: ServerRestoreRequest,
): Promise<Answer<RestoreResult>> {
    if (request.ref.kind === "ssh-docker") {
        if (request.transport?.atomicRestoreDirectory === undefined || request.targetFolder === undefined) {
            return fail("unsupported", "This remote server has no atomic restore primitive available.");
        }
        const runner = new BackupRestoreRunner(runnerOptions);
        const downloaded = await runner.restore(request);
        if (!downloaded.ok) return ok(downloaded);
        const swapped = await request.transport.atomicRestoreDirectory(downloaded.summary.contentFolder, request.targetFolder);
        if (!swapped.ok) {
            return ok({
                ok: false,
                restoreId: downloaded.restoreId,
                failure: {
                    code: swapped.failure.code,
                    message: swapped.failure.message,
                    detail: swapped.failure.detail,
                    needsSignIn: false,
                    accountId: null,
                    accountLogin: null,
                    accountHost: null,
                },
            });
        }
        return ok(downloaded);
    }
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
