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
import { basename, join } from "node:path";
import { downloadVerified, type FetchBinary } from "../java/download.js";
import { managedJarDirectory } from "../java/jars.js";

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

const inflight = new Map<string, Promise<EngineProvisionResult | null>>();
const RETRY_COUNT = 8;
const RETRY_DELAY_MS = 25;

export function managedUpstreamJavaJar(
    dataDir: string,
    release: EngineRelease = PINNED_UPSTREAM_JAVA,
): string {
    return join(managedJarDirectory(dataDir), release.asset);
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
        return await verifyJar(join(resourcesPath, "jars", jar.fileName), {
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
    if (running !== undefined) return running;
    const operation = ensureManagedUpstreamJavaOnce(options).finally(() => inflight.delete(key));
    inflight.set(key, operation);
    return operation;
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
    if (!(await jarDescriptorIsSane(target)))
        throw new Error("BlueMap engine is not a valid JAR archive");
}

async function verifyJar(path: string, release: EngineRelease): Promise<boolean> {
    try {
        const info = await stat(path);
        if (!info.isFile() || info.size !== release.sizeBytes) return false;
        if ((await sha256File(path)) !== release.sha256) return false;
        return await jarDescriptorIsSane(path);
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

async function jarDescriptorIsSane(path: string): Promise<boolean> {
    const bytes = await readFile(path);
    if (bytes.length < 4096 || bytes.readUInt32LE(0) !== 0x04034b50) return false;
    const tailStart = Math.max(0, bytes.length - 65_557);
    const end = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]), tailStart);
    if (end < 0 || end + 22 > bytes.length) return false;
    const entries = bytes.readUInt16LE(end + 10);
    const centralSize = bytes.readUInt32LE(end + 12);
    const centralOffset = bytes.readUInt32LE(end + 16);
    if (entries === 0 || centralOffset + centralSize > end) return false;
    let cursor = centralOffset;
    let manifest = false;
    let classFile = false;
    for (let index = 0; index < entries && cursor + 46 <= bytes.length; index += 1) {
        if (bytes.readUInt32LE(cursor) !== 0x02014b50) return false;
        const nameLength = bytes.readUInt16LE(cursor + 28);
        const extraLength = bytes.readUInt16LE(cursor + 30);
        const commentLength = bytes.readUInt16LE(cursor + 32);
        const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
        manifest ||= name.toUpperCase() === "META-INF/MANIFEST.MF";
        classFile ||= name.endsWith(".class");
        cursor += 46 + nameLength + extraLength + commentLength;
    }
    return manifest && classFile;
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
