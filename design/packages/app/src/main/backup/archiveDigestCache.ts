/**
 * A small side-car that remembers a staged archive's already-proven SHA-256, so a resumed
 * backup does not pay for a multi-gigabyte rehash every single time it is resumed.
 *
 * ## The problem this fixes
 *
 * `#packOrReuse` in `runner.ts` has always been careful never to *trust* a staged
 * archive - it hashes the file on disk and compares the digest to what the sidecar and
 * pointer expect, rather than assuming a file of the right name and size is the right
 * file. That carefulness is correct and this module does not weaken it. What it does fix
 * is that, without a cache, "check rather than trust" meant a full re-read of the entire
 * archive on **every single resume** - pause, resume; close the app, reopen it, resume
 * again; each one re-hashing bytes that were already hashed, verified and known-good
 * moments (or days) earlier. On an 8.69 GB world archive that is minutes of solid disk
 * read spent proving something that was already proven.
 *
 * ## What is cached, and the one thing that makes the fast path safe
 *
 * The cache holds the digest **and** the exact `size` and `mtimeMs` the archive had when
 * that digest was computed. The fast path is used only when the archive's *current*
 * `stat()` matches both of those exactly. Neither the archive's name nor its mere
 * existence is ever enough on its own - a file replaced at the same path with the same
 * size (vanishingly unlikely, but not impossible for a manually-tampered folder) would
 * still usually change `mtimeMs`, and anything that actually rewrote the bytes without
 * touching either would already be an adversary this application's overall trust model
 * does not defend against elsewhere either (a person invited to replace their own local
 * files can always do so).
 *
 * When the fast path's proof does not hold - size differs, mtime differs, the cache file
 * is missing, unreadable, or was written for a different archive name - **the archive is
 * rehashed, unconditionally**. That is the whole point of keeping this a cache and not a
 * substitute: correctness always wins over speed the moment the cheap check cannot
 * actually vouch for anything.
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { sha256File } from "@worldlens/parts";
import type { BackupWorkspace } from "./workspace.js";
import { stagedArchiveDigestPath } from "./workspace.js";

interface DigestRecord {
    readonly version: 1;
    readonly archiveName: string;
    readonly size: number;
    readonly mtimeMs: number;
    readonly sha256: string;
}

async function readDigestRecord(path: string): Promise<DigestRecord | null> {
    try {
        const text = await readFile(path, "utf8");
        const parsed: unknown = JSON.parse(text);
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            (parsed as { version?: unknown }).version === 1 &&
            typeof (parsed as { archiveName?: unknown }).archiveName === "string" &&
            typeof (parsed as { size?: unknown }).size === "number" &&
            typeof (parsed as { mtimeMs?: unknown }).mtimeMs === "number" &&
            typeof (parsed as { sha256?: unknown }).sha256 === "string"
        ) {
            return parsed as DigestRecord;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * The archive's SHA-256: from the cache when its proof still holds, freshly hashed and
 * re-cached otherwise. `signal` is passed straight through to a fresh hash so a Stop
 * pressed mid-rehash still works exactly as it always has.
 */
export async function digestStagedArchive(
    workspace: BackupWorkspace,
    archiveName: string,
    archivePath: string,
    archiveSize: number,
    signal?: AbortSignal,
): Promise<string> {
    const cachePath = stagedArchiveDigestPath(workspace, archiveName);
    const cached = await readDigestRecord(cachePath);
    if (cached !== null && cached.archiveName === archiveName && cached.size === archiveSize) {
        const stats = await stat(archivePath).catch(() => null);
        if (stats !== null && stats.mtimeMs === cached.mtimeMs) {
            // The fast path. Every field the cache promises to check has actually been
            // checked against the file that is on disk *right now*, not against what the
            // cache merely claims about itself.
            return cached.sha256;
        }
    }

    const digest = await sha256File(archivePath, signal);
    // Cached *after* a successful hash, using the mtime observed at hash time - not the
    // one read before it, in case something touched the file in between. Best-effort:
    // a resume that cannot write this small file still has its real digest to return,
    // it just pays the rehash again next time.
    const stats = await stat(archivePath).catch(() => null);
    if (stats !== null) {
        const record: DigestRecord = { version: 1, archiveName, size: archiveSize, mtimeMs: stats.mtimeMs, sha256: digest };
        await writeFile(cachePath, JSON.stringify(record), "utf8").catch(() => undefined);
    }
    return digest;
}

/** Removes the cache. Called wherever the staged archive itself is deleted or replaced. */
export async function clearArchiveDigestCache(workspace: BackupWorkspace, archiveName: string): Promise<void> {
    await rm(stagedArchiveDigestPath(workspace, archiveName), { force: true }).catch(() => undefined);
}
