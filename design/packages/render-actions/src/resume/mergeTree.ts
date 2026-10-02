/**
 * Merging a map that does not fit on one runner.
 *
 * The existing merge is correct and is not being replaced. `merge/mergeMap.ts` knows what
 * every layer of a BlueMap map is and how it behaves under a split: hires tiles are a
 * disjoint union once the cuts land on tile boundaries, lod 1 has to be composited pixel
 * by pixel because lowres tiles straddle every cut, lod 2 and above are wrong at the
 * source and are rebuilt, and `rstate` is left out. All of that is reused here unchanged.
 *
 * What does not survive scale is the *shape* of running it once. At the density measured
 * on this project's reference world, 961 hires tiles cover a million square blocks in
 * about 47 MB, so a 20 GB world renders to something on the order of 40 to 50 GB of
 * tiles. A GitHub standard runner has roughly 14 GB of free disk. One job cannot download
 * every shard and write a merged copy beside them; it cannot download every shard at all.
 *
 * ## So the merge is a tree, and its last level is small
 *
 * ```
 *  shards 0..31   ->  group merge 0  ->  partial-hires-0 + partial-lowres-0
 *  shards 32..63  ->  group merge 1  ->  partial-hires-1 + partial-lowres-1
 *  ...                                          |
 *                                               v
 *                                    lowres merge (lod 1 composited, lod 2+ rebuilt)
 * ```
 *
 * A group merge is the ordinary merge over a handful of neighbouring shards, so a group
 * runner only ever holds its own group. It uploads two artifacts rather than one, and
 * that separation is the point: hires and lowres leave on different journeys because only
 * one of them still needs work.
 *
 * **Hires is finished when its group merge is.** Tiles are disjoint across the whole
 * plan, not merely within a group, so a group's hires union is already its final share of
 * the map. Nothing downstream needs to open it, and nothing downstream does.
 *
 * **Lod 1 is not**, because a lowres tile is 500 blocks square on an unoffset grid and
 * straddles group boundaries exactly as it straddles shard boundaries. So the last level
 * downloads only the lowres artifacts, composites what genuinely overlaps, and rebuilds
 * lod 2 upwards from the result. That is a few megabytes of PNGs rather than tens of
 * gigabytes of tiles, and it is why the final step fits on one runner however large the
 * world is.
 *
 * The finished map is then the union of the hires partials and the merged lowres pyramid.
 * For a world small enough to fit, that union is assembled in one job and published as
 * one artifact exactly as before. For a world that is not, it stays as parts, and the run
 * summary says so plainly rather than producing a job that fails at 96% with a disk error.
 *
 * ## Group merges compose
 *
 * Merging (A, B) and then (AB, C) gives the same lod-1 pixels as merging (A, B, C) in one
 * go. Each pixel is decided by a ranking - rendered terrain beats an erasure beats an
 * untouched pixel - and taking the best of a set is the same whether it is done in one
 * pass or in stages. Two shards holding *different* terrain for one pixel is impossible
 * when every column belongs to exactly one shard, and the merge already refuses rather
 * than guessing if it ever happens, at whichever level it happens.
 */

/** How many shards one group merge takes on. Small enough for one runner's disk. */
export const DEFAULT_MERGE_GROUP_SIZE = 32;

/**
 * The decoded-tile working-memory budget one merge-group job is planned against.
 *
 * ## What actually bounds memory here
 *
 * `mergeShardMaps` (src/merge/mergeMap.ts) copies hires tiles (`tiles/0`) with
 * `fs.copyFile`, never reading them into JS memory - that is the bulk of a render's
 * bytes (roughly `TILE_OUTPUT_RATIO` times the world's size) and it is disk traffic,
 * not heap. The part that used to hold memory is lod 1 (`tiles/1`): every shard's lowres
 * tiles were decoded to uncompressed RGBA buffers (~2 MB each at the default tile size)
 * and kept in one big map, ALL of them, before a single pixel was composited. That is
 * now fixed directly (only the paths are collected up front; decoding happens per
 * output tile, so at most the few shards sharing one lowres tile's boundary are decoded
 * at once) - see the comment beside `lod1SourcePaths` in mergeMap.ts.
 *
 * That fix alone would very likely have been enough: measured on the run that failed
 * (30 shards, 17.65 GiB of shard artifacts, ubuntu-24.04's ~7 GiB runner), the actual
 * lod-1 tile count for a world that size is small next to the hires tile count, so
 * decoding one boundary's worth of tiles at a time costs tens of megabytes, not
 * gigabytes.
 *
 * This budget is the guard on top of that fix, not a replacement for it. Grouping still
 * matters because a group's job also has to download and hold every one of its shards'
 * artifacts on disk at once (the `pattern: shard-g<group>-*` download step), hold the
 * `listFiles`/`hiresOwner` bookkeeping for all of them, and run the atomic-output staging
 * copy alongside whatever the OS keeps in page cache for files it just wrote - all of
 * which scale with how many shards one group takes on. Bounding total *tile bytes* per
 * group (rather than merely counting shards) keeps that scaling in check regardless of
 * how dense a particular world's tiles are.
 *
 * The number: GitHub-hosted standard Linux runners (`ubuntu-24.04`) report roughly 7 GiB
 * of RAM. Half of that, 4 GiB, is kept aside from the disk/bookkeeping scaling above
 * while still leaving comfortable headroom under the real 7 GiB ceiling for the OS, the
 * Node.js baseline, and everything else already running in the job (checkout, the
 * toolchain build, actions/download-artifact). It is deliberately a round, conservative
 * number in the same spirit as this package's other safety margins
 * (`DISK_SAFETY_FACTOR`, the render-time estimate's own margin): a group that runs light
 * on memory costs nothing extra, a group that runs out loses the whole run.
 */
export const MERGE_MEMORY_BUDGET_BYTES = 4 * 1024 ** 3;

export interface MergeGroupSizeInputs {
    /** Tile bytes the whole plan is expected to produce, summed across every shard. */
    readonly totalTileBytes: number;
    /** How many shards the plan has. */
    readonly shardCount: number;
    /** Never returns more than this, whatever the memory budget would allow. */
    readonly cap?: number | undefined;
    /** Overrides {@link MERGE_MEMORY_BUDGET_BYTES}, for tests. */
    readonly memoryBudgetBytes?: number | undefined;
}

/**
 * How many shards one merge group can take on without a group's job needing more than
 * {@link MERGE_MEMORY_BUDGET_BYTES} worth of its shards' tile bytes at once.
 *
 * Always at least 1 (a group of one shard is a no-op merge and cannot be split further)
 * and never more than `cap` (still {@link DEFAULT_MERGE_GROUP_SIZE} unless the caller
 * asked for a different upper bound).
 */
export function chooseMergeGroupSize(inputs: MergeGroupSizeInputs): number {
    const cap = Math.max(1, Math.floor(inputs.cap ?? DEFAULT_MERGE_GROUP_SIZE));
    const shardCount = Math.max(1, Math.floor(inputs.shardCount));
    const budget = Math.max(1, inputs.memoryBudgetBytes ?? MERGE_MEMORY_BUDGET_BYTES);
    const perShardTileBytes = Math.max(1, inputs.totalTileBytes) / shardCount;
    const affordable = Math.max(1, Math.floor(budget / perShardTileBytes));
    return Math.min(cap, affordable);
}

export interface MergeGroup {
    /** 0-based; also the matrix entry and the artifact name suffix. */
    readonly index: number;
    readonly shardIds: readonly number[];
}

export interface MergeTree {
    readonly groups: readonly MergeGroup[];
    /**
     * True when one group holds every shard.
     *
     * The case where the whole map fits on one runner, which is most of them. The
     * workflow then merges once and publishes one artifact, exactly as it did before any
     * of this existed.
     */
    readonly singleGroup: boolean;
    readonly groupSize: number;
}

/**
 * Groups shards for merging, keeping neighbours together.
 *
 * Consecutive shard ids run along the grid, so a group is a contiguous band of the world.
 * That is not only tidy: neighbouring shards share the lowres tiles that straddle their
 * cuts, so grouping them means those tiles are composited at the group level and the
 * final lowres merge has less left to reconcile.
 */
export function planMergeTree(
    shardIds: readonly number[],
    groupSize: number = DEFAULT_MERGE_GROUP_SIZE,
): MergeTree {
    const size = Math.max(1, Math.floor(groupSize));
    const groups: MergeGroup[] = [];
    for (let start = 0; start < shardIds.length; start += size) {
        groups.push({ index: groups.length, shardIds: shardIds.slice(start, start + size) });
    }
    return { groups, singleGroup: groups.length <= 1, groupSize: size };
}

/** Which group a shard is merged by, or null when no group claims it. */
export function groupOf(shardId: number, tree: MergeTree): number | null {
    for (const group of tree.groups) if (group.shardIds.includes(shardId)) return group.index;
    return null;
}

export interface MergeTreeSummaryOptions {
    /** Hires tiles the whole plan is expected to produce, when it is known. */
    readonly estimatedHiresTiles?: number | undefined;
}

/** The merge shape, in the words the run summary prints. */
export function describeMergeTree(
    tree: MergeTree,
    options: MergeTreeSummaryOptions = {},
): string[] {
    const shardCount = tree.groups.reduce((total, group) => total + group.shardIds.length, 0);

    if (tree.singleGroup) {
        return [
            "All " +
                shardCount +
                " shard" +
                (shardCount === 1 ? "" : "s") +
                " are merged in one job, which produces the complete map as a single" +
                " artifact.",
        ];
    }

    const lines = [
        shardCount +
            " shards are merged in " +
            tree.groups.length +
            " groups of at most " +
            tree.groupSize +
            ", then the lowres pyramid is merged once across the groups. No single runner" +
            " holds the whole map, which at this size would not fit on one.",
        "Hires tiles are disjoint across the entire plan, so a group's hires output is" +
            " already its final share of the map and is uploaded as partial-hires-<group>." +
            " Nothing downstream reads it again.",
        "Lod 1 is not disjoint: a lowres tile is 500 blocks square on an unoffset grid and" +
            " straddles group boundaries. Only that layer goes to the final job, which" +
            " composites it and rebuilds lod 2 upwards from the result. That is megabytes," +
            " not gigabytes.",
        "The map is therefore published as " +
            tree.groups.length +
            " hires parts plus one lowres part. Unzip them into the same directory to get" +
            " the map; they never overlap, so the order does not matter.",
    ];

    if (options.estimatedHiresTiles !== undefined) {
        lines.push(
            "Expecting roughly " +
                options.estimatedHiresTiles.toLocaleString("en-US") +
                " hires tiles in total, about " +
                Math.ceil(options.estimatedHiresTiles / tree.groups.length).toLocaleString("en-US") +
                " per group.",
        );
    }

    return lines;
}
