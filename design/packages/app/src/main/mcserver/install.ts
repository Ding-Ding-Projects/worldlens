/**
 * Downloading one server jar to one server directory, verified before it is trusted.
 *
 * Deliberately smaller than `java/download.ts`: that module resumes a `.part` file across
 * restarts because a JDK is ~200 MB and losing the whole thing to a closed laptop lid is
 * a real cost. A server jar is a few tens of megabytes at most, downloaded once at server
 * creation, so this module trades the resume machinery for a simpler contract that never
 * throws - `create.ts` composes it with several other steps that can each fail, and an
 * `Answer<T>` composes with `if (!step.ok) return step;`; an exception would not.
 *
 * The one thing kept from `java/download.ts` is the rule that matters most: a hash
 * mismatch deletes the file. A jar that silently kept a half-downloaded or tampered
 * download and let `create.ts` carry on would launch java against garbage and report a
 * confusing crash instead of an honest download failure.
 */

import { createHash } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { fail, ok, type Answer } from "./transport/types.js";

export interface InstallProgress {
    readonly received: number;
    /** Expected total, or null when the server did not say. */
    readonly total: number | null;
}

export interface HttpBinaryResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText?: string;
    readonly headers: { get(name: string): string | null };
    readonly body: AsyncIterable<Uint8Array> | null;
}

export type FetchBinary = (url: string, init: { signal?: AbortSignal }) => Promise<HttpBinaryResponse>;

export interface InstallJarOptions {
    readonly url: string;
    /** Absolute path the verified jar is written to. */
    readonly targetPath: string;
    /** Lower-case hex SHA-256 the finished file must match, or null when none was published. */
    readonly sha256: string | null;
    readonly fetchBinary?: FetchBinary;
    readonly onProgress?: (progress: InstallProgress) => void;
    readonly signal?: AbortSignal;
}

export interface InstallJarResult {
    readonly path: string;
    readonly bytes: number;
    /** The digest that was actually written, so a caller can record provenance. */
    readonly sha256: string;
}

const defaultFetchBinary: FetchBinary = (url, init) =>
    globalThis.fetch(url, { redirect: "follow", ...(init.signal === undefined ? {} : { signal: init.signal }) });

function describeStatus(response: HttpBinaryResponse): string {
    return response.statusText === undefined || response.statusText.length === 0
        ? String(response.status)
        : `${String(response.status)} ${response.statusText}`;
}

/**
 * Downloads `url` to `targetPath`, refusing to leave a file behind that does not match
 * `sha256` when one was supplied. Never throws: every failure, including a network error
 * or a hash mismatch, comes back as `Answer<T>` so `create.ts` can fold this into a chain
 * of steps that all report the same way.
 */
export async function installServerJar(options: InstallJarOptions): Promise<Answer<InstallJarResult>> {
    const fetchBinary = options.fetchBinary ?? defaultFetchBinary;
    const expected = options.sha256 === null ? null : options.sha256.toLowerCase();

    let response: HttpBinaryResponse;
    try {
        response = await fetchBinary(options.url, options.signal === undefined ? {} : { signal: options.signal });
    } catch (error) {
        return fail(
            "unreachable",
            "The server download could not be started.",
            error instanceof Error ? error.message : String(error),
        );
    }

    if (!response.ok) {
        return fail(
            "command-failed",
            `The server download failed with HTTP ${describeStatus(response)}.`,
            options.url,
        );
    }
    if (response.body === null) {
        return fail("command-failed", "The server download returned no data.", options.url);
    }

    try {
        await mkdir(dirname(options.targetPath), { recursive: true });
    } catch (error) {
        return fail("denied", "The server folder could not be created.", String(error));
    }

    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    const total = Number.isFinite(contentLength) ? contentLength : null;

    const hash = createHash("sha256");
    const chunks: Buffer[] = [];
    let received = 0;
    try {
        for await (const chunk of response.body) {
            options.signal?.throwIfAborted();
            const buffer = Buffer.from(chunk);
            chunks.push(buffer);
            hash.update(buffer);
            received += buffer.byteLength;
            options.onProgress?.({ received, total });
        }
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            return fail("timeout", "The server download was cancelled.");
        }
        return fail(
            "command-failed",
            "The server download was interrupted.",
            error instanceof Error ? error.message : String(error),
        );
    }

    const digest = hash.digest("hex");
    if (expected !== null && digest !== expected) {
        // Nothing was written yet - the bytes only ever lived in memory - so there is
        // no half-downloaded file on disk to clean up here. The refusal is the cleanup.
        return fail(
            "command-failed",
            "The downloaded server jar did not match the expected checksum. Nothing was installed.",
            `expected ${expected}, got ${digest}`,
        );
    }

    try {
        await writeFile(options.targetPath, Buffer.concat(chunks));
    } catch (error) {
        return fail("denied", "The verified server jar could not be written to disk.", String(error));
    }

    return ok({ path: options.targetPath, bytes: received, sha256: digest });
}

/**
 * Deletes whatever `installServerJar` may have left at `targetPath`.
 *
 * `installServerJar` itself never leaves a partial file - a hash mismatch is caught
 * before anything is written - but a caller composing several install steps (a server
 * jar, then a mod loader installer jar) wants one place to clean up after an earlier
 * step succeeded and a later one failed.
 */
export async function removeInstalledJar(targetPath: string): Promise<void> {
    await rm(targetPath, { force: true });
}

/** True when a file already exists at `targetPath` with the expected size, if known. */
export async function jarAlreadyInstalled(targetPath: string, expectedBytes: number | null): Promise<boolean> {
    try {
        const info = await stat(targetPath);
        return expectedBytes === null || expectedBytes <= 0 || info.size === expectedBytes;
    } catch {
        return false;
    }
}
