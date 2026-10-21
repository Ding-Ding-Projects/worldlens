import { randomUUID } from "node:crypto";
import type { BuildJournal } from "./journal.js";
import type { BuildPlan, BuildRequest } from "./source.js";
import { inspectBuildSource, prepareBuild } from "./source.js";
import type { OwnedBuildProcess, ProcessExit, StartBuildProcess } from "./process.js";
import { windowsBuildTransport } from "./process.js";
import { BuildPhaseReader } from "./progress.js";
import type { BuildPhase } from "./progress.js";

export type BuildState = "prepared" | "running" | "cancelling" | "cancelled" | "failed" | "completed-unverified" | "interrupted";
export interface BuildRecord {
    readonly id: string;
    readonly plan: BuildPlan;
    readonly startedAt: string;
    readonly state: BuildState;
    readonly endedAt?: string;
    readonly exit?: ProcessExit;
    readonly detail?: string;
    readonly lastPhase?: BuildPhase;
}
export type BuildEvent = { readonly kind: "state"; readonly record: BuildRecord } |
    { readonly kind: "phase"; readonly id: string; readonly phase: BuildPhase } |
    { readonly kind: "output"; readonly id: string; readonly stream: "stdout" | "stderr"; readonly text: string };
export interface BuildHandle {
    readonly id: string;
    readonly completion: Promise<BuildRecord>;
    snapshot(): BuildRecord;
    cancel(): Promise<"requested" | "unavailable" | "finished">;
}

/** One active run per checkout. Repository tabs can still hold several distinct checkout contexts. */
export class CompanionBuildHost {
    private readonly active = new Set<string>();
    constructor(private readonly options: {
        journal: BuildJournal;
        prepare?: (request: BuildRequest) => Promise<BuildPlan>;
        revalidate?: (plan: BuildPlan) => Promise<void>;
        start?: StartBuildProcess;
        onEvent?: (event: BuildEvent) => void;
    }) {}

    async start(request: BuildRequest): Promise<BuildHandle> {
        // Copy renderer input before the first asynchronous operation.
        const input = { checkout: request.checkout, action: request.action, ...(request.candidate !== undefined ? { candidate: request.candidate } : {}) };
        const prepared = await (this.options.prepare ?? prepareBuild)(input);
        const plan = Object.freeze({ ...prepared, source: Object.freeze({ ...prepared.source }), args: Object.freeze([...prepared.args]) });
        if (this.active.has(plan.source.checkoutId)) throw new Error("A build already owns this checkout.");
        this.active.add(plan.source.checkoutId);
        let record: BuildRecord = Object.freeze({ id: randomUUID(), plan, startedAt: new Date().toISOString(), state: "prepared" });
        const notify = (event: BuildEvent): void => { try { this.options.onEvent?.(event); } catch { /* Observation never controls the child. */ } };
        const save = async (next: BuildRecord): Promise<void> => {
            record = Object.freeze(next);
            await this.options.journal.save(record);
            notify({ kind: "state", record });
        };
        let child: OwnedBuildProcess;
        const progress = new BuildPhaseReader();
        try {
            await save(record);
            await (this.options.revalidate ?? revalidateBuildSource)(plan);
            child = (this.options.start ?? windowsBuildTransport())(plan, (stream, text) => {
                const bounded = text.slice(0, 16_384);
                notify({ kind: "output", id: record.id, stream, text: bounded });
                if (stream === "stdout") for (const phase of progress.push(bounded)) {
                    record = Object.freeze({ ...record, lastPhase: Object.freeze(phase) });
                    notify({ kind: "phase", id: record.id, phase });
                }
            });
        } catch {
            this.active.delete(plan.source.checkoutId);
            await save({ ...record, state: "failed", endedAt: new Date().toISOString(), detail: "Source validation, persistence or process launch failed; no successful result is available." });
            throw new Error(record.detail);
        }
        let settled = false;
        let cancelRequested = false;
        let cancellation: Promise<"requested" | "unavailable" | "finished"> | undefined;
        // Persist before exposing the handle; if recording fails, keep process ownership and observe completion.
        const running = save({ ...record, state: "running" }).catch(() => {
            record = Object.freeze({ ...record, detail: "Run history could not be saved. Keep this host open until completion." });
        });
        const completion = (async (): Promise<BuildRecord> => {
            await running;
            let exit: ProcessExit;
            try { exit = await child.completion; } catch { exit = { code: null, signal: null, startError: "Process observation failed." }; }
            settled = true;
            if (cancellation) await cancellation;
            let state: BuildState = cancelRequested ? "cancelled" : exit.code === 0 && !exit.startError ? "completed-unverified" : "failed";
            let detail = state === "completed-unverified" ? "Root command exited zero. Output receipts, application health and package delivery have not been accepted." : "Root process ended without a verified deliverable.";
            try { await (this.options.revalidate ?? revalidateBuildSource)(plan); }
            catch { if (state !== "cancelled") state = "failed"; detail = "Source changed during the run; outputs are ineligible for acceptance."; }
            try { await save({ ...record, state, exit, endedAt: new Date().toISOString(), detail }); }
            catch { record = Object.freeze({ ...record, detail: `${detail} Final history persistence failed.` }); }
            finally { this.active.delete(plan.source.checkoutId); }
            return record;
        })();
        return {
            id: record.id, completion, snapshot: () => record,
            cancel: () => {
                if (settled) return Promise.resolve("finished");
                if (cancellation) return cancellation;
                cancellation = (async () => {
                    let outcome: "requested" | "unavailable" | "finished";
                    try { outcome = await child.cancel(); } catch { outcome = "unavailable"; }
                    if (outcome === "requested") {
                        cancelRequested = true;
                        await save({ ...record, state: "cancelling", detail: "Cancellation requested; waiting for owned process completion." }).catch(() => undefined);
                    }
                    return outcome;
                })();
                return cancellation;
            },
        };
    }
}

async function revalidateBuildSource(plan: BuildPlan): Promise<void> {
    const actual = await inspectBuildSource(plan.source.checkout);
    for (const key of ["repositoryId", "checkoutId", "commit", "indexTree", "inputsDigest"] as const)
        if (actual[key] !== plan.source[key]) throw new Error("Build source changed.");
}
