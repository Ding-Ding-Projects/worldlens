/**
 * Repairing the upstream Java engine in an installed app.
 *
 * The installer normally carries a verified jar in `resources/jars`. Older
 * installers did not, and some builds carried a stale or malformed manifest.
 * Those installs repair into application data using one immutable release asset.
 * A repair never changes the bundled resources and never exposes a half-written
 * jar to a render.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { downloadVerified, type FetchBinary } from "../java/download.js";
import { managedJarDirectory } from "../java/jars.js";
import { verifyJarFile } from "../../../scripts/jar-verifier.mjs";

export const PINNED_UPSTREAM_JAVA = {
    version: "5.23",
    asset: "bluemap-5.23-cli.jar",
    sizeBytes: 6_646_012,
    sha256: "ebdb33821b127505be94599555cb16bb9b46c8f70aa22283d314cdb829b47a54",
    url: "https://github.com/BlueMap-Minecraft/BlueMap/releases/download/v5.23/bluemap-5.23-cli.jar",
} as const;

export type EngineRelease = Readonly<{
    version: string;
    asset: string;
    sizeBytes: number;
    sha256: string;
    url: string;
}>;

export type EngineProvisionStage =
    "checking" | "downloading" | "verifying" | "installed" | "reused";

export interface EngineProvisionProgress {
    readonly stage: EngineProvisionStage;
    readonly message: string;
    readonly received: number | null;
    readonly total: number | null;
}

export interface EngineProvisionOptions {
    readonly dataDir: string;
    readonly resourcesPath?: string | null;
    readonly fetchBinary?: FetchBinary;
    readonly onProgress?: (progress: EngineProvisionProgress) => void;
    readonly signal?: AbortSignal;
    /** Test seam for a local fixture; production callers use the pinned release. */
    readonly release?: EngineRelease;
}

export interface EngineProvisionResult {
    readonly jarPath: string | null;
    readonly source: "bundled" | "managed";
    readonly version: string;
    readonly reused: boolean;
}

interface EngineFlight {
    readonly controller: AbortController;
    readonly listeners: Set<(progress: EngineProvisionProgress) => void>;
    waiters: number;
    readonly promise: Promise<EngineProvisionResult | null>;
}

const inflight = new Map<string, EngineFlight>();
const RETRY_COUNT = 8;
const RETRY_DELAY_MS = 25;

export function managedUpstreamJavaJar(
    dataDir: string,
    release: EngineRelease = PINNED_UPSTREAM_JAVA,
): string {
    return join(managedJarDirectory(dataDir), release.asset);
}

export async function verifyManagedUpstreamJava(
    dataDir: string,
    release: EngineRelease = PINNED_UPSTREAM_JAVA,
): Promise<boolean> {
    return verifyJar(managedUpstreamJavaJar(dataDir, release), release);
}

/**
 * Checks the package manifest and jar without trusting either one by itself.
 * The packaged manifest is authoritative for the build's locally compiled jar.
 * Its bytes therefore do not have to equal the official fallback asset. A stale
 * version, wrong digest, bad ZIP directory or missing manifest sends the caller
 * to the managed repair route.
 */
export async function packagedUpstreamJavaIsUsable(
    resourcesPath: string,
    release: EngineRelease = PINNED_UPSTREAM_JAVA,
): Promise<boolean> {
    try {
        const parsed: unknown = JSON.parse(
            await readFile(join(resourcesPath, "render-engines", "manifest.json"), "utf8"),
        );
        if (!isRecord(parsed) || parsed.manifestVersion !== 1) return false;
        const engines = parsed.engines;
        if (!isRecord(engines)) return false;
        const java = engines["upstream-java"];
        if (
            !isRecord(java) ||
            java.available !== true ||
            typeof java.version !== "string" ||
            !(java.version === release.version || java.version.startsWith(`${release.version}-`))
        )
            return false;
        const jar = java.jar;
        if (
            !isRecord(jar) ||
            typeof jar.fileName !== "string" ||
            basename(jar.fileName) !== jar.fileName
        )
            return false;
        if (typeof jar.size !== "number" || typeof jar.sha256 !== "string") return false;
        const jarsRoot = resolve(resourcesPath, "jars");
        const jarPath = resolve(jarsRoot, jar.fileName);
        if (!jarPath.startsWith(`${jarsRoot}${process.platform === "win32" ? "\\" : "/"}`))
            return false;
        return await verifyJar(jarPath, {
            ...release,
            version: java.version,
            asset: jar.fileName,
            sizeBytes: jar.size,
            sha256: jar.sha256,
        });
    } catch {
        return false;
    }
}

/**
 * Returns the packaged jar when it is sound, otherwise repairs the exact pinned
 * release into userData. The promise is single-flight per data directory.
 */
export function ensureManagedUpstreamJava(
    options: EngineProvisionOptions,
): Promise<EngineProvisionResult | null> {
    const release = options.release ?? PINNED_UPSTREAM_JAVA;
    const key = managedUpstreamJavaJar(options.dataDir, release);
    const running = inflight.get(key);
    if (running !== undefined) return attachFlight(running, options);
    const controller = new AbortController();
    const listeners = new Set<(progress: EngineProvisionProgress) => void>();
    const operation = Promise.resolve()
        .then(() =>
            ensureManagedUpstreamJavaOnce({
                ...options,
                signal: controller.signal,
                onProgress: (progress) => listeners.forEach((listener) => listener(progress)),
            }),
        )
        .finally(() => inflight.delete(key));
    const flight = { controller, listeners, waiters: 0, promise: operation };
    inflight.set(key, flight);
    return attachFlight(flight, options);
}

function attachFlight(
    flight: EngineFlight,
    options: EngineProvisionOptions,
): Promise<EngineProvisionResult | null> {
    return new Promise((resolve, reject) => {
        flight.waiters += 1;
        const listener = options.onProgress === undefined ? null : options.onProgress;
        if (listener !== null) flight.listeners.add(listener);
        const abort = (): void => {
            if (listener !== null) flight.listeners.delete(listener);
            if (flight.waiters === 1) flight.controller.abort();
            reject(new Error("engine provisioning was cancelled"));
        };
        if (options.signal?.aborted === true) {
            abort();
            return;
        }
        options.signal?.addEventListener("abort", abort, { once: true });
        flight.promise.then(resolve, reject).finally(() => {
            if (listener !== null) flight.listeners.delete(listener);
            flight.waiters -= 1;
            options.signal?.removeEventListener("abort", abort);
        });
    });
}

async function ensureManagedUpstreamJavaOnce(
    options: EngineProvisionOptions,
): Promise<EngineProvisionResult | null> {
    const release = options.release ?? PINNED_UPSTREAM_JAVA;
    const emit = options.onProgress;
    emit?.({
        stage: "checking",
        message: "Checking the packaged BlueMap engine",
        received: null,
        total: null,
    });
    if (options.resourcesPath !== undefined && options.resourcesPath !== null) {
        if (await packagedUpstreamJavaIsUsable(options.resourcesPath, release)) {
            return { jarPath: null, source: "bundled", version: release.version, reused: true };
        }
    }

    const target = managedUpstreamJavaJar(options.dataDir, release);
    if (await verifyJar(target, release)) {
        emit?.({
            stage: "reused",
            message: "Using the verified managed BlueMap engine",
            received: null,
            total: null,
        });
        return { jarPath: target, source: "managed", version: release.version, reused: true };
    }

    await mkdir(managedJarDirectory(options.dataDir), { recursive: true });
    const temporary = join(
        managedJarDirectory(options.dataDir),
        `.${release.asset}.${randomUUID()}.tmp`,
    );
    try {
        await downloadToTemporary(temporary, options, release);
        emit?.({
            stage: "verifying",
            message: `Verified ${release.asset}`,
            received: null,
            total: null,
        });
        await replaceWithRetry(temporary, target);
        if (!(await verifyJar(target, release))) {
            await rm(target, { force: true });
            throw new Error("the repaired BlueMap engine failed its post-install descriptor check");
        }
        emit?.({
            stage: "installed",
            message: "The managed BlueMap engine is ready",
            received: release.sizeBytes,
            total: release.sizeBytes,
        });
        return { jarPath: target, source: "managed", version: release.version, reused: false };
    } catch (error) {
        await rm(temporary, { force: true });
        await rm(`${temporary}.part`, { force: true });
        await rm(`${temporary}.part.json`, { force: true });
        throw error;
    }
}

async function downloadToTemporary(
    target: string,
    options: EngineProvisionOptions,
    release: EngineRelease,
): Promise<void> {
    await downloadVerified({
        url: release.url,
        sha256: release.sha256,
        target,
        expectedSize: release.sizeBytes,
        maxSize: release.sizeBytes,
        ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        onProgress: (progress) =>
            options.onProgress?.({
                stage: "downloading",
                message: "Downloading the verified BlueMap engine",
                received: progress.received,
                total: progress.total ?? release.sizeBytes,
            }),
    });
    if (!(await verifyJarFile(target)).ok)
        throw new Error("BlueMap engine is not a valid JAR archive");
}

async function verifyJar(path: string, release: EngineRelease): Promise<boolean> {
    try {
        const info = await stat(path);
        if (!info.isFile() || info.size !== release.sizeBytes) return false;
        if ((await sha256File(path)) !== release.sha256) return false;
        return (await verifyJarFile(path)).ok;
    } catch {
        return false;
    }
}

async function sha256File(path: string): Promise<string> {
    const hash = createHash("sha256");
    const bytes = await readFile(path);
    hash.update(bytes);
    return hash.digest("hex");
}

async function replaceWithRetry(source: string, target: string): Promise<void> {
    for (let attempt = 0; attempt < RETRY_COUNT; attempt += 1) {
        try {
            await rename(source, target);
            return;
        } catch (error) {
            if (!isTransientRename(error)) throw error;
            if (await fileExists(target)) {
                const backup = `${target}.previous-${randomUUID()}`;
                try {
                    await renameWithRetry(target, backup);
                    try {
                        await renameWithRetry(source, target);
                    } catch (replaceError) {
                        await renameWithRetry(backup, target).catch(() => undefined);
                        throw replaceError;
                    }
                    await rm(backup, { force: true });
                    return;
                } catch (backupError) {
                    if (attempt === RETRY_COUNT - 1) throw backupError;
                }
            }
            if (attempt === RETRY_COUNT - 1) throw error;
            await delay(RETRY_DELAY_MS * (attempt + 1));
        }
    }
}

async function renameWithRetry(source: string, target: string): Promise<void> {
    for (let attempt = 0; attempt < RETRY_COUNT; attempt += 1) {
        try {
            await rename(source, target);
            return;
        } catch (error) {
            if (!isTransientRename(error) || attempt === RETRY_COUNT - 1) throw error;
            await delay(RETRY_DELAY_MS * (attempt + 1));
        }
    }
}

async function fileExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

function isTransientRename(error: unknown): boolean {
    const code = isRecord(error) ? error.code : null;
    return code === "EPERM" || code === "EACCES" || code === "EBUSY" || code === "EEXIST";
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null;
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
