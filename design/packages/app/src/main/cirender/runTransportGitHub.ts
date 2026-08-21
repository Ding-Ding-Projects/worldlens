/**
 * The existing GitHub transport, seen through the neutral {@link CiRunTransport} shape.
 *
 * An adapter rather than a rewrite, and deliberately so: `brokerCliTransport()` and every
 * call already made against `CiTransport` keep working untouched, and this file is the one
 * place that has to speak both vocabularies. If the GitHub route had instead been changed
 * to the neutral shape, every repository-flavoured call site would have had to change with
 * it for the benefit of a second provider that shares none of them.
 *
 * What it cannot do is invent coordinates. Actions dispatch needs an owner, a repository, a
 * workflow file and a ref, and none of those are in {@link CiJobRequest} - they are bound
 * here, once, when the adapter is built.
 */
import { RENDERED_MAP_ARTIFACT } from "./actions.js";
import type { WorkflowArtifact } from "./actions.js";
import { neutralStatus } from "./runTransport.js";
import type {
    CiJobArtifact,
    CiJobRef,
    CiJobRequest,
    CiJobState,
    CiJobUnit,
    CiRunTransport,
} from "./runTransport.js";
import type { CiTransport } from "./transport.js";

/** Where an Actions render lives: the repository, the workflow file and the ref. */
export interface GitHubRunBinding {
    readonly owner: string;
    readonly repo: string;
    readonly workflowFile: string;
    readonly ref: string;
}

/** Thrown when a job reference minted by another provider reaches this adapter. */
export class WrongProviderError extends Error {
    constructor(expected: string, saw: string) {
        super(`This is the ${expected} route; it was handed a ${saw} job.`);
        this.name = "WrongProviderError";
    }
}

function ghRef(ref: CiJobRef): { owner: string; repo: string; runId: number } {
    if (ref.provider !== "gh") {
        throw new WrongProviderError("GitHub", ref.provider);
    }
    return { owner: ref.owner, repo: ref.repo, runId: ref.runId };
}

/**
 * How long after a dispatch to keep looking for the run it started.
 *
 * Actions gives no run id back from a dispatch, so the run has to be found by looking for
 * one created after the dispatch went out. That search is already implemented by
 * `findDispatchedRun`; this is only how long the adapter is willing to keep asking.
 */
const DISPATCH_SEARCH_MS = 90_000;
const DISPATCH_POLL_MS = 2_000;

/** Wraps one `CiTransport` so a render loop can drive it without knowing it is GitHub. */
export function runTransportOverGitHub(
    transport: CiTransport,
    binding: GitHubRunBinding,
    options: { readonly sleep?: (ms: number) => Promise<void> } = {},
): CiRunTransport {
    const sleep =
        options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const { owner, repo, workflowFile, ref } = binding;

    return {
        provider: "gh",
        describe: transport.describe,
        canUpload: transport.canUpload,

        async submitJob(request: CiJobRequest): Promise<CiJobRef> {
            // Read the clock before dispatching, never after. A run created between the
            // dispatch landing and the clock being read would sit before `since` and be
            // invisible to the search, which reads as a dispatch that silently did nothing.
            const since = new Date();
            await transport.dispatchWorkflow(owner, repo, workflowFile, ref, request.inputs);

            const deadline = Date.now() + DISPATCH_SEARCH_MS;
            for (;;) {
                const run = await transport.findDispatchedRun(owner, repo, workflowFile, since);
                if (run) {
                    return { provider: "gh", owner, repo, runId: run.id };
                }
                if (Date.now() >= deadline) {
                    const seconds = Math.round(DISPATCH_SEARCH_MS / 1000);
                    throw new Error(
                        `The workflow was dispatched but no run appeared within ${seconds} seconds. ` +
                            `It may still start; check the repository Actions tab.`,
                    );
                }
                await sleep(DISPATCH_POLL_MS);
            }
        },

        async readJob(jobRef: CiJobRef): Promise<CiJobState> {
            const { owner: o, repo: r, runId } = ghRef(jobRef);
            const run = await transport.readRun(o, r, runId);
            const { status, conclusion } = neutralStatus(run.status, run.conclusion);
            return {
                ref: jobRef,
                status,
                conclusion,
                startedAt: run.createdAt,
                completedAt: status === "completed" ? run.updatedAt : null,
                url: run.htmlUrl,
            };
        },

        async readJobUnits(jobRef: CiJobRef): Promise<readonly CiJobUnit[]> {
            const { owner: o, repo: r, runId } = ghRef(jobRef);
            const jobs = await transport.readRunJobs(o, r, runId);
            return jobs.map((job) => {
                const { status, conclusion } = neutralStatus(job.status, job.conclusion);
                return {
                    id: String(job.id),
                    name: job.name,
                    status,
                    conclusion,
                    startedAt: job.startedAt,
                    completedAt: job.completedAt,
                } satisfies CiJobUnit;
            });
        },

        async readLogTail(
            jobRef: CiJobRef,
            unitId: string,
            maxLines?: number,
        ): Promise<string | null> {
            const { owner: o, repo: r } = ghRef(jobRef);
            const id = Number(unitId);
            if (!Number.isSafeInteger(id)) {
                // A unit id this route did not mint. Say nothing rather than asking GitHub
                // for job NaN, which answers with a 404 that reads as a missing job.
                return null;
            }
            return transport.readJobLogTail(o, r, id, maxLines);
        },

        async listArtifacts(jobRef: CiJobRef): Promise<readonly CiJobArtifact[]> {
            const { owner: o, repo: r, runId } = ghRef(jobRef);
            const artifacts = await transport.listRunArtifacts(o, r, runId);
            return artifacts.map(neutralArtifact);
        },

        async downloadArtifact(
            jobRef: CiJobRef,
            artifact: CiJobArtifact,
            destination: string,
            onBytes?: (done: number, total: number) => void,
        ): Promise<void> {
            const { owner: o, repo: r, runId } = ghRef(jobRef);
            // The download needs the full Actions artifact, including its download URL,
            // which the neutral shape deliberately does not carry. Re-read the list and
            // match by id rather than reconstructing a URL that would go stale.
            const artifacts = await transport.listRunArtifacts(o, r, runId);
            const match = artifacts.find((candidate) => String(candidate.id) === artifact.id);
            if (!match) {
                throw new Error(
                    `Artifact ${artifact.name} is no longer listed on run ${runId}; it may have expired.`,
                );
            }
            await transport.downloadArtifact(o, r, match, destination, onBytes);
        },
    };
}

/** The neutral view of one Actions artifact. */
function neutralArtifact(artifact: WorkflowArtifact): CiJobArtifact {
    return {
        id: String(artifact.id),
        name: artifact.name,
        sizeInBytes: artifact.sizeInBytes,
        digest: artifact.digest,
        expired: artifact.expired,
    };
}

/** The artifact name an Actions render publishes its map under. Re-exported for symmetry. */
export const GITHUB_MAP_ARTIFACT = RENDERED_MAP_ARTIFACT;
