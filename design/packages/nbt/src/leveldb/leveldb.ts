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
