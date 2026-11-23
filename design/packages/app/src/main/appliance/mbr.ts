/** The appliance data partition type: "non-filesystem data", so no OS offers to format it. */
export const DATA_PARTITION_TYPE = 0xda;
export const SECTOR = 512;
export const MIB = 1024 * 1024;

export interface PartitionEntry {
    readonly slot: number;
    readonly bootable: boolean;
    readonly type: number;
    readonly startLba: number;
    readonly sectors: number;
}

export function readPartitions(mbr: Buffer): PartitionEntry[] {
    if (mbr.length < SECTOR || mbr.readUInt16LE(510) !== 0xaa55) throw new Error("The appliance base image has no valid MBR signature.");
    const entries: PartitionEntry[] = [];
    for (let slot = 0; slot < 4; slot += 1) {
        const at = 446 + slot * 16;
        const type = mbr[at + 4] ?? 0;
        const sectors = mbr.readUInt32LE(at + 12);
        if (type !== 0 && sectors > 0) entries.push({ slot, bootable: mbr[at] === 0x80, type, startLba: mbr.readUInt32LE(at + 8), sectors });
    }
    return entries;
}

/** Writes one entry. CHS is set to the "use LBA" sentinel, which every modern loader honours. */
export function writePartition(mbr: Buffer, slot: number, entry: { bootable?: boolean; type: number; startLba: number; sectors: number }): void {
    if (slot < 0 || slot > 3) throw new Error("An MBR has four partition slots.");
    if (entry.startLba + entry.sectors > 0xffffffff) throw new Error("The image is larger than an MBR disk can describe (2 TiB).");
    const at = 446 + slot * 16;
    mbr[at] = entry.bootable ? 0x80 : 0x00;
    mbr[at + 1] = 0xfe;
    mbr[at + 2] = 0xff;
    mbr[at + 3] = 0xff;
    mbr[at + 4] = entry.type;
    mbr[at + 5] = 0xfe;
    mbr[at + 6] = 0xff;
    mbr[at + 7] = 0xff;
    mbr.writeUInt32LE(entry.startLba, at + 8);
    mbr.writeUInt32LE(entry.sectors, at + 12);
}

export interface DataPartitionPlan {
    /** Where the data partition starts, in bytes: the end of the base image rounded up to 1 MiB. */
    readonly startBytes: number;
    /** Size of the data partition in bytes, rounded up to 1 MiB so every disk format can hold it. */
    readonly sizeBytes: number;
    readonly totalBytes: number;
}

export function planDataPartition(baseBytes: number, dataBytes: number): DataPartitionPlan {
    const round = (n: number): number => Math.ceil(n / MIB) * MIB;
    const startBytes = round(baseBytes);
    const sizeBytes = round(Math.max(dataBytes, MIB));
    return { startBytes, sizeBytes, totalBytes: startBytes + sizeBytes };
}

/** Adds the data partition as the first free slot and returns the patched first sector. */
export function patchMbrWithData(mbr: Buffer, plan: DataPartitionPlan): { mbr: Buffer; slot: number } {
    const patched = Buffer.from(mbr.subarray(0, SECTOR));
    const used = readPartitions(patched);
    if (used.some((p) => p.type === DATA_PARTITION_TYPE)) throw new Error("The base image already has a data partition.");
    const free = [0, 1, 2, 3].find((slot) => !used.some((p) => p.slot === slot));
    if (free === undefined) throw new Error("The base image has no free partition slot.");
    for (const p of used) {
        if (p.startLba * SECTOR + p.sectors * SECTOR > plan.startBytes) throw new Error("The base image overlaps the data partition.");
    }
    writePartition(patched, free, { type: DATA_PARTITION_TYPE, startLba: plan.startBytes / SECTOR, sectors: plan.sizeBytes / SECTOR });
    return { mbr: patched, slot: free };
}
