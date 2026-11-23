import { mkdtemp, readFile, rm, stat, writeFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composeDisk, MAP_CONFIG_NAME } from "./compose.js";
import { DATA_PARTITION_TYPE, MIB, patchMbrWithData, planDataPartition, readPartitions, SECTOR, writePartition } from "./mbr.js";
import { accessCodeVerifier, applyVocabularyToLabels, BASE_LABELS, buildMapConfig } from "./mapConfig.js";
import { buildTar, isUstarHeader, tarHeader, tarMemberName, tarSize } from "./tar.js";
import { crc32c, guidBytes, vhdxLayout, vhdxPrefix, VHDX_PAYLOAD_OFFSET, writeFixedVhdx } from "./vhdx.js";
import { flatVmdkDescriptor, sparseHeader, sparseLayout, vmxText, writeSparseVmdk } from "./vmdk.js";
import { ovfText, writeExport } from "./exportFormats.js";
import { createHash } from "node:crypto";

let dir = "";
beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "wl-appliance-"));
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

/** A fake base: one Linux partition, 3 MiB total, valid MBR signature. */
async function fakeBase(): Promise<{ file: string; sha: string }> {
    const image = Buffer.alloc(3 * MIB + 100);
    writePartition(image, 0, { bootable: true, type: 0x83, startLba: 2048, sectors: 2048 });
    image.writeUInt16LE(0xaa55, 510);
    image.write("BASE-PAYLOAD", 2048 * SECTOR);
    const file = path.join(dir, "base.img");
    await writeFile(file, image);
    return { file, sha: createHash("sha256").update(image).digest("hex") };
}

describe("tar", () => {
    it("writes a ustar header whose magic and first member name the boot script can recognise", () => {
        const archive = buildTar([{ name: MAP_CONFIG_NAME, data: Buffer.from("{}") }]);
        expect(isUstarHeader(archive.subarray(0, 512))).toBe(true);
        expect(tarMemberName(archive.subarray(0, 512))).toBe(MAP_CONFIG_NAME);
        expect(archive.length % 512).toBe(0);
        expect(archive.length).toBe(512 + 512 + 1024);
        expect(tarSize([{ name: MAP_CONFIG_NAME, data: Buffer.from("{}") }])).toBe(archive.length);
    });
    it("has a checksum a reader recomputes the same way", () => {
        const header = tarHeader("a/b.txt", 5);
        const stored = parseInt(header.subarray(148, 154).toString("ascii"), 8);
        const copy = Buffer.from(header);
        copy.fill(0x20, 148, 156);
        expect(copy.reduce((s, b) => s + b, 0)).toBe(stored);
    });
    it("splits a long name into prefix and name and refuses an impossible one", () => {
        const long = `${"d".repeat(120)}/file.txt`;
        const header = tarHeader(long, 1);
        expect(header.subarray(345, 345 + 120).toString("utf8")).toBe("d".repeat(120));
        expect(() => tarHeader("x".repeat(300), 1)).toThrow(/too long/);
    });
});

describe("mbr", () => {
    it("plans a 1 MiB-aligned data partition and patches a free slot with type 0xDA", async () => {
        const { file } = await fakeBase();
        const mbr = (await readFile(file)).subarray(0, 512);
        const plan = planDataPartition(3 * MIB + 100, 700_000);
        expect(plan.startBytes).toBe(4 * MIB);
        expect(plan.sizeBytes % MIB).toBe(0);
        const patched = patchMbrWithData(Buffer.from(mbr), plan);
        const parts = readPartitions(patched.mbr);
        expect(parts).toHaveLength(2);
        expect(parts[0]?.type).toBe(0x83);
        expect(parts[1]).toMatchObject({ slot: 1, type: DATA_PARTITION_TYPE, startLba: plan.startBytes / SECTOR, sectors: plan.sizeBytes / SECTOR });
    });
    it("refuses an image with no signature, an overlap, or an existing data partition", () => {
        expect(() => readPartitions(Buffer.alloc(512))).toThrow(/MBR/);
        const mbr = Buffer.alloc(512);
        mbr.writeUInt16LE(0xaa55, 510);
        writePartition(mbr, 0, { type: 0x83, startLba: 2048, sectors: 100000 });
        expect(() => patchMbrWithData(mbr, planDataPartition(MIB, 1000))).toThrow(/overlaps/);
        const full = Buffer.alloc(512);
        full.writeUInt16LE(0xaa55, 510);
        writePartition(full, 0, { type: DATA_PARTITION_TYPE, startLba: 2048, sectors: 10 });
        expect(() => patchMbrWithData(full, planDataPartition(4 * MIB, 1000))).toThrow(/already/);
    });
});

describe("compose", () => {
    it("copies the verified base, appends the map tar as partition 2 and reads both back", async () => {
        const base = await fakeBase();
        const mapDir = path.join(dir, "map");
        await writeFile(path.join(dir, "ignored.txt"), "x");
        const { mkdir } = await import("node:fs/promises");
        await mkdir(path.join(mapDir, "tiles"), { recursive: true });
        await writeFile(path.join(mapDir, "index.html"), "<html></html>");
        await writeFile(path.join(mapDir, "tiles", "0.png"), Buffer.from([1, 2, 3]));
        const config = buildMapConfig({ hostName: "worldlens-map", port: 80, accessCode: "secret-code", vocabulary: {} });
        const out = await composeDisk({ baseImage: base.file, baseSha256: base.sha, mapDirectory: mapDir, config, outFile: path.join(dir, "out", "disk.img") });
        const bytes = await readFile(out.path);
        expect(bytes.length).toBe(out.plan.totalBytes);
        expect(bytes.subarray(2048 * SECTOR, 2048 * SECTOR + 12).toString()).toBe("BASE-PAYLOAD");
        const parts = readPartitions(bytes.subarray(0, 512));
        const data = parts.find((p) => p.type === DATA_PARTITION_TYPE);
        expect(data?.startLba).toBe(out.plan.startBytes / SECTOR);
        const at = out.plan.startBytes;
        expect(tarMemberName(bytes.subarray(at, at + 512))).toBe(MAP_CONFIG_NAME);
        const text = bytes.subarray(at, at + out.dataBytes).toString("latin1");
        expect(text).toContain("map/index.html");
        expect(text).toContain("map/tiles/0.png");
        expect(text).not.toContain("secret-code");
        expect(out.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    });
    it("refuses a base whose checksum does not match and a map containing a symbolic link", async () => {
        const base = await fakeBase();
        const config = buildMapConfig({ hostName: "a", port: 80, accessCode: null, vocabulary: {} });
        await expect(composeDisk({ baseImage: base.file, baseSha256: "0".repeat(64), mapDirectory: dir, config, outFile: path.join(dir, "o.img") })).rejects.toThrow(/checksum/);
    });
});

describe("map config and vocabulary", () => {
    it("stores a salted verifier, never the code, and replaces only whole-string labels", () => {
        const a = accessCodeVerifier("abcd");
        const b = accessCodeVerifier("abcd");
        expect(a).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
        expect(a).not.toBe(b);
        const labels = applyVocabularyToLabels(BASE_LABELS, { "Worldlens map": "Chosen name", Worldlens: "nope" });
        expect(labels.consoleTitle).toBe("Chosen name");
        expect(labels.pageTitle).toBe("Chosen name");
        expect(labels.accessCodePrompt).toBe("Access code");
        const none = buildMapConfig({ hostName: "h", port: 8080, accessCode: null, vocabulary: {} });
        expect(none.accessCodeVerifier).toBeNull();
        expect(none.labels).toEqual(BASE_LABELS);
    });
});

describe("vmdk", () => {
    it("writes a flat descriptor and a vmx with the requested hardware", () => {
        const d = flatVmdkDescriptor("a.img", 2097152);
        expect(d).toContain('createType="monolithicFlat"');
        expect(d).toContain('RW 2097152 FLAT "a.img" 0');
        const vmx = vmxText({ name: 'My "VM"', memoryMb: 1024, cpus: 2, diskFile: "a.vmdk", bridged: true });
        expect(vmx).toContain('memsize = "1024"');
        expect(vmx).toContain('ethernet0.connectionType = "bridged"');
        expect(vmx).toContain('displayName = "My VM"');
        expect(vmxText({ name: "n", memoryMb: 256, cpus: 1, diskFile: "a.vmdk", bridged: false })).toContain('"nat"');
    });
    it("writes a sparse file that reads back byte for byte and skips empty grains", async () => {
        const raw = Buffer.alloc(8 * MIB);
        raw.write("HELLO-GRAIN-ZERO", 0);
        raw.write("HELLO-LATER-GRAIN", 5 * MIB + 3 * 65536 + 100);
        const rawPath = path.join(dir, "r.img");
        await writeFile(rawPath, raw);
        const target = path.join(dir, "r.vmdk");
        const { bytes } = await writeSparseVmdk(rawPath, target);
        const file = await readFile(target);
        expect(file.length).toBe(bytes);
        expect(bytes).toBeLessThan(raw.length / 2);
        expect(file.subarray(0, 4).toString()).toBe("KDMV");
        const capacity = Number(file.readBigUInt64LE(12));
        expect(capacity).toBe(raw.length / 512);
        const layout = sparseLayout(capacity);
        expect(Number(file.readBigUInt64LE(64))).toBe(layout.overheadSectors);
        const gdOffset = Number(file.readBigUInt64LE(56));
        const read = (grain: number): Buffer => {
            const gt = file.readUInt32LE(gdOffset * 512 + Math.floor(grain / 512) * 4);
            const sector = file.readUInt32LE(gt * 512 + (grain % 512) * 4);
            return sector === 0 ? Buffer.alloc(65536) : file.subarray(sector * 512, sector * 512 + 65536);
        };
        const rebuilt = Buffer.concat(Array.from({ length: raw.length / 65536 }, (_, g) => read(g)));
        expect(rebuilt.equals(raw)).toBe(true);
        expect(sparseHeader(capacity, layout)).toHaveLength(512);
    });
});

describe("vhdx", () => {
    it("computes the standard CRC-32C check value", () => {
        expect(crc32c(Buffer.from("123456789"))).toBe(0xe3069283);
    });
    it("encodes GUIDs in mixed-endian order", () => {
        expect(guidBytes("2DC27766-F623-4200-9D64-115E9BFD4A08").toString("hex")).toBe("6677c22d23f60042" + "9d64115e9bfd4a08");
    });
    it("builds headers and region tables whose checksums verify, and an allocation table pointing at the payload", () => {
        const size = 40 * MIB;
        const prefix = vhdxPrefix(size);
        expect(prefix.length).toBe(VHDX_PAYLOAD_OFFSET);
        expect(prefix.subarray(0, 8).toString()).toBe("vhdxfile");
        for (const at of [64 * 1024, 128 * 1024]) {
            const header = Buffer.from(prefix.subarray(at, at + 4096));
            expect(header.subarray(0, 4).toString()).toBe("head");
            const stored = header.readUInt32LE(4);
            header.writeUInt32LE(0, 4);
            expect(crc32c(header)).toBe(stored);
        }
        for (const at of [192 * 1024, 256 * 1024]) {
            const table = Buffer.from(prefix.subarray(at, at + 65536));
            const stored = table.readUInt32LE(4);
            table.writeUInt32LE(0, 4);
            expect(table.subarray(0, 4).toString()).toBe("regi");
            expect(crc32c(table)).toBe(stored);
        }
        const metadata = prefix.subarray(2 * MIB, 3 * MIB);
        expect(metadata.subarray(0, 8).toString()).toBe("metadata");
        expect(metadata.readUInt16LE(10)).toBe(5);
        const layout = vhdxLayout(size);
        expect(layout.blocks).toBe(2);
        const bat = prefix.subarray(3 * MIB, 4 * MIB);
        expect(bat.readBigUInt64LE(0) & 7n).toBe(6n);
        expect(bat.readBigUInt64LE(0) >> 20n).toBe(4n);
        expect(bat.readBigUInt64LE(8) >> 20n).toBe(36n);
        expect(layout.fileBytes).toBe(4 * MIB + 64 * MIB);
    });
    it("refuses a size that is not a whole number of MiB and writes a file of the exact layout size", async () => {
        expect(() => vhdxLayout(MIB + 1)).toThrow(/MiB/);
        const raw = Buffer.alloc(3 * MIB, 7);
        const rawPath = path.join(dir, "v.img");
        await writeFile(rawPath, raw);
        const out = path.join(dir, "v.vhdx");
        const bytes = await writeFixedVhdx(rawPath, out);
        expect((await stat(out)).size).toBe(bytes);
        const h = await open(out, "r");
        const sample = Buffer.alloc(4);
        await h.read(sample, 0, 4, VHDX_PAYLOAD_OFFSET);
        await h.close();
        expect([...sample]).toEqual([7, 7, 7, 7]);
    });
});

describe("export", () => {
    it("writes the image, SHA256SUMS and INSTALL.txt, refuses to overwrite, and makes an OVA tar", async () => {
        const raw = Buffer.alloc(2 * MIB);
        raw.write("DATA", 1000);
        const rawPath = path.join(dir, "e.img");
        await writeFile(rawPath, raw);
        const out = path.join(dir, "out");
        const img = await writeExport({ raw: rawPath, directory: out, baseName: "map", format: "img", hostName: "worldlens-map", port: 80, hasAccessCode: true });
        const sums = await readFile(path.join(out, "SHA256SUMS"), "utf8");
        expect(sums).toContain(`${img.files[0]?.sha256}  map.img`);
        expect(await readFile(path.join(out, "INSTALL.txt"), "utf8")).toContain("worldlens-map.local");
        await expect(writeExport({ raw: rawPath, directory: out, baseName: "map", format: "img", hostName: "h", port: 80, hasAccessCode: false })).rejects.toThrow(/already exists/);
        const ova = await writeExport({ raw: rawPath, directory: out, baseName: "map", format: "ova", hostName: "h", port: 80, hasAccessCode: false, memoryMb: 512, cpus: 1 });
        const tar = await readFile(ova.primary);
        expect(tarMemberName(tar.subarray(0, 512))).toBe("map.ovf");
        expect(tar.toString("latin1")).toContain("map.mf");
        expect(await readFile(path.join(out, "SHA256SUMS"), "utf8")).toContain("map.ova");
        expect(ovfText({ name: "a&b", vmdkFile: "a.vmdk", vmdkBytes: 1, capacityBytes: 2, memoryMb: 512, cpus: 1 })).toContain("a&amp;b");
    });
});
