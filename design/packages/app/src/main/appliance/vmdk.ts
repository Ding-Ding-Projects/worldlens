import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";

const SECTOR = 512;
const GRAIN_SECTORS = 128;
const GTES_PER_GT = 512;
const DESCRIPTOR_SECTORS = 20;

function geometry(sectors: number): { cylinders: number; heads: number; sectors: number } {
    return { cylinders: Math.min(16383, Math.max(1, Math.floor(sectors / (255 * 63)))), heads: 255, sectors: 63 };
}

function ddb(sectors: number, uuid: string = randomUUID()): string {
    const g = geometry(sectors);
    return [
        "",
        "# The Disk Data Base",
        "#DDB",
        "",
        'ddb.virtualHWVersion = "21"',
        `ddb.geometry.cylinders = "${g.cylinders}"`,
        `ddb.geometry.heads = "${g.heads}"`,
        `ddb.geometry.sectors = "${g.sectors}"`,
        'ddb.adapterType = "lsilogic"',
        `ddb.uuid.image = "${uuid}"`,
        "",
    ].join("\n");
}

/** A monolithicFlat descriptor: a small text file that points at the raw image. Used for VMs we start. */
export function flatVmdkDescriptor(rawFileName: string, sectors: number, cid = "fffffffe"): string {
    return [
        "# Disk DescriptorFile",
        "version=1",
        `CID=${cid}`,
        "parentCID=ffffffff",
        'createType="monolithicFlat"',
        "",
        "# Extent description",
        `RW ${sectors} FLAT "${rawFileName.replace(/"/gu, "")}" 0`,
        ddb(sectors),
    ].join("\n");
}

function sparseDescriptor(fileName: string, sectors: number): string {
    return [
        "# Disk DescriptorFile",
        "version=1",
        "CID=fffffffe",
        "parentCID=ffffffff",
        'createType="monolithicSparse"',
        "",
        "# Extent description",
        `RW ${sectors} SPARSE "${fileName.replace(/"/gu, "")}"`,
        ddb(sectors),
    ].join("\n");
}

export interface SparseLayout {
    readonly numGTs: number;
    readonly gdSectors: number;
    readonly rgdOffset: number;
    readonly gdOffset: number;
    readonly overheadSectors: number;
}

export function sparseLayout(capacitySectors: number): SparseLayout {
    const grains = Math.ceil(capacitySectors / GRAIN_SECTORS);
    const numGTs = Math.ceil(grains / GTES_PER_GT);
    const gdSectors = Math.ceil((numGTs * 4) / SECTOR);
    const gtSectors = (GTES_PER_GT * 4) / SECTOR;
    const rgdOffset = 1 + DESCRIPTOR_SECTORS;
    const rgtStart = rgdOffset + gdSectors;
    const gdOffset = rgtStart + numGTs * gtSectors;
    const gtStart = gdOffset + gdSectors;
    const end = gtStart + numGTs * gtSectors;
    const overheadSectors = Math.ceil(end / GRAIN_SECTORS) * GRAIN_SECTORS;
    return { numGTs, gdSectors, rgdOffset, gdOffset, overheadSectors };
}

/** The 512-byte hosted sparse extent header. */
export function sparseHeader(capacitySectors: number, layout: SparseLayout): Buffer {
    const h = Buffer.alloc(SECTOR);
    h.write("KDMV", 0, "ascii");
    h.writeUInt32LE(1, 4);
    h.writeUInt32LE(0x3, 8); // valid newline detection + redundant grain table
    h.writeBigUInt64LE(BigInt(capacitySectors), 12);
    h.writeBigUInt64LE(BigInt(GRAIN_SECTORS), 20);
    h.writeBigUInt64LE(1n, 28);
    h.writeBigUInt64LE(BigInt(DESCRIPTOR_SECTORS), 36);
    h.writeUInt32LE(GTES_PER_GT, 44);
    h.writeBigUInt64LE(BigInt(layout.rgdOffset), 48);
    h.writeBigUInt64LE(BigInt(layout.gdOffset), 56);
    h.writeBigUInt64LE(BigInt(layout.overheadSectors), 64);
    h[72] = 0;
    h[73] = 0x0a;
    h[74] = 0x20;
    h[75] = 0x0d;
    h[76] = 0x0a;
    h.writeUInt16LE(0, 77);
    return h;
}

/**
 * Writes `raw` as a single self-contained monolithicSparse VMDK. All-zero grains are skipped, so an
 * image that is mostly empty space stays small. VMware and VirtualBox both open this format.
 */
export async function writeSparseVmdk(raw: string, destination: string, onProgress?: (fraction: number) => void): Promise<{ bytes: number; capacitySectors: number }> {
    const { size } = await fs.stat(raw);
    if (size % SECTOR !== 0) throw new Error("A disk image must be a whole number of sectors.");
    const capacity = size / SECTOR;
    const layout = sparseLayout(capacity);
    const grains = Math.ceil(capacity / GRAIN_SECTORS);
    const table = new Uint32Array(layout.numGTs * GTES_PER_GT);
    const out = await fs.open(destination, "w");
    try {
        let next = layout.overheadSectors;
        const grainBytes = GRAIN_SECTORS * SECTOR;
        let grain = 0;
        let carry = Buffer.alloc(0);
        const emit = async (block: Buffer): Promise<void> => {
            if (block.some((byte) => byte !== 0)) {
                const padded = block.length === grainBytes ? block : Buffer.concat([block, Buffer.alloc(grainBytes - block.length)]);
                await out.write(padded, 0, grainBytes, next * SECTOR);
                table[grain] = next;
                next += GRAIN_SECTORS;
            }
            grain += 1;
            onProgress?.(grain / grains);
        };
        for await (const chunk of createReadStream(raw, { highWaterMark: grainBytes * 64 })) {
            let buffer = Buffer.concat([carry, chunk as Buffer]);
            while (buffer.length >= grainBytes) {
                await emit(buffer.subarray(0, grainBytes));
                buffer = buffer.subarray(grainBytes);
            }
            carry = buffer;
        }
        if (carry.length > 0) await emit(carry);
        const gtSectors = (GTES_PER_GT * 4) / SECTOR;
        const gdBuffer = (start: number): Buffer => {
            const b = Buffer.alloc(layout.gdSectors * SECTOR);
            for (let i = 0; i < layout.numGTs; i += 1) b.writeUInt32LE(start + i * gtSectors, i * 4);
            return b;
        };
        const rgtStart = layout.rgdOffset + layout.gdSectors;
        const gtStart = layout.gdOffset + layout.gdSectors;
        const littleEndian = Buffer.alloc(table.length * 4);
        for (let i = 0; i < table.length; i += 1) littleEndian.writeUInt32LE(table[i] ?? 0, i * 4);
        const descriptor = Buffer.alloc(DESCRIPTOR_SECTORS * SECTOR);
        descriptor.write(sparseDescriptor(destination.split(/[\\/]/u).pop() ?? "disk.vmdk", capacity), 0, "ascii");
        await out.write(sparseHeader(capacity, layout), 0, SECTOR, 0);
        await out.write(descriptor, 0, descriptor.length, SECTOR);
        await out.write(gdBuffer(rgtStart), 0, layout.gdSectors * SECTOR, layout.rgdOffset * SECTOR);
        await out.write(littleEndian, 0, littleEndian.length, rgtStart * SECTOR);
        await out.write(gdBuffer(gtStart), 0, layout.gdSectors * SECTOR, layout.gdOffset * SECTOR);
        await out.write(littleEndian, 0, littleEndian.length, gtStart * SECTOR);
        const total = next * SECTOR;
        await out.truncate(total);
        return { bytes: total, capacitySectors: capacity };
    } finally {
        await out.close();
    }
}

export interface VmSpec {
    readonly name: string;
    readonly memoryMb: number;
    readonly cpus: number;
    readonly diskFile: string;
    readonly bridged: boolean;
}

/** The `.vmx` for VMware Workstation: SATA disk, e1000e NIC, bridged or NAT. */
export function vmxText(spec: VmSpec): string {
    const quote = (value: string): string => `"${value.replace(/["\\\r\n]/gu, "")}"`;
    return [
        '.encoding = "UTF-8"',
        'config.version = "8"',
        'virtualHW.version = "21"',
        `displayName = ${quote(spec.name)}`,
        'guestOS = "other5xlinux-64"',
        `memsize = "${spec.memoryMb}"`,
        `numvcpus = "${spec.cpus}"`,
        'firmware = "bios"',
        'sata0.present = "TRUE"',
        'sata0:0.present = "TRUE"',
        `sata0:0.fileName = ${quote(spec.diskFile)}`,
        'ethernet0.present = "TRUE"',
        'ethernet0.virtualDev = "e1000e"',
        `ethernet0.connectionType = "${spec.bridged ? "bridged" : "nat"}"`,
        'ethernet0.addressType = "generated"',
        'tools.syncTime = "FALSE"',
        'pciBridge0.present = "TRUE"',
        "",
    ].join("\n");
}
