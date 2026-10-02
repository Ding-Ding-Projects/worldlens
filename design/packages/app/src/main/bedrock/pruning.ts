/** Exact inclusive rectangle algebra used to compose a user's pruning with bounded batches. */
import type { PruningBox, PruningConfigFile } from "./batch.js";
export interface UserPruning { configs: Record<string, { include: boolean; regions: PruningBox[] }> }
export function intersection(a: PruningBox, b: PruningBox): PruningBox | null {
    const box = { minChunkX: Math.max(a.minChunkX, b.minChunkX), minChunkZ: Math.max(a.minChunkZ, b.minChunkZ), maxChunkX: Math.min(a.maxChunkX, b.maxChunkX), maxChunkZ: Math.min(a.maxChunkZ, b.maxChunkZ) };
    return box.minChunkX <= box.maxChunkX && box.minChunkZ <= box.maxChunkZ ? box : null;
}
export function subtract(a: PruningBox, b: PruningBox): PruningBox[] {
    const cut = intersection(a, b);
    if (!cut) return [a];
    return [
        { ...a, maxChunkX: cut.minChunkX - 1 },
        { ...a, minChunkX: cut.maxChunkX + 1 },
        { minChunkX: cut.minChunkX, maxChunkX: cut.maxChunkX, minChunkZ: a.minChunkZ, maxChunkZ: cut.minChunkZ - 1 },
        { minChunkX: cut.minChunkX, maxChunkX: cut.maxChunkX, minChunkZ: cut.maxChunkZ + 1, maxChunkZ: a.maxChunkZ },
    ].filter((box) => box.minChunkX <= box.maxChunkX && box.minChunkZ <= box.maxChunkZ);
}
export function composePruning(batch: PruningConfigFile, user?: object): PruningConfigFile {
    const requested = user as UserPruning | undefined;
    const configs: Record<string, { include: boolean; regions: PruningBox[] }> = {};
    for (const [dimension, selection] of Object.entries(batch.configs)) {
        const rule = requested?.configs?.[dimension];
        let regions = [...selection.regions];
        if (rule?.include && rule.regions.length) regions = regions.flatMap((box) => rule.regions.map((other) => intersection(box, other)).filter((box): box is PruningBox => box !== null));
        else if (rule && !rule.include) for (const excluded of rule.regions) {
            regions = regions.flatMap((box) => subtract(box, excluded));
            if (regions.length > 100_000) throw new Error("Pruning exceeds the 100,000 rectangle batch limit. Simplify overlapping exclusions.");
        }
        // Chunker treats an empty list as unrestricted. Exclude the entire integer domain
        // to represent an empty intersection without accidentally converting everything.
        configs[dimension] = regions.length ? { include: true, regions } : { include: false, regions: [{ minChunkX: -2147483648, minChunkZ: -2147483648, maxChunkX: 2147483647, maxChunkZ: 2147483647 }] };
    }
    return { configs };
}
