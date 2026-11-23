import { NbtError, type Compression } from "./types.js";
import { compressPayload, decompressPayload } from "./codec.js";

const SECTOR = 4096;
const HEADER = 8192;

/** One chunk slot of an Anvil region file. */
export interface RegionChunk {
    /** `x + z * 32`, the slot's place in the file header. */
    index: number;
    /** Chunk coordinates inside the region, 0 to 31. */
    x: number;
    z: number;
    sector: number;
    sectors: number;
    /** Stored payload size in bytes, without the five-byte chunk header. */
    size: number;
    /** The compression byte as stored (1 gzip, 2 zlib, 3 none, 4 LZ4, 127 custom). */
    compressionType: number;
    timestamp: number;
    /** False when this editor cannot read it, with the reason in `unsupported`. */
    readable: boolean;
    unsupported: string | null;
}

function u32(bytes: Uint8Array, at: number): number {
    return (
        (bytes[at]! * 0x1000000 +
            (bytes[at + 1]! << 16) +
            (bytes[at + 2]! << 8) +
            bytes[at + 3]!) >>>
        0
    );
}

function view(bytes: Uint8Array): DataView {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** The coordinates a region file name carries, or null when it is not `r.X.Z.mca`. */
export function regionCoordinates(fileName: string): { x: number; z: number } | null {
    const match = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(fileName);
    return match === null ? null : { x: Number(match[1]), z: Number(match[2]) };
}

/**
 * What the caller can handle beyond gzip, zlib and none.
 *
 * LZ4 (compression byte 4, lz4-java block stream) needs a codec this package does not carry, and
 * an external chunk (compression byte with 128 added: the data lives in `c.<x>.<z>.mcc` beside the
 * region file because it did not fit) needs file access. The desktop service has both and says so;
 * without them those chunks are listed but marked unreadable with the reason.
 */
export interface RegionSupport {
    readonly lz4?: boolean;
    readonly external?: boolean;
}

/** Lists every populated chunk slot, validating each against the file's size. */
export function listRegionChunks(bytes: Uint8Array, support: RegionSupport = {}): RegionChunk[] {
    if (bytes.length < HEADER) {
        if (bytes.length === 0) return [];
        throw new NbtError("That region file is shorter than its header.", "malformed");
    }
    const v = view(bytes);
    const out: RegionChunk[] = [];
    for (let index = 0; index < 1024; index++) {
        const location = u32(bytes, index * 4);
        const sector = location >>> 8;
        const sectors = location & 0xff;
        if (sector === 0 && sectors === 0) continue;
        const timestamp = v.getUint32(SECTOR + index * 4, false);
        const entry: RegionChunk = {
            index,
            x: index % 32,
            z: Math.floor(index / 32),
            sector,
            sectors,
            size: 0,
            compressionType: 0,
            timestamp,
            readable: false,
            unsupported: null,
        };
        const at = sector * SECTOR;
        if (sector < 2 || at + 5 > bytes.length) {
            entry.unsupported = "The slot points outside the file.";
        } else {
            const length = v.getUint32(at, false);
            const type = bytes[at + 4]!;
            entry.compressionType = type;
            entry.size = Math.max(0, length - 1);
            const base = type & 0x7f;
            const external = (type & 0x80) !== 0;
            if (length < 1 || at + 4 + length > bytes.length)
                entry.unsupported = "The chunk is cut off.";
            else if (external && support.external !== true)
                entry.unsupported = "The chunk is stored in a separate .mcc file.";
            else if (base === 4 && support.lz4 !== true)
                entry.unsupported = "LZ4 chunks cannot be edited here yet.";
            else if (base !== 1 && base !== 2 && base !== 3 && base !== 4)
                entry.unsupported = `Unknown chunk compression (${base}).`;
            else entry.readable = true;
        }
        out.push(entry);
    }
    return out;
}

/**
 * One chunk exactly as stored: its compression byte and its compressed bytes. For an external
 * chunk the bytes are empty, because the data is in the `.mcc` file; `external` says so.
 */
export function storedRegionChunk(
    bytes: Uint8Array,
    index: number,
): { compressionType: number; stored: Uint8Array; external: boolean } {
    const chunk = listRegionChunks(bytes, { lz4: true, external: true }).find(
        (c) => c.index === index,
    );
    if (chunk === undefined)
        throw new NbtError("That chunk is not stored in this region.", "not-found");
    if (!chunk.readable)
        throw new NbtError(chunk.unsupported ?? "That chunk cannot be read.", "unsupported");
    const at = chunk.sector * SECTOR;
    const length = view(bytes).getUint32(at, false);
    const external = (chunk.compressionType & 0x80) !== 0;
    return {
        compressionType: chunk.compressionType,
        stored: external ? new Uint8Array(0) : bytes.slice(at + 5, at + 4 + length),
        external,
    };
}

/** `c.<x>.<z>.mcc`, the file an external chunk lives in, from the region's own coordinates. */
export function externalChunkName(regionX: number, regionZ: number, index: number): string {
    return `c.${regionX * 32 + (index % 32)}.${regionZ * 32 + Math.floor(index / 32)}.mcc`;
}

/** The largest chunk body a region file can hold in its own sectors (255 sectors with the header). */
export const MAX_INLINE_CHUNK_BYTES = 255 * SECTOR - 5;

/**
 * Writes already-compressed chunk bytes into slot `index` and returns the new region bytes.
 *
 * `compressionType` is written as given, so an external chunk passes its type with 128 added and
 * an empty body (the data goes to the `.mcc` file, which the caller writes). Placement follows
 * `replaceRegionChunk`: in place when it fits, otherwise fresh sectors at the end.
 */
export function writeStoredRegionChunk(
    bytes: Uint8Array,
    index: number,
    body: Uint8Array,
    compressionType: number,
    timestamp = Math.floor(Date.now() / 1000),
): Uint8Array {
    const chunk = listRegionChunks(bytes, { lz4: true, external: true }).find(
        (c) => c.index === index,
    );
    if (chunk === undefined)
        throw new NbtError("That chunk is not stored in this region.", "not-found");
    const total = 4 + 1 + body.length;
    const sectorsNeeded = Math.max(1, Math.ceil(total / SECTOR));
    if (sectorsNeeded > 255)
        throw new NbtError("That chunk is too large to store in a region file.", "invalid-value");
    let sector = chunk.sector;
    let out: Uint8Array;
    if (sectorsNeeded <= chunk.sectors) {
        out = Uint8Array.from(bytes);
    } else {
        const end = Math.ceil(bytes.length / SECTOR);
        sector = end;
        out = new Uint8Array((end + sectorsNeeded) * SECTOR);
        out.set(bytes);
    }
    const start = sector * SECTOR;
    const dv = view(out);
    const clearUntil =
        start +
        (sector === chunk.sector ? Math.max(sectorsNeeded, chunk.sectors) : sectorsNeeded) * SECTOR;
    out.fill(0, start, Math.min(clearUntil, out.length));
    dv.setUint32(start, body.length + 1, false);
    out[start + 4] = compressionType;
    out.set(body, start + 5);
    const sectorsToRecord = sector === chunk.sector ? Math.max(sectorsNeeded, 1) : sectorsNeeded;
    dv.setUint32(index * 4, ((sector << 8) | sectorsToRecord) >>> 0, false);
    dv.setUint32(SECTOR + index * 4, timestamp, false);
    return out;
}

function compressionOf(type: number): Compression {
    return type === 1 ? "gzip" : type === 2 ? "zlib" : "none";
}

/** The decompressed NBT payload of one chunk. */
export function readRegionChunk(
    bytes: Uint8Array,
    index: number,
): { payload: Uint8Array; compressionType: number } {
    const chunk = listRegionChunks(bytes).find((c) => c.index === index);
    if (chunk === undefined)
        throw new NbtError("That chunk is not stored in this region.", "not-found");
    if (!chunk.readable)
        throw new NbtError(chunk.unsupported ?? "That chunk cannot be read.", "unsupported");
    const at = chunk.sector * SECTOR;
    const length = view(bytes).getUint32(at, false);
    const stored = bytes.subarray(at + 5, at + 4 + length);
    return {
        payload: decompressPayload(stored, compressionOf(chunk.compressionType)),
        compressionType: chunk.compressionType,
    };
}

/**
 * Writes one chunk back and returns the new region bytes.
 *
 * The chunk keeps its compression type. If the new data fits the sectors it already owns it
 * is written there; otherwise it moves to fresh sectors at the end of the file and the old
 * ones are left as free space, which is how the game itself grows a region. Every other
 * chunk's bytes and timestamp are untouched.
 */
export function replaceRegionChunk(
    bytes: Uint8Array,
    index: number,
    payload: Uint8Array,
    compressionType: number,
    timestamp = Math.floor(Date.now() / 1000),
): Uint8Array {
    if (compressionType !== 1 && compressionType !== 2 && compressionType !== 3)
        throw new NbtError("That chunk's compression cannot be written here.", "unsupported");
    const chunks = listRegionChunks(bytes);
    const chunk = chunks.find((c) => c.index === index);
    if (chunk === undefined)
        throw new NbtError("That chunk is not stored in this region.", "not-found");
    const body = compressPayload(payload, compressionOf(compressionType));
    const total = 4 + 1 + body.length;
    const sectorsNeeded = Math.ceil(total / SECTOR);
    if (sectorsNeeded > 255)
        throw new NbtError("That chunk is too large to store in a region file.", "invalid-value");
    let sector = chunk.sector;
    let out: Uint8Array;
    if (sectorsNeeded <= chunk.sectors) {
        out = Uint8Array.from(bytes);
    } else {
        const end = Math.ceil(bytes.length / SECTOR);
        sector = end;
        out = new Uint8Array((end + sectorsNeeded) * SECTOR);
        out.set(bytes);
    }
    const base = sector * SECTOR;
    const dv = view(out);
    const clearUntil =
        base +
        (sector === chunk.sector ? Math.max(sectorsNeeded, chunk.sectors) : sectorsNeeded) * SECTOR;
    out.fill(0, base, Math.min(clearUntil, out.length));
    dv.setUint32(base, body.length + 1, false);
    out[base + 4] = compressionType;
    out.set(body, base + 5);
    const sectorsToRecord = sector === chunk.sector ? Math.max(sectorsNeeded, 1) : sectorsNeeded;
    dv.setUint32(index * 4, ((sector << 8) | sectorsToRecord) >>> 0, false);
    dv.setUint32(SECTOR + index * 4, timestamp, false);
    return out;
}
