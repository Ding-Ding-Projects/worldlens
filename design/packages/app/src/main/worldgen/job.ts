/**
 * The progress state machine a long-running generation job goes through.
 *
 * This is the part of "report real progress, allow cancel, never a bare spinner, survive
 * a restart" that can be proven with a unit test: a pure reducer over a small set of
 * events. Whatever actually drives a real server process or polls a real GitHub Actions
 * run (not built in this change - see the module header on `ipc.ts`) is expected to fold
 * its observations through this reducer rather than inventing its own status strings, so
 * the renderer never has to guess what "unreachable" means versus "failed".
 */

import type { RunnerChoice } from "./runner.js";

export type JobPhase =
    | "queued"
    | "starting"
    | "generating"
    | "packaging"
    | "succeeded"
    | "failed"
    | "cancelled"
    /** The runner could not be reached. Distinct from "failed": the job's own outcome is
     * unknown, not negative. Never rendered as finished or as failed. */
    | "unreachable";

export interface JobState {
    readonly id: string;
    readonly runner: RunnerChoice;
    readonly phase: JobPhase;
    /** Chunks confirmed generated so far. Monotonic within one job. */
    readonly chunksDone: number;
    readonly chunksTotal: number;
    /** Set only once, by whichever event first reports an outcome. */
    readonly errorMessage: string | null;
    readonly startedAt: string;
    readonly updatedAt: string;
}

export type JobEvent =
    | { readonly type: "started"; readonly at: string }
    | { readonly type: "progress"; readonly chunksDone: number; readonly at: string }
    | { readonly type: "packaging-started"; readonly at: string }
    | { readonly type: "succeeded"; readonly at: string }
    | { readonly type: "failed"; readonly message: string; readonly at: string }
    | { readonly type: "cancelled"; readonly at: string }
    | { readonly type: "unreachable"; readonly at: string };

export function createJobState(id: string, runner: RunnerChoice, chunksTotal: number, at: string): JobState {
    return {
        id,
        runner,
        phase: "queued",
        chunksDone: 0,
        chunksTotal,
        errorMessage: null,
        startedAt: at,
        updatedAt: at,
    };
}

const TERMINAL_PHASES: readonly JobPhase[] = ["succeeded", "failed", "cancelled"];

/** True once a job has reached a phase that will never change again. "unreachable" is
 * deliberately excluded - the runner may come back, and this job's own fate is still
 * unknown, so a caller must keep watching rather than treating it as done. */
export function isTerminal(phase: JobPhase): boolean {
    return TERMINAL_PHASES.includes(phase);
}

/**
 * Folds one observed event into a job's state.
 *
 * A terminal job never moves again - once "succeeded", "failed", or "cancelled", every
 * further event is ignored rather than silently overwriting a result the renderer may
 * already be showing to the user. "unreachable" is the one exception in the other
 * direction: it can arrive at any non-terminal phase (the runner can drop out mid-job)
 * and a later "progress" event can bring the job straight back out of it - reachability is
 * a fact about the connection, not about the job's own outcome.
 */
export function applyJobEvent(state: JobState, event: JobEvent): JobState {
    if (isTerminal(state.phase)) {
        return state;
    }
    switch (event.type) {
        case "started":
            return { ...state, phase: "starting", updatedAt: event.at };
        case "progress":
            return {
                ...state,
                phase: "generating",
                chunksDone: Math.max(state.chunksDone, event.chunksDone),
                updatedAt: event.at,
            };
        case "packaging-started":
            return { ...state, phase: "packaging", updatedAt: event.at };
        case "succeeded":
            return { ...state, phase: "succeeded", chunksDone: state.chunksTotal, updatedAt: event.at };
        case "failed":
            return { ...state, phase: "failed", errorMessage: event.message, updatedAt: event.at };
        case "cancelled":
            return { ...state, phase: "cancelled", updatedAt: event.at };
        case "unreachable":
            return { ...state, phase: "unreachable", updatedAt: event.at };
    }
}

/** A 0-100 integer progress percentage, safe to render directly in a progress bar. Never
 * NaN, never over 100, even for a zero-chunk job (reports 0 rather than dividing by zero). */
export function progressPercent(state: JobState): number {
    if (state.phase === "succeeded") {
        return 100;
    }
    if (state.chunksTotal <= 0) {
        return 0;
    }
    return Math.min(100, Math.round((state.chunksDone / state.chunksTotal) * 100));
}
