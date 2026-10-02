import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, rename, rm, statfs, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import { TerrainGenerator } from "./TerrainGenerator.js";
import { ChunkNbtWriter } from "./chunkNbt.js";
import { buildLevelDatNbt } from "./levelDat.js";
import { RegionFileWriter, regionFileName } from "./region.js";
import { SEA_LEVEL } from "./version.js";

export const MEASURED_LEDGER = "worldgen-manifest.json";
const GENERATOR = "worldlens-anvil-measured-v1";
const MAX_REGIONS = 25_000;
const MAX_TARGET = 100_000_000_000;
interface RegionRecord { name: string; chunks: number; bytes: number; sha256: string }
interface Ledger {
    schema: 1; generator: typeof GENERATOR; seed: number; name: string;
    format: "1.20.4"; targetBytes: number; level: { bytes: number; sha256: string };
    regions: RegionRecord[];
}
export interface MeasuredWorldProgress {
    bytes: number; targetBytes: number; chunkCount: number; regionCount: number;
}
export interface MeasuredWorldOptions {
    seed: number; name: string; outDir: string; targetBytes: number; resume?: boolean;
    isCancelled?: () => boolean; onProgress?: (progress: MeasuredWorldProgress) => void;
}
export interface MeasuredWorldResult extends MeasuredWorldProgress {
    worldFolder: string; seed: number; overshootBytes: number; cancelled: boolean;
    manifestPath: string; manifestSha256: string;
}

/** Square shells preserve a compact world while retaining an append-only region order. */
export function measuredRegionCoordinates(index: number): [number, number] {
    const edge = Math.floor(Math.sqrt(index));
    const offset = index - edge * edge;
    return offset <= edge ? [offset, edge] : [edge, 2 * edge - offset];
}
async function hashFile(path: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(path, { highWaterMark: 64 * 1024 })) hash.update(bytes);
    return hash.digest("hex");
}
async function plainPath(path: string): Promise<void> {
    let current = resolve(path);
    for (;;) {
        try { if ((await lstat(current)).isSymbolicLink()) throw new Error("Symbolic links are not generation destinations."); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }
}
async function saveLedger(folder: string, ledger: Ledger): Promise<void> {
    const temporary = join(folder, "worldgen-manifest.pending");
    await writeFile(temporary, JSON.stringify(ledger, null, 2) + "\n", { flag: "wx" });
    try {
        for (let attempt = 0; ; attempt++) {
            try { await rename(temporary, join(folder, MEASURED_LEDGER)); break; }
            catch (error) {
                if (attempt === 5 || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
                await delay(50);
            }
        }
    } finally { await rm(temporary, { force: true }); }
}
function validRecord(record: RegionRecord): boolean {
    return record !== null && typeof record === "object" && Number.isSafeInteger(record.chunks) && record.chunks > 0 && record.chunks <= 1024 &&
        Number.isSafeInteger(record.bytes) && record.bytes >= 12288 && record.bytes <= 1024 * 255 * 4096 + 8192 &&
        record.bytes % 4096 === 0 && typeof record.sha256 === "string" && /^[a-f0-9]{64}$/.test(record.sha256);
}
async function validateLedger(folder: string, options: MeasuredWorldOptions, expectedLevel: Buffer): Promise<Ledger> {
    const path = join(folder, MEASURED_LEDGER);
    const info = await lstat(path);
    if (!info.isFile() || info.size > 8_000_000) throw new Error("Invalid generation manifest.");
    const ledger = JSON.parse(await readFile(path, "utf8")) as Ledger;
    if (ledger.schema !== 1 || ledger.generator !== GENERATOR || ledger.seed !== options.seed || ledger.name !== options.name ||
        ledger.format !== "1.20.4" || ledger.targetBytes !== options.targetBytes || !Array.isArray(ledger.regions) || ledger.regions.length > MAX_REGIONS ||
        ledger.level?.bytes !== expectedLevel.length || ledger.level.sha256 !== createHash("sha256").update(expectedLevel).digest("hex")) {
        throw new Error("Resume requires the original seed, name, byte target, format and generator version.");
    }
    const top = await readdir(folder, { withFileTypes: true });
    if (top.some((entry) => entry.isSymbolicLink() || !["region", "level.dat", MEASURED_LEDGER, ".worldgen-active"].includes(entry.name))) throw new Error("Unrelated files in generation destination.");
    if (!(await lstat(join(folder, "region"))).isDirectory() || !(await lstat(join(folder, "level.dat"))).isFile()) throw new Error("Invalid world structure.");
    if (await hashFile(join(folder, "level.dat")) !== ledger.level.sha256) throw new Error("level.dat has changed since generation.");
    const entries = await readdir(join(folder, "region"), { withFileTypes: true });
    if (entries.length !== ledger.regions.length || entries.some((entry) => !entry.isFile())) throw new Error("Untracked or unfinished region files prevent safe resume.");
    for (let index = 0; index < ledger.regions.length; index++) {
        const record = ledger.regions[index]!;
        const [x, z] = measuredRegionCoordinates(index);
        if (!validRecord(record) || record.name !== regionFileName(x, z) || (index < ledger.regions.length - 1 && record.chunks !== 1024)) throw new Error("Invalid region inventory.");
        const file = join(folder, "region", record.name);
        if ((await lstat(file)).size !== record.bytes || await hashFile(file) !== record.sha256) throw new Error("Region content differs from its generation manifest: " + record.name);
    }
    return ledger;
}

/** Measures actual valid Anvil bytes, never estimates or pads to the requested size.
 * Cancellation commits the partial region and its hash. Resume verifies every file before
 * appending. Abrupt interruption with uncommitted bytes fails closed instead of guessing.
 * Memory is one chunk, an 8 KiB header, a 64 KiB hash buffer and a bounded region ledger.
 */
export async function generateMeasuredWorld(options: MeasuredWorldOptions): Promise<MeasuredWorldResult> {
    if (!Number.isSafeInteger(options.seed) || !Number.isSafeInteger(options.targetBytes) || options.targetBytes < 1 || options.targetBytes > MAX_TARGET ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(options.name)) throw new Error("Invalid measured-world options.");
    const worldFolder = resolve(options.outDir, options.name);
    await plainPath(worldFolder);
    if (!options.resume) {
        await mkdir(resolve(options.outDir), { recursive: true });
        await mkdir(worldFolder); // Exclusive creation, never adopt an unrelated directory.
    }
    const lock = await open(join(worldFolder, ".worldgen-active"), "wx");
    try {
        const terrain = new TerrainGenerator(options.seed);
        const writer = new ChunkNbtWriter();
        const level = gzipSync(buildLevelDatNbt({ seed: options.seed, name: options.name, spawnX: 8, spawnZ: 8, spawnY: Math.max(SEA_LEVEL, terrain.terrainHeight(8, 8)) + 1 }));
        let ledger: Ledger;
        if (options.resume) ledger = await validateLedger(worldFolder, options, level);
        else {
            await mkdir(join(worldFolder, "region"));
            await writeFile(join(worldFolder, "level.dat"), level, { flag: "wx" });
            ledger = { schema: 1, generator: GENERATOR, seed: options.seed, name: options.name, format: "1.20.4", targetBytes: options.targetBytes,
                level: { bytes: level.length, sha256: createHash("sha256").update(level).digest("hex") }, regions: [] };
            await saveLedger(worldFolder, ledger);
        }
        let bytes = ledger.level.bytes + ledger.regions.reduce((sum, record) => sum + record.bytes, 0);
        let chunkCount = ledger.regions.reduce((sum, record) => sum + record.chunks, 0);
        const capacity = await statfs(worldFolder);
        if (capacity.bavail * capacity.bsize < Math.max(0, options.targetBytes - bytes) + 32 * 1024 * 1024) {
            throw new Error("Destination lacks the remaining requested bytes plus 32 MiB reserve. Generated content is preserved.");
        }
        const report = () => options.onProgress?.({ bytes, targetBytes: options.targetBytes, chunkCount, regionCount: ledger.regions.length });
        report();
        while ((bytes < options.targetBytes || chunkCount === 0) && !options.isCancelled?.()) {
            const last = ledger.regions.at(-1);
            const append = last !== undefined && last.chunks < 1024;
            const index = append ? ledger.regions.length - 1 : ledger.regions.length;
            if (index >= MAX_REGIONS) throw new Error("The bounded region inventory is exhausted.");
            const free = await statfs(worldFolder);
            if (free.bavail * free.bsize < 32 * 1024 * 1024) throw new Error("Less than 32 MiB of destination space remains. Cancelled output is preserved.");
            const [x, z] = measuredRegionCoordinates(index);
            const name = regionFileName(x, z);
            const path = join(worldFolder, "region", name);
            const region = append ? await RegionFileWriter.resume(path, last.chunks) : await RegionFileWriter.createExclusive(path);
            const start = append ? last.chunks : 0;
            const before = append ? last.bytes : 0;
            const baseBytes = bytes - before;
            let count = start;
            try {
                while (count < 1024 && (bytes < options.targetBytes || chunkCount === 0) && !options.isCancelled?.()) {
                    const cx = x * 32 + count % 32;
                    const cz = z * 32 + Math.floor(count / 32);
                    await region.addChunk(cx, cz, writer.write(terrain.generateChunk(cx, cz)));
                    count++; chunkCount++; bytes = baseBytes + region.bytes;
                    if (count % 16 === 0) report();
                }
            } finally { await region.close(); }
            // Empty cancellation is still a valid empty region but is not admitted to the ledger.
            if (count === 0) { await rm(path); break; }
            const record = { name, chunks: count, bytes: (await lstat(path)).size, sha256: await hashFile(path) };
            if (append) ledger.regions[index] = record; else ledger.regions.push(record);
            bytes = baseBytes + record.bytes;
            await saveLedger(worldFolder, ledger);
            report();
        }
        const manifestPath = join(worldFolder, MEASURED_LEDGER);
        return { worldFolder, seed: options.seed, bytes, targetBytes: options.targetBytes, overshootBytes: Math.max(0, bytes - options.targetBytes),
            chunkCount, regionCount: ledger.regions.length, cancelled: bytes < options.targetBytes || chunkCount === 0, manifestPath, manifestSha256: await hashFile(manifestPath) };
    } finally { await lock.close(); await rm(join(worldFolder, ".worldgen-active")); }
}
