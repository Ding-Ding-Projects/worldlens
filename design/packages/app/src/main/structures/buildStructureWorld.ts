/**
 * Wrapping a parsed structure's blocks in the smallest real Minecraft world that can hold
 * them.
 *
 * This is the adaptation the drop-render lane exists to make honest about: BlueMap's
 * upstream CLI (driven by `../render/orchestrator.ts`) only ever renders a *world* - a
 * folder with a `level.dat` and an anvil `region/` directory - because that is the one
 * input format its meshing code understands. A dropped `.nbt` or `.schem` file is not a
 * world, it is a bounded box of block-states with no world around it. Rather than writing
 * a second mesher that reads structures directly (the TS engine in `packages/engine`
 * cannot do this either - see `render/engine.ts`'s own note on why it is not yet the
 * default renderer even for real worlds), this module does the smaller thing: it places
 * the structure's blocks at a fixed, reproducible origin inside an otherwise-empty world,
 * writes that world out with `@worldlens/worldgen`'s own anvil writers (the same writers
 * CI's reference fixtures are built with), and hands the resulting folder to the existing
 * `RenderOrchestrator` exactly as a real save's folder would be. BlueMap never learns the
 * world it is rendering was invented five seconds ago for this one structure.
 *
 * The structure is placed with its own (0,0,0) corner at world (0, `ORIGIN_Y`, 0). Only
 * the chunks the structure's bounding box touches are written, so a small structure costs
 * a handful of chunks rather than a whole world's worth of empty ones.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
    BlockRegistry,
    ChunkData,
    ChunkNbtWriter,
    RegionFileWriter,
    buildLevelDatNbt,
    blockIndex,
    columnIndex,
    regionFileName,
    regionOf,
    PLAINS,
    MIN_Y,
} from "@worldlens/worldgen";
import type { ParsedStructure } from "./parseStructureFile.js";

/**
 * A few blocks above the world floor rather than at it, so a structure that happens to
 * carry blocks at its own y=0 does not sit flush against the bedrock plane BlueMap would
 * otherwise have to render underneath it for no reason - there is none, since this world
 * writes only the sections the structure and its floor actually occupy.
 */
const ORIGIN_Y = MIN_Y + 4;

export interface BuiltStructureWorld {
    /** Absolute path to the synthetic world folder, ready to hand to `RenderMapRequest.world`. */
    readonly worldFolder: string;
    readonly chunkCount: number;
}

/**
 * Writes a synthetic world containing exactly one structure's blocks, into `outDir`.
 *
 * `outDir` becomes the world folder itself (not a parent it is created inside), matching
 * how `RenderMapRequest.world` expects to be pointed at the folder containing `level.dat`
 * directly.
 */
export async function buildStructureWorld(
    structure: ParsedStructure,
    outDir: string,
): Promise<BuiltStructureWorld> {
    const regionFolder = join(outDir, "region");
    await mkdir(regionFolder, { recursive: true });

    const registry = new BlockRegistry();
    const chunks = new Map<string, ChunkData>();

    function chunkAt(chunkX: number, chunkZ: number): ChunkData {
        const key = `${chunkX},${chunkZ}`;
        let chunk = chunks.get(key);
        if (chunk === undefined) {
            chunk = new ChunkData(chunkX, chunkZ, registry);
            // Every column needs a biome cell or the writer has nothing to read; a
            // structure carries no biome information of its own, so one arbitrary,
            // harmless default (BlueMap does not colour a structure render by biome the
            // way it colours grass on a real terrain render) is used everywhere.
            for (let cell = 0; cell < 16; cell++) chunk.biomeCells[cell] = PLAINS;
            chunks.set(key, chunk);
        }
        return chunk;
    }

    for (const block of structure.blocks) {
        const worldX = block.x;
        const worldY = ORIGIN_Y + block.y;
        const worldZ = block.z;
        const chunk = chunkAt(worldX >> 4, worldZ >> 4);
        chunk.setBlock(worldX & 15, worldY, worldZ & 15, registry.id(block.state));
    }

    // A structure with every block classified as air (an empty capture, or a structure
    // that is nothing but a bounding box) still gets one chunk at its origin, so the
    // render has a real map to open rather than failing with "no chunks written" for a
    // file that parsed successfully.
    if (chunks.size === 0) chunkAt(0, 0);

    computeHeightmaps(chunks);

    const writer = new ChunkNbtWriter();
    const regionFiles = new Map<string, RegionFileWriter>();
    let chunkCount = 0;

    for (const chunk of chunks.values()) {
        const regionX = regionOf(chunk.chunkX);
        const regionZ = regionOf(chunk.chunkZ);
        const fileName = regionFileName(regionX, regionZ);
        let region = regionFiles.get(fileName);
        if (region === undefined) {
            region = await RegionFileWriter.create(join(regionFolder, fileName));
            regionFiles.set(fileName, region);
        }
        await region.addChunk(chunk.chunkX, chunk.chunkZ, writer.write(chunk));
        chunkCount++;
    }
    for (const region of regionFiles.values()) await region.close();

    const spawnX = 8;
    const spawnZ = 8;
    const spawnY = ORIGIN_Y + structure.sizeY + 1;
    const levelDat = gzipSync(
        buildLevelDatNbt({
            seed: 0,
            name: "Dropped structure",
            spawnX,
            spawnY,
            spawnZ,
        }),
    );
    await writeFile(join(outDir, "level.dat"), levelDat);

    return { worldFolder: outDir, chunkCount };
}

/**
 * Fills every written chunk's `surfaceY`/`floorY`, the two heightmaps `ChunkNbtWriter`
 * reads. A structure has no water, so the terrain generator's water-vs-floor distinction
 * (see `TerrainGenerator.computeHeightmaps`) does not apply here: the first non-air block
 * found scanning down from the top is both the surface and the floor.
 */
function computeHeightmaps(chunks: ReadonlyMap<string, ChunkData>): void {
    for (const chunk of chunks.values()) {
        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                const index = columnIndex(x, z);
                let surface = MIN_Y - 1;
                for (const sectionY of chunk.sectionYs().slice().reverse()) {
                    const section = chunk.section(sectionY);
                    if (section === null) continue;
                    let found = -1;
                    for (let localY = 15; localY >= 0; localY--) {
                        const id = section[blockIndex(x, sectionY * 16 + localY, z)];
                        if (id !== undefined && id !== 0) {
                            found = sectionY * 16 + localY;
                            break;
                        }
                    }
                    if (found >= MIN_Y) {
                        surface = found;
                        break;
                    }
                }
                chunk.surfaceY[index] = surface;
                chunk.floorY[index] = surface;
            }
        }
    }
}
