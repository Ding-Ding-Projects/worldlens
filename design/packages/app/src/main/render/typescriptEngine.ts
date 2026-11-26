/**
 * Finding, reinstalling and describing the TypeScript render engine.
 *
 * The engine is a tree of files, not one artefact: its own ESM build, the standalone driver,
 * its assets, and every package it imports by name. Releases 1.0.2490 to 1.0.2502 shipped
 * the first three and none of the packages, with a manifest that still read
 * `"available": true`. So nothing here believes a manifest: a copy is usable only when
 * `inspectTypeScriptEngineTree` has opened each piece, and a copy that is not usable is
 * described by exactly what it is missing.
 *
 * An installed app that finds its own copy incomplete reinstalls the engine into its data
 * folder from the archive it was packaged with, verified against the digest in the
 * manifest, and then carries on with the render. Nothing is downloaded, so the repair works
 * offline; the packaged resources are never modified.
 */

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { inspectTypeScriptEngineTree } from "../../../scripts/typescript-engine-tree.mjs";
import type {
    TypeScriptEngineInspection,
    TypeScriptEngineRepairArchive,
} from "../../../scripts/typescript-engine-tree.mjs";
import { extractZip } from "../download/extract.js";
import type { EngineProvisionProgress } from "./engineProvisioning.js";
import { EngineUnavailableError } from "./orchestrator.js";
import type { ResolvedEngine } from "./orchestrator.js";
import type { RenderEngineId } from "./provenance.js";

export interface TypeScriptEngineOptions {
    /** `process.resourcesPath` in a packaged app; omit in development. */
    readonly resourcesPath?: string | null;
    /** Repository root in development; the resolver searches it when provided. */
    readonly repositoryRoot?: string | null;
    /**
     * Electron's `userData`. Where an installed app reinstalls an incomplete engine. Without
     * it an incomplete packaged engine is reported and not repaired.
     */
    readonly dataDir?: string | null;
}

export type TypeScriptEngineSource = "bundled" | "managed" | "repairable" | "development";

/** What the engine picker is told, so it never offers an engine that cannot start. */
export interface TypeScriptEngineRuntimeSummary {
    readonly available: boolean;
    readonly version: string | null;
    readonly source: TypeScriptEngineSource | null;
    readonly reason: string | null;
}

export interface ManagedTypeScriptEngineOptions {
    readonly resourcesPath: string;
    readonly dataDir: string;
    readonly onProgress?: (progress: EngineProvisionProgress) => void;
    readonly signal?: AbortSignal;
}

export interface ManagedTypeScriptEngine {
    readonly root: string;
    readonly version: string;
    readonly reused: boolean;
}

const RENAME_ATTEMPTS = 8;
const RENAME_DELAY_MS = 25;
const inflight = new Map<string, Promise<ManagedTypeScriptEngine>>();

function packagedRoot(resourcesPath: string): string {
    return join(resourcesPath, "render-engines");
}

/** `<userData>/render-engines/typescript/<archive digest>` - one folder per packaged engine. */
export function managedTypeScriptEngineRoot(dataDir: string, sha256: string): string {
    return join(dataDir, "render-engines", "typescript", sha256.slice(0, 16));
}

function listMissing(missing: readonly string[]): string {
    return missing.join("; ");
}

async function sha256OfFile(
    path: string,
    onBytes: (received: number) => void,
    signal: AbortSignal | undefined,
): Promise<string> {
    const hash = createHash("sha256");
    let received = 0;
    for await (const chunk of createReadStream(path, signal === undefined ? {} : { signal })) {
        hash.update(chunk as Buffer);
        received += (chunk as Buffer).length;
        onBytes(received);
    }
    return hash.digest("hex");
}

async function readPackagedRepairArchive(
    resourcesPath: string,
): Promise<TypeScriptEngineRepairArchive | null> {
    try {
        const manifest = JSON.parse(
            await readFile(join(packagedRoot(resourcesPath), "manifest.json"), "utf8"),
        ) as { engines?: { typescript?: { repairArchive?: unknown } } };
        const record = manifest.engines?.typescript?.repairArchive as
            | Partial<TypeScriptEngineRepairArchive>
            | undefined;
        if (
            record === undefined ||
            record === null ||
            typeof record.fileName !== "string" ||
            !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.zip$/u.test(record.fileName) ||
            typeof record.size !== "number" ||
            !Number.isSafeInteger(record.size) ||
            record.size <= 0 ||
            typeof record.sha256 !== "string" ||
            !/^[a-f0-9]{64}$/u.test(record.sha256)
        ) {
            return null;
        }
        return { fileName: record.fileName, size: record.size, sha256: record.sha256 };
    } catch {
        return null;
    }
}

/**
 * Reinstall the engine into the data folder from the archive inside the installed app.
 *
 * Single-flight per target folder: two renders started together share one installation
 * rather than extracting over each other.
 */
export function ensureManagedTypeScriptEngine(
    options: ManagedTypeScriptEngineOptions,
): Promise<ManagedTypeScriptEngine> {
    const key = resolve(options.dataDir, "render-engines", "typescript");
    const running = inflight.get(key);
    if (running !== undefined) return running;
    const operation = installManagedTypeScriptEngine(options).finally(() => {
        if (inflight.get(key) === operation) inflight.delete(key);
    });
    inflight.set(key, operation);
    return operation;
}

async function installManagedTypeScriptEngine(
    options: ManagedTypeScriptEngineOptions,
): Promise<ManagedTypeScriptEngine> {
    const emit = options.onProgress;
    emit?.({
        stage: "checking",
        message: "Checking the Worldlens engine inside the app",
        received: null,
        total: null,
    });

    const archive = await readPackagedRepairArchive(options.resourcesPath);
    if (archive === null) {
        throw new Error(
            "the app's render-engine manifest " +
                `(${join(packagedRoot(options.resourcesPath), "manifest.json")}) is missing or ` +
                "names no engine archive to reinstall from",
        );
    }

    const target = managedTypeScriptEngineRoot(options.dataDir, archive.sha256);
    const existing = await inspectTypeScriptEngineTree(target);
    if (existing.ok) {
        emit?.({
            stage: "reused",
            message: "Using the reinstalled Worldlens engine",
            received: null,
            total: null,
        });
        return { root: target, version: existing.version ?? "unknown", reused: true };
    }

    const archivePath = join(packagedRoot(options.resourcesPath), archive.fileName);
    let size: number;
    try {
        size = (await stat(archivePath)).size;
    } catch {
        throw new Error(`the engine archive ${archivePath} is missing from this installation`);
    }
    if (size !== archive.size) {
        throw new Error(
            `the engine archive ${archivePath} is ${String(size)} bytes and should be ` +
                `${String(archive.size)}, so this installation is damaged`,
        );
    }
    const digest = await sha256OfFile(
        archivePath,
        (received) =>
            emit?.({
                stage: "verifying",
                message: "Verifying the Worldlens engine archive",
                received,
                total: archive.size,
            }),
        options.signal,
    );
    if (digest !== archive.sha256) {
        throw new Error(
            `the engine archive ${archivePath} does not match its recorded SHA-256, so this ` +
                "installation is damaged",
        );
    }

    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
        await extractZip(archivePath, temporary, {
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            onProgress: (progress) =>
                emit?.({
                    stage: "installing",
                    message: "Installing the Worldlens engine",
                    received: progress.bytesDone,
                    total: progress.bytesTotal,
                }),
        });
        const installed = await inspectTypeScriptEngineTree(temporary);
        if (!installed.ok) {
            throw new Error(
                `the reinstalled engine is still missing ${listMissing(installed.missing)}`,
            );
        }
        await rm(target, { recursive: true, force: true });
        await renameWithRetry(temporary, target);
        await removeSupersededCopies(target);
        emit?.({
            stage: "installed",
            message: "The Worldlens engine is ready",
            received: null,
            total: null,
        });
        return { root: target, version: installed.version ?? "unknown", reused: false };
    } catch (error) {
        await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
        if (options.signal?.aborted === true) throw error;
        throw new Error(
            `installing the engine into ${target} failed: ${describe(error)}`,
            error instanceof Error ? { cause: error } : undefined,
        );
    }
}

/** Copies reinstalled for earlier versions of the app are rebuildable and no longer read. */
async function removeSupersededCopies(current: string): Promise<void> {
    const parent = dirname(current);
    const names = await readdir(parent).catch(() => [] as string[]);
    for (const name of names) {
        const candidate = join(parent, name);
        if (candidate === current) continue;
        await rm(candidate, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function renameWithRetry(source: string, target: string): Promise<void> {
    for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt += 1) {
        try {
            await rename(source, target);
            return;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            const transient = code === "EPERM" || code === "EACCES" || code === "EBUSY";
            if (!transient || attempt === RENAME_ATTEMPTS - 1) throw error;
            await new Promise((done) => setTimeout(done, RENAME_DELAY_MS * (attempt + 1)));
        }
    }
}

function resolved(root: string, version: string): ResolvedEngine {
    return {
        engine: "typescript",
        engineVersion: version,
        launch: "typescript",
        driverPath: join(root, "typescript", "render-ts.mjs"),
        enginePath: join(root, "typescript", "dist", "index.js"),
        javaExecutable: null,
        javaVersion: null,
    };
}

function developmentStagedRoot(repositoryRoot: string): string {
    return join(repositoryRoot, "design", "packages", "app", "dist", "render-engines");
}

async function isFile(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

async function developmentTypeScriptVersion(base: string): Promise<string> {
    try {
        const packageJson = JSON.parse(
            await readFile(join(base, "design", "packages", "engine", "package.json"), "utf8"),
        ) as { version?: unknown };
        return typeof packageJson.version === "string" && packageJson.version.length > 0
            ? packageJson.version
            : "unknown";
    } catch {
        return "unknown";
    }
}

/** The engine in a checkout: the staged tree when it is complete, else the workspace build. */
async function developmentEngine(repositoryRoot: string): Promise<ResolvedEngine | null> {
    // The process may have been started from the repository root or from the app package.
    const bases = [repositoryRoot, resolve(repositoryRoot, "..", "..", "..")];
    for (const base of bases) {
        const staged = developmentStagedRoot(base);
        const inspection = await inspectTypeScriptEngineTree(staged);
        if (inspection.ok) return resolved(staged, inspection.version ?? "unknown");
    }
    for (const base of bases) {
        const driverPath = join(base, "tools", "oracle", "render-ts.mjs");
        const enginePath = join(base, "design", "packages", "engine", "dist", "index.js");
        if ((await isFile(enginePath)) && (await isFile(driverPath))) {
            return {
                engine: "typescript",
                engineVersion: await developmentTypeScriptVersion(base),
                launch: "typescript",
                driverPath,
                enginePath,
                javaExecutable: null,
                javaVersion: null,
            };
        }
    }
    return null;
}

/** Resolves the packaged, reinstalled or checkout copy of the standalone TypeScript engine. */
export function typescriptEngine(
    options: TypeScriptEngineOptions = {},
): (
    engine?: RenderEngineId,
    signal?: AbortSignal,
    onProgress?: (progress: EngineProvisionProgress) => void,
) => Promise<ResolvedEngine> {
    return async (engine = "typescript", signal, onProgress): Promise<ResolvedEngine> => {
        if (engine !== "typescript") {
            throw new EngineUnavailableError(
                "engine",
                `The project selected '${engine}', but the TypeScript resolver was asked to resolve another engine.`,
            );
        }

        const resourcesPath = options.resourcesPath ?? null;
        let packaged: TypeScriptEngineInspection | null = null;
        if (resourcesPath !== null) {
            packaged = await inspectTypeScriptEngineTree(packagedRoot(resourcesPath));
            if (packaged.ok) {
                return resolved(packagedRoot(resourcesPath), packaged.version ?? "unknown");
            }
            const dataDir = options.dataDir ?? null;
            if (dataDir !== null) {
                try {
                    const managed = await ensureManagedTypeScriptEngine({
                        resourcesPath,
                        dataDir,
                        ...(onProgress === undefined ? {} : { onProgress }),
                        ...(signal === undefined ? {} : { signal }),
                    });
                    return resolved(managed.root, managed.version);
                } catch (error) {
                    if (signal?.aborted === true) throw error;
                    throw new EngineUnavailableError(
                        "engine",
                        "The Worldlens engine inside this installation is incomplete: it is missing " +
                            `${listMissing(packaged.missing)}. Worldlens tried to reinstall it and could ` +
                            `not, because ${describe(error)}. Nothing was started and Java was not ` +
                            "selected as a fallback. Start the render again to retry; if it keeps " +
                            "failing, update or reinstall Worldlens.",
                    );
                }
            }
        }

        const repositoryRoot = options.repositoryRoot ?? null;
        if (repositoryRoot !== null) {
            const development = await developmentEngine(repositoryRoot);
            if (development !== null) return development;
        }

        if (packaged !== null) {
            throw new EngineUnavailableError(
                "engine",
                "The Worldlens engine inside this installation is incomplete: it is missing " +
                    `${listMissing(packaged.missing)}. Nothing was started and Java was not selected ` +
                    "as a fallback. Update or reinstall Worldlens to restore it.",
            );
        }
        throw new EngineUnavailableError(
            "engine",
            "The Worldlens engine has not been built in this checkout: neither " +
                "design/packages/app/dist/render-engines nor design/packages/engine/dist holds a " +
                "complete copy. Run the build and render again. Nothing was started and Java was " +
                "not selected as a fallback.",
        );
    };
}

/**
 * What is true about the engine right now, for the engine picker.
 *
 * `repairable` is still available: the next render reinstalls the engine before it starts,
 * and the reason says so. It is checked by the archive's presence and size only - hashing
 * it is the reinstall's job, and this runs every time Settings opens.
 */
export async function describeTypeScriptEngine(
    options: TypeScriptEngineOptions = {},
): Promise<TypeScriptEngineRuntimeSummary> {
    const resourcesPath = options.resourcesPath ?? null;
    if (resourcesPath !== null) {
        const packaged = await inspectTypeScriptEngineTree(packagedRoot(resourcesPath));
        if (packaged.ok) {
            return { available: true, version: packaged.version, source: "bundled", reason: null };
        }
        const missing = `The engine inside the app is incomplete (missing ${listMissing(packaged.missing)}).`;
        const archive = await readPackagedRepairArchive(resourcesPath);
        const dataDir = options.dataDir ?? null;
        if (archive !== null && dataDir !== null) {
            const managed = await inspectTypeScriptEngineTree(
                managedTypeScriptEngineRoot(dataDir, archive.sha256),
            );
            if (managed.ok) {
                return {
                    available: true,
                    version: managed.version,
                    source: "managed",
                    reason: `${missing} A reinstalled copy in the app's data folder is used instead.`,
                };
            }
            const archiveSize = await stat(join(packagedRoot(resourcesPath), archive.fileName)).then(
                (info) => info.size,
                () => null,
            );
            if (archiveSize === archive.size) {
                return {
                    available: true,
                    version: packaged.version,
                    source: "repairable",
                    reason: `${missing} It is reinstalled automatically when the next render starts.`,
                };
            }
        }
        return {
            available: false,
            version: null,
            source: null,
            reason: `${missing} It cannot be reinstalled from this installation; update or reinstall Worldlens.`,
        };
    }

    const repositoryRoot = options.repositoryRoot ?? null;
    if (repositoryRoot !== null) {
        const development = await developmentEngine(repositoryRoot);
        if (development !== null) {
            return {
                available: true,
                version: development.engineVersion,
                source: "development",
                reason: null,
            };
        }
    }
    return {
        available: false,
        version: null,
        source: null,
        reason: "The Worldlens engine has not been built in this checkout.",
    };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
