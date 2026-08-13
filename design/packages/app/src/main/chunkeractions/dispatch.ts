/**
 * The dispatch itself: one call, against whichever credential the caller already holds.
 *
 * The transport is taken structurally rather than as `CiTransport` from `../cirender`, so
 * a test can drive this with a two-method object and nothing else. The real caller passes
 * the CI render transport, which satisfies this shape exactly and already resolves the
 * in-app GitHub token first and the `gh` CLI second.
 *
 * The default branch is read rather than assumed. A `workflow_dispatch` runs the workflow
 * file as it exists on the ref it is dispatched against, and a repository whose default
 * branch is not `main` would otherwise be told to run a file from a branch that has none.
 */

import { planChunkerRun } from "./plan.js";
import type { ChunkerRunRequest, ChunkerRunPlan, ChunkerPlanRefusal } from "./plan.js";

/** Exactly the part of the CI render transport a conversion needs. */
export interface ChunkerDispatchTransport {
    readDefaultBranch(owner: string, repo: string): Promise<string>;
    dispatchWorkflow(
        owner: string,
        repo: string,
        workflowFile: string,
        ref: string,
        inputs: Readonly<Record<string, string>>,
    ): Promise<void>;
}

export type ChunkerDispatchFailure =
    | { readonly code: "refused"; readonly refusal: ChunkerPlanRefusal }
    /** GitHub answered, and said no. The message is its own, so it is passed through whole. */
    | { readonly code: "dispatch-failed"; readonly message: string };

export type ChunkerDispatchResult =
    | { readonly ok: true; readonly plan: ChunkerRunPlan; readonly ref: string }
    | { readonly ok: false; readonly failure: ChunkerDispatchFailure };

/**
 * Plans a conversion and starts it, reporting honestly which of the two halves failed.
 *
 * A started run is not a finished conversion and this deliberately does not pretend
 * otherwise: it returns as soon as GitHub has accepted the dispatch, and the caller
 * follows the run the same way a CI render is followed. Reporting a conversion complete
 * here would be a claim about a job that has not begun.
 */
export async function dispatchChunkerRun(
    transport: ChunkerDispatchTransport,
    owner: string,
    repo: string,
    request: ChunkerRunRequest,
): Promise<ChunkerDispatchResult> {
    const planned = planChunkerRun(request);
    if (!planned.ok) {
        return { ok: false, failure: { code: "refused", refusal: planned.failure } };
    }

    let ref: string;
    try {
        ref = await transport.readDefaultBranch(owner, repo);
    } catch (error) {
        return {
            ok: false,
            failure: {
                code: "dispatch-failed",
                message:
                    `The default branch of ${owner}/${repo} could not be read, so there is no ref to ` +
                    `run ${planned.plan.workflowFile} against: ${String(error)}`,
            },
        };
    }

    try {
        await transport.dispatchWorkflow(
            owner,
            repo,
            planned.plan.workflowFile,
            ref,
            planned.plan.inputs,
        );
    } catch (error) {
        return { ok: false, failure: { code: "dispatch-failed", message: String(error) } };
    }

    return { ok: true, plan: planned.plan, ref };
}
