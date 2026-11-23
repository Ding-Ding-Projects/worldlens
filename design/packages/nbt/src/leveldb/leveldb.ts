/**
 * A read-only LevelDB reader, enough to open a Bedrock Edition world's `db` folder.
 *
 * Bedrock stores its world in Mojang's LevelDB fork. This reads both kinds of file it leaves:
 * - `*.log`: the write-ahead log, 32 KiB blocks of records (full, first, middle, last), each
 *   record a write batch of puts and deletes with a sequence number.
 * - `*.ldb` / `*.sst`: sorted tables, prefix-compressed blocks found through an index block
 *   and a 48-byte footer. Blocks may be stored plain, Snappy (1), zlib (2) or raw deflate (4),
 *   the last two being Mojang's additions.
 * Keys in tables carry an 8-byte trailer (sequence << 8 | type). The newest sequence for each
 * key wins and a deletion hides older values, which is all reading needs: the MANIFEST only
 * decides which files are live, and LevelDB removes obsolete files itself.
 *
 * Pure: the caller supplies the files' bytes. No checksums are verified.
 */
import { inflateRawSync, inflateSync } from "node:zlib";

export interface LevelDbEntry {
    readonly key: Uint8Array;
    readonly value: Uint8Array;
    readonly sequence: bigint;
}

class Cursor {
    pos = 0;
    constructor(readonly bytes: Uint8Array) {}
    get done(): boolean {
        return this.pos >= this.bytes.length;
    }
    byte(): number {
        if (this.pos >= this.bytes.length) throw new Error("LevelDB data ended early.");
        return this.bytes[this.pos++]!;
    }
    varint(): number {
        let result = 0;
        for (let shift = 0; shift < 35; shift += 7) {
            const b = this.byte();
            result += (b & 0x7f) * 2 ** shift;
            if ((b & 0x80) === 0) return result;
        }
        throw new Error("Bad varint.");
    }
    varint64(): bigint {
        let result = 0n;
        for (let shift = 0n; shift < 70n; shift += 7n) {
            const b = this.byte();
            result |= BigInt(b & 0x7f) << shift;
            if ((b & 0x80) === 0) return result;
        }
        throw new Error("Bad varint.");
    }
    take(n: number): Uint8Array {
        if (this.pos + n > this.bytes.length) throw new Error("LevelDB data ended early.");
        this.pos += n;
        return this.bytes.subarray(this.pos - n, this.pos);
    }
    slice(): Uint8Array {
        return this.take(this.varint());
    }
}

/* --------------------------------- Snappy ---------------------------------- */

export function snappyDecompress(input: Uint8Array): Uint8Array {
    const c = new Cursor(input);
    const length = c.varint();
    const out = new Uint8Array(length);
    let at = 0;
    while (!c.done) {
        const tag = c.byte();
        const kind = tag & 3;
        if (kind === 0) {
            let len = tag >> 2;
            if (len >= 60) {
                const bytes = len - 59;
                len = 0;
                for (let i = 0; i < bytes; i++) len |= c.byte() << (8 * i);
            }
            len += 1;
            out.set(c.take(len), at);
            at += len;
            continue;
        }
        let len: number;
        let offset: number;
        if (kind === 1) {
            len = ((tag >> 2) & 7) + 4;
            offset = ((tag >> 5) << 8) | c.byte();
        } else if (kind === 2) {
            len = (tag >> 2) + 1;
            offset = c.byte() | (c.byte() << 8);
        } else {
            len = (tag >> 2) + 1;
            offset = (c.byte() | (c.byte() << 8) | (c.byte() << 16) | (c.byte() << 24)) >>> 0;
        }
        if (offset === 0 || offset > at) throw new Error("Bad Snappy copy.");
        for (let i = 0; i < len; i++, at++) out[at] = out[at - offset]!;
    }
    if (at !== length) throw new Error("Snappy length mismatch.");
    return out;
}

/* --------------------------------- Tables ---------------------------------- */

function readBlock(file: Uint8Array, offset: number, size: number): Uint8Array {
    if (offset + size + 5 > file.length)
        throw new Error("A table block points past the end of the file.");
    const raw = file.subarray(offset, offset + size);
    const type = file[offset + size]!;
    switch (type) {
        case 0:
            return raw;
        case 1:
            return snappyDecompress(raw);
        case 2:
            return new Uint8Array(inflateSync(raw));
        case 4:
            return new Uint8Array(inflateRawSync(raw));
        default:
            throw new Error(`Unknown block compression ${type}.`);
    }
}

function blockEntries(block: Uint8Array): { key: Uint8Array; value: Uint8Array }[] {
    if (block.length < 4) return [];
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    const restarts = view.getUint32(block.length - 4, true);
    const end = block.length - 4 - restarts * 4;
    if (end < 0) throw new Error("Bad block restart count.");
    const c = new Cursor(block.subarray(0, end));
    const out: { key: Uint8Array; value: Uint8Array }[] = [];
    let last = new Uint8Array(0);
    while (!c.done) {
        const shared = c.varint();
        const unshared = c.varint();
        const valueLength = c.varint();
        if (shared > last.length) throw new Error("Bad key prefix.");
        const key = new Uint8Array(shared + unshared);
        key.set(last.subarray(0, shared), 0);
        key.set(c.take(unshared), shared);
        out.push({ key, value: c.take(valueLength) });
        last = key;
    }
    return out;
}

const TABLE_MAGIC = 0xdb4775248b80fb57n;

/** Every entry in one sorted table, with its sequence; deletions have `value === null`. */
export function readTable(
    file: Uint8Array,
): { key: Uint8Array; value: Uint8Array | null; sequence: bigint }[] {
    if (file.length < 48) throw new Error("The table is too short.");
    const footer = file.subarray(file.length - 48);
    if (
        new DataView(footer.buffer, footer.byteOffset + 40, 8).getBigUint64(0, true) !== TABLE_MAGIC
    )
        throw new Error("Not a LevelDB table.");
    const f = new Cursor(footer);
    f.varint(); // metaindex offset
    f.varint(); // metaindex size
    const indexOffset = f.varint();
    const indexSize = f.varint();
    const out: { key: Uint8Array; value: Uint8Array | null; sequence: bigint }[] = [];
    for (const handle of blockEntries(readBlock(file, indexOffset, indexSize))) {
        const h = new Cursor(handle.value);
        for (const entry of blockEntries(readBlock(file, h.varint(), h.varint()))) {
            if (entry.key.length < 8) continue;
            const trailer = new DataView(
                entry.key.buffer,
                entry.key.byteOffset + entry.key.length - 8,
                8,
            ).getBigUint64(0, true);
            const type = Number(trailer & 0xffn);
            out.push({
                key: entry.key.slice(0, entry.key.length - 8),
                value: type === 1 ? entry.value : null,
                sequence: trailer >> 8n,
            });
        }
    }
    return out;
}

/* ----------------------------------- Log ----------------------------------- */

const LOG_BLOCK = 32768;

/** Every put and delete in a write-ahead log, in order. A torn tail is ignored, as LevelDB does. */
export function readLog(
    file: Uint8Array,
): { key: Uint8Array; value: Uint8Array | null; sequence: bigint }[] {
    const records: Uint8Array[] = [];
    let pending: Uint8Array[] = [];
    let pos = 0;
    while (pos + 7 <= file.length) {
        const blockLeft = LOG_BLOCK - (pos % LOG_BLOCK);
        if (blockLeft < 7) {
            pos += blockLeft;
            continue;
        }
        const length = file[pos + 4]! | (file[pos + 5]! << 8);
        const type = file[pos + 6]!;
        if (type === 0 && length === 0) {
            pos += blockLeft; // zero padding
            continue;
        }
        if (pos + 7 + length > file.length) break;
        const data = file.subarray(pos + 7, pos + 7 + length);
        pos += 7 + length;
        if (type === 1) records.push(data);
        else if (type === 2) pending = [data];
        else if (type === 3) pending.push(data);
        else if (type === 4) {
            pending.push(data);
            const total = pending.reduce((n, p) => n + p.length, 0);
            const joined = new Uint8Array(total);
            let at = 0;
            for (const p of pending) {
                joined.set(p, at);
                at += p.length;
            }
            records.push(joined);
            pending = [];
        }
    }
    const out: { key: Uint8Array; value: Uint8Array | null; sequence: bigint }[] = [];
    for (const record of records) {
        if (record.length < 12) continue;
        const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
        let sequence = view.getBigUint64(0, true);
        const count = view.getUint32(8, true);
        const c = new Cursor(record.subarray(12));
        try {
            for (let i = 0; i < count; i++) {
                const tag = c.byte();
                const key = c.slice().slice();
                const value = tag === 1 ? c.slice().slice() : null;
                out.push({ key, value, sequence });
                sequence += 1n;
            }
        } catch {
            // A batch cut short by a crash is dropped, as LevelDB's own recovery would.
        }
    }
    return out;
}

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

/**
 * The live contents of a database from its files (name → bytes), newest value per key, sorted
 * by key bytes. Files that are not tables or logs are ignored; an unreadable table is reported.
 */
export function readLevelDb(files: ReadonlyMap<string, Uint8Array>): {
    entries: LevelDbEntry[];
    problems: string[];
} {
    const latest = new Map<
        string,
        { key: Uint8Array; value: Uint8Array | null; sequence: bigint }
    >();
    const problems: string[] = [];
    const take = (e: { key: Uint8Array; value: Uint8Array | null; sequence: bigint }): void => {
        const k = hex(e.key);
        const seen = latest.get(k);
        if (seen === undefined || e.sequence >= seen.sequence) latest.set(k, e);
    };
    for (const [name, bytes] of files) {
        try {
            if (/\.(ldb|sst)$/i.test(name)) readTable(bytes).forEach(take);
            else if (/\.log$/i.test(name)) readLog(bytes).forEach(take);
        } catch (error) {
            problems.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const entries = [...latest.values()]
        .filter((e): e is LevelDbEntry => e.value !== null)
        .sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
    return { entries, problems };
}

/* --------------------------------- Writing --------------------------------- */

const CRC32C_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0x82f63b78 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

export function crc32c(bytes: Uint8Array, seed = 0): number {
    let c = (seed ^ 0xffffffff) >>> 0;
    for (const b of bytes) c = CRC32C_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/** LevelDB stores checksums masked, so a CRC of data containing CRCs stays well behaved. */
export function maskCrc(crc: number): number {
    return (((crc >>> 15) | (crc << 17)) + 0xa282ead8) >>> 0;
}

function varintBytes(n: number): number[] {
    const out: number[] = [];
    while (n >= 0x80) {
        out.push((n & 0x7f) | 0x80);
        n = Math.floor(n / 128);
    }
    out.push(n);
    return out;
}

/** A write batch putting each value (or deleting, when `value` is null) at `sequence` onwards. */
export function encodeWriteBatch(
    ops: readonly { key: Uint8Array; value: Uint8Array | null }[],
    sequence: bigint,
): Uint8Array {
    const parts: number[] = [];
    for (const op of ops) {
        parts.push(op.value === null ? 0 : 1, ...varintBytes(op.key.length), ...op.key);
        if (op.value !== null) parts.push(...varintBytes(op.value.length), ...op.value);
    }
    const out = new Uint8Array(12 + parts.length);
    const view = new DataView(out.buffer);
    view.setBigUint64(0, sequence, true);
    view.setUint32(8, ops.length, true);
    out.set(parts, 12);
    return out;
}

/**
 * The bytes to append to a log of `existingLength` bytes so it gains one more record holding
 * `batch`, fragmented across 32 KiB blocks and checksummed the way LevelDB's own writer does.
 */
export function logRecordBytes(batch: Uint8Array, existingLength: number): Uint8Array {
    const chunks: Uint8Array[] = [];
    let offset = existingLength % LOG_BLOCK;
    let left = batch.length;
    let at = 0;
    let first = true;
    do {
        const room = LOG_BLOCK - offset;
        if (room < 7) {
            chunks.push(new Uint8Array(room)); // trailer padding, as the writer does
            offset = 0;
            continue;
        }
        const length = Math.min(left, room - 7);
        const end = left === length;
        const type = first && end ? 1 : first ? 2 : end ? 4 : 3;
        const data = batch.subarray(at, at + length);
        const header = new Uint8Array(7);
        const crc = maskCrc(crc32c(data, crc32c(Uint8Array.of(type))));
        new DataView(header.buffer).setUint32(0, crc, true);
        header[4] = length & 0xff;
        header[5] = length >> 8;
        header[6] = type;
        chunks.push(header, data);
        offset = (offset + 7 + length) % LOG_BLOCK;
        at += length;
        left -= length;
        first = false;
    } while (left > 0);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) {
        out.set(c, p);
        p += c.length;
    }
    return out;
}

/** The highest sequence number any table or log in these files holds. */
export function lastSequence(files: ReadonlyMap<string, Uint8Array>): bigint {
    let max = 0n;
    for (const [name, bytes] of files) {
        try {
            const entries = /\.(ldb|sst)$/i.test(name)
                ? readTable(bytes)
                : /\.log$/i.test(name)
                  ? readLog(bytes)
                  : [];
            for (const e of entries) if (e.sequence > max) max = e.sequence;
        } catch {
            // An unreadable file is reported by readLevelDb; it cannot lower the maximum.
        }
    }
    return max;
}
