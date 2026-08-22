import { describe, expect, it } from "vitest";

import {
    RATE_MIN_SPAN_MS,
    createRateMeter,
    rateText,
    remainingText,
    type TransferRate,
} from "./transferRate.js";

const MB = 1024 * 1024;
const bytes = (value: number): string => `${Math.round(value / MB)} MB`;

describe("measuring how fast a transfer is going", () => {
    it("says nothing until it has watched for long enough to be worth saying", () => {
        const meter = createRateMeter();
        meter.observe(0, 0);
        meter.observe(500, 50 * MB);

        // A rate from the first half-second is arithmetic on noise, and showing a wild
        // number for a moment teaches somebody the number cannot be trusted.
        expect(meter.rate(1000 * MB).bytesPerSecond).toBeNull();
    });

    it("reports an average across the window rather than the last two samples", () => {
        const meter = createRateMeter();
        // Packing writes one file at a time, so samples swing between nothing and a whole
        // region file. An instantaneous rate would flicker between zero and enormous.
        meter.observe(0, 0);
        meter.observe(1_000, 0);
        meter.observe(2_000, 0);
        meter.observe(3_000, 30 * MB);
        meter.observe(4_000, 30 * MB);

        const rate = meter.rate(100 * MB);
        // 30 MB over 4 seconds, not "30 MB in the last second" and not "nothing".
        expect(rate.bytesPerSecond).toBeCloseTo((30 * MB) / 4, -3);
    });

    it("estimates what is left at the rate it measured", () => {
        const meter = createRateMeter();
        meter.observe(0, 0);
        meter.observe(10_000, 100 * MB);

        const rate = meter.rate(1_000 * MB);
        expect(rate.bytesPerSecond).toBeCloseTo(10 * MB, -3);
        // 900 MB left at 10 MB/s.
        expect(rate.secondsRemaining).toBe(90);
    });

    it("gives a speed but no estimate when nobody said how big it is", () => {
        const meter = createRateMeter();
        meter.observe(0, 0);
        meter.observe(10_000, 100 * MB);

        const rate = meter.rate(0);
        expect(rate.bytesPerSecond).not.toBeNull();
        // An unknown total is a real state. Inventing an estimate of zero would be worse
        // than admitting the size is not known.
        expect(rate.secondsRemaining).toBeNull();
    });

    it("starts again when the byte count goes backwards", () => {
        const meter = createRateMeter();
        meter.observe(0, 0);
        meter.observe(10_000, 500 * MB);
        // A resume from an earlier offset, or a different transfer reusing the meter.
        meter.observe(11_000, 10 * MB);

        // Averaging across that would produce a negative rate, so the window restarts and
        // has nothing to report until it has watched long enough again.
        expect(meter.rate(1_000 * MB).bytesPerSecond).toBeNull();
    });

    it("stops reporting a speed once a stalled transfer ages out of the window", () => {
        const meter = createRateMeter(20_000);
        meter.observe(0, 0);
        meter.observe(5_000, 100 * MB);
        // Nothing moves for a long time, but samples keep arriving.
        meter.observe(60_000, 100 * MB);
        meter.observe(70_000, 100 * MB);

        // A window counted in samples would still be reporting the old speed here, which is
        // exactly the lie somebody would act on while a transfer sat dead.
        expect(meter.rate(1_000 * MB).bytesPerSecond).toBeNull();
    });

    it("keeps measuring across a window boundary rather than resetting to nothing", () => {
        const meter = createRateMeter(20_000);
        for (let second = 0; second <= 60; second += 1) {
            meter.observe(second * 1_000, second * 10 * MB);
        }

        const rate = meter.rate(1_000 * MB);
        expect(rate.bytesPerSecond).toBeCloseTo(10 * MB, -4);
    });

    it("forgets everything when it is reset", () => {
        const meter = createRateMeter();
        meter.observe(0, 0);
        meter.observe(RATE_MIN_SPAN_MS + 1_000, 100 * MB);
        expect(meter.rate(200 * MB).bytesPerSecond).not.toBeNull();

        meter.reset();
        expect(meter.rate(200 * MB).bytesPerSecond).toBeNull();
    });
});

describe("putting a rate into words", () => {
    const rate = (bytesPerSecond: number | null, secondsRemaining: number | null): TransferRate => ({
        bytesPerSecond,
        secondsRemaining,
    });

    it("says nothing at all rather than a zero speed", () => {
        expect(rateText(rate(null, null), bytes)).toBe("");
    });

    it("names the speed per second", () => {
        expect(rateText(rate(2 * MB, null), bytes)).toBe("2 MB/s");
    });

    it("rounds the estimate coarsely, because a second-by-second countdown is the jitter", () => {
        expect(remainingText(rate(1, 30))).toBe("less than a minute left");
        expect(remainingText(rate(1, 60))).toBe("about 1 minute left");
        expect(remainingText(rate(1, 260))).toBe("about 4 minutes left");
        expect(remainingText(rate(1, 3_600))).toBe("about 1 hour left");
        expect(remainingText(rate(1, 5_400))).toBe("about 1h 30m left");
    });

    it("says nothing when there is no estimate to give", () => {
        expect(remainingText(rate(2 * MB, null))).toBe("");
        expect(remainingText(rate(2 * MB, 0))).toBe("");
    });
});
