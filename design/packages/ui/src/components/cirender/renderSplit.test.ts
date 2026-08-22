import { describe, expect, it } from "vitest";

import {
    MAX_PERCENT,
    allocate,
    evenShares,
    rebalance,
    sharesAreValid,
    type EngineShare,
    type RenderEngine,
} from "./renderSplit.js";

function engine(id: string, available = true, unavailableReason: string | null = null): RenderEngine {
    return { id, label: id, available, unavailableReason };
}

function regions(count: number): string[] {
    return Array.from({ length: count }, (_unused, index) => `r.${index}.0`);
}

function total(shares: readonly EngineShare[]): number {
    return shares.reduce((sum, share) => sum + share.percent, 0);
}

describe("splitting a render evenly", () => {
    it("gives two engines half each", () => {
        expect(evenShares(["docker", "actions"])).toEqual([
            { engineId: "docker", percent: 50 },
            { engineId: "actions", percent: 50 },
        ]);
    });

    it("still totals a hundred when the split does not divide evenly", () => {
        const shares = evenShares(["a", "b", "c"]);
        // 33/33/33 would total 99, and a panel reading "99%" looks like a defect whatever
        // the arithmetic reason.
        expect(total(shares)).toBe(MAX_PERCENT);
        expect(shares.map((share) => share.percent)).toEqual([34, 33, 33]);
    });

    it("has nothing to split across no engines", () => {
        expect(evenShares([])).toEqual([]);
    });
});

describe("adjusting one share", () => {
    const start: EngineShare[] = [
        { engineId: "docker", percent: 50 },
        { engineId: "actions", percent: 50 },
    ];

    it("keeps the number the person actually typed", () => {
        const next = rebalance(start, "docker", 70);
        // The whole point. A normalise that scales every share including the edited one
        // means dragging to 70 lands somewhere else and the control feels broken.
        expect(next.find((share) => share.engineId === "docker")?.percent).toBe(70);
        expect(next.find((share) => share.engineId === "actions")?.percent).toBe(30);
    });

    it("always totals exactly a hundred", () => {
        for (const value of [0, 1, 7, 33, 50, 66, 99, 100]) {
            expect(total(rebalance(start, "docker", value)), `at ${value}`).toBe(MAX_PERCENT);
        }
    });

    it("shares the remainder in proportion across several engines", () => {
        const three: EngineShare[] = [
            { engineId: "a", percent: 20 },
            { engineId: "b", percent: 20 },
            { engineId: "c", percent: 60 },
        ];
        const next = rebalance(three, "a", 40);

        expect(next.find((share) => share.engineId === "a")?.percent).toBe(40);
        // b and c had 20 and 60, so they keep that 1:3 relationship inside the 60 left.
        expect(next.find((share) => share.engineId === "b")?.percent).toBe(15);
        expect(next.find((share) => share.engineId === "c")?.percent).toBe(45);
        expect(total(next)).toBe(MAX_PERCENT);
    });

    it("spreads evenly when everything else is at zero", () => {
        const shares: EngineShare[] = [
            { engineId: "a", percent: 100 },
            { engineId: "b", percent: 0 },
            { engineId: "c", percent: 0 },
        ];
        const next = rebalance(shares, "a", 40);

        // There is no proportion to preserve, so 60 is split rather than dumped on whichever
        // engine happens to be listed first.
        expect(next.find((share) => share.engineId === "b")?.percent).toBe(30);
        expect(next.find((share) => share.engineId === "c")?.percent).toBe(30);
    });

    it("clamps rather than letting one engine take more than the whole world", () => {
        expect(rebalance(start, "docker", 150).find((s) => s.engineId === "docker")?.percent).toBe(100);
        expect(rebalance(start, "docker", -20).find((s) => s.engineId === "docker")?.percent).toBe(0);
    });

    it("gives the only engine everything", () => {
        const one: EngineShare[] = [{ engineId: "solo", percent: 40 }];
        expect(rebalance(one, "solo", 40)).toEqual([{ engineId: "solo", percent: 100 }]);
    });
});

describe("whether a split can be rendered", () => {
    it("refuses shares that do not total a hundred", () => {
        expect(sharesAreValid([{ engineId: "a", percent: 90 }])).toBe(false);
    });

    it("refuses a split with no engines at all", () => {
        expect(sharesAreValid([])).toBe(false);
    });

    it("accepts a valid split", () => {
        expect(sharesAreValid(evenShares(["a", "b"]))).toBe(true);
    });
});

describe("dividing the regions", () => {
    it("gives each engine its share and loses none of them", () => {
        const plan = allocate(regions(100), evenShares(["a", "b"]), [engine("a"), engine("b")]);

        expect(plan.shares.map((share) => share.regions.length)).toEqual([50, 50]);
        expect(plan.totalRegions).toBe(100);
    });

    it("never loses or duplicates a region when the split does not divide evenly", () => {
        // The failure this guards is the worst kind: a lost region is a hole in the finished
        // map, and nothing else in the pipeline would report it.
        const all = regions(7);
        const plan = allocate(all, evenShares(["a", "b", "c"]), [engine("a"), engine("b"), engine("c")]);

        const assigned = plan.shares.flatMap((share) => share.regions);
        expect(assigned).toHaveLength(7);
        expect(new Set(assigned).size).toBe(7);
        expect([...assigned].sort()).toEqual([...all].sort());
    });

    it("gives every engine a disjoint set", () => {
        const plan = allocate(regions(50), evenShares(["a", "b", "c", "d"]), [
            engine("a"),
            engine("b"),
            engine("c"),
            engine("d"),
        ]);

        const seen = new Set<string>();
        for (const share of plan.shares) {
            for (const region of share.regions) {
                expect(seen.has(region), `${region} was given to two engines`).toBe(false);
                seen.add(region);
            }
        }
        expect(seen.size).toBe(50);
    });

    it("splits the same world the same way every time", () => {
        // A re-run must hand each engine the work it had before. Otherwise a retry after one
        // engine fails silently redoes the regions another engine already finished.
        const shares = evenShares(["a", "b"]);
        const engines = [engine("a"), engine("b")];
        const shuffled = [...regions(30)].reverse();

        const first = allocate(regions(30), shares, engines);
        const second = allocate(shuffled, shares, engines);

        expect(second.shares.map((s) => s.regions)).toEqual(first.shares.map((s) => s.regions));
    });

    it("honours an uneven split", () => {
        const plan = allocate(
            regions(100),
            [
                { engineId: "fast", percent: 70 },
                { engineId: "slow", percent: 30 },
            ],
            [engine("fast"), engine("slow")],
        );

        expect(plan.shares.map((share) => share.regions.length)).toEqual([70, 30]);
    });

    it("leaves out an engine given a share too small to be worth starting", () => {
        const plan = allocate(
            regions(100),
            [
                { engineId: "a", percent: 100 },
                { engineId: "b", percent: 0 },
            ],
            [engine("a"), engine("b")],
        );

        expect(plan.shares.map((share) => share.engineId)).toEqual(["a"]);
    });

    it("reports an engine that has work but cannot take it, rather than dropping the work", () => {
        const plan = allocate(regions(10), evenShares(["a", "b"]), [
            engine("a"),
            engine("b", false, "Docker's engine is not running."),
        ]);

        // Silently reassigning b's half to a would produce a render that quietly ignored
        // what the person asked for.
        expect(plan.blocked).toEqual([{ engineId: "b", reason: "Docker's engine is not running." }]);
        expect(plan.shares.find((share) => share.engineId === "b")?.regions).toHaveLength(5);
    });

    it("says nothing is blocked when an unavailable engine was given no work", () => {
        const plan = allocate(
            regions(10),
            [
                { engineId: "a", percent: 100 },
                { engineId: "b", percent: 0 },
            ],
            [engine("a"), engine("b", false, "off")],
        );

        expect(plan.blocked).toEqual([]);
    });

    it("handles a world with no regions without inventing any", () => {
        const plan = allocate([], evenShares(["a", "b"]), [engine("a"), engine("b")]);
        expect(plan.totalRegions).toBe(0);
        expect(plan.shares.every((share) => share.regions.length === 0)).toBe(true);
    });

    it("gives one engine everything when it is the only one with a share", () => {
        const plan = allocate(regions(9), [{ engineId: "solo", percent: 100 }], [engine("solo")]);
        expect(plan.shares[0]?.regions).toHaveLength(9);
    });
});
