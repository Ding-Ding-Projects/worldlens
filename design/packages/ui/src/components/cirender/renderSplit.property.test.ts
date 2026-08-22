import { describe, expect, it } from "vitest";

import {
    MAX_PERCENT,
    allocate,
    evenShares,
    rebalance,
    type EngineShare,
    type RenderEngine,
} from "./renderSplit.js";

/**
 * The hand-written tests check the cases somebody thought of. These check the two
 * properties that must hold for EVERY input, across a few thousand of them.
 *
 * They matter more than they look. A region silently lost at a rounding boundary is a hole
 * in a finished map, and nothing else in the pipeline reports it - the render completes,
 * every engine says it succeeded, and the map simply has an empty square in it that
 * somebody notices weeks later while flying over their own base.
 *
 * The generator is seeded rather than random, so a failure is reproducible. `Math.random`
 * would give a test that fails once, passes on the re-run, and gets deleted.
 */
function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function engines(count: number): RenderEngine[] {
    return Array.from({ length: count }, (_unused, index) => ({
        id: `e${index}`,
        label: `Engine ${index}`,
        available: true,
        unavailableReason: null,
    }));
}

function regions(count: number): string[] {
    return Array.from({ length: count }, (_unused, index) => `r.${index}.${index % 7}`);
}

/** A valid set of shares that totals exactly 100, built the way the interface builds them. */
function randomShares(random: () => number, engineCount: number): readonly EngineShare[] {
    let shares = evenShares(engines(engineCount).map((engine) => engine.id));
    // A few random drags of the sliders, which is how a real set of shares comes about.
    const drags = 1 + Math.floor(random() * 4);
    for (let index = 0; index < drags; index += 1) {
        const target = shares[Math.floor(random() * shares.length)];
        if (target === undefined) continue;
        shares = rebalance(shares, target.engineId, Math.floor(random() * (MAX_PERCENT + 1)));
    }
    return shares;
}

describe("properties that must hold for every split", () => {
    it("never loses or duplicates a region, across three thousand random splits", () => {
        const random = mulberry32(20260821);
        let checked = 0;

        for (let round = 0; round < 3_000; round += 1) {
            const engineCount = 1 + Math.floor(random() * 6);
            const regionCount = Math.floor(random() * 400);
            const all = regions(regionCount);
            const shares = randomShares(random, engineCount);
            const plan = allocate(all, shares, engines(engineCount));

            const assigned = plan.shares.flatMap((share) => share.regions);

            // Every region assigned exactly once, and nothing invented.
            expect(
                assigned.length,
                `round ${round}: ${regionCount} regions across ${engineCount} engines ` +
                    `(${shares.map((s) => s.percent).join("/")}) produced ${assigned.length}`,
            ).toBe(regionCount);
            expect(new Set(assigned).size, `round ${round}: a region was given to two engines`).toBe(
                regionCount,
            );
            checked += 1;
        }

        expect(checked).toBe(3_000);
    });

    it("keeps every set of shares totalling exactly a hundred, however it is dragged", () => {
        const random = mulberry32(7);

        for (let round = 0; round < 3_000; round += 1) {
            const engineCount = 1 + Math.floor(random() * 6);
            const shares = randomShares(random, engineCount);
            const total = shares.reduce((sum, share) => sum + share.percent, 0);

            // A panel that reads 99% or 101% looks like a defect whatever the arithmetic
            // reason, and a total that drifts is a total that will eventually drift far.
            expect(total, `round ${round}: ${shares.map((s) => s.percent).join("/")}`).toBe(MAX_PERCENT);
            for (const share of shares) {
                expect(share.percent, `round ${round}: a share went out of range`).toBeGreaterThanOrEqual(0);
                expect(share.percent).toBeLessThanOrEqual(MAX_PERCENT);
            }
        }
    });

    it("splits the same world identically no matter what order the regions arrive in", () => {
        const random = mulberry32(99);

        for (let round = 0; round < 500; round += 1) {
            const engineCount = 2 + Math.floor(random() * 4);
            const all = regions(50 + Math.floor(random() * 200));
            const shares = randomShares(random, engineCount);

            const shuffled = [...all];
            for (let index = shuffled.length - 1; index > 0; index -= 1) {
                const swap = Math.floor(random() * (index + 1));
                const a = shuffled[index];
                const b = shuffled[swap];
                if (a !== undefined && b !== undefined) {
                    shuffled[index] = b;
                    shuffled[swap] = a;
                }
            }

            const first = allocate(all, shares, engines(engineCount));
            const second = allocate(shuffled, shares, engines(engineCount));

            // A retry after one engine fails must hand every other engine exactly the work
            // it had, or the retry silently redoes regions somebody already finished.
            expect(
                second.shares.map((share) => share.regions),
                `round ${round}: the same world split differently on a second run`,
            ).toEqual(first.shares.map((share) => share.regions));
        }
    });

    it("gives a bigger share more regions than a smaller one, at every size", () => {
        const random = mulberry32(4242);

        for (let round = 0; round < 1_000; round += 1) {
            const regionCount = 20 + Math.floor(random() * 500);
            const big = 60 + Math.floor(random() * 39);
            const shares: EngineShare[] = [
                { engineId: "big", percent: big },
                { engineId: "small", percent: MAX_PERCENT - big },
            ];
            const plan = allocate(regions(regionCount), shares, engines(2));

            const bigCount = plan.shares.find((share) => share.engineId === "big")?.regions.length ?? 0;
            const smallCount = plan.shares.find((share) => share.engineId === "small")?.regions.length ?? 0;

            expect(
                bigCount,
                `round ${round}: ${big}% got ${bigCount} of ${regionCount} while ` +
                    `${MAX_PERCENT - big}% got ${smallCount}`,
            ).toBeGreaterThanOrEqual(smallCount);
        }
    });
});
