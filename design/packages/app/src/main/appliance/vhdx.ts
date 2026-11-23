import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";

/**
 * A fixed VHDX writer. Hyper-V and Windows mount the result directly.
 *
 * The layout follows the published VHDX format: a 1 MiB header section (file identifier, two
 * headers, two region tables), a 1 MiB log, a 1 MiB metadata region, a 1 MiB block allocation
 * table, then the payload at 4 MiB. Every block is marked fully present and the file is created
 * with "leave blocks allocated" set, which is what makes it a fixed disk.
 */

const MIB = 1024 * 1024;
export const VHDX_BLOCK_SIZE = 32 * MIB;
export const VHDX_PAYLOAD_OFFSET = 4 * MIB;
const LOGICAL_SECTOR = 512;
const PHYSICAL_SECTOR = 4096;
const CHUNK_RATIO = Math.floor((2 ** 23 * LOGICAL_SECTOR) / VHDX_BLOCK_SIZE);

const CRC32C_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1;
        table[i] = c >>> 0;
    }
    return table;
})();

export function crc32c(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data) crc = (CRC32C_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** Mixed-endian GUID bytes from the canonical text form. */
export function guidBytes(text: string): Buffer {
    const hex = text.replace(/-/gu, "");
    if (!/^[0-9a-fA-F]{32}$/u.test(hex)) throw new Error(`Not a GUID: ${text}`);
    const b = Buffer.from(hex, "hex");
    return Buffer.from([b[3], b[2], b[1], b[0], b[5], b[4], b[7], b[6], ...b.subarray(8)] as number[]);
}

const GUID = {
    bat: "2DC27766-F623-4200-9D64-115E9BFD4A08",
    metadata: "8B7CA206-4790-4B9A-B8FE-575F050F886E",
    fileParameters: "CAA16737-FA36-4D43-B3B6-33F0AA44E76B",
    virtualDiskSize: "2FA54224-CD1B-4876-B211-5DBED83BF4B8",
    virtualDiskId: "BECA12AB-B2E6-4523-93EF-C309E000C746",
    logicalSector: "8141BF1D-A96F-4709-BA47-F233A8FAAB5F",
    physicalSector: "CDA348C7-445D-4471-9CC9-E9885251C556",
};

export interface VhdxLayout {
    readonly blocks: number;
    readonly batEntries: number;
    readonly fileBytes: number;
}

export function vhdxLayout(virtualBytes: number): VhdxLayout {
    if (virtualBytes <= 0 || virtualBytes % MIB !== 0) throw new Error("A VHDX virtual size must be a whole number of MiB.");
    const blocks = Math.ceil(virtualBytes / VHDX_BLOCK_SIZE);
    const batEntries = blocks + Math.floor((blocks - 1) / CHUNK_RATIO);
    if (batEntries * 8 > MIB) throw new Error("This image is larger than the fixed VHDX writer supports (about 4 TiB).");
    return { blocks, batEntries, fileBytes: VHDX_PAYLOAD_OFFSET + blocks * VHDX_BLOCK_SIZE };
}

function withChecksum(buffer: Buffer): Buffer {
    buffer.writeUInt32LE(0, 4);
    buffer.writeUInt32LE(crc32c(buffer), 4);
    return buffer;
}

function header(sequence: number, fileWriteGuid: Buffer, dataWriteGuid: Buffer): Buffer {
    const h = Buffer.alloc(4096);
    h.write("head", 0, "ascii");
    h.writeBigUInt64LE(BigInt(sequence), 8);
    fileWriteGuid.copy(h, 16);
    dataWriteGuid.copy(h, 32);
    // LogGuid stays zero: there is no log to replay.
    h.writeUInt16LE(0, 64);
    h.writeUInt16LE(1, 66);
    h.writeUInt32LE(MIB, 68);
    h.writeBigUInt64LE(BigInt(MIB), 72);
    return withChecksum(h);
}

function regionTable(): Buffer {
    const r = Buffer.alloc(64 * 1024);
    r.write("regi", 0, "ascii");
    r.writeUInt32LE(2, 8);
    const entry = (at: number, guid: string, offset: number): void => {
        guidBytes(guid).copy(r, at);
        r.writeBigUInt64LE(BigInt(offset), at + 16);
        r.writeUInt32LE(MIB, at + 24);
        r.writeUInt32LE(1, at + 28);
    };
    entry(16, GUID.bat, 3 * MIB);
    entry(48, GUID.metadata, 2 * MIB);
    return withChecksum(r);
}

function metadataRegion(virtualBytes: number, diskId: Buffer): Buffer {
    const m = Buffer.alloc(MIB);
    m.write("metadata", 0, "ascii");
    const items: { guid: string; flags: number; data: Buffer }[] = [];
    const fileParameters = Buffer.alloc(8);
    fileParameters.writeUInt32LE(VHDX_BLOCK_SIZE, 0);
    fileParameters.writeUInt32LE(1, 4); // LeaveBlocksAllocated: a fixed disk
    items.push({ guid: GUID.fileParameters, flags: 0x4, data: fileParameters });
    const size = Buffer.alloc(8);
    size.writeBigUInt64LE(BigInt(virtualBytes));
    items.push({ guid: GUID.virtualDiskSize, flags: 0x6, data: size });
    items.push({ guid: GUID.virtualDiskId, flags: 0x6, data: diskId });
    const logical = Buffer.alloc(4);
    logical.writeUInt32LE(LOGICAL_SECTOR);
    items.push({ guid: GUID.logicalSector, flags: 0x6, data: logical });
    const physical = Buffer.alloc(4);
    physical.writeUInt32LE(PHYSICAL_SECTOR);
    items.push({ guid: GUID.physicalSector, flags: 0x6, data: physical });
    m.writeUInt16LE(items.length, 10);
    let dataAt = 64 * 1024;
    items.forEach((item, index) => {
        const at = 32 + index * 32;
        guidBytes(item.guid).copy(m, at);
        m.writeUInt32LE(dataAt, at + 16);
        m.writeUInt32LE(item.data.length, at + 20);
        m.writeUInt32LE(item.flags, at + 24);
        item.data.copy(m, dataAt);
        dataAt += 8;
    });
    return m;
}

function allocationTable(layout: VhdxLayout): Buffer {
    const bat = Buffer.alloc(MIB);
    let entry = 0;
    for (let block = 0; block < layout.blocks; block += 1) {
        const offsetMiB = (VHDX_PAYLOAD_OFFSET + block * VHDX_BLOCK_SIZE) / MIB;
        bat.writeBigUInt64LE((BigInt(offsetMiB) << 20n) | 6n, entry * 8);
        entry += 1;
        // After every chunk of payload blocks comes one sector-bitmap entry, left "not present".
        if ((block + 1) % CHUNK_RATIO === 0 && block + 1 < layout.blocks) entry += 1;
    }
    return bat;
}

/** The first 4 MiB of the file: everything before the payload. */
export function vhdxPrefix(virtualBytes: number, ids?: { file?: Buffer; data?: Buffer; disk?: Buffer }): Buffer {
    const layout = vhdxLayout(virtualBytes);
    const out = Buffer.alloc(VHDX_PAYLOAD_OFFSET);
    const identifier = Buffer.alloc(64 * 1024);
    identifier.write("vhdxfile", 0, "ascii");
    identifier.write("Worldlens appliance", 8, "utf16le");
    identifier.copy(out, 0);
    const fileGuid = ids?.file ?? randomBytes(16);
    const dataGuid = ids?.data ?? randomBytes(16);
    header(1, fileGuid, dataGuid).copy(out, 64 * 1024);
    header(2, fileGuid, dataGuid).copy(out, 128 * 1024);
    const table = regionTable();
    table.copy(out, 192 * 1024);
    table.copy(out, 256 * 1024);
    metadataRegion(virtualBytes, ids?.disk ?? randomBytes(16)).copy(out, 2 * MIB);
    allocationTable(layout).copy(out, 3 * MIB);
    return out;
}

/** Writes `raw` (whose size must be a whole number of MiB) as a fixed VHDX at `destination`. */
export async function writeFixedVhdx(raw: string, destination: string, onProgress?: (fraction: number) => void): Promise<number> {
    const { size } = await fs.stat(raw);
    const layout = vhdxLayout(size);
    const out = await fs.open(destination, "w");
    try {
        await out.write(vhdxPrefix(size), 0, VHDX_PAYLOAD_OFFSET, 0);
        let position = VHDX_PAYLOAD_OFFSET;
        for await (const chunk of createReadStream(raw, { highWaterMark: 8 * MIB })) {
            const buffer = chunk as Buffer;
            await out.write(buffer, 0, buffer.length, position);
            position += buffer.length;
            onProgress?.((position - VHDX_PAYLOAD_OFFSET) / size);
        }
        await out.truncate(layout.fileBytes);
    } finally {
        await out.close();
    }
    return layout.fileBytes;
}
