/**
 * How much world is actually on disk, counted from the region files themselves.
 *
 * A world download in flight needs a progress number, and the obvious source is the
 * tool's own log output. That number is worth less than it looks. The log says what the
 * downloader believes it has received, which is a claim made before anything was written,
 * on a schedule of the tool's choosing, in a format that belongs to the tool and can
 * change under us with any upstream build. The region files say what survived: a chunk
 * counted here has a header entry pointing at real sectors in a real file on this
 * machine. When the two disagree the region files are the ones a user can go and look at.
 *
 * Counting them is also cheap, which is what makes it usable as live progress rather than
 * as a one-off audit at the end.
 *
 * ## The region header
 *
 * Every `.mca` file opens with a 4096 byte location table: 1024 entries of four bytes,
 * one per chunk in the 32 by 32 region, each holding a three byte sector offset and a one
 * byte sector count. An entry that is all zeroes means that chunk was never generated or
 * never saved. So the number of chunks present in a region is the number of non-zero
 * entries in its first 4096 bytes, and nothing past those bytes has to be read at all.
 *
 * That matters more than it sounds. A populated region file runs to several megabytes,
 * and a downloading world can hold hundreds of them across three dimensions. Reading them
 * whole to count something that lives entirely in the first page would turn a progress
 * indicator into gigabytes of disk traffic every time it refreshed, competing for the same
 * disk the download is trying to write to. So each file is opened and exactly one 4096
 * byte read is issued against it.
 *
 * ## Nothing here fails
 *
 * A world folder that does not exist yet, a dimension folder that will never exist because
 * the player never went there, and a region file caught halfway through being written by
 * the downloader running right now are all ordinary, expected states of a download in
 * progress. Reporting them as errors would mean a progress display that spends its early
 * life showing failures for a job that is going perfectly. They count as zero instead.
 */

import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** The header is 1024 four-byte entries, and nothing outside it is read. */
const LOCATION_TABLE_BYTES = 4096;
const LOCATION_ENTRIES = 1024;

/**
 * Anvil region file names, e.g. `r.-3.11.mca`.
 *
 * Matched rather than assumed because a world folder legitimately accumulates neighbours
 * this must not read: `.mcr` files from an ancient world, `.mca_tmp` staging files that
 * some tools write beside their target, and whatever the operating system's own indexer
 * decided to leave behind.
 */
const REGION_FILE = /^r\.-?\d+\.-?\d+\.mca$/;

export interface DimensionChunkCount {
    readonly dimension: "overworld" | "nether" | "end";
    readonly regionFiles: number;
    readonly chunks: number;
    readonly bytes: number;
}

export interface WorldChunkCount {
    readonly total: number;
    readonly bytes: number;
    readonly dimensions: readonly DimensionChunkCount[];
    /** ISO-8601 with offset, so a displayed figure can say how stale it is. */
    readonly countedAt: string;
}

/**
 * Where each dimension keeps its regions, in the layout a single-player world uses.
 *
 * This is the client-side layout the world downloader writes, which is also the layout
 * this app renders from. A server's `world_nether` and `world_the_end` siblings are a
 * different arrangement of the same data and are not this module's concern.
 */
const DIMENSION_FOLDERS: readonly {
    readonly dimension: DimensionChunkCount["dimension"];
    readonly segments: readonly string[];
}[] = [
    { dimension: "overworld", segments: ["region"] },
    { dimension: "nether", segments: ["DIM-1", "region"] },
    { dimension: "end", segments: ["DIM1", "region"] },
];

/**
 * Counts the chunks a single region file holds, from its header alone.
 *
 * Returns 0 rather than throwing for every way this can go wrong, and they are all the
 * same way in practice: the file is being written right now. A downloader that has just
 * created a region file and not yet flushed its header produces a file shorter than 4096
 * bytes, and a file that vanishes between the directory listing and this read is the same
 * event a moment later. Neither is a failure of the count; both mean "no chunks are
 * readable here yet", which is true and becomes false on its own within a second.
 */
export async function countRegionChunks(file: string): Promise<number> {
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
        handle = await open(file, "r");
        const header = Buffer.alloc(LOCATION_TABLE_BYTES);
        const { bytesRead } = await handle.read(header, 0, LOCATION_TABLE_BYTES, 0);
        // A partial header is not a partially valid header. The entries are fixed-width
        // and positional, so a truncated read gives no way to know whether the bytes
        // present are a complete prefix or a page the writer is still filling in.
        if (bytesRead < LOCATION_TABLE_BYTES) return 0;

        let present = 0;
        for (let entry = 0; entry < LOCATION_ENTRIES; entry += 1) {
            if (header.readUInt32BE(entry * 4) !== 0) present += 1;
        }
        return present;
    } catch {
        return 0;
    } finally {
        // Closing matters here specifically because this runs across hundreds of files on
        // every refresh, so a leaked handle per file would exhaust the process's descriptor
        // budget within a few minutes of watching a download.
        await handle?.close().catch(() => undefined);
    }
}

async function countDimension(
    dimension: DimensionChunkCount["dimension"],
    folder: string,
): Promise<DimensionChunkCount | null> {
    let entries: string[];
    try {
        entries = await readdir(folder);
    } catch {
        // The folder is absent, which is what a dimension the player has never entered
        // looks like, and what every dimension looks like before the download starts
        // writing. Absent is not the same as empty, so it is reported as no dimension at
        // all rather than as a dimension holding nothing.
        return null;
    }

    let regionFiles = 0;
    let chunks = 0;
    let bytes = 0;
    for (const name of entries) {
        if (!REGION_FILE.test(name)) continue;
        const file = join(folder, name);

        let size = 0;
        try {
            size = (await stat(file)).size;
        } catch {
            // Gone between the listing and now. The chunk count below will independently
            // reach the same conclusion, so this contributes nothing rather than aborting.
            continue;
        }

        regionFiles += 1;
        bytes += size;
        chunks += await countRegionChunks(file);
    }

    return { dimension, regionFiles, chunks, bytes };
}

/**
 * Counts every chunk on disk under a world folder, across all three dimensions.
 *
 * A world folder that does not exist yet returns a zeroed count rather than a failure,
 * because a download that has been asked for but has not written anything is a real and
 * entirely expected state. Treating it as an error would mean the surface that started the
 * download shows a failure for the first few seconds of every successful run, which trains
 * people to ignore the one place a genuine failure would appear.
 *
 * Dimensions are listed only when their region folder exists. An end dimension the player
 * never visited is not a dimension with zero chunks in it; it is a dimension there is
 * nothing to say about, and printing a zero beside it invites the reader to wonder what
 * went wrong with a download where nothing did.
 */
export async function countWorldChunks(worldFolder: string): Promise<WorldChunkCount> {
    const dimensions: DimensionChunkCount[] = [];
    let total = 0;
    let bytes = 0;

    for (const { dimension, segments } of DIMENSION_FOLDERS) {
        const counted = await countDimension(dimension, join(worldFolder, ...segments));
        if (counted === null) continue;
        dimensions.push(counted);
        total += counted.chunks;
        bytes += counted.bytes;
    }

    return { total, bytes, dimensions, countedAt: new Date().toISOString() };
}
