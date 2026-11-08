import { describe, expect, it } from "vitest";
import { ease, gridValues, nearestIndex, pushSample, range, stateOf, trend, visible } from "./liveChartModel.js";

describe("live chart model", () => {
    it("eases eight percent of the way each frame and snaps when close", () => {
        expect(ease(0, 100)).toBeCloseTo(8);
        let v = 0;
        for (let i = 0; i < 400; i++) v = ease(v, 100);
        expect(v).toBe(100);
    });

    it("shows only real samples inside the window", () => {
        const s = [{ t: 0, v: 1 }, { t: 50, v: 2 }, { t: 100, v: 3 }];
        expect(visible(s, 100, 60)).toEqual([{ t: 50, v: 2 }, { t: 100, v: 3 }]);
    });

    it("keeps a range that starts at zero for positive data and is never flat", () => {
        expect(range([{ t: 0, v: 5 }, { t: 1, v: 5 }]).min).toBe(0);
        const flat = range([{ t: 0, v: 0 }]);
        expect(flat.max).toBeGreaterThan(flat.min);
        expect(range([{ t: 0, v: -4 }, { t: 1, v: 2 }]).min).toBeLessThan(-4);
    });

    it("gives readable grid steps", () => {
        expect(gridValues(0, 10)).toEqual([0, 5, 10]);
        expect(gridValues(0, 0.9).every((v) => Number.isFinite(v))).toBe(true);
    });

    it("names momentum without relying on colour", () => {
        expect(trend([{ t: 0, v: 1 }, { t: 1, v: 2 }])).toBe("up");
        expect(trend([{ t: 0, v: 2 }, { t: 1, v: 1 }])).toBe("down");
        expect(trend([{ t: 0, v: 100 }, { t: 1, v: 101 }])).toBe("flat");
    });

    it("scrubs to the nearest reading", () => {
        expect(nearestIndex([{ t: 0, v: 1 }, { t: 10, v: 2 }, { t: 20, v: 3 }], 13)).toBe(1);
        expect(nearestIndex([], 5)).toBe(-1);
    });

    it("reports loading, live, stale, paused and empty honestly", () => {
        const base = { now: 100_000, staleMs: 30_000 };
        expect(stateOf({ ...base, samples: [], running: true, started: true })).toBe("loading");
        expect(stateOf({ ...base, samples: [{ t: 90_000, v: 1 }], running: true, started: true })).toBe("live");
        expect(stateOf({ ...base, samples: [{ t: 10_000, v: 1 }], running: true, started: true })).toBe("stale");
        expect(stateOf({ ...base, samples: [{ t: 90_000, v: 1 }], running: false, started: true })).toBe("paused");
        expect(stateOf({ ...base, samples: [], running: false, started: false })).toBe("empty");
    });

    it("never adds a reading out of order and keeps a bounded history", () => {
        const s = pushSample([{ t: 10, v: 1 }], { t: 5, v: 9 });
        expect(s).toEqual([{ t: 10, v: 1 }]);
        let many: { t: number; v: number }[] = [];
        for (let i = 0; i < 700; i++) many = pushSample(many, { t: i, v: i });
        expect(many).toHaveLength(600);
        expect(many[0]!.t).toBe(100);
    });
});
