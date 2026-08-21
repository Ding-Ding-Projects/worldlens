/**
 * Running a render as an AWS Batch job on Fargate.
 *
 * Batch rather than a bare ECS task because a render is a *queued* piece of work: a world
 * that needs eight shards submits one array job of eight and lets Batch decide when each
 * index gets capacity. Doing that by hand over RunTask means writing a queue, a retry and
 * a fan-in, all of which already exist here.
 *
 * Every call goes through the lease, so nothing in this file has ever seen a credential.
 */
import type { ProcessRunOptions } from "../cirender/gh.js";
import type { CiJobConclusion, CiJobStatus, CiJobUnit } from "../cirender/runTransport.js";
import type { AwsCliAccountLease } from "./credentialBroker.js";

/** Where a render runs: the queue that schedules it and the definition that shapes it. */
export interface BatchBinding {
    readonly jobQueue: string;
    readonly jobDefinition: string;
}

export interface BatchSubmitRequest {
    readonly lease: AwsCliAccountLease;
    readonly binding: BatchBinding;
    /** Names the job in the Batch console, so a person can find it there. */
    readonly name: string;
    /** Passed to the container as environment. Never a secret; these reach the console. */
    readonly environment: Readonly<Record<string, string>>;
    /**
     * How many array indices to submit. One means a plain job.
     *
     * Batch refuses an array of size 1, which is why this is not simply always an array:
     * a single-shard render must be submitted as an ordinary job or it fails at submit.
     */
    readonly units: number;
    readonly signal?: AbortSignal | undefined;
}

/**
 * Batch's own job states, mapped onto the three this app acts on.
 *
 * The mapping worth noting is that `RUNNABLE` is **queued**, not running. A job can sit
 * RUNNABLE for minutes while Fargate finds capacity, and reporting that as running makes
 * somebody watch a screen telling them something false.
 */
export function batchStatus(status: string): CiJobStatus {
    switch (status) {
        case "SUBMITTED":
        case "PENDING":
        case "RUNNABLE":
        case "STARTING":
            return "queued";
        case "RUNNING":
            return "running";
        case "SUCCEEDED":
        case "FAILED":
            return "completed";
        default:
            // An unknown state is not a finished one. Treating it as completed would end
            // the poll loop and report a render that is still going as done.
            return "running";
    }
}

/** Why a Batch job ended, from its status and the reason it recorded. */
export function batchConclusion(status: string, reason: string | null): CiJobConclusion {
    if (status === "SUCCEEDED") {
        return "success";
    }
    if (status !== "FAILED") {
        return null;
    }
    const text = (reason ?? "").toLowerCase();
    if (text.includes("cancel")) {
        return "cancelled";
    }
    // Batch words a timeout several ways depending on where it was set: the console says
    // "Job attempt duration exceeded", the API field is attemptDurationSeconds, and a
    // container that hits its own limit says "timed out". Match the space-insensitive
    // form so a spelling difference does not report a timeout as an ordinary failure -
    // the two want completely different advice.
    const squashed = text.replace(/\s+/g, "");
    if (squashed.includes("timedout") || squashed.includes("timeout") || squashed.includes("attemptduration")) {
        return "timed-out";
    }
    return "failure";
}

interface SubmitAnswer {
    readonly jobId?: string;
    readonly jobName?: string;
}

/** Submits one render and returns the Batch job id. */
export async function submitBatchJob(request: BatchSubmitRequest): Promise<string> {
    const { lease, binding } = request;
    const environment = Object.entries(request.environment).map(([name, value]) => ({
        name,
        value,
    }));

    const args = [
        "batch",
        "submit-job",
        "--job-name",
        request.name,
        "--job-queue",
        binding.jobQueue,
        "--job-definition",
        binding.jobDefinition,
        "--container-overrides",
        JSON.stringify({ environment }),
    ];

    if (request.units > 1) {
        args.push("--array-properties", JSON.stringify({ size: request.units }));
    }

    const answer = await lease.json<SubmitAnswer>(args, { signal: request.signal });
    if (!answer.jobId) {
        throw new Error("AWS Batch accepted the submission but returned no job id.");
    }
    return answer.jobId;
}

interface DescribeAnswer {
    readonly jobs?: readonly BatchJobDescription[];
}

interface BatchJobDescription {
    readonly jobId?: string;
    readonly jobName?: string;
    readonly status?: string;
    readonly statusReason?: string;
    readonly createdAt?: number;
    readonly startedAt?: number;
    readonly stoppedAt?: number;
    readonly arrayProperties?: {
        readonly size?: number;
        readonly statusSummary?: Readonly<Record<string, number>>;
    };
    readonly container?: { readonly logStreamName?: string };
    readonly attempts?: readonly {
        readonly container?: { readonly logStreamName?: string };
    }[];
}

/** Describes one job. Null when Batch no longer knows about it. */
export async function describeBatchJob(
    lease: AwsCliAccountLease,
    jobId: string,
    options?: ProcessRunOptions,
): Promise<BatchJobDescription | null> {
    const answer = await lease.json<DescribeAnswer>(
        ["batch", "describe-jobs", "--jobs", jobId],
        options,
    );
    return answer.jobs?.[0] ?? null;
}

/** Every index of an array job, or the single job itself when it is not an array. */
export async function describeBatchUnits(
    lease: AwsCliAccountLease,
    jobId: string,
    options?: ProcessRunOptions,
): Promise<readonly CiJobUnit[]> {
    const parent = await describeBatchJob(lease, jobId, options);
    if (!parent) {
        return [];
    }

    const size = parent.arrayProperties?.size ?? 0;
    if (size < 1) {
        return [unitFrom(parent, parent.jobName ?? jobId)];
    }

    // An array job's children are described by index-suffixed ids. Ask for them in one
    // call rather than one call per index: a 64-shard render would otherwise spend 64
    // round trips per poll, which is how a progress display becomes the slow part.
    const childIds = Array.from({ length: size }, (_, index) => `${jobId}:${index}`);
    const units: CiJobUnit[] = [];
    for (let start = 0; start < childIds.length; start += DESCRIBE_BATCH_SIZE) {
        const slice = childIds.slice(start, start + DESCRIBE_BATCH_SIZE);
        const answer = await lease.json<DescribeAnswer>(
            ["batch", "describe-jobs", "--jobs", ...slice],
            options,
        );
        for (const job of answer.jobs ?? []) {
            units.push(unitFrom(job, job.jobName ?? job.jobId ?? "shard"));
        }
    }
    return units;
}

/** describe-jobs accepts at most 100 ids per call. */
const DESCRIBE_BATCH_SIZE = 100;

function unitFrom(job: BatchJobDescription, name: string): CiJobUnit {
    const status = batchStatus(job.status ?? "");
    return {
        id: job.jobId ?? name,
        name,
        status,
        conclusion: batchConclusion(job.status ?? "", job.statusReason ?? null),
        startedAt: isoOrNull(job.startedAt ?? job.createdAt),
        completedAt: isoOrNull(job.stoppedAt),
    };
}

function isoOrNull(epochMillis: number | undefined): string | null {
    if (typeof epochMillis !== "number" || !Number.isFinite(epochMillis)) {
        return null;
    }
    return new Date(epochMillis).toISOString();
}

/** The CloudWatch log stream one job wrote to, or null before it has written any. */
export function logStreamOf(job: BatchJobDescription): string | null {
    const direct = job.container?.logStreamName;
    if (direct) {
        return direct;
    }
    // A retried job records its stream on the attempt rather than the container. Read the
    // most recent attempt, because that is the one whose failure a person is looking at.
    const attempts = job.attempts ?? [];
    for (let index = attempts.length - 1; index >= 0; index -= 1) {
        const stream = attempts[index]?.container?.logStreamName;
        if (stream) {
            return stream;
        }
    }
    return null;
}

/** Asks Batch to stop a job. Best effort; the caller still verifies the state after. */
export async function cancelBatchJob(
    lease: AwsCliAccountLease,
    jobId: string,
    reason: string,
    options?: ProcessRunOptions,
): Promise<void> {
    // terminate-job stops a job that is already running; cancel-job only works before it
    // starts. Sending both means "stop" means stop regardless of where the job had got to.
    await lease.json(["batch", "cancel-job", "--job-id", jobId, "--reason", reason], options);
    await lease.json(["batch", "terminate-job", "--job-id", jobId, "--reason", reason], options);
}

export type { BatchJobDescription };
