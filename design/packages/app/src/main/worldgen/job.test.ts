import { describe, expect, it } from "vitest";

import { applyJobEvent, createJobState, isTerminal, progressPercent } from "./job.js";
import type { RunnerChoice } from "./runner.js";

const RUNNER: RunnerChoice = { kind: "transport", transport: { kind: "local-process", serverDir: "/x" } };

describe("createJobState / applyJobEvent", () => {
    it("starts queued with zero progress", () => {
        const state = createJobState("job-1", RUNNER, 100, "t0");
        expect(state.phase).toBe("queued");
        expect(progressPercent(state)).toBe(0);
    });

    it("advances through starting -> generating -> packaging -> succeeded", () => {
        let state = createJobState("job-1", RUNNER, 100, "t0");
        state = applyJobEvent(state, { type: "started", at: "t1" });
        expect(state.phase).toBe("starting");
        state = applyJobEvent(state, { type: "progress", chunksDone: 40, at: "t2" });
        expect(state.phase).toBe("generating");
        expect(progressPercent(state)).toBe(40);
        state = applyJobEvent(state, { type: "packaging-started", at: "t3" });
        expect(state.phase).toBe("packaging");
        state = applyJobEvent(state, { type: "succeeded", at: "t4" });
        expect(state.phase).toBe("succeeded");
        expect(progressPercent(state)).toBe(100);
    });

    it("never lets progress go backwards", () => {
        let state = createJobState("job-1", RUNNER, 100, "t0");
        state = applyJobEvent(state, { type: "progress", chunksDone: 50, at: "t1" });
        state = applyJobEvent(state, { type: "progress", chunksDone: 30, at: "t2" });
        expect(state.chunksDone).toBe(50);
    });

    it("is a no-op once a job has reached a terminal phase", () => {
        let state = createJobState("job-1", RUNNER, 100, "t0");
        state = applyJobEvent(state, { type: "cancelled", at: "t1" });
        expect(state.phase).toBe("cancelled");
        const untouched = applyJobEvent(state, { type: "progress", chunksDone: 90, at: "t2" });
        expect(untouched).toBe(state);
        expect(untouched.phase).toBe("cancelled");
    });

    it("records a failure message and never renders unreachable as finished", () => {
        let state = createJobState("job-1", RUNNER, 100, "t0");
        state = applyJobEvent(state, { type: "unreachable", at: "t1" });
        expect(state.phase).toBe("unreachable");
        expect(isTerminal(state.phase)).toBe(false);
        // The runner reconnects and progress resumes - unreachable must not have been terminal.
        state = applyJobEvent(state, { type: "progress", chunksDone: 10, at: "t2" });
        expect(state.phase).toBe("generating");

        let failedState = createJobState("job-2", RUNNER, 100, "t0");
        failedState = applyJobEvent(failedState, { type: "failed", message: "disk full", at: "t1" });
        expect(failedState.phase).toBe("failed");
        expect(failedState.errorMessage).toBe("disk full");
        expect(isTerminal(failedState.phase)).toBe(true);
    });

    it("reports 0% rather than NaN for a zero-chunk job that has not succeeded", () => {
        const state = createJobState("job-1", RUNNER, 0, "t0");
        expect(progressPercent(state)).toBe(0);
    });
});
