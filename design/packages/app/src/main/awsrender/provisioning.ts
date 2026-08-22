/**
 * Creating the AWS side of a render, and saying what it costs first.
 *
 * The sibling of `cirender/bootstrap.ts`, with one difference that shapes the whole file:
 * committing a workflow into somebody's repository costs them nothing, and creating a
 * Fargate compute environment, a job queue and an S3 bucket costs them money for as long
 * as it exists. So the plan comes first, always, with real numbers on it, and nothing is
 * created until somebody has seen it.
 *
 * ## Every resource is tagged, and that is load-bearing
 *
 * A marker file records what was made, exactly as the GitHub bootstrap does. But a marker
 * can go stale - a person deletes something in the console, a create half-fails, a machine
 * is reinstalled - and unlike a repository file, the thing it describes is being billed for.
 * So every resource also carries {@link MANAGED_TAG}, and reconciliation lists what is
 * really there and compares. Anything provisioned but unrecorded, or recorded but gone, is
 * *reported* rather than quietly fixed: this is somebody's bill, and a wrong guess in
 * either direction costs them either money or a working render.
 */
import type { AwsCliAccountLease } from "./credentialBroker.js";

/** Every resource this app creates carries this tag. Nothing else is treated as ours. */
export const MANAGED_TAG_KEY = "worldlens:managed";
export const MANAGED_TAG_VALUE = "true";
export const MANAGED_TAG = `${MANAGED_TAG_KEY}=${MANAGED_TAG_VALUE}` as const;

/** Bumped only if the marker's shape changes. An unknown version is still ours. */
export const AWS_MARKER_VERSION = 1;

/** The kinds of resource a render needs. Ordered as they must be created. */
export type AwsResourceKind =
    | "s3-bucket"
    | "iam-execution-role"
    | "iam-job-role"
    | "batch-compute-environment"
    | "batch-job-queue"
    | "batch-job-definition"
    | "cloudwatch-log-group";

/** One resource, as the plan describes it before anything exists. */
export interface AwsPlannedResource {
    readonly kind: AwsResourceKind;
    /** The exact name or ARN fragment this will be created as. Never a placeholder. */
    readonly name: string;
    /** True when it is already there and will be left alone. */
    readonly exists: boolean;
    /**
     * What this costs, in plain words, or null when it genuinely costs nothing.
     *
     * Null is used only for things AWS does not bill for at all - an IAM role, an empty
     * job queue. Everything else says a real number, because "it depends on usage" is
     * what somebody reads right before an unexpected bill.
     */
    readonly cost: string | null;
}

/** What provisioning would do, for a person to read before it does any of it. */
export interface AwsProvisionPlan {
    readonly region: string;
    readonly accountId: string | null;
    readonly resources: readonly AwsPlannedResource[];
    /** True when every resource already exists and provisioning would create nothing. */
    readonly complete: boolean;
    /**
     * The standing cost of leaving this provisioned with nothing running.
     *
     * The number that actually surprises people. Fargate bills per second while a render
     * runs, which is easy to reason about; what is not obvious is that a Fargate compute
     * environment with a zero minimum vCPU count costs nothing at rest, so the standing
     * cost here is the bucket alone.
     */
    readonly idleCostSummary: string;
    /** The per-render cost, stated as a rate rather than a total nobody can predict. */
    readonly renderCostSummary: string;
}

/** What this app recorded creating, kept in the bucket it created. */
export interface AwsBootstrapMarker {
    readonly tool: "worldlens";
    readonly version: number;
    readonly region: string;
    readonly resources: readonly { readonly kind: AwsResourceKind; readonly name: string }[];
    readonly preparedAt: string;
}

/** Names every resource for one render setup, derived from one chosen prefix. */
export interface AwsResourceNames {
    readonly bucket: string;
    readonly executionRole: string;
    readonly jobRole: string;
    readonly computeEnvironment: string;
    readonly jobQueue: string;
    readonly jobDefinition: string;
    readonly logGroup: string;
}

/**
 * Derives every resource name from one prefix.
 *
 * A bucket name is globally unique across all of AWS, which is why the account id is part
 * of it: "worldlens-renders" is certainly taken, and a create that fails with
 * BucketAlreadyExists reads as a broken app rather than as a name somebody else has.
 */
export function resourceNames(prefix: string, accountId: string | null): AwsResourceNames {
    const safe = prefix.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    const suffix = accountId ? `-${accountId}` : "";
    return {
        bucket: `${safe}${suffix}`,
        executionRole: `${safe}-execution`,
        jobRole: `${safe}-job`,
        computeEnvironment: `${safe}-compute`,
        jobQueue: `${safe}-queue`,
        jobDefinition: `${safe}-render`,
        logGroup: `/aws/batch/${safe}`,
    };
}

/**
 * Cost sentences, written once so the plan and the docs cannot drift apart.
 *
 * These are order-of-magnitude figures in US dollars, and they say so. Quoting a precise
 * per-second rate would be false precision - it varies by region and changes without
 * notice - while quoting nothing at all is how somebody finds out from their bill.
 */
export const COST_NOTES = {
    bucket:
        "S3 storage, roughly $0.023 per GB per month, plus a charge for data leaving AWS. " +
        "A 20 GB world left in the bucket is well under a dollar a month.",
    fargate:
        "Fargate bills per second only while a render runs, roughly $0.04 per vCPU-hour " +
        "and $0.004 per GB-hour. A four-vCPU render taking an hour is a few tens of cents.",
    logs: "CloudWatch Logs, roughly $0.50 per GB ingested. A render's log is a few MB.",
    none: null,
} as const;

/** Builds the plan by reading what is already there. Creates nothing. */
export async function planAwsProvisioning(options: {
    readonly lease: AwsCliAccountLease;
    readonly prefix: string;
    readonly signal?: AbortSignal | undefined;
}): Promise<AwsProvisionPlan> {
    const { lease } = options;
    const names = resourceNames(options.prefix, lease.accountId);
    const runOptions = { signal: options.signal };

    const resources: AwsPlannedResource[] = [
        {
            kind: "s3-bucket",
            name: names.bucket,
            exists: await bucketExists(lease, names.bucket, runOptions),
            cost: COST_NOTES.bucket,
        },
        {
            kind: "iam-execution-role",
            name: names.executionRole,
            exists: await roleExists(lease, names.executionRole, runOptions),
            cost: COST_NOTES.none,
        },
        {
            kind: "iam-job-role",
            name: names.jobRole,
            exists: await roleExists(lease, names.jobRole, runOptions),
            cost: COST_NOTES.none,
        },
        {
            kind: "cloudwatch-log-group",
            name: names.logGroup,
            exists: await logGroupExists(lease, names.logGroup, runOptions),
            cost: COST_NOTES.logs,
        },
        {
            kind: "batch-compute-environment",
            name: names.computeEnvironment,
            exists: await computeEnvironmentExists(lease, names.computeEnvironment, runOptions),
            cost: COST_NOTES.fargate,
        },
        {
            kind: "batch-job-queue",
            name: names.jobQueue,
            exists: await jobQueueExists(lease, names.jobQueue, runOptions),
            cost: COST_NOTES.none,
        },
        {
            kind: "batch-job-definition",
            name: names.jobDefinition,
            exists: await jobDefinitionExists(lease, names.jobDefinition, runOptions),
            cost: COST_NOTES.none,
        },
    ];

    return {
        region: lease.region,
        accountId: lease.accountId,
        resources,
        complete: resources.every((resource) => resource.exists),
        idleCostSummary:
            "With nothing rendering, only the S3 bucket is billed - the compute environment " +
            "sits at zero vCPUs and costs nothing at rest. Expect well under a dollar a month " +
            "for a world or two, and nothing at all once the bucket is emptied.",
        renderCostSummary:
            "A render is billed per second of Fargate time, roughly $0.04 per vCPU-hour and " +
            "$0.004 per GB-hour, plus a few cents for logs and for the finished map leaving AWS.",
    };
}

/* --------------------------------------------------------------------------------------- */
/* Existence probes. Each answers only what it can prove, and never guesses from a name.     */
/* --------------------------------------------------------------------------------------- */

async function probe(
    call: () => Promise<unknown>,
): Promise<boolean> {
    try {
        await call();
        return true;
    } catch {
        // Every one of these commands exits non-zero when the resource is not there, which
        // is the ordinary answer rather than a fault. A permissions failure also lands here
        // and reads as "absent" - which is why provisioning re-checks at create time and
        // surfaces the real refusal then, rather than this probe inventing one.
        return false;
    }
}

export function bucketExists(
    lease: AwsCliAccountLease,
    bucket: string,
    options?: { signal?: AbortSignal | undefined },
): Promise<boolean> {
    return probe(() => lease.json(["s3api", "head-bucket", "--bucket", bucket], options));
}

export function roleExists(
    lease: AwsCliAccountLease,
    role: string,
    options?: { signal?: AbortSignal | undefined },
): Promise<boolean> {
    return probe(() => lease.json(["iam", "get-role", "--role-name", role], options));
}

export function logGroupExists(
    lease: AwsCliAccountLease,
    group: string,
    options?: { signal?: AbortSignal | undefined },
): Promise<boolean> {
    return probe(async () => {
        const answer = await lease.json<{
            readonly logGroups?: readonly { readonly logGroupName?: string }[];
        }>(
            ["logs", "describe-log-groups", "--log-group-name-prefix", group],
            options,
        );
        // A prefix search matches more than the exact name, so an exact comparison is
        // required: "/aws/batch/worldlens" must not be satisfied by "/aws/batch/worldlens-old".
        const found = (answer.logGroups ?? []).some((entry) => entry.logGroupName === group);
        if (!found) {
            throw new Error("absent");
        }
    });
}

export function computeEnvironmentExists(
    lease: AwsCliAccountLease,
    name: string,
    options?: { signal?: AbortSignal | undefined },
): Promise<boolean> {
    return probe(async () => {
        const answer = await lease.json<{ readonly computeEnvironments?: readonly unknown[] }>(
            ["batch", "describe-compute-environments", "--compute-environments", name],
            options,
        );
        if ((answer.computeEnvironments ?? []).length === 0) {
            throw new Error("absent");
        }
    });
}

export function jobQueueExists(
    lease: AwsCliAccountLease,
    name: string,
    options?: { signal?: AbortSignal | undefined },
): Promise<boolean> {
    return probe(async () => {
        const answer = await lease.json<{ readonly jobQueues?: readonly unknown[] }>(
            ["batch", "describe-job-queues", "--job-queues", name],
            options,
        );
        if ((answer.jobQueues ?? []).length === 0) {
            throw new Error("absent");
        }
    });
}

export function jobDefinitionExists(
    lease: AwsCliAccountLease,
    name: string,
    options?: { signal?: AbortSignal | undefined },
): Promise<boolean> {
    return probe(async () => {
        const answer = await lease.json<{ readonly jobDefinitions?: readonly unknown[] }>(
            [
                "batch",
                "describe-job-definitions",
                "--job-definition-name",
                name,
                "--status",
                "ACTIVE",
            ],
            options,
        );
        if ((answer.jobDefinitions ?? []).length === 0) {
            throw new Error("absent");
        }
    });
}

/* --------------------------------------------------------------------------------------- */
/* Reconciliation                                                                            */
/* --------------------------------------------------------------------------------------- */

/** One disagreement between what was recorded and what is really provisioned. */
export interface AwsOrphanFinding {
    readonly kind: AwsResourceKind;
    readonly name: string;
    /**
     * `unrecorded` is provisioned but absent from the marker - possibly ours from a
     * half-finished run, possibly somebody else's. `missing` is recorded but gone.
     */
    readonly state: "unrecorded" | "missing";
}

/**
 * Compares the marker against what is really there.
 *
 * Reports rather than repairs, deliberately. Deleting an "orphan" that turned out to be a
 * colleague's costs them their work; recreating a resource somebody deliberately removed
 * costs money silently. Both decisions belong to a person.
 */
export function reconcileAws(
    marker: AwsBootstrapMarker | null,
    live: readonly { readonly kind: AwsResourceKind; readonly name: string }[],
): readonly AwsOrphanFinding[] {
    const recorded = new Set((marker?.resources ?? []).map((entry) => `${entry.kind}:${entry.name}`));
    const present = new Set(live.map((entry) => `${entry.kind}:${entry.name}`));

    const findings: AwsOrphanFinding[] = [];
    for (const entry of live) {
        if (!recorded.has(`${entry.kind}:${entry.name}`)) {
            findings.push({ kind: entry.kind, name: entry.name, state: "unrecorded" });
        }
    }
    for (const entry of marker?.resources ?? []) {
        if (!present.has(`${entry.kind}:${entry.name}`)) {
            findings.push({ kind: entry.kind, name: entry.name, state: "missing" });
        }
    }
    return findings;
}
