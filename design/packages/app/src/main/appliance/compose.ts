import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { verifyManagedMapContext } from "../managedHosting/exportContext.js";
import type { MapConfig } from "./mapConfig.js";
import { patchMbrWithData, planDataPartition, readPartitions, SECTOR, type DataPartitionPlan } from "./mbr.js";
import { isUstarHeader, tarMemberName, tarSize, writeTarTo, type TarSource } from "./tar.js";

export const MAP_CONFIG_NAME = "worldlens-map.json";

export async function sha256File(file: string, onChunk?: (bytes: number) => void): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file, { highWaterMark: 8 * 1024 * 1024 })) {
        hash.update(chunk as Buffer);
        onChunk?.((chunk as Buffer).length);
    }
    return hash.digest("hex");
}

/** A managed hosting export keeps the web root in `map/`; a plain rendered folder is the root itself. */
export async function resolveMapDirectory(mapRoot: string): Promise<string> {
    const receipt = path.join(mapRoot, "worldlens-host-export.json");
    if (await fs.stat(receipt).then(() => true, () => false)) {
        await verifyManagedMapContext(mapRoot);
        return path.join(mapRoot, "map");
    }
    const info = await fs.stat(mapRoot).catch(() => null);
    if (!info?.isDirectory()) throw new Error("The rendered map folder does not exist.");
    return mapRoot;
}

/** Lists a folder as tar members under `map/`. Symbolic links and special files are refused. */
export async function mapTarSources(directory: string): Promise<TarSource[]> {
    const out: TarSource[] = [];
    const walk = async (relative: string): Promise<void> => {
        const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            const rel = relative ? `${relative}/${entry.name}` : entry.name;
            const full = path.join(directory, rel);
            const info = await fs.lstat(full);
            if (info.isSymbolicLink()) throw new Error(`The map contains a symbolic link (${rel}); the appliance cannot carry it.`);
            if (info.isDirectory()) await walk(rel);
            else if (info.isFile()) out.push({ name: `map/${rel}`, path: full, size: info.size });
            else throw new Error(`The map contains a special file (${rel}).`);
        }
    };
    await walk("");
    return out;
}

export interface ComposeInput {
    readonly baseImage: string;
    readonly baseSha256: string;
    readonly mapDirectory: string;
    readonly config: MapConfig;
    readonly outFile: string;
    readonly onStep?: (step: "base-verified" | "packed" | "patched", info: { bytes: number }) => void;
}

export interface ComposeResult {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly plan: DataPartitionPlan;
    readonly dataBytes: number;
}

/**
 * Builds the final raw disk without any Linux tooling: copy the verified base, append the tar of
 * the map as a 1 MiB-aligned data partition, and add that partition to the MBR. The appliance finds
 * the partition at boot by recognising a tar header whose first member is `worldlens-map.json`.
 */
export async function composeDisk(input: ComposeInput): Promise<ComposeResult> {
    const baseHash = await sha256File(input.baseImage);
    if (baseHash !== input.baseSha256) throw new Error("The bundled appliance base does not match its recorded checksum. Reinstall Worldlens.");
    input.onStep?.("base-verified", { bytes: (await fs.stat(input.baseImage)).size });

    const sources: TarSource[] = [{ name: MAP_CONFIG_NAME, data: Buffer.from(JSON.stringify(input.config, null, 2), "utf8") }, ...(await mapTarSources(input.mapDirectory))];
    const dataBytes = tarSize(sources);
    const baseBytes = (await fs.stat(input.baseImage)).size;
    const plan = planDataPartition(baseBytes, dataBytes);

    await fs.mkdir(path.dirname(input.outFile), { recursive: true });
    await fs.copyFile(input.baseImage, input.outFile);
    const handle = await fs.open(input.outFile, "r+");
    try {
        const mbr = Buffer.alloc(SECTOR);
        await handle.read(mbr, 0, SECTOR, 0);
        const patched = patchMbrWithData(mbr, plan);
        await handle.truncate(plan.totalBytes);
        await writeTarTo(handle, plan.startBytes, sources);
        input.onStep?.("packed", { bytes: dataBytes });
        await handle.write(patched.mbr, 0, SECTOR, 0);
        const first = Buffer.alloc(SECTOR);
        await handle.read(first, 0, SECTOR, plan.startBytes);
        if (!isUstarHeader(first) || tarMemberName(first) !== MAP_CONFIG_NAME) throw new Error("The map data partition did not read back as expected.");
        const partitions = readPartitions((await readFirstSector(handle)));
        if (!partitions.some((p) => p.startLba * SECTOR === plan.startBytes)) throw new Error("The partition table did not read back as expected.");
    } finally {
        await handle.close();
    }
    input.onStep?.("patched", { bytes: plan.totalBytes });
    return { path: input.outFile, bytes: plan.totalBytes, sha256: await sha256File(input.outFile), plan, dataBytes };
}

async function readFirstSector(handle: fs.FileHandle): Promise<Buffer> {
    const mbr = Buffer.alloc(SECTOR);
    await handle.read(mbr, 0, SECTOR, 0);
    return mbr;
}
