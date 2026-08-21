/**
 * Cutting one oversized file into parts a release can actually carry.
 *
 * One pass over the source, streamed. Every byte read is written into the current part,
 * folded into that part's SHA-256, and folded into the whole-file SHA-256 at the same
 * time, so a 20 GB archive is hashed twice over without ever being read twice and
 * without a byte of it being held in memory longer than the chunk it arrived in.
 *
 * ## A file that fits is left alone
 *
 * `splitFile` on a file no larger than the part size writes nothing and reports
 * `split: false`. Producing a one-part manifest for a 40 MB installer would mean every
 * consumer of every release had to learn the join format to open an asset that was
 * never split, which is a cost paid by everyone to describe a case that did not happen.
 *
 * ## Resuming a split that was interrupted
 *
 * `joinParts` (`join.ts`) has always been able to pick up a rejoin from a verified
 * prefix of the *output* file. This function used to have no equivalent: every call
 * re-cut the source from byte zero, no matter how many correct part files were already
 * sitting on disk from an attempt that a pause, a crash or an application restart broke
 * off. On an 8+ GB world archive that is not a minor inefficiency - it is the whole
 * reason a person asking to "pause" this step got what amounted to a stop instead: the
 * bar always restarted at 0%, and the disk paid for every byte a second time.
 *
 * Part boundaries are **deterministic** - part *i* always covers
 * `[(i-1)*partSize, min(i*partSize, bytesTotal))` - so they can be computed up front
 * from nothing but the source's size, before a single byte is read. That is what makes a
 * safe resume possible at all: given a candidate part file already on disk, this function
 * can know exactly which bytes it is supposed to hold without having read the source yet.
 *
 * A candidate is only ever *accepted*, never *assumed*. Its size must match the
 * deterministic boundary exactly (a truncated write, which is what an interrupted split
 * or a killed process leaves, never has the right size), and its own bytes are read back
 * and hashed - the resumed part becomes part of the whole-file digest only once it has
 * actually been rehashed off disk, not because a size and a filename look plausible. See
 * {@link findResumablePrefix} for exactly what is, and is not, proven by that check.
 *
 * A part file is only ever trusted as part of a **contiguous prefix starting at part
 * one**. A directory holding parts one, two and four with no part three is not "mostly
 * done" - part four is an orphan from some earlier, differently-sized attempt, and using
 * it would silently splice the wrong bytes into the middle of the archive. The prefix
 * stops at the first gap or mismatch and everything from there onward is cut fresh.
 *
 * ## The in-progress marker, and why "the manifest doesn't exist yet" is not enough
 *
 * A finished split is recognisable by its manifest: `splitFile` writes `<name>.parts.json`
 * only once every part is on disk and verified, which is exactly what already told a
 * caller "this split completed" before any of this file's resume logic existed. That is
 * necessary but is not, on its own, *sufficient* to trust a pile of `.001`, `.002` files
 * sitting next to a missing manifest as this split's own leftovers - they could just as
 * easily be stale debris from an entirely different file that used to live at this path,
 * under a different part size, and happened to leave same-shaped names behind.
 *
 * So a resumable attempt also writes a small `<name>.parts.inprogress.json` marker the
 * moment it starts, naming the exact source file, its size and the part size in force -
 * and only ever trusts existing `.NNN` files against **that** marker, never against bare
 * existence. A marker that does not match (or is missing) means every existing numbered
 * file at this path is untrusted; they are deleted before a fresh cut begins, exactly as
 * the pre-resume version of this function always deleted its own debris on failure. The
 * marker is removed the moment the manifest is written, which is what stops "still going"
 * ever being confused for "finished" - a reader can tell the two apart without opening a
 * single part file, by asking which of the two small JSON files sitting beside them
 * actually exists.
 */

import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Hash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { READ_CHUNK_BYTES } from "./hash.js";
import { DEFAULT_PART_SIZE, manifestNameFor, partNameFor } from "./manifest.js";
import type { PartRecord, PartsManifest } from "./manifest.js";
import { PARTS_MANIFEST_VERSION } from "./manifest.js";

export interface SplitProgress {
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly partsDone: number;
    readonly partsTotal: number;
    /** 0 to 100. */
    readonly percent: number;
}

export interface SplitOptions {
    /** Defaults to {@link DEFAULT_PART_SIZE}, 1.7 GB. */
    readonly partSize?: number;
    /** Defaults to the directory the source file is in. */
    readonly outDir?: string;
    readonly onProgress?: (progress: SplitProgress) => void;
    readonly signal?: AbortSignal;
    /**
     * Called once every part is finished, closed, and its record is known - the one
     * clean boundary inside this loop where nothing is open and nothing is
     * half-written. A caller that wants to pause "between parts while splitting"
     * awaits this hook and does not resolve it until it is safe to open the next part
     * file; `splitFile` itself has no opinion about what "safe to continue" means and
     * simply awaits whatever this returns. Never called after the very last part -
     * pausing there would only delay writing the manifest, which is quick and is not a
     * boundary worth a person's patience.
     */
    readonly onPartBoundary?: (() => Promise<void> | void) | undefined;
}

/** The file was already small enough, so nothing was written and nothing changed. */
export interface SplitSkipped {
    readonly split: false;
    /** The source file, absolute. */
    readonly file: string;
    readonly bytes: number;
}

export interface SplitPerformed {
    readonly split: true;
    readonly file: string;
    readonly bytes: number;
    /** Absolute path of the `<name>.parts.json` that was written. */
    readonly manifestPath: string;
    readonly manifest: PartsManifest;
    /** Absolute paths of the parts, in join order. */
    readonly partPaths: readonly string[];
    /**
     * How many of the parts were **not** rewritten this call because a prior attempt's
     * part file was found, matched its deterministic size exactly, and rehashed to
     * prove it is intact. Zero on a first attempt or one that resumed nothing. This is
     * what lets a caller say something honest about what a resume actually bought,
     * rather than a bar that looks the same whether it skipped 8 GB or none of it.
     */
    readonly partsResumed: number;
}

export type SplitResult = SplitSkipped | SplitPerformed;

/** What `<name>.parts.inprogress.json` records while a split is under way. */
interface InProgressMarker {
    readonly version: 1;
    /** The exact source file name this marker's part files belong to. */
    readonly file: string;
    readonly bytes: number;
    readonly partSize: number;
}

function inProgressMarkerNameFor(fileName: string): string {
    return `${manifestNameFor(fileName)}.inprogress.json`;
}

async function readInProgressMarker(path: string): Promise<InProgressMarker | null> {
    try {
        const text = await readFile(path, "utf8");
        const parsed: unknown = JSON.parse(text);
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            (parsed as { version?: unknown }).version === 1 &&
            typeof (parsed as { file?: unknown }).file === "string" &&
            typeof (parsed as { bytes?: unknown }).bytes === "number" &&
            typeof (parsed as { partSize?: unknown }).partSize === "number"
        ) {
            return parsed as InProgressMarker;
        }
        return null;
    } catch {
        // Missing, unreadable or not JSON: no marker, so nothing is trusted. This is
        // the fail-closed side of the resume - a marker that cannot be read proves
        // nothing, and proving nothing means starting over rather than guessing.
        return null;
    }
}

/** One deterministic part boundary: which source bytes part *index* (1-based) covers. */
interface PartBoundary {
    readonly index: number;
    readonly start: number;
    readonly bytes: number;
}

function partBoundaries(bytesTotal: number, partSize: number, partsTotal: number): PartBoundary[] {
    const boundaries: PartBoundary[] = [];
    for (let index = 1; index <= partsTotal; index++) {
        const start = (index - 1) * partSize;
        boundaries.push({ index, start, bytes: Math.min(partSize, bytesTotal - start) });
    }
    return boundaries;
}

/**
 * How many of the leading parts can safely be trusted from a previous attempt, and their
 * already-computed records.
 *
 * "Safely" means exactly two things, both checked, neither assumed: the file at that
 * part's deterministic path is **exactly** the number of bytes that boundary calls for
 * (a truncated write - the one thing an interrupted process reliably leaves behind - can
 * never pass this), and its **own bytes, read back and rehashed**, are what becomes that
 * part's SHA-256 in the manifest and what feeds the whole-file digest below. Nothing
 * about a resumed part is taken on faith: the size proves it was not cut off mid-write,
 * and the hash is not copied from anywhere - it is recomputed from the file that is
 * actually sitting on disk right now.
 *
 * What this does **not** prove, and must not be read as proving: that the bytes in the
 * resumed part file are identical to what a fresh split of the *original source* would
 * produce for that same byte range. This function never re-reads the source to check
 * that - doing so would defeat the entire point of resuming, which is to avoid re-reading
 * bytes that are already accounted for. The property this relies on instead is that the
 * source file itself is not mutated by anything in this codebase once it has been staged
 * (see `backup/runner.ts#packOrReuse`, which never rewrites an archive it decides to
 * reuse) - so a part file that correctly reflects *some* stable version of the source's
 * bytes at that offset is exactly as trustworthy as re-reading the source would be,
 * provided the source has not changed underneath it. A caller resuming against a source
 * that genuinely changed between attempts (a different file placed at the same path) is
 * the one case this cannot detect, and it is an existing, accepted risk of every
 * "reuse a staged file rather than re-derive it" shortcut in this application - not a new
 * one introduced here.
 *
 * Stops at the first index that is missing, wrongly sized, or fails to open - a gap in
 * the middle is never bridged, because the part after a gap could be an orphan from an
 * entirely different attempt.
 */
async function findResumablePrefix(
    outDir: string,
    fileName: string,
    boundaries: readonly PartBoundary[],
    signal: AbortSignal | undefined,
): Promise<{ records: PartRecord[]; hash: Hash }> {
    const records: PartRecord[] = [];
    let hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);

    for (const boundary of boundaries) {
        signal?.throwIfAborted();
        const partPath = join(outDir, partNameFor(fileName, boundary.index));
        const stats = await stat(partPath).catch(() => null);
        if (stats === null || !stats.isFile() || stats.size !== boundary.bytes) break;

        const partHash = createHash("sha256");
        const before = hash.copy();
        let ok = true;
        const handle = await open(partPath, "r");
        try {
            let position = 0;
            while (position < stats.size) {
                const { bytesRead } = await handle.read(
                    buffer,
                    0,
                    Math.min(buffer.length, stats.size - position),
                    position,
                );
                if (bytesRead <= 0) {
                    ok = false;
                    break;
                }
                const slice = buffer.subarray(0, bytesRead);
                partHash.update(slice);
                hash.update(slice);
                position += bytesRead;
            }
        } finally {
            await handle.close();
        }
        if (!ok) {
            // Reading the candidate part failed part-way (a race with something else
            // touching the file, most plausibly). Roll the whole-file hash back to
            // before this candidate was folded in and stop trusting the prefix here -
            // exactly the same "stop at the first problem" rule a size mismatch gets.
            hash = before;
            break;
        }

        records.push({
            index: boundary.index,
            name: partNameFor(fileName, boundary.index),
            bytes: boundary.bytes,
            // `digest()` finalizes a Node `Hash` and may only be called once, so this is
            // the single read of it - `hash` (the whole-file running digest) is a
            // separate, still-open `Hash` instance and is unaffected.
            sha256: partHash.digest("hex"),
        });
    }

    return { records, hash };
}

/**
 * Splits `path` into `<name>.001`, `<name>.002`, ... and a `<name>.parts.json`.
 *
 * A failure part-way through no longer deletes everything it had written - that was the
 * old, simpler safety property, and it bought that safety at the cost of every resume
 * redoing the entire cut. What replaces it is stricter, not looser: nothing is ever
 * trusted without rehashing (see {@link findResumablePrefix}), and the in-progress
 * marker means a stray pile of numbered files with no marker to vouch for them is
 * deleted and re-cut exactly as it always was. A genuinely corrupt or truncated part is
 * therefore always recut, never accepted - it simply fails the size or hash check that
 * decides what counts as "already done" in the first place.
 */
export async function splitFile(path: string, options: SplitOptions = {}): Promise<SplitResult> {
    const source = resolve(path);
    const partSize = options.partSize ?? DEFAULT_PART_SIZE;
    if (!Number.isSafeInteger(partSize) || partSize <= 0) {
        throw new RangeError(`The part size must be a positive whole number of bytes, not ${String(partSize)}.`);
    }

    const stats = await stat(source);
    if (!stats.isFile()) throw new Error(`${source} is not a file.`);
    const bytesTotal = stats.size;

    if (bytesTotal <= partSize) return { split: false, file: source, bytes: bytesTotal };

    const fileName = basename(source);
    const outDir = resolve(options.outDir ?? dirname(source));
    await mkdir(outDir, { recursive: true });

    const partsTotal = Math.ceil(bytesTotal / partSize);
    const boundaries = partBoundaries(bytesTotal, partSize, partsTotal);
    const markerPath = join(outDir, inProgressMarkerNameFor(fileName));

    // Trust an existing pile of numbered files only when the marker beside them names
    // *this exact* source, size and part size. Anything else - no marker, a marker for a
    // different file, a marker written under a different part size - means the numbered
    // files here (if any) are untrusted debris and are wiped before the fresh cut below,
    // exactly as the pre-resume version of this function always did on its own failure
    // path. This is what stops a coincidentally-named leftover from a previous, unrelated
    // split silently splicing itself into this one.
    const marker = await readInProgressMarker(markerPath);
    const markerMatches =
        marker !== null && marker.file === fileName && marker.bytes === bytesTotal && marker.partSize === partSize;

    let resumed: { records: PartRecord[]; hash: Hash } = { records: [], hash: createHash("sha256") };
    if (markerMatches) {
        resumed = await findResumablePrefix(outDir, fileName, boundaries, options.signal);
    } else {
        // No marker, or one that does not match: every `<name>.NNN` this call might
        // otherwise have found is not provably this split's own work, so it is removed
        // rather than risked. A stat-and-delete sweep over `partsTotal` deterministic
        // names is cheap next to the gigabytes being cut.
        for (const boundary of boundaries) {
            await rm(join(outDir, partNameFor(fileName, boundary.index)), { force: true }).catch(() => undefined);
        }
    }
    await writeFile(markerPath, JSON.stringify({ version: 1, file: fileName, bytes: bytesTotal, partSize }), "utf8");

    const resumedCount = resumed.records.length;
    const records: PartRecord[] = [...resumed.records];
    const partPaths: string[] = boundaries.map((boundary) => join(outDir, partNameFor(fileName, boundary.index)));
    const whole = resumed.hash;
    let bytesDone = boundaries.slice(0, resumedCount).reduce((total, boundary) => total + boundary.bytes, 0);

    if (resumedCount > 0) {
        options.onProgress?.({
            bytesDone,
            bytesTotal,
            partsDone: resumedCount,
            partsTotal,
            percent: percentOf(bytesDone, bytesTotal),
        });
    }

    if (resumedCount === partsTotal) {
        // Every part was already on disk and rehashed clean - nothing left to stream at
        // all. This is the fully-resumed case a pause between uploads (which never
        // touches these files) or a restart right after this phase finished should hit.
        await rm(markerPath, { force: true }).catch(() => undefined);
        const manifest: PartsManifest = {
            version: PARTS_MANIFEST_VERSION,
            file: fileName,
            bytes: bytesTotal,
            sha256: whole.digest("hex"),
            partSize,
            parts: records,
        };
        const manifestPath = join(outDir, manifestNameFor(fileName));
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`, "utf8");
        return { split: true, file: source, bytes: bytesTotal, manifestPath, manifest, partPaths, partsResumed: resumedCount };
    }

    const resumeOffset = bytesDone;
    let partIndex = resumedCount;

    interface OpenPart {
        readonly index: number;
        readonly handle: FileHandle;
        readonly hash: Hash;
        bytes: number;
    }

    let current: OpenPart | null = null;

    const finishPart = async (part: OpenPart): Promise<void> => {
        await part.handle.close();
        records.push({
            index: part.index,
            name: partNameFor(fileName, part.index),
            bytes: part.bytes,
            sha256: part.hash.digest("hex"),
        });
        options.onProgress?.({
            bytesDone,
            bytesTotal,
            partsDone: records.length,
            partsTotal,
            percent: percentOf(bytesDone, bytesTotal),
        });
    };

    try {
        // `start: resumeOffset` is the other half of the saving: the source is read from
        // the first byte that is genuinely not yet accounted for, not from zero. On a
        // fully-fresh split `resumeOffset` is 0 and this is identical to the old
        // behaviour.
        const reader = createReadStream(source, { start: resumeOffset, highWaterMark: READ_CHUNK_BYTES });
        for await (const chunk of reader) {
            options.signal?.throwIfAborted();
            const buffer = chunk as Buffer;
            let offset = 0;
            while (offset < buffer.length) {
                if (current === null) {
                    partIndex += 1;
                    const partPath = partPaths[partIndex - 1] as string;
                    current = {
                        index: partIndex,
                        handle: await open(partPath, "w"),
                        hash: createHash("sha256"),
                        bytes: 0,
                    };
                }
                const expectedBytes = boundaries[partIndex - 1]?.bytes ?? partSize;
                const take = Math.min(expectedBytes - current.bytes, buffer.length - offset);
                const slice = buffer.subarray(offset, offset + take);
                await writeFully(current.handle, slice);
                current.hash.update(slice);
                whole.update(slice);
                current.bytes += take;
                offset += take;
                bytesDone += take;
                if (current.bytes === expectedBytes) {
                    await finishPart(current);
                    current = null;
                    // The one clean boundary in this loop: the just-finished part is
                    // closed and recorded, and the next one has not been opened yet.
                    // Never awaited for the very last part - see the doc comment on
                    // `onPartBoundary`.
                    if (partIndex < partsTotal) await options.onPartBoundary?.();
                }
            }
        }
        if (current !== null) {
            await finishPart(current);
            current = null;
        }
    } catch (error) {
        if (current !== null) await current.handle.close().catch(() => undefined);
        // Only the parts this attempt itself wrote are torn down on failure. A resumed
        // prefix that rehashed clean stays on disk exactly as it was found - deleting it
        // here would throw away the one thing that made this attempt cheaper than
        // starting from zero, for no safety benefit: it was already proven intact before
        // a single new byte was streamed.
        for (let index = resumedCount + 1; index <= partsTotal; index++) {
            const written = partPaths[index - 1];
            if (written !== undefined) await rm(written, { force: true }).catch(() => undefined);
        }
        throw error;
    }

    const manifest: PartsManifest = {
        version: PARTS_MANIFEST_VERSION,
        file: fileName,
        bytes: bytesTotal,
        sha256: whole.digest("hex"),
        partSize,
        parts: records,
    };
    const manifestPath = join(outDir, manifestNameFor(fileName));
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`, "utf8");
    // The manifest existing is what means "finished" to every other reader of this
    // directory; the marker's job ends the instant that becomes true.
    await rm(markerPath, { force: true }).catch(() => undefined);

    return { split: true, file: source, bytes: bytesTotal, manifestPath, manifest, partPaths, partsResumed: resumedCount };
}

/**
 * Writes the whole buffer, however many calls that takes.
 *
 * `FileHandle.write` is allowed to write fewer bytes than it was given. It essentially
 * never does for a regular file, which is exactly why a truncated part produced this
 * way would be found months later by somebody debugging a corrupt download.
 */
async function writeFully(handle: FileHandle, buffer: Buffer): Promise<void> {
    let written = 0;
    while (written < buffer.length) {
        const result = await handle.write(buffer, written, buffer.length - written);
        if (result.bytesWritten <= 0) throw new Error("The part file accepted no bytes.");
        written += result.bytesWritten;
    }
}

function percentOf(done: number, total: number): number {
    if (total <= 0) return 100;
    return Math.min(100, (done / total) * 100);
}
