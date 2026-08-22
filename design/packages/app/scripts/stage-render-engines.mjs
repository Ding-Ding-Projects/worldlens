import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const designRoot = resolve(appRoot, "../..");
const repositoryRoot = resolve(designRoot, "..");
const engineRoot = join(designRoot, "packages", "engine");
const sharedRoot = join(designRoot, "packages", "shared");
const nbtRoot = join(designRoot, "packages", "nbt");
const configRoot = join(designRoot, "packages", "config");
const driverSource = join(repositoryRoot, "tools", "oracle", "render-ts.mjs");
const typescriptAssets = join(engineRoot, "assets");
const jarDirectory = join(repositoryRoot, "tools", "oracle", "out", "jars");
const require = createRequire(import.meta.url);

const runtimeWorkspacePackages = [
    { name: "@worldlens/config", root: configRoot },
    { name: "@worldlens/nbt", root: nbtRoot },
    { name: "@worldlens/shared", root: sharedRoot },
];

async function artifactMetadata(path) {
    const bytes = await readFile(path);
    return { size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/**
 * Keep the TypeScript engine's bare workspace imports inside its staged package
 * boundary. `tsc` deliberately leaves `@worldlens/*` specifiers intact, so the
 * packaged driver must see an ordinary Node package layout next to the engine;
 * the checkout's pnpm links cannot cross an installed app's resource boundary.
 */
async function stageRuntimePackage(packageDefinition, packageRoot) {
    const sourceManifestPath = join(packageDefinition.root, "package.json");
    const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
    if (sourceManifest.name !== packageDefinition.name) {
        throw new Error(
            `workspace package manifest name mismatch: expected ${packageDefinition.name}, got ${String(sourceManifest.name)}`,
        );
    }
    if (
        typeof sourceManifest.main !== "string" ||
        isAbsolute(sourceManifest.main) ||
        !isSafeRelativePackagePath(sourceManifest.main)
    ) {
        throw new Error(`runtime package ${packageDefinition.name} has no relative main entry`);
    }
    const sourceMain = join(packageDefinition.root, sourceManifest.main);
    const sourceMainInfo = await stat(sourceMain);
    if (!sourceMainInfo.isFile()) {
        throw new Error(`runtime package ${packageDefinition.name} is not built: ${sourceMain}`);
    }

    const targetRoot = join(packageRoot, ...packageDefinition.name.split("/"));
    await mkdir(targetRoot, { recursive: true });
    if (packageDefinition.workspace) {
        const sourceDist = join(packageDefinition.root, "dist");
        const sourceDistInfo = await stat(sourceDist);
        if (!sourceDistInfo.isDirectory()) {
            throw new Error(`workspace package ${packageDefinition.name} has no built dist directory: ${sourceDist}`);
        }
        await cp(sourceDist, join(targetRoot, "dist"), { recursive: true, force: true });
        await cp(sourceManifestPath, join(targetRoot, "package.json"), { force: true });
    } else {
        await cp(packageDefinition.root, targetRoot, {
            recursive: true,
            force: true,
            filter: (source) => {
                const relativeSource = relative(packageDefinition.root, source);
                return !relativeSource.split(/[\\/]+/u).includes("node_modules");
            },
        });
    }
    return {
        name: packageDefinition.name,
        root: `typescript/node_modules/${packageDefinition.name}`,
        main: sourceManifest.main.replace(/^\.\//u, "").replaceAll("\\", "/"),
    };
}

function isSafeRelativePackagePath(value) {
    return value.length > 0 && !value.split(/[\\/]+/u).includes("..");
}

function resolveInstalledPackage(packageName, fromRoot) {
    let entry;
    try {
        entry = require.resolve(packageName, { paths: [fromRoot] });
    } catch (error) {
        throw new Error(`runtime dependency ${packageName} required by ${fromRoot} is not installed: ${String(error)}`);
    }
    // Package exports may intentionally omit ./package.json. Walk from the
    // resolved entry to the nearest manifest, which works for both regular
    // node_modules packages and pnpm workspace symlinks.
    let directory = dirname(entry);
    while (directory !== dirname(directory)) {
        const manifestPath = join(directory, "package.json");
        if (existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
                if (manifest.name === packageName) return directory;
            } catch {
                // Keep walking if an unrelated or malformed manifest is found.
            }
        }
        directory = dirname(directory);
    }
    throw new Error(`resolved runtime dependency ${packageName} has no matching package.json: ${entry}`);
}

async function stageRuntimePackageClosure(outputDirectory) {
    const packageRoot = join(outputDirectory, "typescript", "node_modules");
    const workspaceDefinitions = new Map(runtimeWorkspacePackages.map((definition) => [definition.name, definition]));
    const queue = [
        ...runtimeWorkspacePackages.map((definition) => ({ ...definition, workspace: true })),
        { name: "@worldlens/engine", root: engineRoot, workspace: true, stage: false },
    ];
    const staged = [];
    const visited = new Set();
    while (queue.length > 0) {
        const definition = queue.shift();
        if (visited.has(definition.name)) continue;
        visited.add(definition.name);
        const sourceManifest = JSON.parse(await readFile(join(definition.root, "package.json"), "utf8"));
        if (sourceManifest.name !== definition.name) {
            throw new Error(`runtime package manifest name mismatch for ${definition.name}`);
        }
        if (definition.stage !== false) {
            staged.push(await stageRuntimePackage(definition, packageRoot));
        }
        const optional = new Set(
            sourceManifest.optionalDependencies && typeof sourceManifest.optionalDependencies === "object"
                ? Object.keys(sourceManifest.optionalDependencies)
                : [],
        );
        const dependencies = new Set(
            sourceManifest.dependencies && typeof sourceManifest.dependencies === "object"
                ? Object.keys(sourceManifest.dependencies)
                : [],
        );
        const optionalPeers = new Set(
            sourceManifest.peerDependenciesMeta && typeof sourceManifest.peerDependenciesMeta === "object"
                ? Object.entries(sourceManifest.peerDependenciesMeta)
                      .filter(([, metadata]) => metadata?.optional === true)
                      .map(([name]) => name)
                : [],
        );
        if (sourceManifest.peerDependencies && typeof sourceManifest.peerDependencies === "object") {
            for (const dependencyName of Object.keys(sourceManifest.peerDependencies)) dependencies.add(dependencyName);
        }
        for (const dependencyName of dependencies) {
            if (optional.has(dependencyName) || optionalPeers.has(dependencyName)) continue;
            // Vue publishes csstype as a package dependency for its type
            // declarations, but it is not a runtime asset and pnpm does not
            // expose it through the real package path used during staging.
            if (dependencyName === "csstype") continue;
            const workspaceDefinition = workspaceDefinitions.get(dependencyName);
            if (workspaceDefinition !== undefined) {
                queue.push({ ...workspaceDefinition, workspace: true });
                continue;
            }
            queue.push({
                name: dependencyName,
                root: resolveInstalledPackage(dependencyName, definition.root),
                workspace: false,
            });
        }
    }
    return staged;
}

/**
 * Stage the files and machine-readable description the packaged app can use to
 * discover both render engines. The TypeScript engine is always bundled from the
 * workspace package; the Java engine is present when the jar bootstrap has staged
 * its CLI jar. Missing Java output is reported in the manifest rather than turning
 * a no-JVM-capable build into a packaging failure.
 */
export async function stageRenderEngines(outputDirectory = join(appRoot, "dist", "render-engines")) {
    await rm(outputDirectory, { recursive: true, force: true });
    await mkdir(outputDirectory, { recursive: true });

    const typescriptOutput = join(outputDirectory, "typescript", "assets");
    await cp(typescriptAssets, typescriptOutput, { recursive: true, force: true });
    await cp(join(engineRoot, "dist"), join(outputDirectory, "typescript", "dist"), { recursive: true, force: true });
    await cp(join(sharedRoot, "dist"), join(outputDirectory, "shared", "dist"), { recursive: true, force: true });
    await cp(driverSource, join(outputDirectory, "typescript", "render-ts.mjs"));
    const stagedWorkspacePackages = await stageRuntimePackageClosure(outputDirectory);

    let javaVersion = null;
    let javaArtifact = null;
    let stagedManifestFound = false;
    try {
        const stagedManifest = JSON.parse(await readFile(join(jarDirectory, "manifest.json"), "utf8"));
        stagedManifestFound = true;
        const cli = Array.isArray(stagedManifest.jars)
            ? stagedManifest.jars.find((jar) => jar?.implementation === "cli")
            : null;
        if (typeof cli?.fileName === "string") {
            const candidate = join(jarDirectory, cli.fileName);
            const info = await stat(candidate);
            if (!info.isFile()) throw new Error(`staged CLI jar is not a file: ${candidate}`);
            const actual = await artifactMetadata(candidate);
            if (typeof cli.size === "number" && cli.size !== actual.size) {
                throw new Error(`staged CLI jar size differs from manifest: ${candidate}`);
            }
            if (typeof cli.sha256 === "string" && cli.sha256.toLowerCase() !== actual.sha256) {
                throw new Error(`staged CLI jar digest differs from manifest: ${candidate}`);
            }
            javaArtifact = { fileName: cli.fileName, ...actual };
            javaVersion = typeof cli.version === "string" ? cli.version : null;
        }
    } catch {
        // A stale or malformed manifest is not evidence that a jar is usable.
    }
    try {
        if (javaArtifact === null && !stagedManifestFound) {
            const entries = await readdir(jarDirectory, { withFileTypes: true });
            const candidates = entries
                .filter((entry) => entry.isFile() && /^cli-(.+)-shadow\.jar$/.test(entry.name))
                .map(async (entry) => ({
                    name: entry.name,
                    mtimeMs: (await stat(join(jarDirectory, entry.name))).mtimeMs,
                }));
            const ordered = (await Promise.all(candidates)).sort((left, right) => right.mtimeMs - left.mtimeMs);
            const javaJar = ordered[0]?.name ?? null;
            if (javaJar !== null) {
                javaArtifact = { fileName: javaJar, ...(await artifactMetadata(join(jarDirectory, javaJar))) };
                javaVersion = /^cli-(.+)-shadow\.jar$/.exec(javaJar)?.[1] ?? null;
            }
        }
    } catch {
        // The Java engine remains an honest unavailable capability until jars are staged.
    }

    let typescriptVersion = "unknown";
    try {
        const packageJson = JSON.parse(await readFile(join(engineRoot, "package.json"), "utf8"));
        if (typeof packageJson.version === "string" && packageJson.version.length > 0) {
            typescriptVersion = packageJson.version;
        }
    } catch {
        // A malformed package manifest is reported as unknown metadata, not guessed.
    }

    const manifest = {
        manifestVersion: 1,
        engines: {
            "upstream-java": {
                id: "upstream-java",
                label: "BlueMap engine (Java)",
                version: javaVersion,
                available: javaArtifact !== null,
                requiresJvm: true,
                capabilities: { local: true, docker: true, cli: true, restart: true },
                unsupportedSettings: [],
                jar: javaArtifact,
            },
            typescript: {
                id: "typescript",
                label: "Worldlens engine (TypeScript)",
                version: typescriptVersion,
                available: true,
                requiresJvm: false,
                capabilities: { local: true, docker: false, cli: false, restart: true },
                unsupportedSettings: ["BlueMap JVM flags", "BlueMap CLI-only diagnostics"],
                assetDirectory: "typescript/assets",
                engineEntry: "typescript/dist/index.js",
                driver: "typescript/render-ts.mjs",
                packageResolution: {
                    root: "typescript/node_modules/@worldlens",
                    packages: stagedWorkspacePackages,
                },
            },
        },
    };
    await writeFile(join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`, "utf8");
    return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const manifest = await stageRenderEngines();
    console.log(
        `Staged render engines: TypeScript ${manifest.engines.typescript.version}; ` +
            `Java ${manifest.engines["upstream-java"].version ?? "unavailable"}.`,
    );
}
