import { describe, expect, it } from "vitest";
import { chooseMergeGroupSize, DEFAULT_MERGE_GROUP_SIZE, MERGE_MEMORY_BUDGET_BYTES } from "./mergeTree.js";

const GIB = 1024 ** 3;

describe("chooseMergeGroupSize", () => {
    it("keeps small worlds in one group: 5 shards of ~400 MiB of tiles each fit the budget", () => {
        const size = chooseMergeGroupSize({
            totalTileBytes: 2 * GIB,
            shardCount: 5,
        });
        // A single group needs to be able to hold all 5 shards, i.e. the chosen size must
        // be at least the shard count - which is what makes `planMergeTree` produce one
        // group rather than several.
        expect(size).toBeGreaterThanOrEqual(5);
        expect(size).toBeLessThanOrEqual(DEFAULT_MERGE_GROUP_SIZE);
    });

    it("splits a large world into several groups: 30 shards of ~1 GiB of tiles each", () => {
        // This is the exact shape of the run that failed: 30 shards, roughly a GiB of
        // tile output apiece, on a runner whose merge job was killed for memory.
        const totalTileBytes = 30 * GIB;
        const size = chooseMergeGroupSize({ totalTileBytes, shardCount: 30 });

        expect(size).toBeLessThan(30);
        expect(size).toBeGreaterThan(1);
        // The chosen size must actually keep one group under the memory budget.
        const perShardBytes = totalTileBytes / 30;
        expect(size * perShardBytes).toBeLessThanOrEqual(MERGE_MEMORY_BUDGET_BYTES);
        // And one more shard than that must not still fit, or the size was not tight.
        expect((size + 1) * perShardBytes).toBeGreaterThan(MERGE_MEMORY_BUDGET_BYTES);
    });

    it("never returns more than the cap even when the memory budget would allow it", () => {
        const size = chooseMergeGroupSize({
            totalTileBytes: 1, // effectively free per shard
            shardCount: 1000,
            cap: 32,
        });
        expect(size).toBe(32);
    });

    it("never returns less than 1, however dense the tiles are", () => {
        const size = chooseMergeGroupSize({
            totalTileBytes: 10_000 * GIB,
            shardCount: 10,
            memoryBudgetBytes: 1,
        });
        expect(size).toBe(1);
    });

    it("respects an explicit memory budget override", () => {
        const totalTileBytes = 8 * GIB; // 1 GiB per shard, 8 shards
        const size = chooseMergeGroupSize({
            totalTileBytes,
            shardCount: 8,
            memoryBudgetBytes: 2 * GIB,
        });
        expect(size).toBe(2);
    });

    it("a single shard is always one group, whatever its tiles weigh", () => {
        const size = chooseMergeGroupSize({ totalTileBytes: 500 * GIB, shardCount: 1 });
        expect(size).toBe(1);
    });
});
