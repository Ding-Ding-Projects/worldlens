/**
 * The part of a cloud render that is not about GitHub.
 *
 * `CiTransport` in `./transport.js` is GitHub all the way down - releases, repository
 * files, repository variables, Pages, token scopes. Most of that has no meaning anywhere
 * else. But four things are true of *any* place a render runs: something starts a job,
 * something reports what that job is doing, something hands back its log, and something
 * produces a file at the end. That is this interface, and nothing more.
 *
 * The coordinates deliberately do **not** unify. GitHub identifies a run by
 * `(owner, repo, runId)` and AWS Batch identifies one by a job id; pretending those are
 * the same triple would mean one of them carrying two empty strings around forever. So a
 * job is named by {@link CiJobRef}, a discriminated union each provider builds for itself,
 * and the loop that polls it never looks inside.
 *
 * The GitHub route is not rewritten to fit. {@link runTransportOverGitHub} adapts the
 * existing `CiTransport` onto this shape, so `brokerCliTransport()` keeps working exactly
 * as it did and the adapter is the only code that knows both vocabularies.
 */
/** Which provider ran a job. Widened here first; every route id in the app mirrors it. */
export type CiRunProvider = "gh" | "aws";

/**
 * One job, named in whatever way its own provider names jobs.
 *
 * Opaque by intent: the sync loop passes it back to the transport that produced it and
 * never reads a field. Anything the loop genuinely needs is on {@link CiJobState}.
 */
export type CiJobRef =
    | {
          readonly provider: "gh";
          readonly owner: string;
          readonly repo: string;
          readonly runId: number;
      }
    | {
          readonly provider: "aws";
          /** The Batch job id. For an array job this is the parent. */
          readonly jobId: string;
          readonly jobQueue: string;
      };

/**
 * How a job is going, in the four states every provider genuinely has.
 *
 * `queued` and `running` are deliberately separate: a Batch job can sit in a queue for
 * minutes with nothing wrong, and reporting that as "running" makes a person wait at a
 * screen that is telling them something false.
 */
export type CiJobStatus = "queued" | "running" | "completed";

/** Why a completed job ended. Null while it has not. */
export type CiJobConclusion = "success" | "failure" | "cancelled" | "timed-out" | null;

/** The state of one job, in the facts a render loop acts on and no others. */
export interface CiJobState {
    readonly ref: CiJobRef;
    readonly status: CiJobStatus;
    readonly conclusion: CiJobConclusion;
    /** ISO-8601, or null when the provider has not started it yet. */
    readonly startedAt: string | null;
    readonly completedAt: string | null;
    /**
     * A page a person can open to watch this themselves.
     *
     * Null rather than a guessed address. A console URL assembled from a region and an id
     * that turns out to 404 is worse than no link, because it reads as the job being gone.
     */
    readonly url: string | null;
}

/** One named unit inside a job - an Actions job, or one index of a Batch array job. */
export interface CiJobUnit {
    readonly id: string;
    readonly name: string;
    readonly status: CiJobStatus;
    readonly conclusion: CiJobConclusion;
    readonly startedAt: string | null;
    readonly completedAt: string | null;
}

/** A file a finished job produced, wherever it is actually stored. */
export interface CiJobArtifact {
    readonly id: string;
    readonly name: string;
    readonly sizeInBytes: number;
    /**
     * The provider's own digest in `sha256:<hex>` form, or null when it published none.
     *
     * Null is the honest answer and has consequences downstream: a collector says
     * "recorded" rather than "verified" for a download it could not check, because
     * claiming a verification that never happened is worse than admitting there was none.
     */
    readonly digest: string | null;
    /** True when the provider has expired it and a download would fail. */
    readonly expired: boolean;
}

/** Everything a render loop asks of the place a render runs, and nothing GitHub-shaped. */
export interface CiRunTransport {
    readonly provider: CiRunProvider;
    /** One phrase naming the credential in play, for a message a person has to act on. */
    readonly describe: string;
    /** False when this route can start a render but cannot publish a world to it. */
    readonly canUpload: boolean;

    /** Starts one render and returns the job it started. */
    submitJob(request: CiJobRequest): Promise<CiJobRef>;
    readJob(ref: CiJobRef): Promise<CiJobState>;
    readJobUnits(ref: CiJobRef): Promise<readonly CiJobUnit[]>;
    /** The tail of one unit's log, or null when the provider has none to give yet. */
    readLogTail(ref: CiJobRef, unitId: string, maxLines?: number): Promise<string | null>;
    listArtifacts(ref: CiJobRef): Promise<readonly CiJobArtifact[]>;
    downloadArtifact(
        ref: CiJobRef,
        artifact: CiJobArtifact,
        destination: string,
        onBytes?: (done: number, total: number) => void,
    ): Promise<void>;
    /** Asks the provider to stop a job. Best effort; the loop still verifies the state. */
    cancelJob?: ((ref: CiJobRef, reason: string) => Promise<void>) | undefined;
}

/** What starting a render needs, in terms neither provider owns. */
export interface CiJobRequest {
    /** The render inputs, already flattened to strings by `plan.ts`. */
    readonly inputs: Readonly<Record<string, string>>;
    /** How many parallel units to ask for. One means a single job, not an array of one. */
    readonly units: number;
    /** Names this render in the provider's own console, so a person can find it there. */
    readonly label: string;
}

/** Maps one Actions run or job status pair onto the neutral pair. */
export function neutralStatus(
    status: string,
    conclusion: string | null,
): { status: CiJobStatus; conclusion: CiJobConclusion } {
    if (status === "completed") {
        return { status: "completed", conclusion: neutralConclusion(conclusion) };
    }
    if (status === "queued" || status === "waiting" || status === "pending" || status === "requested") {
        return { status: "queued", conclusion: null };
    }
    return { status: "running", conclusion: null };
}

/** Maps one provider conclusion word onto the four this app acts on. */
export function neutralConclusion(conclusion: string | null): CiJobConclusion {
    switch (conclusion) {
        case "success":
            return "success";
        case "cancelled":
        case "canceled":
            return "cancelled";
        case "timed_out":
        case "timed-out":
            return "timed-out";
        case null:
            return null;
        default:
            // Every other word GitHub can return - failure, startup_failure, action_required,
            // neutral, skipped, stale - is something other than a success on a completed run,
            // and the loop treats them all the same way. Mapping them to null would read as
            // "still going", which is the one wrong answer here.
            return "failure";
    }
}
