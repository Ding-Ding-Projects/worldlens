/**
 * Copies a folder tree, proves the copy, and cleans up after itself when it must stop.
 *
 * The guarantees, in the order they matter:
 *
 *  1. **Nothing is overwritten.** Every file is created with an exclusive flag, so a file
 *     that is already in the target makes the copy fail rather than replace it.
 *  2. **The source is never changed.** This module only reads from it.
 *  3. **A copy is believed only after it is verified.** Every copied file is compared with
 *     its source by size and SHA-256 before the result says `verified`.
 *  4. **Stopping leaves things as they were.** A cancel or a failure removes only the files
 *     and folders this run created, in reverse order, and never anything that was there first.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, constants, lstat, mkdir, readdir, rm, rmdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export interface MoveProgress {
    readonly phase: "measuring" | "copying" | "verifying" | "finished";
    readonly filesDone: number;
    readonly filesTotal: number;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    /** The profile-relative path being worked on, or null between files. */
    readonly current: string | null;
}

export interface SkippedEntry {
    readonly path: string;
    readonly reason: string;
}

export interface CopyTreeResult {
    readonly ok: boolean;
    readonly cancelled: boolean;
    /** True only when every copied file matched its source by size and SHA-256. */
    readonly verified: boolean;
    readonly copiedFiles: number;
    readonly copiedBytes: number;
    readonly skipped: readonly SkippedEntry[];
    /** Why the copy stopped, or null on success. */
    readonly failure: string | null;
    /** True when the files this run created were removed again. */
    readonly rolledBack: boolean;
}

export interface CopyTreeOptions {
    readonly source: string;
    readonly target: string;
    /** Return true to leave an entry out. Receives a forward-slash path relative to `source`. */
    readonly skip?: (relativePosixPath: string, isDirectory: boolean) => boolean;
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: MoveProgress) => void;
}

interface PlannedFile {
    readonly relative: string;
    readonly size: number;
}

interface Plan {
    readonly directories: string[];
    readonly files: PlannedFile[];
    readonly skipped: SkippedEntry[];
    readonly bytes: number;
}

function toPosix(path: string): string {
    return path.split(sep).join("/");
}

async function plan(source: string, skip: CopyTreeOptions["skip"]): Promise<Plan> {
    const directories: string[] = [];
    const files: PlannedFile[] = [];
    const skipped: SkippedEntry[] = [];
    let bytes = 0;

    async function walk(directory: string): Promise<void> {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const absolute = join(directory, entry.name);
            const rel = toPosix(relative(source, absolute));
            if (entry.isSymbolicLink()) {
                skipped.push({ path: rel, reason: "A link is not copied, so it cannot point somewhere unexpected." });
                continue;
            }
            if (entry.isDirectory()) {
                if (skip?.(rel, true) === true) {
                    skipped.push({ path: rel, reason: "Rebuildable or in use, so it is not copied." });
                    continue;
                }
                directories.push(rel);
                await walk(absolute);
                continue;
            }
            if (!entry.isFile()) {
                skipped.push({ path: rel, reason: "Not an ordinary file." });
                continue;
            }
            if (skip?.(rel, false) === true) {
                skipped.push({ path: rel, reason: "Rebuildable or in use, so it is not copied." });
                continue;
            }
            const info = await lstat(absolute);
            files.push({ relative: rel, size: info.size });
            bytes += info.size;
        }
    }

    await walk(source);
    return { directories, files, skipped, bytes };
}

/** How many bytes a copy would move, for the free-space check. */
export async function measureTree(source: string, skip?: CopyTreeOptions["skip"]): Promise<number> {
    const info = await stat(source).catch(() => null);
    if (info === null || !info.isDirectory()) return 0;
    return (await plan(source, skip)).bytes;
}

export async function hashFile(path: string): Promise<string> {
    const hash = createHash("sha256");
    await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(path);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve());
    });
    return hash.digest("hex");
}

async function compareFiles(from: string, to: string): Promise<"same" | "size" | "content"> {
    const [sourceInfo, targetInfo] = await Promise.all([stat(from), stat(to)]);
    if (sourceInfo.size !== targetInfo.size) return "size";
    const [sourceHash, targetHash] = await Promise.all([hashFile(from), hashFile(to)]);
    return sourceHash === targetHash ? "same" : "content";
}

export async function copyTree(options: CopyTreeOptions): Promise<CopyTreeResult> {
    const { source, target, signal } = options;
    const createdFiles: string[] = [];
    const createdDirectories: string[] = [];
    let copiedBytes = 0;
    let skipped: readonly SkippedEntry[] = [];

    const report = (phase: MoveProgress["phase"], done: number, total: number, bytesTotal: number, current: string | null) =>
        options.onProgress?.({ phase, filesDone: done, filesTotal: total, bytesDone: copiedBytes, bytesTotal, current });

    async function rollBack(): Promise<boolean> {
        let clean = true;
        for (const file of createdFiles.reverse()) {
            await rm(file, { force: true }).catch(() => {
                clean = false;
            });
        }
        // Only folders this run made, and only when they are empty again.
        for (const directory of createdDirectories.reverse()) {
            await rmdir(directory).catch(() => {
                clean = false;
            });
        }
        return clean;
    }

    async function stopped(
        failure: string | null,
        cancelled: boolean,
        copiedFiles: number,
    ): Promise<CopyTreeResult> {
        const rolledBack = await rollBack();
        return {
            ok: false,
            cancelled,
            verified: false,
            copiedFiles,
            copiedBytes,
            skipped,
            failure,
            rolledBack,
        };
    }

    try {
        report("measuring", 0, 0, 0, null);
        const planned = await plan(source, options.skip);
        skipped = planned.skipped;
        const total = planned.files.length;

        const targetExisted = await stat(target).then(
            () => true,
            () => false,
        );
        if (!targetExisted) {
            // Remember every folder level this run creates, so a rollback removes exactly those.
            const missing: string[] = [];
            let probe = target;
            for (;;) {
                const exists = await stat(probe).then(
                    () => true,
                    () => false,
                );
                if (exists) break;
                missing.push(probe);
                const parent = join(probe, "..");
                if (parent === probe) break;
                probe = parent;
            }
            await mkdir(target, { recursive: true });
            createdDirectories.push(...missing.reverse());
        }
        for (const directory of planned.directories) {
            if (signal?.aborted === true) return await stopped("Cancelled.", true, createdFiles.length);
            const destination = join(target, directory);
            const existed = await stat(destination).then(
                () => true,
                () => false,
            );
            await mkdir(destination, { recursive: true });
            if (!existed) createdDirectories.push(destination);
        }

        let done = 0;
        for (const file of planned.files) {
            if (signal?.aborted === true) return await stopped("Cancelled.", true, done);
            report("copying", done, total, planned.bytes, file.relative);
            const from = join(source, file.relative);
            const to = join(target, file.relative);
            try {
                // COPYFILE_EXCL: an existing file is a refusal, never a replacement.
                await copyFile(from, to, constants.COPYFILE_EXCL);
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code ?? "unknown";
                return await stopped(`${file.relative} could not be copied (${code}).`, false, done);
            }
            createdFiles.push(to);
            copiedBytes += file.size;
            done += 1;
        }

        copiedBytes = 0;
        let verified = 0;
        for (const file of planned.files) {
            if (signal?.aborted === true) return await stopped("Cancelled.", true, done);
            report("verifying", verified, total, planned.bytes, file.relative);
            const from = join(source, file.relative);
            const to = join(target, file.relative);
            try {
                let outcome = await compareFiles(from, to);
                if (outcome !== "same") {
                    // A live profile can change a file between the copy and the check. The
                    // file at the target was created by this run, so it may be replaced once.
                    await rm(to, { force: true });
                    await copyFile(from, to, constants.COPYFILE_EXCL);
                    outcome = await compareFiles(from, to);
                }
                if (outcome !== "same") {
                    return await stopped(
                        `${file.relative} did not match its source after copying (${outcome}).`,
                        false,
                        done,
                    );
                }
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code ?? "unknown";
                return await stopped(`${file.relative} could not be verified (${code}).`, false, done);
            }
            copiedBytes += file.size;
            verified += 1;
        }
        report("finished", total, total, planned.bytes, null);
        return {
            ok: true,
            cancelled: false,
            verified: true,
            copiedFiles: total,
            copiedBytes,
            skipped,
            failure: null,
            rolledBack: false,
        };
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        return await stopped(
            `The copy stopped unexpectedly${code === undefined ? "" : ` (${code})`}.`,
            false,
            createdFiles.length,
        );
    }
}

/**
 * Compares two trees by size and SHA-256 for every file the first one holds, ignoring what
 * `skip` leaves out. Used to prove an old folder is fully contained in the new one before its
 * removal is offered.
 */
export async function treeIsContainedIn(
    older: string,
    newer: string,
    skip?: CopyTreeOptions["skip"],
): Promise<{ readonly contained: boolean; readonly firstMismatch: string | null }> {
    const planned = await plan(older, skip);
    for (const file of planned.files) {
        const from = join(older, file.relative);
        const to = join(newer, file.relative);
        try {
            const [a, b] = await Promise.all([stat(from), stat(to)]);
            if (a.size !== b.size) return { contained: false, firstMismatch: file.relative };
            const [ha, hb] = await Promise.all([hashFile(from), hashFile(to)]);
            if (ha !== hb) return { contained: false, firstMismatch: file.relative };
        } catch {
            return { contained: false, firstMismatch: file.relative };
        }
    }
    return { contained: true, firstMismatch: null };
}
