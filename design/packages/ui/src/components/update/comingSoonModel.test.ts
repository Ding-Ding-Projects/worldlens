import { describe, expect, it } from "vitest";
import {
    comingSoonFor,
    estimateFor,
    formatClock24,
    formatDuration,
    versionAtLeast,
} from "./comingSoonModel.js";
import type { ComingSoonState, UpdateState } from "./updateBridge.js";
import { unknownUpdateState } from "./updateModel.js";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const minutesAgo = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

type Building = Extract<ComingSoonState, { kind: "building" }>;

function building(overrides: Partial<Building> = {}): Building {
    return {
        kind: "building",
        runNumber: 2401,
        version: "1.0.2401",
        phase: "running",
        createdAt: minutesAgo(21),
        startedAt: minutesAgo(20),
        stalled: false,
        lastActivityAt: minutesAgo(2),
        stages: [
            { id: "source", kind: "source", label: "", state: "done", startedAt: null, completedAt: null },
            { id: "queue", kind: "queue", label: "", state: "done", startedAt: null, completedAt: null },
            { id: "job-1", kind: "part", label: "Windows installer", state: "running", startedAt: null, completedAt: null },
            { id: "job-2", kind: "publish", label: "Publish release", state: "waiting", startedAt: null, completedAt: null },
        ],
        stagesDone: 2,
        stagesTotal: 4,
        estimate: { typicalMs: 40 * 60_000, sampleCount: 5 },
        contents: { commits: [{ sha: "a", subject: "Fix a thing" }], total: 1, truncated: false },
        contentsUnavailable: null,
        replacedRun: null,
        checkedAt: minutesAgo(0),
        ...overrides,
    };
}

const installed = (overrides: Partial<UpdateState> = {}): UpdateState => ({
    ...unknownUpdateState("1.0.2400"),
    status: "up-to-date",
    ...overrides,
});

describe("formatClock24", () => {
    it("reads 24-hour time, never am or pm", () => {
        expect(formatClock24("2026-11-25T15:07:00Z", "UTC")).toBe("15:07");
        expect(formatClock24("2026-11-25T03:07:00Z", "UTC")).toBe("03:07");
    });

    it("keeps midnight at 00 rather than 24", () => {
        expect(formatClock24("2026-11-25T00:05:00Z", "UTC")).toBe("00:05");
        expect(formatClock24("2026-11-25T16:05:00Z", "Asia/Hong_Kong")).toBe("00:05");
    });

    it("gives nothing for a value that is not a time", () => {
        expect(formatClock24(null)).toBeNull();
        expect(formatClock24("not a time")).toBeNull();
    });
});

describe("formatDuration", () => {
    it("writes whole minutes, and hours with two-digit minutes", () => {
        expect(formatDuration(0)).toBe("<1 min");
        expect(formatDuration(59_000)).toBe("<1 min");
        expect(formatDuration(12 * 60_000 + 30_000)).toBe("12 min");
        expect(formatDuration(65 * 60_000)).toBe("1 h 05 min");
        expect(formatDuration(120 * 60_000)).toBe("2 h 00 min");
    });

    it("does not print a made-up figure for a bad span", () => {
        expect(formatDuration(Number.NaN)).toBe("<1 min");
        expect(formatDuration(-5)).toBe("<1 min");
    });
});

describe("estimateFor", () => {
    const estimate = { typicalMs: 40 * 60_000, sampleCount: 5 };

    it("counts down from the usual time", () => {
        expect(estimateFor(15 * 60_000, estimate)).toEqual({
            kind: "remaining",
            remainingMs: 25 * 60_000,
            typicalMs: 40 * 60_000,
            sampleCount: 5,
        });
    });

    it("says it is taking longer instead of counting below zero", () => {
        expect(estimateFor(40 * 60_000, estimate)).toMatchObject({ kind: "overrun" });
        expect(estimateFor(90 * 60_000, estimate)).toMatchObject({ kind: "overrun" });
    });

    it("has no estimate without one to base it on, or without a start time", () => {
        expect(estimateFor(10 * 60_000, null)).toEqual({ kind: "none" });
        expect(estimateFor(null, estimate)).toEqual({ kind: "none" });
    });
});

describe("versionAtLeast", () => {
    it("compares the three numeric parts as numbers", () => {
        expect(versionAtLeast("1.0.2401", "1.0.2401")).toBe(true);
        expect(versionAtLeast("1.0.2402", "1.0.2401")).toBe(true);
        expect(versionAtLeast("1.0.999", "1.0.2401")).toBe(false);
        expect(versionAtLeast("1.1.0", "1.0.2401")).toBe(true);
        expect(versionAtLeast("garbage", "1.0.1")).toBe(false);
    });
});

describe("comingSoonFor", () => {
    it("is absent when no build is in flight, and before anything is known", () => {
        expect(comingSoonFor(null, installed(), NOW)).toBeNull();
        expect(
            comingSoonFor({ kind: "none", checkedAt: null, lastOutcome: null }, installed(), NOW),
        ).toBeNull();
    });

    it("describes a build in flight from its real stages, with a bar that counts finished rows", () => {
        const model = comingSoonFor(building(), installed(), NOW, "UTC");
        expect(model).toMatchObject({
            kind: "building",
            version: "1.0.2401",
            stagesDone: 2,
            stagesTotal: 4,
            percent: 50,
            startedClock: "11:40",
            elapsedMs: 20 * 60_000,
            queued: false,
        });
        if (model?.kind !== "building") throw new Error("expected building");
        expect(model.currentStage?.label).toBe("Windows installer");
        expect(model.estimate).toMatchObject({ kind: "remaining", remainingMs: 20 * 60_000 });
        expect(model.stages.map((stage) => stage.stateKey)).toEqual([
            "update.comingSoon.state.done",
            "update.comingSoon.state.done",
            "update.comingSoon.state.running",
            "update.comingSoon.state.waiting",
        ]);
        // The two fixed stages are named from the catalogue; jobs keep their own names.
        expect(model.stages[0]?.labelKey).toBe("update.comingSoon.stage.source");
        expect(model.stages[2]?.labelKey).toBeNull();
    });

    it("derives the bar only from finished stages, so a clock moving on changes nothing", () => {
        const early = comingSoonFor(building(), installed(), NOW);
        const later = comingSoonFor(building(), installed(), NOW + 30 * 60_000);
        if (early?.kind !== "building" || later?.kind !== "building") throw new Error("building");
        expect(later.percent).toBe(early.percent);
        expect(later.elapsedMs).toBe((early.elapsedMs ?? 0) + 30 * 60_000);
    });

    it("reads a queued build as waiting its turn, with no start time yet", () => {
        const model = comingSoonFor(
            building({ phase: "queued", startedAt: null, stagesDone: 1 }),
            installed(),
            NOW,
        );
        expect(model).toMatchObject({ kind: "building", queued: true, startedClock: null, elapsedMs: null });
        if (model?.kind === "building") expect(model.estimate).toEqual({ kind: "none" });
    });

    it("steps aside as soon as the ordinary updater offers that build or a newer one", () => {
        for (const state of [
            installed({ status: "available", newVersion: "1.0.2401" }),
            installed({ status: "downloading", newVersion: "1.0.2402" }),
            installed({ status: "ready", readyVersion: "1.0.2401" }),
        ]) {
            expect(comingSoonFor(building(), state, NOW)).toBeNull();
        }
        // An offer for something older is not the coming build, so the card stays.
        expect(
            comingSoonFor(building(), installed({ status: "available", newVersion: "1.0.2399" }), NOW),
        ).not.toBeNull();
    });

    it("steps aside once the installed version has caught up", () => {
        expect(
            comingSoonFor(building(), installed({ currentVersion: "1.0.2401" }), NOW),
        ).toBeNull();
    });

    it("is absent in a build that cannot update itself", () => {
        expect(comingSoonFor(building(), installed({ status: "unsupported" }), NOW)).toBeNull();
    });

    it("gives a failed build its own state with the conclusion and the stage", () => {
        const model = comingSoonFor(
            {
                kind: "failed",
                runNumber: 2401,
                version: "1.0.2401",
                conclusion: "failure",
                failedStage: "Windows installer",
                endedAt: minutesAgo(1),
                checkedAt: minutesAgo(0),
            },
            installed(),
            NOW,
        );
        expect(model).toEqual({
            kind: "failed",
            version: "1.0.2401",
            conclusion: "failure",
            failedStage: "Windows installer",
        });
    });

    it("gives each way of not knowing its own state, and hides the two that say nothing about the build", () => {
        const unknown = (reason: "offline" | "rate-limited" | "unavailable" | "refused" | "disabled", retryAt: string | null = null): ComingSoonState => ({
            kind: "unknown",
            reason,
            retryAt,
            checkedAt: null,
        });
        expect(comingSoonFor(unknown("offline"), installed(), NOW)).toEqual({
            kind: "unknown",
            reason: "offline",
            retryClock: null,
        });
        expect(
            comingSoonFor(unknown("rate-limited", "2026-11-25T12:30:00Z"), installed(), NOW, "UTC"),
        ).toEqual({ kind: "unknown", reason: "rate-limited", retryClock: "12:30" });
        expect(comingSoonFor(unknown("unavailable"), installed(), NOW)).toMatchObject({
            reason: "unavailable",
        });
        expect(comingSoonFor(unknown("disabled"), installed(), NOW)).toBeNull();
        expect(comingSoonFor(unknown("refused"), installed(), NOW)).toBeNull();
    });
});
