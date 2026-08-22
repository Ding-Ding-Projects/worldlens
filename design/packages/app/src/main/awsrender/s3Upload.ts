/**
 * Putting a world into S3, in one piece.
 *
 * This file deliberately does **not** import `CI_UPLOAD_PART_SIZE_BYTES`, and must never
 * start. That constant exists because a GitHub release asset caps at 1.5 GB, so the
 * Actions route has to split a world into verified parts and reassemble them on the far
 * side. S3 has no such ceiling - a single object goes to 5 TB, and the CLI does multipart
 * transfer underneath by itself - so carrying that splitting here would import a
 * limitation from a service that is not involved, cost a full extra pass over the world
 * on disk, and leave the far side reassembling something that never needed taking apart.
 *
 * A guard test asserts exactly that: a world well past 1.5 GB uploads as one object.
 */
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { sha256File } from "@worldlens/parts";
import type { ProcessRunOptions } from "../cirender/gh.js";
import { AwsCredentialError } from "./credentialBroker.js";
import type { AwsCliAccountLease } from "./credentialBroker.js";

/** How an upload is going, in bytes rather than percentages. */
export interface S3UploadProgress {
    readonly done: number;
    readonly total: number;
    /** The object key being written, so a surface can name what is moving. */
    readonly key: string;
}

export interface S3UploadRequest {
    readonly lease: AwsCliAccountLease;
    readonly bucket: string;
    readonly key: string;
    readonly filePath: string;
    readonly onProgress?: ((progress: S3UploadProgress) => void) | undefined;
    readonly signal?: AbortSignal | undefined;
    /**
     * Skip the upload when an object of the same size and digest is already there.
     *
     * On by default. Re-uploading a world that is already in the bucket is the single
     * most expensive pointless thing this route can do.
     */
    readonly reuseExisting?: boolean | undefined;
}

export interface S3UploadResult {
    readonly bucket: string;
    readonly key: string;
    readonly bytes: number;
    /** The SHA-256 this app computed locally, in `sha256:<hex>` form. */
    readonly digest: string;
    /** True when an existing object matched and nothing was transferred. */
    readonly reused: boolean;
    /** The `s3://` address of the object, for a message and for the job inputs. */
    readonly uri: string;
}

/** Metadata key carrying our own digest, so a later run can verify a reuse honestly. */
export const S3_DIGEST_METADATA_KEY = "worldlens-sha256";

interface HeadObjectAnswer {
    readonly ContentLength?: number;
    readonly Metadata?: Readonly<Record<string, string>>;
}

/** Reads one object's size and metadata, or null when it is not there. */
export async function headObject(
    lease: AwsCliAccountLease,
    bucket: string,
    key: string,
    options?: ProcessRunOptions,
): Promise<HeadObjectAnswer | null> {
    try {
        return await lease.json<HeadObjectAnswer>(
            ["s3api", "head-object", "--bucket", bucket, "--key", key],
            options,
        );
    } catch (error) {
        if (error instanceof AwsCredentialError && error.code === "refused") {
            // A 404 from head-object is the ordinary "not uploaded yet" answer, and it
            // arrives as a refusal because the CLI exits non-zero. Anything else - a
            // denied permission, an expired session - must keep propagating.
            const text = error.message.toLowerCase();
            if (text.includes("not found") || text.includes("404")) {
                return null;
            }
        }
        throw error;
    }
}

/**
 * Uploads one file to S3 as a single object, using the CLI's own multipart transfer.
 *
 * `aws s3 cp` splits into parts, uploads them concurrently, retries a failed part and
 * completes the upload - all inside one command, all invisible to this app, and with no
 * part file ever written to disk here. That is the whole reason this route needs none of
 * the Actions route's packing machinery.
 */
export async function uploadToS3(request: S3UploadRequest): Promise<S3UploadResult> {
    const { lease, bucket, key, filePath } = request;
    const stats = await stat(filePath);
    const bytes = stats.size;
    const digest = await sha256File(filePath);
    const uri = `s3://${bucket}/${key}`;

    if (request.reuseExisting !== false) {
        const existing = await headObject(lease, bucket, key, { signal: request.signal });
        if (existing && existing.ContentLength === bytes) {
            const recorded = existing.Metadata?.[S3_DIGEST_METADATA_KEY];
            if (recorded && recorded === digest) {
                request.onProgress?.({ done: bytes, total: bytes, key });
                return { bucket, key, bytes, digest, reused: true, uri };
            }
            // Same size, different or absent digest. Not a match: re-upload rather than
            // assume. A world edited to exactly the same length is unlikely, and a wrong
            // reuse here renders somebody's old world and reports it as their new one.
        }
    }

    request.onProgress?.({ done: 0, total: bytes, key });

    const result = await lease.run(
        [
            "s3",
            "cp",
            filePath,
            uri,
            "--metadata",
            `${S3_DIGEST_METADATA_KEY}=${digest}`,
            // Without this the CLI draws a progress bar with carriage returns, which is
            // unreadable once captured. Progress is reported from the parsed lines instead.
            "--no-progress",
        ],
        { signal: request.signal },
    );

    if (!result.started) {
        throw new AwsCredentialError("cli-missing", "The AWS CLI is not installed, or not on PATH.");
    }
    if (result.code !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim();
        throw new Error(
            `Uploading ${basename(filePath)} to ${uri} failed: ${
                detail || "the AWS CLI gave no reason."
            }`,
        );
    }

    // Verify the object is actually there at the size we sent. The CLI exiting zero says
    // the transfer completed; it does not say the object is readable at the expected
    // length, and that is the thing every later step depends on.
    const landed = await headObject(lease, bucket, key, { signal: request.signal });
    if (!landed) {
        throw new Error(`The upload reported success but ${uri} is not there.`);
    }
    if (landed.ContentLength !== bytes) {
        throw new Error(
            `The upload reported success but ${uri} is ${landed.ContentLength ?? "an unknown number of"} bytes, not ${bytes}.`,
        );
    }

    request.onProgress?.({ done: bytes, total: bytes, key });
    return { bucket, key, bytes, digest, reused: false, uri };
}

/** Downloads one object to a local path, through the CLI's own multipart transfer. */
export async function downloadFromS3(options: {
    readonly lease: AwsCliAccountLease;
    readonly bucket: string;
    readonly key: string;
    readonly destination: string;
    readonly signal?: AbortSignal | undefined;
}): Promise<{ readonly bytes: number }> {
    const { lease, bucket, key, destination } = options;
    const uri = `s3://${bucket}/${key}`;
    const result = await lease.run(["s3", "cp", uri, destination, "--no-progress"], {
        signal: options.signal,
    });
    if (!result.started) {
        throw new AwsCredentialError("cli-missing", "The AWS CLI is not installed, or not on PATH.");
    }
    if (result.code !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim();
        throw new Error(`Downloading ${uri} failed: ${detail || "the AWS CLI gave no reason."}`);
    }
    const stats = await stat(destination);
    return { bytes: stats.size };
}

/** Lists the objects under one prefix, with their sizes. */
export async function listObjects(options: {
    readonly lease: AwsCliAccountLease;
    readonly bucket: string;
    readonly prefix: string;
    readonly signal?: AbortSignal | undefined;
}): Promise<readonly { readonly key: string; readonly bytes: number }[]> {
    const answer = await options.lease.json<{
        readonly Contents?: readonly { readonly Key?: string; readonly Size?: number }[];
    }>(
        [
            "s3api",
            "list-objects-v2",
            "--bucket",
            options.bucket,
            "--prefix",
            options.prefix,
        ],
        { signal: options.signal },
    );
    return (answer.Contents ?? [])
        .filter((entry): entry is { Key: string; Size: number } =>
            typeof entry.Key === "string" && typeof entry.Size === "number",
        )
        .map((entry) => ({ key: entry.Key, bytes: entry.Size }));
}
