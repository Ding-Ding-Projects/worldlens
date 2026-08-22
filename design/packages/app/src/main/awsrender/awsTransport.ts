/**
 * The AWS route, seen through the neutral {@link CiRunTransport} shape.
 *
 * The sibling of `cirender/runTransportGitHub.ts`, and unlike that one this is not an
 * adapter over something older - the AWS route was built to this interface, so this file
 * is simply what it is. Between them they are the only two files in the app that know
 * which cloud a render is running in; everything upstream deals in jobs.
 *
 * Artifacts are S3 objects rather than workflow artifacts, which is why `listArtifacts`
 * reads a prefix. A render publishes its map under a key this app chose when it submitted
 * the job, so finding it afterwards is a list rather than a search.
 */
import { basename } from "node:path";
import type { ProcessRunOptions } from "../cirender/gh.js";
import type {
    CiJobArtifact,
    CiJobRef,
    CiJobRequest,
    CiJobState,
    CiJobUnit,
    CiRunTransport,
} from "../cirender/runTransport.js";
import {
    batchConclusion,
    batchStatus,
    cancelBatchJob,
    describeBatchJob,
    describeBatchUnits,
    logStreamOf,
    submitBatchJob,
} from "./batchJob.js";
import type { BatchBinding } from "./batchJob.js";
import { readLogTail as readCloudWatchTail } from "./cloudWatchLogs.js";
import type { AwsCliAccountLease } from "./credentialBroker.js";
import { downloadFromS3, listObjects } from "./s3Upload.js";

/** Everything the AWS route needs to know about where this render lives. */
export interface AwsRunBinding extends BatchBinding {
    /** The bucket the world went into and the map will come out of. */
    readonly bucket: string;
    /** The key prefix for this render's outputs, chosen at submit time. */
    readonly outputPrefix: string;
    /** The CloudWatch log group, when it is not the Batch default. */
    readonly logGroup?: string | undefined;
}

/** Thrown when a job reference minted by another provider reaches this transport. */
export class WrongProviderError extends Error {
    constructor(saw: string) {
        super(`This is the AWS route; it was handed a ${saw} job.`);
        this.name = "WrongProviderError";
    }
}

function awsRef(ref: CiJobRef): { jobId: string; jobQueue: string } {
    if (ref.provider !== "aws") {
        throw new WrongProviderError(ref.provider);
    }
    return { jobId: ref.jobId, jobQueue: ref.jobQueue };
}

/** A Batch console address for one job, so a person can watch it themselves. */
function jobConsoleUrl(region: string, jobId: string): string {
    return `https://${region}.console.aws.amazon.com/batch/home?region=${region}#jobs/detail/${jobId}`;
}

/** Builds the AWS route over one verified lease. */
export function awsCliTransport(options: {
    readonly lease: AwsCliAccountLease;
    readonly binding: AwsRunBinding;
    readonly signal?: AbortSignal | undefined;
}): CiRunTransport {
    const { lease, binding } = options;
    const runOptions: ProcessRunOptions = { signal: options.signal };

    return {
        provider: "aws",
        describe: lease.describe,
        canUpload: true,

        async submitJob(request: CiJobRequest): Promise<CiJobRef> {
            const jobId = await submitBatchJob({
                lease,
                binding,
                name: sanitiseJobName(request.label),
                environment: request.inputs,
                units: request.units,
                signal: options.signal,
            });
            return { provider: "aws", jobId, jobQueue: binding.jobQueue };
        },

        async readJob(ref: CiJobRef): Promise<CiJobState> {
            const { jobId } = awsRef(ref);
            const job = await describeBatchJob(lease, jobId, runOptions);
            if (!job) {
                throw new Error(
                    `AWS Batch no longer knows about job ${jobId}. Batch forgets a finished ` +
                        `job after about 24 hours, so this may simply have aged out.`,
                );
            }
            const status = batchStatus(job.status ?? "");
            return {
                ref,
                status,
                conclusion: batchConclusion(job.status ?? "", job.statusReason ?? null),
                startedAt: epochToIso(job.startedAt ?? job.createdAt),
                completedAt: epochToIso(job.stoppedAt),
                url: jobConsoleUrl(lease.region, jobId),
            };
        },

        async readJobUnits(ref: CiJobRef): Promise<readonly CiJobUnit[]> {
            const { jobId } = awsRef(ref);
            return describeBatchUnits(lease, jobId, runOptions);
        },

        async readLogTail(ref: CiJobRef, unitId: string, maxLines?: number) {
            awsRef(ref);
            const job = await describeBatchJob(lease, unitId, runOptions);
            if (!job) {
                return null;
            }
            const logStream = logStreamOf(job);
            if (!logStream) {
                // The stream is created when the container first writes. Saying nothing is
                // the honest answer; inventing a stream name would 404 and read as a lost log.
                return null;
            }
            return readCloudWatchTail({
                lease,
                logGroup: binding.logGroup,
                logStream,
                maxLines,
                signal: options.signal,
            });
        },

        async listArtifacts(ref: CiJobRef): Promise<readonly CiJobArtifact[]> {
            awsRef(ref);
            const objects = await listObjects({
                lease,
                bucket: binding.bucket,
                prefix: binding.outputPrefix,
                signal: options.signal,
            });
            return objects.map((object) => ({
                id: object.key,
                name: basename(object.key),
                sizeInBytes: object.bytes,
                // S3 publishes an ETag, but an ETag is only a content digest for an object
                // uploaded in one part - for a multipart object it is a digest of digests
                // and matching it against a SHA-256 would fail on exactly the large worlds
                // this route exists for. Null says "not verified", which is the truth, and
                // the collector says "recorded" rather than "verified" because of it.
                digest: null,
                expired: false,
            }));
        },

        async downloadArtifact(
            ref: CiJobRef,
            artifact: CiJobArtifact,
            destination: string,
        ): Promise<void> {
            awsRef(ref);
            await downloadFromS3({
                lease,
                bucket: binding.bucket,
                key: artifact.id,
                destination,
                signal: options.signal,
            });
        },

        async cancelJob(ref: CiJobRef, reason: string): Promise<void> {
            const { jobId } = awsRef(ref);
            await cancelBatchJob(lease, jobId, reason, runOptions);
        },
    };
}

function epochToIso(epochMillis: number | undefined): string | null {
    if (typeof epochMillis !== "number" || !Number.isFinite(epochMillis)) {
        return null;
    }
    return new Date(epochMillis).toISOString();
}

/**
 * Batch job names allow letters, digits, hyphens and underscores, up to 128 characters.
 *
 * A world called "My World (2024)" is perfectly ordinary and would be refused at submit,
 * so it is reshaped here rather than failing a render for the sake of a bracket.
 */
export function sanitiseJobName(label: string): string {
    const cleaned = label.replace(/[^A-Za-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const bounded = cleaned.slice(0, 128);
    return bounded.length > 0 ? bounded : "worldlens-render";
}
