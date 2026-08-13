/**
 * Pruning a world down to a boundary.
 *
 * Everything in this module is pure arithmetic over coordinates. It decides which region
 * files survive, which of the 1024 chunks inside a surviving region survive, and which
 * regions can be deleted whole. Nothing here touches the disk, because the part that is
 * easy to get wrong is the edge arithmetic and the part that is slow is the copying, and
 * keeping them apart means the first can be tested exhaustively without the second.
 */

/** chunks along one edge of a region file, in both editions */
export const REGION_CHUNKS = 32;
/** blocks along one edge of a chunk */
export const CHUNK_BLOCKS = 16;

/**
 * An inclusive rectangle of chunk coordinates.
 *
 * Inclusive on both edges is the choice that matches how a player describes a selection:
 * "keep chunks -4 to 4" means nine chunks, not eight. Every helper below preserves that,
 * and the region edge case exists precisely because a bound of 31 and a bound of 32 fall
 * on opposite sides of a region boundary while looking like neighbours.
 */
export interface ChunkBounds {
    readonly minChunkX: number;
    readonly minChunkZ: number;
    readonly maxChunkX: number;
    readonly maxChunkZ: number;
}

/** a bounds value that could not be used, reported rather than thrown */
export interface BoundsInvalid {
    readonly ok: false;
    readonly reason: string;
}

/** a bounds value that is usable */
export interface BoundsValid {
    readonly ok: true;
    readonly bounds: ChunkBounds;
}

export type BoundsCheck = BoundsValid | BoundsInvalid;

/**
 * Checks a bounds rectangle before anything is planned from it.
 *
 * An inverted rectangle is refused rather than silently normalised. Swapping the corners
 * for the user would turn a typo that selects nothing into a selection of some other
 * region entirely, and the deletion that follows is not reversible.
 */
export function checkBounds(bounds: ChunkBounds): BoundsCheck {
    const values = [bounds.minChunkX, bounds.minChunkZ, bounds.maxChunkX, bounds.maxChunkZ];
    if (values.some((value) => !Number.isInteger(value)))
        return { ok: false, reason: "Chunk bounds must be whole chunk coordinates." };

    if (bounds.maxChunkX < bounds.minChunkX)
        return {
            ok: false,
            reason:
                "The east bound (" +
                bounds.maxChunkX +
                ") is west of the west bound (" +
                bounds.minChunkX +
                "), so the selection is empty.",
        };

    if (bounds.maxChunkZ < bounds.minChunkZ)
        return {
            ok: false,
            reason:
                "The south bound (" +
                bounds.maxChunkZ +
                ") is north of the north bound (" +
                bounds.minChunkZ +
                "), so the selection is empty.",
        };

    return { ok: true, bounds };
}

/** converts an inclusive block rectangle to the inclusive chunk rectangle covering it */
export function boundsFromBlocks(
    minBlockX: number,
    minBlockZ: number,
    maxBlockX: number,
    maxBlockZ: number,
): ChunkBounds {
    // Arithmetic shift rather than division, because a block at -1 belongs to chunk -1 and
    // integer division would round it toward zero and put it in chunk 0.
    return {
        minChunkX: minBlockX >> 4,
        minChunkZ: minBlockZ >> 4,
        maxChunkX: maxBlockX >> 4,
        maxChunkZ: maxBlockZ >> 4,
    };
}

/** the region a chunk coordinate falls in */
export function regionOfChunk(chunkCoordinate: number): number {
    return chunkCoordinate >> 5;
}

/** how many chunks an inclusive bounds rectangle covers */
export function chunkCount(bounds: ChunkBounds): number {
    const width = bounds.maxChunkX - bounds.minChunkX + 1;
    const depth = bounds.maxChunkZ - bounds.minChunkZ + 1;
    if (width <= 0 || depth <= 0) return 0;
    return width * depth;
}

/** the file name Anvil gives a region */
export function regionFileName(regionX: number, regionZ: number): string {
    return "r." + regionX + "." + regionZ + ".mca";
}

const REGION_NAME_PATTERN = /^r\.(-?\d+)\.(-?\d+)\.mca$/;

/** reads a region file name back into its coordinates, or null when the name is not one */
export function parseRegionFileName(name: string): { x: number; z: number } | null {
    const match = REGION_NAME_PATTERN.exec(name);
    if (match === null) return null;
    return { x: Number(match[1]), z: Number(match[2]) };
}

/** what pruning does to one region file */
export type RegionDisposition = "keep-whole" | "keep-partial" | "delete";

/** the decision for one region, with the surviving chunks named when it is a partial keep */
export interface RegionPlan {
    readonly regionX: number;
    readonly regionZ: number;
    readonly fileName: string;
    readonly disposition: RegionDisposition;
    /**
     * The chunks inside this region that survive, in world chunk coordinates, sorted by z
     * then x. Empty for a delete, and the full 1024 for a whole keep, so a caller never has
     * to reconstruct the list itself and the two cannot drift apart.
     */
    readonly chunks: readonly ChunkCoordinate[];
}

/** one chunk, in world coordinates */
export interface ChunkCoordinate {
    readonly x: number;
    readonly z: number;
}

/** the whole pruning decision over a set of region files */
export interface PrunePlan {
    readonly bounds: ChunkBounds;
    readonly regions: readonly RegionPlan[];
    readonly keptChunks: number;
    readonly removedChunks: number;
}

/** the inclusive chunk rectangle a region covers */
export function regionChunkBounds(regionX: number, regionZ: number): ChunkBounds {
    return {
        minChunkX: regionX * REGION_CHUNKS,
        minChunkZ: regionZ * REGION_CHUNKS,
        maxChunkX: regionX * REGION_CHUNKS + REGION_CHUNKS - 1,
        maxChunkZ: regionZ * REGION_CHUNKS + REGION_CHUNKS - 1,
    };
}

/** the overlap of two inclusive rectangles, or null when they do not touch */
export function intersectBounds(a: ChunkBounds, b: ChunkBounds): ChunkBounds | null {
    const minChunkX = Math.max(a.minChunkX, b.minChunkX);
    const minChunkZ = Math.max(a.minChunkZ, b.minChunkZ);
    const maxChunkX = Math.min(a.maxChunkX, b.maxChunkX);
    const maxChunkZ = Math.min(a.maxChunkZ, b.maxChunkZ);
    if (maxChunkX < minChunkX || maxChunkZ < minChunkZ) return null;
    return { minChunkX, minChunkZ, maxChunkX, maxChunkZ };
}

function chunksIn(bounds: ChunkBounds): ChunkCoordinate[] {
    const chunks: ChunkCoordinate[] = [];
    for (let z = bounds.minChunkZ; z <= bounds.maxChunkZ; z++)
        for (let x = bounds.minChunkX; x <= bounds.maxChunkX; x++) chunks.push({ x, z });
    return chunks;
}

/** decides what happens to one region file under a bounds rectangle */
export function planRegion(regionX: number, regionZ: number, bounds: ChunkBounds): RegionPlan {
    const fileName = regionFileName(regionX, regionZ);
    const overlap = intersectBounds(regionChunkBounds(regionX, regionZ), bounds);

    if (overlap === null) return { regionX, regionZ, fileName, disposition: "delete", chunks: [] };

    const covered = chunkCount(overlap) === REGION_CHUNKS * REGION_CHUNKS;
    return {
        regionX,
        regionZ,
        fileName,
        disposition: covered ? "keep-whole" : "keep-partial",
        chunks: chunksIn(overlap),
    };
}

/**
 * Plans a prune over the region files a world actually holds.
 *
 * `regionFiles` is the list read off disk rather than a rectangle derived from the bounds,
 * because a world is not a rectangle: a player who walked a long corridor leaves a sparse
 * set of regions, and planning over the bounding box would invent regions to delete that
 * were never there and report a removed-chunk count nobody could reconcile.
 *
 * A name that is not a region file is ignored rather than refused. Region directories
 * collect stray files, and refusing the whole prune because a backup tool left a
 * `r.0.0.mca.bak` behind would be a refusal the user cannot act on.
 */
export function planPrune(regionFiles: readonly string[], bounds: ChunkBounds): PrunePlan {
    const regions: RegionPlan[] = [];
    let keptChunks = 0;
    let removedChunks = 0;

    for (const name of [...regionFiles].sort()) {
        const parsed = parseRegionFileName(name);
        if (parsed === null) continue;

        const plan = planRegion(parsed.x, parsed.z, bounds);
        regions.push(plan);
        keptChunks += plan.chunks.length;
        removedChunks += REGION_CHUNKS * REGION_CHUNKS - plan.chunks.length;
    }

    return { bounds, regions, keptChunks, removedChunks };
}

/** whether a single chunk survives a bounds rectangle */
export function chunkSurvives(chunkX: number, chunkZ: number, bounds: ChunkBounds): boolean {
    return (
        chunkX >= bounds.minChunkX &&
        chunkX <= bounds.maxChunkX &&
        chunkZ >= bounds.minChunkZ &&
        chunkZ <= bounds.maxChunkZ
    );
}
