/**
 * zip-writer.mjs - a small, deterministic zip writer for build-time archives.
 *
 * The same input files always produce the same bytes: entries are sorted by name, carry one
 * fixed timestamp and no platform attributes beyond a regular-file mode. That matters because
 * the archive's SHA-256 is written into a manifest and checked again on a user's machine, and
 * a digest that changed with the build clock would describe nothing.
 *
 * It writes deflated entries without Zip64, so it is for archives well under 4 GB with fewer
 * than 65,535 entries, and it refuses anything larger rather than emitting a broken file.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00:00, the earliest moment the format can express.
const DOS_TIME = 0;
const DOS_DATE = 0x21;

/**
 * @param {string} target where the archive is written
 * @param {ReadonlyArray<{ name: string, path: string }>} files entry name and source file
 * @returns {Promise<{ entries: number, size: number, sha256: string, uncompressedSize: number }>}
 */
export async function writeDeterministicZip(target, files) {
    const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (sorted.length >= 0xffff) throw new Error(`too many entries for a plain zip: ${String(sorted.length)}`);

    const local = [];
    const central = [];
    let offset = 0;
    let uncompressedSize = 0;

    for (const file of sorted) {
        if (file.name.length === 0 || file.name.startsWith("/") || file.name.split("/").includes("..")) {
            throw new Error(`unsafe archive entry name: ${file.name}`);
        }
        const data = await readFile(file.path);
        const deflated = deflateRawSync(data, { level: 9 });
        const useDeflate = deflated.length < data.length;
        const stored = useDeflate ? deflated : data;
        const method = useDeflate ? 8 : 0;
        const name = Buffer.from(file.name, "utf8");
        const crc = crc32(data);

        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x0800, 6);
        header.writeUInt16LE(method, 8);
        header.writeUInt16LE(DOS_TIME, 10);
        header.writeUInt16LE(DOS_DATE, 12);
        header.writeUInt32LE(crc, 14);
        header.writeUInt32LE(stored.length, 18);
        header.writeUInt32LE(data.length, 22);
        header.writeUInt16LE(name.length, 26);
        header.writeUInt16LE(0, 28);
        local.push(header, name, stored);

        const record = Buffer.alloc(46);
        record.writeUInt32LE(0x02014b50, 0);
        record.writeUInt16LE(0x0314, 4);
        record.writeUInt16LE(20, 6);
        record.writeUInt16LE(0x0800, 8);
        record.writeUInt16LE(method, 10);
        record.writeUInt16LE(DOS_TIME, 12);
        record.writeUInt16LE(DOS_DATE, 14);
        record.writeUInt32LE(crc, 16);
        record.writeUInt32LE(stored.length, 20);
        record.writeUInt32LE(data.length, 24);
        record.writeUInt16LE(name.length, 28);
        record.writeUInt32LE(((0o100644 << 16) >>> 0), 38);
        record.writeUInt32LE(offset, 42);
        central.push(record, name);

        offset += header.length + name.length + stored.length;
        uncompressedSize += data.length;
        if (offset >= 0xffffffff) throw new Error("the archive is too large for a plain zip");
    }

    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(sorted.length, 8);
    end.writeUInt16LE(sorted.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);

    const bytes = Buffer.concat([...local, directory, end]);
    await writeFile(target, bytes);
    return {
        entries: sorted.length,
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        uncompressedSize,
    };
}
