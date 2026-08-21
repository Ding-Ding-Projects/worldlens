/**
 * The durable half of "pause": a small JSON record beside a backup's staged files, so a
 * paused backup is still recognisably paused after the application is closed and
 * reopened.
 *
 * ## What "durable" does and does not mean here
 *
 * Nothing in this application keeps a backup running in the background once the process
 * that started it is gone - there is no service, no daemon, nothing left holding an
 * `AbortController` or a `PauseGate` (`pauseGate.ts`) once the app quits. So "the pause
 * survives a restart" cannot mean "the same in-memory wait resumes where it left off";
 * it means two honest, weaker things instead, and both are worth being explicit about
 * because the difference is exactly what requirement 4 (say what a resume will actually
 * reuse and redo) is asking this feature to be honest about:
 *
 * 1. **The reopened application can tell a paused backup apart from a stopped one.**
 *    `BackupRunner` reads this record when it starts up and reports it through
 *    `activeBackups`/a synthetic `paused` event, so the interface shows "Paused" rather
 *    than silently forgetting the backup existed - see `ipc.ts`.
 * 2. **Resuming after a restart is calling `backup()` again with the same `resumeTag`.**
 *    That is not a special "continue in place" code path - it is the exact same call a
 *    person makes to carry on a *stopped* backup, and it is safe for the same reason:
 *    `#packOrReuse` (with its digest cache, see `archiveDigestCache.ts`) skips re-packing
 *    a staged archive whose size and mtime still match, `splitFile`'s own resume
 *    (`@worldlens/parts`) skips re-cutting parts already verified on disk, and the
 *    upload loop skips assets already on the release. The pause record's job is only to
 *    make the UI honest about that, and to be cleared the instant a live resume (the
 *    process is still running) makes it stale.
 *
 * A pause requested but never reached (the operation finished, failed, or was stopped
 * before its next boundary) must never leave this file behind - a stale "paused" record
 * for a backup that is actually finished would tell the interface to offer resuming
 * something that is already done.
 */

import { readFile, rm, writeFile } from "node:fs/promises";
import type { BackupWorkspace } from "./workspace.js";

/** Where in a backup's run this pause landed, and what it means for a resume. */
export interface BackupPauseRecord {
    readonly version: 1;
    readonly backupId: string;
    /** The phase the operation was in when Pause was pressed. */
    readonly phase: string;
    /**
     * Enough of the backup's own identity to offer "carry on" after a restart, when
     * `pausedBackups()` is all the interface has to go on - the `backupId` alone does
     * not invert back to these (see `backupIdFor`, which hashes them). Optional only for
     * the sake of the type reading sensibly on a record that predates this field; every
     * record this module writes now includes it.
     */
    readonly tag?: string;
    readonly owner?: string;
    readonly repo?: string;
    readonly kind?: string;
    readonly label?: string;
    /** When Pause was pressed, ISO-8601. */
    readonly requestedAt: string;
    /**
     * When the operation actually reached a boundary and stopped moving, or `null` when
     * it is still "pausing" - requested but not yet parked. A record can only ever be
     * *written* once this is non-null (see `pauseState.ts` callers in `runner.ts`); the
     * in-flight "pausing" state lives only in memory, because persisting a request that
     * might be withdrawn a second later before any file ever needed to change is not
     * worth the write.
     */
    readonly pausedAt: string | null;
}

/** Reads the record, or `null` when there is none - which is the ordinary, unpaused case. */
export async function readPauseState(workspace: BackupWorkspace): Promise<BackupPauseRecord | null> {
    try {
        const text = await readFile(workspace.pauseStateFile, "utf8");
        const parsed: unknown = JSON.parse(text);
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            (parsed as { version?: unknown }).version === 1 &&
            typeof (parsed as { backupId?: unknown }).backupId === "string" &&
            typeof (parsed as { phase?: unknown }).phase === "string" &&
            typeof (parsed as { requestedAt?: unknown }).requestedAt === "string"
        ) {
            const record = parsed as { pausedAt?: unknown };
            const pausedAt = typeof record.pausedAt === "string" ? record.pausedAt : null;
            return { ...(parsed as Omit<BackupPauseRecord, "pausedAt">), pausedAt };
        }
        return null;
    } catch {
        // No file, or not readable JSON in the shape expected: treated as "not paused"
        // rather than as an error. A record this module cannot make sense of proves
        // nothing about whether the backup is paused, and "not paused" is the safe
        // reading - it means, at worst, the interface offers Resume where it need not,
        // never the other way round.
        return null;
    }
}

/** Writes the record. Called only once the gate has actually parked at a boundary. */
export async function writePauseState(workspace: BackupWorkspace, record: BackupPauseRecord): Promise<void> {
    await writeFile(workspace.pauseStateFile, JSON.stringify(record, null, 4), "utf8");
}

/** Clears it. Called on resume, on finish, on failure, and on cancellation. */
export async function clearPauseState(workspace: BackupWorkspace): Promise<void> {
    await rm(workspace.pauseStateFile, { force: true }).catch(() => undefined);
}
