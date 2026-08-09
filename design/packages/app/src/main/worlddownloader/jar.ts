/**
 * Getting the world-downloader jar onto this machine, and never trusting one that
 * arrived without a published digest to compare it against.
 *
 * The jar is an executable artefact fetched over the network and then handed to a JVM
 * with the user's own filesystem underneath it. That is exactly the shape of thing that
 * must not be run on the strength of "the download reported success": a proxy that
 * rewrites bodies, a mirror serving a stale build, or a release that was replaced after
 * the URL was published all produce a file of plausible size that the transfer layer has
 * no way to object to. So the digest comes from the release's own `SHA256SUMS.txt` and is
 * checked before the file is allowed to exist under its final name, and if that file does
 * not name the jar there is no fallback path that downloads it anyway. Refusing to
 * install is a recoverable state; installing something unverified is not.
 *
 * Almost none of the work here is new. `../java/download.ts` already solved resumable
 * transfer, sidecar-guarded resumption and end-to-end verification for the JDK, and those
 * problems do not become different problems because the artefact is 14 MB instead of 200.
 * This module is therefore the small amount that is genuinely specific to this release:
 * which repository, which two asset names, how to read a `sha256sum` file, and where the
 * result is remembered.
 *
 * ## Why the record exists
 *
 * The same reason `../java/installation.ts` keeps one. Without it, "the app downloaded a
 * jar from somewhere at some point" is the entire answer available to a support question,
 * and there is no cheap way to answer "is the thing on disk still the thing we verified"
 * on the next launch. The record names the tag, the path, the digest and the day, so both
 * questions have answers that cost a file read.
 *
 * ## Failure as a value
 *
 * Nothing here throws for an outcome a person could be shown. A refused release lookup, a
 * release without the asset, a checksum file that does not cover the jar and a transfer
 * that died are four different situations needing four different responses from whoever
 * reads them, and a bare `Error` with a stack in it collapses all four into one unusable
 * message. They are four codes on a returned value instead.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { downloadVerified, sha256File } from "../java/download.js";
import type { FetchBinary } from "../java/download.js";

export const DOWNLOADER_REPOSITORY = "Ding-Ding-Projects/minecraft-world-downloader";
export const DOWNLOADER_JAR_ASSET = "world-downloader.jar";
export const DOWNLOADER_SUMS_ASSET = "SHA256SUMS.txt";

/**
 * A declared packet of assets could be enormous; a checksum file is 266 bytes.
 *
 * Reading an unbounded body into a string because a URL was expected to be small is how a
 * hostile or simply broken endpoint turns a checksum fetch into an out-of-memory abort, so
 * anything past a very generous ceiling for a few dozen lines of `sha256sum` output is
 * treated as "this is not the file we asked for" rather than parsed.
 */
const MAX_SUMS_BYTES = 64 * 1024;

/** `<dataDir>/world-downloader` */
export function downloaderRoot(dataDir: string): string {
    return join(dataDir, "world-downloader");
}

/**
 * `<dataDir>/world-downloader/<tag>/world-downloader.jar`
 *
 * Keyed by release tag rather than overwriting one fixed filename, so that pinning an
 * older release and then going back to the newest does not re-download either of them,
 * and so that a half-written upgrade can never be mistaken for the working install that
 * was already there. Fourteen megabytes per retained release is a price worth paying for
 * that; the JDK's directory is keyed by feature release precisely because 200 MB is not.
 */
export function downloaderJarPath(dataDir: string, tag: string): string {
    return join(downloaderRoot(dataDir), tag, DOWNLOADER_JAR_ASSET);
}

/** `<dataDir>/world-downloader/installed.json` */
export function jarRecordFile(dataDir: string): string {
    return join(downloaderRoot(dataDir), "installed.json");
}

/** Bumped if the layout or the meaning of the record changes. */
export const JAR_RECORD_VERSION = 1;

export interface DownloaderJarRecord {
    readonly version: number;
    /** The upstream release tag this jar came out of, e.g. `build-61`. */
    readonly tag: string;
    /** Absolute path to the verified jar. */
    readonly jar: string;
    /** Lower-case hex SHA-256 that was checked before the jar was allowed into place. */
    readonly sha256: string;
    readonly bytes: number;
    /** ISO-8601 with offset. */
    readonly installedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readString(source: Record<string, unknown>, key: string): string | null {
    const value = source[key];
    return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads the record of what is installed, or null.
 *
 * Missing, unreadable, malformed, written by an older schema, or naming a jar that is no
 * longer on disk all read the same way: nothing is installed. That is the safe direction
 * every time. Being wrong costs one 14 MB download, whereas trusting a record that does
 * not describe reality means handing a JVM a path to a file that is not there, and
 * discovering it at the moment somebody pressed the button rather than before.
 *
 * The digest is deliberately *not* verified here. Hashing 14 MB is not free, this function
 * is cheap enough to call from anywhere, and the one caller that actually needs proof
 * rather than a claim is {@link ensureDownloaderJar}, which does the hashing itself.
 */
export function readJarRecord(dataDir: string): DownloaderJarRecord | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(jarRecordFile(dataDir), "utf8"));
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    if (parsed["version"] !== JAR_RECORD_VERSION) return null;

    const tag = readString(parsed, "tag");
    const jar = readString(parsed, "jar");
    const sha256 = readString(parsed, "sha256");
    if (tag === null || jar === null || sha256 === null) return null;

    const bytes = parsed["bytes"];
    if (typeof bytes !== "number" || !Number.isFinite(bytes)) return null;

    if (!existsSync(jar)) return null;

    return {
        version: JAR_RECORD_VERSION,
        tag,
        jar,
        sha256: sha256.toLowerCase(),
        bytes,
        installedAt: readString(parsed, "installedAt") ?? "unknown",
    };
}

/**
 * Writes the record through a staging file and a rename.
 *
 * Same reasoning as `../java/installation.ts`: a crash partway through a plain write
 * leaves a truncated file, and a truncated JSON file that happens to still parse is the
 * worst available outcome because it is a lie that passes validation. A rename is atomic,
 * so what is on disk describes either the previous install or the new one, never a state
 * that never existed.
 */
export function writeJarRecord(dataDir: string, record: DownloaderJarRecord): DownloaderJarRecord {
    const target = jarRecordFile(dataDir);
    mkdirSync(dirname(target), { recursive: true });
    const staging = `${target}.writing`;
    writeFileSync(staging, `${JSON.stringify(record, null, 4)}\n`, "utf8");
    renameSync(staging, target);
    return record;
}

/** Forgets a recorded install. Used when the recorded jar has gone missing or stopped matching its digest. */
export function clearJarRecord(dataDir: string): void {
    rmSync(jarRecordFile(dataDir), { force: true });
}

export type FetchText = (
    url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type JarStage = "resolving" | "checksums" | "downloading" | "verifying" | "done";

export interface JarEvent {
    readonly stage: JarStage;
    readonly message: string;
    /** Null outside the transfer, where there is no honest byte count to report. */
    readonly received: number | null;
    /** Null when the server did not say how large the artefact is. */
    readonly total: number | null;
}

export interface EnsureJarOptions {
    readonly dataDir: string;
    /** Pin a release, e.g. `build-61`. Omitted means resolve whatever `latest` currently is. */
    readonly tag?: string;
    readonly fetchText?: FetchText;
    readonly fetchBinary?: FetchBinary;
    readonly onEvent?: (event: JarEvent) => void;
    readonly signal?: AbortSignal;
}

export type EnsureJarResult =
    | { readonly ok: true; readonly record: DownloaderJarRecord; readonly reused: boolean }
    | {
          readonly ok: false;
          readonly code:
              "resolve-failed" | "no-asset" | "checksum-missing" | "download-failed" | "cancelled";
          readonly message: string;
      };

/** The failure half of {@link EnsureJarResult}, so the private resolve steps can return one directly. */
type EnsureJarFailure = Extract<EnsureJarResult, { ok: false }>;

/**
 * The two asset URLs a release publishes, and how large the jar is expected to be.
 *
 * `expectedSize` exists only so a progress bar has a denominator before the first byte
 * arrives; nothing is ever rejected for disagreeing with it, because the digest is the
 * thing that decides whether a file is acceptable and a size check would add nothing a
 * SHA-256 does not already cover.
 */
interface ResolvedRelease {
    readonly tag: string;
    readonly jarUrl: string;
    readonly sumsUrl: string;
    readonly expectedSize: number | null;
}

const LATEST_RELEASE_API = `https://api.github.com/repos/${DOWNLOADER_REPOSITORY}/releases/latest`;

/**
 * The published download URL for one asset of one release.
 *
 * This shape is stable and public, which is what makes pinning a tag cheap: a caller who
 * already knows the tag needs no API call at all, and therefore cannot be blocked by an
 * unauthenticated rate limit on an endpoint whose only job would have been to tell us a
 * string we were given.
 */
function assetUrl(tag: string, asset: string): string {
    return `https://github.com/${DOWNLOADER_REPOSITORY}/releases/download/${tag}/${asset}`;
}

/**
 * The default text fetcher, which exists so callers do not have to supply one and tests
 * never accidentally reach the real internet by omitting it.
 *
 * The explicit user agent is not decoration. GitHub's API refuses requests without one,
 * and the refusal arrives as a 403 whose body explains the real reason while the status
 * alone reads exactly like a rate limit or a permissions problem, which sends whoever is
 * debugging it in the wrong direction entirely.
 */
const defaultFetchText: FetchText = (url) =>
    globalThis.fetch(url, {
        headers: {
            accept: "application/vnd.github+json, text/plain;q=0.9, */*;q=0.8",
            "user-agent": "material-bluemap-world-downloader",
        },
        redirect: "follow",
    });

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Reads a `sha256sum` file and returns the digest recorded for one filename, or null.
 *
 * The format is two fields: a 64-character hex digest, whitespace, then the filename,
 * where the filename may carry a leading `*` that `sha256sum` writes to mark a file it
 * read in binary mode. Both spellings appear in the wild depending on which tool produced
 * the file, and neither says anything about the digest, so both are accepted and the
 * marker is dropped.
 *
 * Returning null rather than throwing is the whole point of this function's contract: the
 * caller has to be able to distinguish "the file does not cover this asset" from "the file
 * could not be fetched", because only one of those is worth retrying.
 */
export function digestFromSums(text: string, filename: string): string | null {
    for (const line of text.split(/\r?\n/)) {
        const match = /^([0-9a-fA-F]{64})\s+\*?(\S.*)$/.exec(line.trim());
        if (match === null) continue;
        const digest = match[1];
        const named = match[2];
        if (digest === undefined || named === undefined) continue;
        // Compared on the trailing path segment because a sums file generated from inside
        // a build directory can legitimately name `dist/world-downloader.jar` for the very
        // same artefact that is published under a bare asset name.
        const segment = named.trim().split(/[\\/]/).pop();
        if (segment === filename) return digest.toLowerCase();
    }
    return null;
}

/**
 * Asks GitHub which release is current and where its two assets are.
 *
 * Everything about the response is treated as untrusted shape rather than as the
 * documented schema, because the failure mode of optimistic access here is a `TypeError`
 * thrown from inside a promise several layers below the surface that started this, with a
 * message that names a property rather than the endpoint that misbehaved.
 */
async function resolveLatestRelease(
    fetchText: FetchText,
): Promise<{ ok: true; release: ResolvedRelease } | EnsureJarFailure> {
    let body: string;
    try {
        const response = await fetchText(LATEST_RELEASE_API);
        if (!response.ok) {
            return {
                ok: false,
                code: "resolve-failed",
                message: `The release listing at ${LATEST_RELEASE_API} answered HTTP ${String(response.status)}.`,
            };
        }
        body = await response.text();
    } catch (error) {
        return {
            ok: false,
            code: "resolve-failed",
            message: `Could not reach ${LATEST_RELEASE_API}: ${describeError(error)}`,
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch (error) {
        return {
            ok: false,
            code: "resolve-failed",
            message: `The release listing was not JSON: ${describeError(error)}`,
        };
    }
    if (!isRecord(parsed)) {
        return {
            ok: false,
            code: "resolve-failed",
            message: "The release listing was not an object.",
        };
    }

    const tag = readString(parsed, "tag_name");
    if (tag === null) {
        return { ok: false, code: "resolve-failed", message: "The release listing named no tag." };
    }

    const assets = parsed["assets"];
    if (!Array.isArray(assets)) {
        return {
            ok: false,
            code: "resolve-failed",
            message: `Release ${tag} listed no assets array.`,
        };
    }

    let jarUrl: string | null = null;
    let sumsUrl: string | null = null;
    let expectedSize: number | null = null;
    for (const entry of assets as readonly unknown[]) {
        if (!isRecord(entry)) continue;
        const name = readString(entry, "name");
        const url = readString(entry, "browser_download_url");
        if (name === null || url === null) continue;
        if (name === DOWNLOADER_JAR_ASSET) {
            jarUrl = url;
            const size = entry["size"];
            expectedSize = typeof size === "number" && size > 0 ? size : null;
        } else if (name === DOWNLOADER_SUMS_ASSET) {
            sumsUrl = url;
        }
    }

    if (jarUrl === null) {
        return {
            ok: false,
            code: "no-asset",
            message: `Release ${tag} does not publish ${DOWNLOADER_JAR_ASSET}.`,
        };
    }
    if (sumsUrl === null) {
        // Deliberately not falling back to the constructed URL. A release that stopped
        // publishing its checksums has changed in a way worth noticing, and quietly
        // guessing a URL for the one file whose entire job is to be authoritative would
        // defeat the reason it is consulted at all.
        return {
            ok: false,
            code: "checksum-missing",
            message: `Release ${tag} does not publish ${DOWNLOADER_SUMS_ASSET}, so the jar cannot be verified.`,
        };
    }

    return { ok: true, release: { tag, jarUrl, sumsUrl, expectedSize } };
}

/**
 * Acquires the world-downloader jar, reusing an already-verified one wherever possible.
 *
 * The reuse path is the common one on every launch after the first, and it does not touch
 * the network at all: not to check for a newer release, not to re-read the checksums. That
 * is a deliberate choice about who decides when an update happens. A caller that wants a
 * newer build asks for one by pinning a tag or by clearing the record; a caller that just
 * wants to run the tool gets the jar it already verified, offline, immediately.
 *
 * Reuse still costs a full re-hash of the file rather than trusting the record's word for
 * it. The record is a claim about the past, and the gap between that claim and the bytes
 * on disk is precisely where a truncated copy, a half-finished replacement, or an edit by
 * something else on the machine would live.
 */
export async function ensureDownloaderJar(options: EnsureJarOptions): Promise<EnsureJarResult> {
    const { dataDir } = options;
    const emit = (
        stage: JarStage,
        message: string,
        received: number | null = null,
        total: number | null = null,
    ): void => {
        options.onEvent?.({ stage, message, received, total });
    };
    const cancelled = (): EnsureJarFailure => ({
        ok: false,
        code: "cancelled",
        message: "Getting the world downloader was cancelled.",
    });
    /**
     * Read through a call rather than inline, because the signal is the one input here
     * that changes underneath us. Inline, the compiler quite reasonably narrows the first
     * check's result and then treats every later check as dead code comparing `false` to
     * `true`, which is exactly backwards: those later checks exist precisely because an
     * await happened in between and the answer may now be different.
     */
    const aborted = (): boolean => options.signal?.aborted === true;

    if (aborted()) return cancelled();

    const existing = readJarRecord(dataDir);
    // A pinned tag that disagrees with the record is not a reusable install even though
    // the file is perfectly valid, because the caller asked for a specific build and
    // handing back a different one would be a silent substitution of the exact kind this
    // module refuses to make anywhere else.
    if (existing !== null && (options.tag === undefined || options.tag === existing.tag)) {
        emit("verifying", `Checking the world downloader already installed at ${existing.jar}.`);
        const digest = await sha256File(existing.jar).catch(() => null);
        if (digest === existing.sha256) {
            emit("done", `Using the verified world downloader from release ${existing.tag}.`);
            return { ok: true, record: existing, reused: true };
        }
        // Present but wrong. The record is cleared before anything else happens so that a
        // failure later in this call cannot leave a record pointing at a file that is
        // known not to match it.
        clearJarRecord(dataDir);
    }

    if (aborted()) return cancelled();

    const fetchText = options.fetchText ?? defaultFetchText;
    let release: ResolvedRelease;
    if (options.tag === undefined) {
        emit("resolving", "Asking which world downloader release is current.");
        const resolved = await resolveLatestRelease(fetchText);
        if (!resolved.ok) return resolved;
        release = resolved.release;
    } else {
        // A pinned tag needs no lookup: the asset URL shape is public and stable, so the
        // API call would spend an unauthenticated rate-limit slot to be told the tag we
        // were handed.
        release = {
            tag: options.tag,
            jarUrl: assetUrl(options.tag, DOWNLOADER_JAR_ASSET),
            sumsUrl: assetUrl(options.tag, DOWNLOADER_SUMS_ASSET),
            expectedSize: null,
        };
    }

    if (aborted()) return cancelled();

    emit("checksums", `Reading the published checksums for release ${release.tag}.`);
    let sumsText: string;
    try {
        const response = await fetchText(release.sumsUrl);
        if (!response.ok) {
            return {
                ok: false,
                code: "checksum-missing",
                message: `${release.sumsUrl} answered HTTP ${String(response.status)}, so ${DOWNLOADER_JAR_ASSET} cannot be verified.`,
            };
        }
        sumsText = await response.text();
    } catch (error) {
        return {
            ok: false,
            code: "checksum-missing",
            message: `Could not read ${release.sumsUrl}: ${describeError(error)}`,
        };
    }
    if (sumsText.length > MAX_SUMS_BYTES) {
        return {
            ok: false,
            code: "checksum-missing",
            message: `${release.sumsUrl} returned ${String(sumsText.length)} characters, which is far too large to be a checksum file.`,
        };
    }

    const expected = digestFromSums(sumsText, DOWNLOADER_JAR_ASSET);
    if (expected === null) {
        // The one branch this whole module exists for. There is no path from here to a
        // download, because a jar nobody can verify is a jar that must not be run, and
        // "fetch it anyway and hope" is how an unverified executable ends up on somebody's
        // machine with this app's name on it.
        return {
            ok: false,
            code: "checksum-missing",
            message: `${release.sumsUrl} does not list a SHA-256 for ${DOWNLOADER_JAR_ASSET}. Nothing was downloaded.`,
        };
    }

    if (aborted()) return cancelled();

    const target = downloaderJarPath(dataDir, release.tag);
    emit(
        "downloading",
        `Downloading ${DOWNLOADER_JAR_ASSET} from release ${release.tag}.`,
        0,
        release.expectedSize,
    );

    let bytes: number;
    try {
        const result = await downloadVerified({
            url: release.jarUrl,
            sha256: expected,
            target,
            ...(release.expectedSize === null ? {} : { expectedSize: release.expectedSize }),
            ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            onProgress: (progress) => {
                emit(
                    "downloading",
                    `Downloading ${DOWNLOADER_JAR_ASSET} from release ${release.tag}.`,
                    progress.received,
                    progress.total,
                );
            },
        });
        bytes = result.bytes;
    } catch (error) {
        // A cancelled transfer surfaces as a thrown abort from inside the download loop,
        // which is indistinguishable from a network failure by its type alone. The signal
        // is the only thing that knows which of the two happened, so it is asked rather
        // than the error inspected.
        if (aborted()) return cancelled();
        return {
            ok: false,
            code: "download-failed",
            message: `Downloading ${release.jarUrl} failed: ${describeError(error)}`,
        };
    }

    emit("verifying", `Recording the verified world downloader from release ${release.tag}.`);
    const record = writeJarRecord(dataDir, {
        version: JAR_RECORD_VERSION,
        tag: release.tag,
        jar: target,
        sha256: expected,
        bytes,
        installedAt: new Date().toISOString(),
    });
    emit("done", `The world downloader from release ${release.tag} is ready.`);
    return { ok: true, record, reused: false };
}
