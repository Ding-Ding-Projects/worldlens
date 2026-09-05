/**
 * Finding a Chunker CLI to run, and fetching one only when it can be checked.
 *
 * Chunker is Hive Games' open-source converter between Minecraft's two editions
 * (https://github.com/HiveGamesOSS/Chunker, MIT). Every release publishes a standalone
 * `chunker-cli-<version>.jar` - around 30 MB, no installer, no native parts - which is
 * exactly the shape this app can use, because it already knows how to run a jar on a
 * verified JVM.
 *
 * ## What "verify what it downloads" can honestly mean here
 *
 * This was researched rather than assumed, and the answer is narrower than one would
 * like. As of Chunker 1.19.1:
 *
 * - There is **no** `SHA256SUMS` file, and **no** detached signature (`.asc`, `.sig`,
 *   `.intoto.jsonl`) among the release assets.
 * - There is **no** GitHub artifact attestation for the CLI jar.
 * - Hive Games *does* Authenticode-sign their Windows artifacts with Azure Trusted
 *   Signing, but that covers the Electron desktop application's `.exe` files. The CLI jar
 *   is not an `.exe` and carries no such signature.
 * - What does exist is GitHub's own per-asset `digest` field on the releases API, a
 *   `sha256:` hash GitHub computes over the asset it is storing.
 *
 * So the strongest available check is a SHA-256, and it is **GitHub's statement about the
 * bytes it holds, not Hive Games' signature over the bytes they built**. That distinction
 * is real and is not smoothed over: it means the digest and the download share a single
 * root of trust, and a fetch of both in one session proves the file arrived intact, not
 * that it is the artefact its publisher intended.
 *
 * Two things follow, and both are deliberate:
 *
 * 1. **A digest is pinned in this source file** ({@link PINNED_CHUNKER}), reviewed and
 *    committed like any other code. When the pinned release is the one being fetched,
 *    the check is against a constant that a compromised API cannot move.
 * 2. **Resolving a newer release from the API is allowed but downgraded.** The result
 *    carries {@link ChunkerRelease.digestTrust} saying which of the two happened, and the
 *    interface is expected to say so rather than showing an identical green tick for a
 *    materially weaker guarantee.
 *
 * Nothing here ever installs an unverified file: {@link downloadVerified} renames a
 * `.part` file into place only after the hash matches, so a file at the final path is
 * always one that passed.
 *
 * ## Licence, and why the jar now ships inside the installer
 *
 * Chunker is MIT (Copyright (c) 2024 Hive Games), which permits redistribution and so
 * permits bundling the jar, provided the copyright notice and the licence text ship with it.
 *
 * This block used to say the app "nevertheless does not bundle it", on the grounds that
 * 30 MB in every installer for a feature most people never use was a poor trade and that a
 * bundled copy pins a converter version to an app release. The first half was re-decided:
 * an installer that cannot convert a world until the machine has been online is not an
 * installer that contains the app, and "download this first" is a defect however politely it
 * is worded. The second half is simply true, and is now a real consequence rather than a
 * hypothetical one: the converter version moves when the app version moves, or when someone
 * points `CHUNKER_CLI_JAR` at their own copy.
 *
 * `scripts/stage-bundled-runtimes.mjs` stages the jar into the installer using this exact
 * asset and this exact digest, so a bundled install and a downloaded one are the same
 * converter rather than two things that merely share a version number. Everything below
 * stays: it is the fallback for a build with nothing staged, and it is what keeps the
 * download path honest when one is needed.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { downloadVerified, type FetchBinary } from "../java/download.js";

/** Chunker needs Java 17 or newer; its README states this for CLI use. */
export const REQUIRED_CHUNKER_JAVA_FEATURE = 17;

/** Where the app keeps a Chunker it fetched for itself, under Electron's `userData`. */
export const CHUNKER_DIRECTORY = "chunker";

/**
 * The release this app was built and tested against, with its digest committed.
 *
 * Updating this is a reviewed source change, which is the entire point: a constant in the
 * repository cannot be altered by whatever answers the network.
 */
export const PINNED_CHUNKER = {
    version: "1.19.1",
    asset: "chunker-cli-1.19.1.jar",
    /** SHA-256 as published by GitHub's releases API for this asset. */
    sha256: "327662e8632acdb4571f60939206d605418ac0633741e1e5a58f5d6c6866dc74",
    sizeBytes: 31_790_149,
    url: "https://github.com/HiveGamesOSS/Chunker/releases/download/1.19.1/chunker-cli-1.19.1.jar",
} as const;

/**
 * How much a release's digest is worth.
 *
 * - `pinned` - matched the constant committed above.
 * - `api` - taken from the GitHub releases API in this same session. Proves the transfer
 *   was intact; does not independently prove provenance.
 */
export type DigestTrust = "pinned" | "api";

export interface ChunkerRelease {
    readonly version: string;
    readonly asset: string;
    readonly url: string;
    readonly sha256: string;
    readonly sizeBytes: number | null;
    readonly digestTrust: DigestTrust;
    /** One sentence for the confirm step, saying exactly what was and was not verified. */
    readonly verificationNote: string;
}

/**
 * Where a usable Chunker came from.
 *
 * `bundled` is the ordinary answer on an installed build: the jar is inside the installer,
 * under `<resourcesPath>/bundled/chunker/`. The other three exist because somebody chose
 * them, or because a development checkout has nothing staged.
 */
export type ChunkerSource = "bundled" | "configured" | "environment" | "downloaded";

/** Where the installer puts the Chunker jar, relative to Electron's `resourcesPath`. */
export const BUNDLED_CHUNKER_DIRECTORY = "bundled/chunker";

/**
 * `<resources>/bundled/chunker/chunker-cli-<version>.jar`, the copy inside the installer.
 *
 * The mirror of `bundledJavaExecutable` in `../java/discovery.ts`, and it exists for the
 * same reason: a resource is only bundled if something looks for it where the packager put
 * it. Until this function existed the packaging config copied the jar into every installer
 * and no code path in the app ever read that directory, so a shipped build carried 30 MB of
 * converter and told the user it did not bundle one.
 */
export function bundledChunkerJarPath(
    resourcesPath: string,
    asset: string = PINNED_CHUNKER.asset,
): string {
    return join(resourcesPath, "bundled", "chunker", asset);
}

export interface ChunkerLocation {
    readonly source: ChunkerSource;
    /** Absolute path to the jar. */
    readonly jarPath: string;
    /**
     * The version, when it could be established. Null is honest and common: a jar somebody
     * placed by hand may be named anything, and this never launches a JVM merely to look.
     */
    readonly version: string | null;
}

/**
 * A refusal, as a value.
 *
 * No function in this module rejects when Chunker is simply absent. "Not installed" is the
 * ordinary state of a machine that has never converted a world, and turning the ordinary
 * state into a thrown exception makes every caller write a catch block to render a
 * perfectly normal screen.
 */
export interface ChunkerMissing {
    readonly found: false;
    readonly reason: string;
    /** What the caller could offer to do about it. */
    readonly remedy: "download" | "configure";
    /** Every place that was looked, so the message can name them rather than gesture. */
    readonly searched: readonly string[];
}

export type ChunkerLookup = ({ readonly found: true } & ChunkerLocation) | ChunkerMissing;

/** Injected so no test ever touches a real file system to prove this file works. */
export type FileProbe = (path: string) => Promise<boolean>;

const defaultDigest: DigestProbe = async (path) => {
    const existing = digestMemo.get(path);
    if (existing !== undefined) return existing;
    const pending = sha256OfFile(path);
    digestMemo.set(path, pending);
    // A failed hash must not be remembered as the answer for the rest of the session.
    pending.catch(() => digestMemo.delete(path));
    return pending;
};

const defaultProbe: FileProbe = async (path) => {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
};

/**
 * Hashes a file, streaming it.
 *
 * Streamed rather than `readFile`d because this runs against a 30 MB jar and there is no
 * reason to hold it all in memory to look at it once.
 */
export async function sha256OfFile(path: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return hash.digest("hex");
}

/** Injected in tests so no test needs a real 30 MB jar to prove the digest gate works. */
export type DigestProbe = (path: string) => Promise<string>;

/**
 * Digests already computed in this process, keyed by path.
 *
 * The bundled jar cannot change while the app is running - it lives inside the installed
 * application directory - so hashing it once per launch is both sufficient and the most this
 * check may cost. Without the memo every screen that asks "is Chunker here" would hash 30 MB
 * again, which is how a correct check becomes one somebody removes for being slow.
 */
const digestMemo = new Map<string, Promise<string>>();

/** Clears {@link digestMemo}. Tests only; nothing in the app replaces a bundled jar. */
export function resetBundledDigestCache(): void {
    digestMemo.clear();
}

export interface FindChunkerOptions {
    /** Electron's `userData`, where a downloaded copy lives. Null means none is kept. */
    readonly dataDir?: string | null;
    /**
     * Electron's `process.resourcesPath` in a packaged build, null in development.
     *
     * Same shape and same meaning as `discovery.ts`'s option of the same name. Omitting it
     * is what a development checkout does, and it is why this is not an error: the staging
     * step runs during packaging, not during `pnpm build`.
     */
    readonly resourcesPath?: string | null;
    /** A path the person chose in settings. Wins over everything else. */
    readonly configuredJar?: string | null;
    readonly env?: NodeJS.ProcessEnv;
    readonly probe?: FileProbe;
    /** Computes a file's SHA-256. Injected in tests. */
    readonly digest?: DigestProbe;
}

/** The environment variable an advanced user or a CI job can point at a jar. */
export const CHUNKER_JAR_ENV = "CHUNKER_CLI_JAR";

/** Where a downloaded Chunker jar lives for a given data directory. */
export function chunkerJarPath(dataDir: string, asset: string = PINNED_CHUNKER.asset): string {
    return join(dataDir, CHUNKER_DIRECTORY, asset);
}

/**
 * `chunker-cli-1.19.1.jar` -> `1.19.1`, and null for a name that says nothing.
 *
 * Read from the filename rather than by launching the jar. Establishing the version by
 * running it costs a JVM start-up on every screen that wants to show the row, and the
 * filename is right in every case where the app itself put the file there.
 */
export function versionFromJarName(path: string): string | null {
    const match = /chunker-cli-(\d+(?:\.\d+)*)\.jar$/i.exec(basename(path));
    return match?.[1] ?? null;
}

/**
 * Finds a Chunker CLI jar, or says why there is none.
 *
 * Order is deliberate: a path the person configured beats one the app downloaded, because
 * somebody who set it did so to override exactly this. A configured path that does not
 * exist is **not** silently skipped in favour of a downloaded copy - it is reported, since
 * quietly running a different converter than the one that was named is how somebody spends
 * an afternoon wondering why their settings do nothing.
 */
export async function findChunker(options: FindChunkerOptions = {}): Promise<ChunkerLookup> {
    const probe = options.probe ?? defaultProbe;
    const env = options.env ?? process.env;
    const digest = options.digest ?? defaultDigest;
    const searched: string[] = [];

    const configured = options.configuredJar?.trim();
    if (configured !== undefined && configured !== "") {
        searched.push(configured);
        if (await probe(configured)) return found("configured", configured);
        return {
            found: false,
            reason:
                `Chunker was set to ${configured} in settings, but there is no file there. ` +
                `Point it at a chunker-cli jar, or clear the setting to let the app fetch one.`,
            remedy: "configure",
            searched,
        };
    }

    const fromEnv = env[CHUNKER_JAR_ENV]?.trim();
    if (fromEnv !== undefined && fromEnv !== "") {
        searched.push(fromEnv);
        if (await probe(fromEnv)) return found("environment", fromEnv);
        return {
            found: false,
            reason:
                `${CHUNKER_JAR_ENV} is set to ${fromEnv}, but there is no file there. ` +
                `Correct it or unset it.`,
            remedy: "configure",
            searched,
        };
    }

    // The copy inside the installer, ahead of anything the app downloaded for itself. An
    // installed build reaches this and stops here, which is the whole point of bundling: the
    // converter a user runs is the converter the release shipped, not whatever a previous
    // version happened to fetch into their profile.
    if (options.resourcesPath != null && options.resourcesPath.trim() !== "") {
        const bundled = bundledChunkerJarPath(options.resourcesPath);
        searched.push(bundled);
        if (await probe(bundled)) {
            let actual: string;
            try {
                actual = await digest(bundled);
            } catch (error) {
                return {
                    found: false,
                    reason:
                        `The Chunker ${PINNED_CHUNKER.version} that ships with this app could not be ` +
                        `read at ${bundled} (${error instanceof Error ? error.message : String(error)}). ` +
                        "Reinstalling the app restores it; you can also point the app at a chunker-cli " +
                        "jar of your own.",
                    remedy: "configure",
                    searched,
                };
            }
            if (actual === PINNED_CHUNKER.sha256) return found("bundled", bundled);
            // Never run it. A jar at the bundled path whose bytes are not the bytes this
            // release was built against is either a damaged install or something that
            // replaced it, and there is no version of "probably fine" worth having here.
            return {
                found: false,
                reason:
                    `The Chunker that ships with this app failed its integrity check: ${bundled} ` +
                    `hashes to ${actual.slice(0, 12)}… where this release expects ` +
                    `${PINNED_CHUNKER.sha256.slice(0, 12)}…. It has not been run. Reinstall the app ` +
                    "to restore the shipped copy, or point the app at a chunker-cli jar you trust.",
                remedy: "configure",
                searched,
            };
        }
    }

    if (options.dataDir != null && options.dataDir.trim() !== "") {
        const downloaded = chunkerJarPath(options.dataDir);
        searched.push(downloaded);
        if (await probe(downloaded)) return found("downloaded", downloaded);
    }

    // Reached by a development checkout with nothing staged, and by an install whose
    // bundled copy is genuinely gone. Both are fixed by the same automatic, digest-verified
    // download, so this says what the app will do rather than what the user should go and do.
    return {
        found: false,
        reason:
            `Chunker ${PINNED_CHUNKER.version} normally ships inside this app, but this build has ` +
            "no copy of it on disk. The app can fetch the same pinned, digest-verified jar " +
            `(${PINNED_CHUNKER.sizeBytes >= 1e6 ? `${String(Math.round(PINNED_CHUNKER.sizeBytes / 1e6))} MB` : "small"}) ` +
            "from Hive Games' own release, or you can point it at a chunker-cli jar you already have.",
        remedy: "download",
        searched,
    };
}

function found(source: ChunkerSource, jarPath: string): { readonly found: true } & ChunkerLocation {
    return { found: true, source, jarPath, version: versionFromJarName(jarPath) };
}

/** The release the app will fetch if asked, with its verification story attached. */
export function pinnedRelease(): ChunkerRelease {
    return {
        version: PINNED_CHUNKER.version,
        asset: PINNED_CHUNKER.asset,
        url: PINNED_CHUNKER.url,
        sha256: PINNED_CHUNKER.sha256,
        sizeBytes: PINNED_CHUNKER.sizeBytes,
        digestTrust: "pinned",
        verificationNote:
            `The download is checked against a SHA-256 committed in this app's own source ` +
            `(${PINNED_CHUNKER.sha256.slice(0, 12)}…). Hive Games do not publish a signature ` +
            `or a checksum file for the Chunker CLI jar, so this is a hash of a known-good ` +
            `release rather than a signature from its publisher.`,
    };
}

export interface FetchChunkerOptions {
    /** Electron's `userData`. The jar lands under `<dataDir>/chunker/`. */
    readonly dataDir: string;
    /** Defaults to {@link pinnedRelease}. */
    readonly release?: ChunkerRelease;
    readonly fetchBinary?: FetchBinary;
    readonly onProgress?: (received: number, total: number | null) => void;
    readonly signal?: AbortSignal;
}

export interface FetchChunkerResult {
    readonly jarPath: string;
    readonly release: ChunkerRelease;
    /** True when a verified copy was already on disk and nothing was transferred. */
    readonly reused: boolean;
}

/**
 * Fetches the Chunker CLI jar and refuses to produce it unless the SHA-256 matches.
 *
 * The hashing, resuming and atomic rename are `java/download.ts`'s, unchanged - the same
 * code that fetches the JDK. Reusing it rather than writing a second downloader means
 * there is one implementation of "do not let an unverified file appear at the final path",
 * which is the property that matters and the one worth having exactly one of.
 */
export async function fetchChunker(options: FetchChunkerOptions): Promise<FetchChunkerResult> {
    const release = options.release ?? pinnedRelease();
    const target = chunkerJarPath(options.dataDir, release.asset);

    const result = await downloadVerified({
        url: release.url,
        sha256: release.sha256,
        target,
        ...(release.sizeBytes === null ? {} : { expectedSize: release.sizeBytes }),
        ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
        ...(options.onProgress === undefined
            ? {}
            : { onProgress: (p) => options.onProgress?.(p.received, p.total) }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    return { jarPath: result.path, release, reused: result.reused };
}
