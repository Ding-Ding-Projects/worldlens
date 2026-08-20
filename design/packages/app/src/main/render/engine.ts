/**
 * Resolving the engine the orchestrator is about to run.
 *
 * This is the seam between render orchestration and the Java toolchain layer in
 * `../java/`. That layer already knows how to find a JDK, judge whether it is new
 * enough, download one when it is not, and locate the seven BlueMap jars in both a
 * packaged app and a checkout. None of that is reimplemented here; this only asks it
 * for the two things a render needs and turns its failures into the orchestrator's
 * shape.
 *
 * Decisions D17 and D18 put a second engine in the tree - the TypeScript mesher in
 * `packages/engine`. D17's Phase D parity gate closed on 2026-08-04 (byte-identical output
 * at both fixture sizes), but passing that gate does not itself move this seam: D17 was
 * amended the next day to keep the Java engine the standing default, and the mesher takes
 * over only through a later, separately verified switch decision. The resolver is a
 * function for exactly that reason: swapping which engine renders is a different
 * `resolveEngine`, not a change to the orchestrator - see `engine.test.ts` for the pin.
 */

import { createHash } from "node:crypto";
import { ensureJava, NoUsableJavaError, resolveCliJar } from "../java/index.js";
import type { JarLookupOptions } from "../java/index.js";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve, basename } from "node:path";
import { EngineUnavailableError } from "./orchestrator.js";
import type { ResolvedEngine } from "./orchestrator.js";
import type { RenderEngineId } from "./provenance.js";

export interface UpstreamEngineOptions {
    /** Electron's `userData`. Where a provisioned JDK is looked for and installed. */
    readonly dataDir: string;
    /** `process.resourcesPath` in a packaged app; omit in development. */
    readonly resourcesPath?: string | null;
    /**
     * Whether a missing JDK may be downloaded.
     *
     * Off by default, matching `ensureJava`. Two hundred megabytes leaving the machine
     * is a decision somebody makes; the caller turns this on once they have said yes.
     */
    readonly allowProvisioning?: boolean;
    readonly jarLookup?: JarLookupOptions;
}

export interface TypeScriptEngineOptions {
    /** `process.resourcesPath` in a packaged app; omit in development. */
    readonly resourcesPath?: string | null;
    /** Repository root in development; the resolver searches it when provided. */
    readonly repositoryRoot?: string | null;
}

/**
 * The engine that renders today: upstream BlueMap's CLI, on a real JVM.
 *
 * Both halves are resolved every time rather than cached. A JDK can be uninstalled and
 * a jar can be rebuilt between two renders, and a cached answer to either question is
 * a render that fails with a path that used to exist.
 */
export function upstreamJavaEngine(
    options: UpstreamEngineOptions,
): (engine?: RenderEngineId) => Promise<ResolvedEngine> {
    return async (engine: RenderEngineId = "upstream-java"): Promise<ResolvedEngine> => {
        if (engine !== "upstream-java") {
            throw new EngineUnavailableError(
                "engine",
                `The project selected '${engine}', but this build only has the upstream Java ` +
                    "resolver wired for this route. Nothing was started and no other engine was chosen.",
            );
        }
        // The jar first: it is a directory listing, where finding a JVM can mean
        // launching a process or downloading two hundred megabytes. Reporting "the
        // engine is not installed" without having spent that is the better order.
        let jar;
        try {
            jar = resolveCliJar(options.jarLookup ?? lookupFrom(options));
        } catch (error) {
            throw new EngineUnavailableError("jar", describe(error));
        }
        if (options.resourcesPath !== undefined && options.resourcesPath !== null) {
            try {
                await verifyStagedJavaArtifact(options.resourcesPath, jar.path, jar.version);
            } catch (error) {
                throw new EngineUnavailableError("jar", describe(error));
            }
        }

        let java;
        try {
            java = await ensureJava({
                dataDir: options.dataDir,
                ...(options.allowProvisioning === undefined
                    ? {}
                    : { allowProvisioning: options.allowProvisioning }),
            });
        } catch (error) {
            if (error instanceof NoUsableJavaError) {
                throw new EngineUnavailableError("java", error.message);
            }
            throw new EngineUnavailableError("java", describe(error));
        }

        return {
            engine: "upstream-java",
            engineVersion: jar.version,
            launch: "java-cli",
            enginePath: jar.path,
            javaExecutable: java.installation.executable,
            javaVersion: java.installation.version.version,
        };
    };
}

/** Resolves the packaged or checkout copy of the standalone TypeScript render driver. */
export function typescriptEngine(
    options: TypeScriptEngineOptions = {},
): (engine?: RenderEngineId) => Promise<ResolvedEngine> {
    return async (engine: RenderEngineId = "typescript"): Promise<ResolvedEngine> => {
        if (engine !== "typescript") {
            throw new EngineUnavailableError(
                "engine",
                `The project selected '${engine}', but the TypeScript resolver was asked to resolve another engine.`,
            );
        }
        const roots = [
            options.resourcesPath === undefined || options.resourcesPath === null
                ? null
                : join(options.resourcesPath, "render-engines"),
            options.repositoryRoot === undefined || options.repositoryRoot === null
                ? null
                : join(options.repositoryRoot, "design", "packages", "app", "dist", "render-engines"),
        ].filter((root): root is string => root !== null);
        for (const root of roots) {
            const enginePath = join(root, "typescript", "dist", "index.js");
            const driverPath = join(root, "typescript", "render-ts.mjs");
            if ((await exists(enginePath)) && (await exists(driverPath))) {
                const version = await stagedTypeScriptVersion(root);
                if (version === null) continue;
                return {
                    engine: "typescript",
                    engineVersion: version,
                    launch: "typescript",
                    driverPath,
                    enginePath,
                    javaExecutable: null,
                    javaVersion: null,
                };
            }
        }
        const developmentBases =
            options.repositoryRoot === undefined || options.repositoryRoot === null
                ? []
                : [options.repositoryRoot, resolve(options.repositoryRoot, "..", "..", "..")];
        for (const base of developmentBases) {
            const driverPath = join(base, "tools", "oracle", "render-ts.mjs");
            const enginePath = join(base, "design", "packages", "engine", "dist", "index.js");
            if ((await exists(enginePath)) && (await exists(driverPath))) {
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
        throw new EngineUnavailableError(
            "engine",
            "The TypeScript engine is not staged in this build. Build the engine bundle before rendering; " +
                "nothing was started and Java was not selected as a fallback.",
        );
    };
}

interface StagedJavaArtifact {
    readonly fileName: string;
    readonly size: number;
    readonly sha256: string;
}

async function verifyStagedJavaArtifact(resourcesPath: string, jarPath: string, jarVersion: string): Promise<void> {
    const raw = await readFile(join(resourcesPath, "render-engines", "manifest.json"), "utf8");
    const parsed = JSON.parse(raw) as {
        manifestVersion?: unknown;
        engines?: { "upstream-java"?: { available?: unknown; version?: unknown; jar?: StagedJavaArtifact | null } };
    };
    const java = parsed.engines?.["upstream-java"];
    if (parsed.manifestVersion !== 1 || java?.available !== true || java.jar === null || java.jar === undefined) {
        throw new Error("the packaged render-engine manifest does not advertise a usable upstream-java artifact");
    }
    if (java.version !== jarVersion || java.jar.fileName !== basename(jarPath)) {
        throw new Error("the packaged render-engine manifest does not match the staged upstream-java jar");
    }
    const bytes = await readFile(jarPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (java.jar.size !== bytes.byteLength || java.jar.sha256.toLowerCase() !== digest) {
        throw new Error("the staged upstream-java jar failed the packaged manifest size or SHA-256 check");
    }
}

async function developmentTypeScriptVersion(base: string): Promise<string> {
    try {
        const packageJson = JSON.parse(await readFile(join(base, "design", "packages", "engine", "package.json"), "utf8"));
        return typeof packageJson.version === "string" && packageJson.version.length > 0
            ? packageJson.version
            : "unknown";
    } catch {
        return "unknown";
    }
}

async function stagedTypeScriptVersion(root: string): Promise<string | null> {
    try {
        const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as {
            manifestVersion?: unknown;
            engines?: {
                typescript?: {
                    available?: unknown;
                    version?: unknown;
                    packageResolution?: {
                        root?: unknown;
                        packages?: unknown;
                    };
                };
            };
        };
        if (manifest.manifestVersion !== 1 || manifest.engines?.typescript?.available !== true) return null;
        if (!(await hasStagedTypeScriptPackageBoundary(root, manifest.engines.typescript.packageResolution))) {
            return null;
        }
        return typeof manifest.engines?.typescript?.version === "string"
            ? manifest.engines.typescript.version
            : "unknown";
    } catch {
        return null;
    }
}

const STAGED_TYPESCRIPT_PACKAGES = ["@worldlens/config", "@worldlens/nbt", "@worldlens/shared"] as const;
const STAGED_TYPESCRIPT_PACKAGE_ROOT = "typescript/node_modules/@worldlens";

interface StagedTypeScriptPackageRecord {
    readonly name?: unknown;
    readonly root?: unknown;
    readonly main?: unknown;
}

interface StagedTypeScriptPackageResolution {
    readonly root?: unknown;
    readonly packages?: unknown;
}

/**
 * Verify the package boundary that Node will use for bare workspace imports before
 * returning a packaged engine. The installed app cannot see pnpm's workspace links;
 * a manifest that merely says the engine is available is not enough evidence that its
 * import graph can load.
 */
async function hasStagedTypeScriptPackageBoundary(
    root: string,
    resolution: StagedTypeScriptPackageResolution | undefined,
): Promise<boolean> {
    if (resolution?.root !== STAGED_TYPESCRIPT_PACKAGE_ROOT || !Array.isArray(resolution.packages)) return false;
    const records = resolution.packages as StagedTypeScriptPackageRecord[];
    if (records.length < STAGED_TYPESCRIPT_PACKAGES.length) return false;

    for (const packageName of STAGED_TYPESCRIPT_PACKAGES) {
        if (!records.some((candidate) => candidate?.name === packageName)) return false;
    }

    const names = new Set<string>();
    for (const record of records) {
        if (
            typeof record.name !== "string" ||
            names.has(record.name) ||
            !isSafeStagedPackageName(record.name) ||
            record.root !== `typescript/node_modules/${record.name}` ||
            typeof record.main !== "string" ||
            !isSafeStagedRelativePath(record.main)
        ) {
            return false;
        }
        names.add(record.name);
        const packageRoot = join(root, record.root);
        const packageManifestPath = join(packageRoot, "package.json");
        try {
            const packageManifest = JSON.parse(await readFile(packageManifestPath, "utf8")) as {
                name?: unknown;
                main?: unknown;
            };
            if (
                packageManifest.name !== record.name ||
                typeof packageManifest.main !== "string" ||
                !isSafeStagedRelativePath(packageManifest.main) ||
                normalizeStagedPackagePath(packageManifest.main) !== record.main
            ) {
                return false;
            }
        } catch {
            return false;
        }
        if (!(await exists(join(packageRoot, record.main)))) return false;
    }
    return true;
}

function isSafeStagedRelativePath(value: string): boolean {
    return value.length > 0 && !isAbsolute(value) && !value.split(/[\\/]+/u).includes("..");
}

function isSafeStagedPackageName(value: string): boolean {
    return /^(?:@[^/]+\/[^/]+|[^/]+)$/u.test(value);
}

function normalizeStagedPackagePath(value: string): string {
    return value.replace(/^\.\//u, "").replaceAll("\\", "/");
}

async function exists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

function lookupFrom(options: UpstreamEngineOptions): JarLookupOptions {
    return options.resourcesPath === undefined
        ? {}
        : { resourcesPath: options.resourcesPath };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
