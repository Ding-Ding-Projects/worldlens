/**
 * Documents, as checkable data, which existing seam a world-generation runner choice
 * maps onto - so the choice made in `design/packages/ui/src/components/mcserver/worldgen/
 * worldGenPlan.ts` (the renderer-side plan builder) is provably the same seam this
 * process already has, rather than a fifth transport invented for this feature.
 *
 * Two seams already exist under `mcserver/`:
 *
 * - `mcserver/transport/` (`localProcess.ts`, `localDocker.ts`, `sshDocker.ts`, plus AWS
 *   support) runs a server process somewhere and gives back a handle for console I/O,
 *   status, and stop. World generation on `"local"` is exactly this: create a server the
 *   normal way (`mcserver/create.ts`), launch it through this same transport, watch the
 *   console, stop it, and read the resulting world folder off disk.
 * - `app/src/main/cirender/` (`gh.ts`, `schedule.ts`, `state.ts`, `workflowTemplates.ts`,
 *   `runTransportGitHub.ts`) already dispatches a workflow on a runner - including a
 *   GitHub Actions runner - polls it, survives the app restarting mid-run, and downloads
 *   the artifact it produced. World generation on `"github-actions"` is a new workflow
 *   *kind* for that seam (run the server-jar steps and upload the resulting world), not a
 *   new way of talking to GitHub Actions.
 *
 * This module owns no I/O. It is the small, testable mapping a caller consults before
 * wiring the real dispatch, kept here so the mapping itself - not just the plan text - is
 * asserted against drifting.
 */

export type WorldGenRunnerKind = "local" | "github-actions";

export interface RunnerSeamDescription {
    readonly runnerKind: WorldGenRunnerKind;
    /** The existing directory under `mcserver/` (or its sibling `cirender/`) this reuses. */
    readonly seamDirectory: string;
    /** The specific modules in that directory a real implementation would call. */
    readonly reusedModules: readonly string[];
    /** Why this seam and not a new one. */
    readonly rationale: string;
}

export const RUNNER_SEAMS: readonly RunnerSeamDescription[] = [
    {
        runnerKind: "local",
        seamDirectory: "mcserver/transport/",
        reusedModules: ["mcserver/create.ts", "mcserver/transport/localProcess.ts", "mcserver/transport/factory.ts"],
        rationale:
            "A local generation run is an ordinary server lifecycle - create, launch, watch the console, stop - that the local process transport already performs for every other server in this app.",
    },
    {
        runnerKind: "github-actions",
        seamDirectory: "cirender/",
        reusedModules: [
            "cirender/gh.ts",
            "cirender/schedule.ts",
            "cirender/state.ts",
            "cirender/workflowTemplates.ts",
            "cirender/upload.ts",
        ],
        rationale:
            "cirender already dispatches a workflow, persists run state across an app restart, polls honestly (never rendering \"unreachable\" as finished or failed), and downloads an artifact when the run completes - every property a long remote generation job needs, with none of it re-implemented here.",
    },
];

export function describeRunnerSeam(kind: WorldGenRunnerKind): RunnerSeamDescription {
    const seam = RUNNER_SEAMS.find((entry) => entry.runnerKind === kind);
    if (seam === undefined) {
        throw new Error(`No runner seam recorded for "${kind}".`);
    }
    return seam;
}
