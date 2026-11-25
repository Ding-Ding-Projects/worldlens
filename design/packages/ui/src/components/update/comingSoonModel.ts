/**
 * What the "Update coming soon" card shows, as a value.
 *
 * Pure functions over the main process's description of the coming build and the updater's own
 * state, so every rule about when the card appears, which words a stage carries and how the
 * estimate reads is tested without mounting anything.
 *
 * ## Rules this file keeps
 *
 *  - **Absent, not empty.** With no build in flight there is no card at all.
 *  - **Published supersedes.** The moment the ordinary updater offers (or has staged) a
 *    version at least as new as the coming build, the card steps aside and the ordinary
 *    update offer is what is on screen.
 *  - **Nothing is invented.** The progress bar is the count of stage rows that really are
 *    done; the estimate is the median of earlier builds and says so; a stage's state is the
 *    one the build record reported, spelled as a word.
 *  - **Times are 24-hour.** Start and retry times never use a 12-hour clock, so there is no
 *    am/pm to read wrongly at 00:05.
 */

import type {
    ComingSoonContents,
    ComingSoonEstimate,
    ComingSoonStageKind,
    ComingSoonStageState,
    ComingSoonState,
    ComingSoonUnknownReason,
    UpdateState,
} from "./updateBridge.js";
import type { UpdateCopyKey } from "./updateCopy.js";

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * "HH:mm" in 24-hour time, or null when the value is not a time.
 *
 * `hourCycle: "h23"` is what keeps midnight at `00:05` rather than `24:05`, which some
 * engines produce for `hour12: false`.
 */
export function formatClock24(iso: string | null, timeZone?: string): string | null {
    if (iso === null) return null;
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return null;
    try {
        return new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            ...(timeZone === undefined ? {} : { timeZone }),
        }).format(new Date(time));
    } catch {
        return null;
    }
}

/**
 * A span as a person reads it: `1 h 05 min`, `12 min`, `<1 min`.
 *
 * Units are symbols that read the same in either language mode, so a duration inside a
 * Cantonese sentence is not half English words. Whole minutes only: a seconds counter on a
 * build that takes an hour would be motion for its own sake.
 */
export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "<1 min";
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return "<1 min";
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${minutes} min`;
    return `${hours} h ${String(rest).padStart(2, "0")} min`;
}

/* -------------------------------------------------------------------------- */
/* The estimate                                                               */
/* -------------------------------------------------------------------------- */

/** An estimate needs at least this many earlier builds. Mirrors the main process. */
export const ESTIMATE_MIN_SAMPLES = 3;

export type EstimateModel =
    | {
          readonly kind: "remaining";
          readonly remainingMs: number;
          readonly typicalMs: number;
          readonly sampleCount: number;
      }
    | { readonly kind: "overrun"; readonly typicalMs: number; readonly sampleCount: number }
    | { readonly kind: "none" };

/**
 * What is left of the usual build time, or that the usual time has been exceeded.
 *
 * Past the usual time there is no "time left" to show: counting down below zero, or resetting
 * to a made-up figure, would be a number nobody measured.
 */
export function estimateFor(
    elapsedMs: number | null,
    estimate: ComingSoonEstimate | null,
): EstimateModel {
    if (estimate === null || elapsedMs === null) return { kind: "none" };
    const remainingMs = estimate.typicalMs - elapsedMs;
    if (remainingMs > 0) {
        return {
            kind: "remaining",
            remainingMs,
            typicalMs: estimate.typicalMs,
            sampleCount: estimate.sampleCount,
        };
    }
    return { kind: "overrun", typicalMs: estimate.typicalMs, sampleCount: estimate.sampleCount };
}

/* -------------------------------------------------------------------------- */
/* Versions                                                                   */
/* -------------------------------------------------------------------------- */

function numericParts(version: string): [number, number, number] | null {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
    if (match === null) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True when `candidate` is at least as new as `reference`. False when either is unreadable. */
export function versionAtLeast(candidate: string, reference: string): boolean {
    const a = numericParts(candidate);
    const b = numericParts(reference);
    if (a === null || b === null) return false;
    for (let index = 0; index < 3; index += 1) {
        const left = a[index] ?? 0;
        const right = b[index] ?? 0;
        if (left !== right) return left > right;
    }
    return true;
}

/* -------------------------------------------------------------------------- */
/* The model                                                                  */
/* -------------------------------------------------------------------------- */

export interface ComingSoonStageModel {
    readonly id: string;
    readonly kind: ComingSoonStageKind;
    /** Catalogue key for the two fixed stages; null when {@link label} is a job's own name. */
    readonly labelKey: UpdateCopyKey | null;
    readonly label: string | null;
    readonly state: ComingSoonStageState;
    /** The state spelled as a word, so colour is never the only carrier. */
    readonly stateKey: UpdateCopyKey;
}

export type ComingSoonModel =
    | {
          readonly kind: "building";
          readonly version: string;
          readonly queued: boolean;
          readonly stalled: boolean;
          readonly replacedRun: number | null;
          readonly stages: readonly ComingSoonStageModel[];
          readonly stagesDone: number;
          readonly stagesTotal: number;
          /** 0 to 100 from the count of stages really done, never from the clock. */
          readonly percent: number;
          readonly currentStage: ComingSoonStageModel | null;
          readonly startedClock: string | null;
          readonly elapsedMs: number | null;
          readonly estimate: EstimateModel;
          readonly contents: ComingSoonContents | null;
          readonly contentsUnavailable: "no-base" | "failed" | null;
      }
    | {
          readonly kind: "failed";
          readonly version: string;
          readonly conclusion: string;
          readonly failedStage: string | null;
      }
    | {
          readonly kind: "unknown";
          readonly reason: ComingSoonUnknownReason;
          readonly retryClock: string | null;
      };

const STATE_KEYS: Readonly<Record<ComingSoonStageState, UpdateCopyKey>> = {
    waiting: "update.comingSoon.state.waiting",
    running: "update.comingSoon.state.running",
    done: "update.comingSoon.state.done",
    failed: "update.comingSoon.state.failed",
    skipped: "update.comingSoon.state.skipped",
};

function stageModel(stage: {
    readonly id: string;
    readonly kind: ComingSoonStageKind;
    readonly label: string;
    readonly state: ComingSoonStageState;
}): ComingSoonStageModel {
    const fixedKey: UpdateCopyKey | null =
        stage.kind === "source"
            ? "update.comingSoon.stage.source"
            : stage.kind === "queue"
              ? "update.comingSoon.stage.queue"
              : null;
    return {
        id: stage.id,
        kind: stage.kind,
        labelKey: fixedKey,
        label: fixedKey === null ? stage.label : null,
        state: stage.state,
        stateKey: STATE_KEYS[stage.state],
    };
}

/**
 * The card's model, or null when there is no card to show.
 *
 * `nowMs` is a parameter so the elapsed time is a function of the clock the caller owns
 * rather than of whenever this happens to run.
 */
export function comingSoonFor(
    coming: ComingSoonState | null,
    update: UpdateState,
    nowMs: number,
    timeZone?: string,
): ComingSoonModel | null {
    if (coming === null) return null;
    // A build that cannot update itself has nothing to be "coming" to.
    if (update.status === "unsupported") return null;

    if (coming.kind === "none") return null;

    if (coming.kind === "unknown") {
        // `disabled` and `refused` are not facts about the build record, so they are not shown.
        if (coming.reason === "disabled" || coming.reason === "refused") return null;
        return {
            kind: "unknown",
            reason: coming.reason,
            retryClock: formatClock24(coming.retryAt, timeZone),
        };
    }

    // The ordinary updater already offers this build, or a newer one: that is the offer.
    for (const offered of [update.readyVersion, update.newVersion, update.currentVersion]) {
        if (offered !== null && offered !== "" && versionAtLeast(offered, coming.version)) {
            return null;
        }
    }

    if (coming.kind === "failed") {
        return {
            kind: "failed",
            version: coming.version,
            conclusion: coming.conclusion,
            failedStage: coming.failedStage,
        };
    }

    const stages = coming.stages.map(stageModel);
    const startedMs = coming.startedAt === null ? Number.NaN : Date.parse(coming.startedAt);
    const elapsedMs = Number.isNaN(startedMs) ? null : Math.max(0, nowMs - startedMs);
    // The stage a person is waiting on: the first one running, else the first not yet done.
    const currentStage =
        stages.find((stage) => stage.state === "running") ??
        stages.find((stage) => stage.state === "waiting") ??
        null;

    return {
        kind: "building",
        version: coming.version,
        queued: coming.phase === "queued",
        stalled: coming.stalled,
        replacedRun: coming.replacedRun,
        stages,
        stagesDone: coming.stagesDone,
        stagesTotal: coming.stagesTotal,
        percent:
            coming.stagesTotal > 0
                ? Math.min(100, Math.round((coming.stagesDone / coming.stagesTotal) * 100))
                : 0,
        currentStage,
        startedClock: formatClock24(coming.startedAt, timeZone),
        elapsedMs,
        estimate: estimateFor(elapsedMs, coming.estimate),
        contents: coming.contents,
        contentsUnavailable: coming.contentsUnavailable,
    };
}
