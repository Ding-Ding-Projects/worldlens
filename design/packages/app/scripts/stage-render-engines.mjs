import { spawnSync } from "node:child_process";
import { stageLocalJavaEngine } from "./stage-local-java-engine.mjs";
import { BLUEMAP_SOURCE_PATH, validateStagedJavaEngine } from "./staged-java-engine.mjs";
import {
    TYPESCRIPT_ENGINE_PACKAGE_ROOT,
    inspectTypeScriptEngineTree,
    probeTypeScriptEngineTree,
} from "./typescript-engine-tree.mjs";
import { writeDeterministicZip } from "./zip-writer.mjs";
import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const designRoot = resolve(appRoot, "../..");
const repositoryRoot = resolve(designRoot, "..");
const workspacePackagesRoot = join(designRoot, "packages");
const engineRoot = join(designRoot, "packages", "engine");
const sharedRoot = join(designRoot, "packages", "shared");
const driverSource = join(repositoryRoot, "tools", "oracle", "render-ts.mjs");
const typescriptAssets = join(engineRoot, "assets");
const jarDirectory = join(repositoryRoot, "tools", "oracle", "out", "jars");
const gradleJarDirectory = join(
    repositoryRoot,
    "vendor",
    "BlueMap-Material",
    "implementations",
    "cli",
    "build",
    "libs",
);

/** The archive the installed app reinstalls the engine from when its loose files are damaged. */
export const TYPESCRIPT_ENGINE_REPAIR_ARCHIVE = "typescript-engine.zip";

/**
 * Files nothing reads at run time. Source maps and declarations roughly double the engine
 * tree, and the update package this lands in has to stay under the size the updater can
 * fetch as one file.
 */
function isRuntimeFile(path) {
    return !/(?:\.map|\.d\.ts|\.d\.mts|\.d\.cts|\.tsbuildinfo|\.test\.js)$/u.test(path);
}

function copyRuntimeTree(source, target, extraFilter = () => true) {
    return cp(source, target, {
        recursive: true,
        force: true,
        filter: (path) => extraFilter(path) && isRuntimeFile(path),
    });
}

const packageOwners = new Map();

/** The nearest named package.json above a file: the package that file belongs to. */
function owningPackage(file) {
    let directory = dirname(file);
    const visited = [];
    while (directory !== dirname(directory)) {
        const cached = packageOwners.get(directory);
        if (cached !== undefined) {
            for (const seen of visited) packageOwners.set(seen, cached);
            return cached;
        }
        visited.push(directory);
        const manifestPath = join(directory, "package.json");
        if (existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
                // A nested `{ "type": "module" }` marker has no name and is not a package root.
                if (typeof manifest.name === "string" && manifest.name.length > 0) {
                    const owner = { name: manifest.name, root: directory, manifest };
                    for (const seen of visited) packageOwners.set(seen, owner);
                    return owner;
                }
            } catch {
                // Keep walking past a malformed manifest.
            }
        }
        directory = dirname(directory);
    }
    return null;
}

/**
 * Find every package the engine really imports, by following its import graph.
 *
 * The earlier version of this walked `dependencies` and `peerDependencies` in each
 * package.json instead. That staged 91 MB, 60 MB of it a UI framework that a peer
 * dependency of the design tokens names and no render path ever loads, and it would have
 * pushed the update package past the size the updater can fetch. The import graph is what
 * Node will actually ask for; a package.json is what somebody declared.
 */
async function traceRuntimePackages() {
    let result;
    try {
        result = await build({
            entryPoints: [join(engineRoot, "dist", "index.js"), join(sharedRoot, "dist", "index.js")],
            absWorkingDir: designRoot,
            bundle: true,
            write: false,
            metafile: true,
            platform: "node",
            format: "esm",
            outdir: join(appRoot, "dist", ".render-engine-trace"),
            logLevel: "silent",
            loader: { ".wasm": "empty", ".node": "empty" },
        });
    } catch (error) {
        throw new Error(
            "The TypeScript engine's imports could not be resolved, so it cannot be staged. " +
                "Build the workspace packages first (pnpm build in design/). " +
                String(error instanceof Error ? error.message : error),
        );
    }
    const packages = new Map();
    for (const input of Object.keys(result.metafile.inputs)) {
        const file = resolve(designRoot, input);
        if (!existsSync(file)) continue;
        const owner = owningPackage(file);
        if (owner === null || owner.name === "@worldlens/engine") continue;
        const known = packages.get(owner.name);
        if (known !== undefined && known.root !== owner.root) {
            throw new Error(
                `The TypeScript engine imports two copies of ${owner.name} (${known.root} and ${owner.root}); ` +
                    "one flat package folder cannot carry both.",
            );
        }
        packages.set(owner.name, owner);
    }
    return [...packages.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
}

/**
 * Copy one package into the engine's own `node_modules`. `tsc` deliberately leaves bare
 * specifiers intact, so the packaged driver must see an ordinary Node package layout next
 * to the engine; the checkout's pnpm links cannot cross an installed app's resource boundary.
 */
async function stageRuntimePackage(owner, packageRoot) {
    const main = owner.manifest.main;
    if (typeof main !== "string" || isAbsolute(main) || main.split(/[\\/]+/u).includes("..")) {
        throw new Error(`runtime package ${owner.name} has no relative main entry`);
    }
    if (!(await stat(join(owner.root, main)).then((info) => info.isFile(), () => false))) {
        throw new Error(`runtime package ${owner.name} is not built: ${join(owner.root, main)}`);
    }
    const targetRoot = join(packageRoot, ...owner.name.split("/"));
    await mkdir(targetRoot, { recursive: true });
    const isWorkspacePackage = owner.root.startsWith(workspacePackagesRoot + sep);
    if (isWorkspacePackage) {
        // Only the build output: a workspace package's sources, tests and tool caches are
        // not part of what it publishes.
        await copyRuntimeTree(join(owner.root, "dist"), join(targetRoot, "dist"));
        await cp(join(owner.root, "package.json"), join(targetRoot, "package.json"), { force: true });
    } else {
        await copyRuntimeTree(
            owner.root,
            targetRoot,
            (source) => !relative(owner.root, source).split(/[\\/]+/u).includes("node_modules"),
        );
    }
    return {
        name: owner.name,
        root: `${TYPESCRIPT_ENGINE_PACKAGE_ROOT}/${owner.name}`,
        main: main.replace(/^\.\//u, "").replaceAll("\\", "/"),
    };
}

async function listFiles(root, prefix = "") {
    const files = [];
    for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
        const name = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) files.push(...(await listFiles(root, name)));
        else if (entry.isFile()) files.push(name);
    }
    return files;
}

function typescriptManifestEntry(version, packages, repairArchive) {
    return {
        id: "typescript",
        label: "Worldlens engine (TypeScript)",
        version,
        available: true,
        requiresJvm: false,
        capabilities: { local: true, docker: false, cli: false, restart: true },
        unsupportedSettings: ["BlueMap JVM flags", "BlueMap CLI-only diagnostics"],
        assetDirectory: "typescript/assets",
        engineEntry: "typescript/dist/index.js",
        driver: "typescript/render-ts.mjs",
        packageResolution: {
            root: `${TYPESCRIPT_ENGINE_PACKAGE_ROOT}/@worldlens`,
            packages,
        },
        ...(repairArchive === null ? {} : { repairArchive }),
    };
}

/**
 * Stage the TypeScript engine into `outputDirectory` and prove it before describing it.
 *
 * The tree is inspected and then loaded in a separate process from a copy outside the
 * workspace. Only after that is the reinstall archive written and `available: true`
 * recorded, so the manifest cannot claim an engine that will not start.
 *
 * @returns the manifest entry for the engine, naming its reinstall archive
 */
export async function stageTypeScriptEngine(outputDirectory, options = {}) {
    await mkdir(outputDirectory, { recursive: true });
    await cp(typescriptAssets, join(outputDirectory, "typescript", "assets"), {
        recursive: true,
        force: true,
    });
    await copyRuntimeTree(join(engineRoot, "dist"), join(outputDirectory, "typescript", "dist"));
    await cp(driverSource, join(outputDirectory, "typescript", "render-ts.mjs"));

    const packageRoot = join(outputDirectory, ...TYPESCRIPT_ENGINE_PACKAGE_ROOT.split("/"));
    const stagedPackages = [];
    for (const owner of await traceRuntimePackages()) {
        stagedPackages.push(await stageRuntimePackage(owner, packageRoot));
    }

    // The driver opens `shared/dist/index.js` by path; the engine imports `@worldlens/shared`
    // by name. In a checkout both are the same file. A second copy here would be a second
    // module instance - two `Key` classes, and an `instanceof` in the engine that is false
    // for a key the driver made - and it could not resolve its own imports from this folder
    // either. So this path re-exports the one staged package.
    const shared = stagedPackages.find((record) => record.name === "@worldlens/shared");
    if (shared === undefined) {
        throw new Error("The TypeScript engine no longer imports @worldlens/shared; the driver still does.");
    }
    await mkdir(join(outputDirectory, "shared", "dist"), { recursive: true });
    await writeFile(
        join(outputDirectory, "shared", "dist", "index.js"),
        `export * from "../../${shared.root}/${shared.main}";\n`,
        "utf8",
    );

    let version = "unknown";
    try {
        const packageJson = JSON.parse(await readFile(join(engineRoot, "package.json"), "utf8"));
        if (typeof packageJson.version === "string" && packageJson.version.length > 0) {
            version = packageJson.version;
        }
    } catch {
        // A malformed package manifest is reported as unknown metadata, not guessed.
    }

    // The copy inside the reinstall archive describes itself without naming the archive it
    // travels in, so the archive's digest does not depend on its own digest.
    await writeEngineManifest(outputDirectory, {
        typescript: typescriptManifestEntry(version, stagedPackages, null),
    });

    const inspection = await inspectTypeScriptEngineTree(outputDirectory);
    if (!inspection.ok) {
        throw new Error(
            `The staged TypeScript engine is incomplete; missing ${inspection.missing.join("; ")}.`,
        );
    }
    if (options.probe !== false) {
        const probe = await probeTypeScriptEngineTree(outputDirectory);
        if (!probe.ok) {
            throw new Error(
                "The staged TypeScript engine does not load outside the workspace, so an installed " +
                    `app could not run it: ${String(probe.detail)}`,
            );
        }
    }

    const archiveFiles = (await listFiles(outputDirectory))
        .filter((name) => name !== TYPESCRIPT_ENGINE_REPAIR_ARCHIVE)
        .map((name) => ({ name, path: join(outputDirectory, ...name.split("/")) }));
    const archive = await writeDeterministicZip(
        join(outputDirectory, TYPESCRIPT_ENGINE_REPAIR_ARCHIVE),
        archiveFiles,
    );
    const entry = typescriptManifestEntry(version, stagedPackages, {
        fileName: TYPESCRIPT_ENGINE_REPAIR_ARCHIVE,
        size: archive.size,
        sha256: archive.sha256,
        files: archive.entries,
    });
    await writeEngineManifest(outputDirectory, { typescript: entry });
    return entry;
}

async function writeEngineManifest(outputDirectory, engines) {
    const manifest = { manifestVersion: 1, engines };
    await writeFile(
        join(outputDirectory, "manifest.json"),
        `${JSON.stringify(manifest, null, 4)}\n`,
        "utf8",
    );
    return manifest;
}

/**
 * Stage the files and machine-readable description the packaged app can use to
 * discover both render engines. The TypeScript engine is always bundled from the
 * workspace package; the Java engine is present when the jar bootstrap has staged
 * its CLI jar. A package without a verified CLI jar is rejected here, because
 * electron-builder otherwise treats a missing extraResources source as a warning
 * and emits an installer that cannot render.
 */
export async function stageRenderEngines(
    outputDirectory = join(appRoot, "dist", "render-engines"),
    options = {},
) {
    await rm(outputDirectory, { recursive: true, force: true });
    const typescript = await stageTypeScriptEngine(outputDirectory, options);
    const java = await resolveJavaArtifact(options.requireJava === true);
    return writeEngineManifest(outputDirectory, {
        "upstream-java": {
            id: "upstream-java",
            label: "BlueMap engine (Java)",
            version: java.version,
            available: java.artifact !== null,
            requiresJvm: true,
            capabilities: { local: true, docker: true, cli: true, restart: true },
            unsupportedSettings: [],
            jar: java.artifact,
        },
        typescript,
    });
}

async function resolveJavaArtifact(requireJava) {
    const release = JSON.parse(
        await readFile(join(repositoryRoot, "scripts", "bluemap-source.json"), "utf8"),
    );
    const head = spawnSync(
        "git",
        ["-C", join(repositoryRoot, BLUEMAP_SOURCE_PATH), "rev-parse", "HEAD"],
        { encoding: "utf8", shell: false },
    );
    const expectedCommit = head.status === 0 ? head.stdout.trim() : null;
    let stagedError;
    try {
        if (!/^[a-f0-9]{40}$/u.test(expectedCommit ?? ""))
            throw new Error("The selected BlueMap source commit is unavailable.");
        const staged = await validateStagedJavaEngine(jarDirectory, { expectedCommit });
        const releaseVersion = release.releaseTag.slice(1);
        if (!(
            staged.source.version === releaseVersion ||
            staged.source.version.startsWith(`${releaseVersion}-`)
        )) {
            throw new Error("Staged BlueMap version does not match the reviewed official release.");
        }
        return {
            version: staged.source.version,
            artifact: {
                fileName: staged.cli.fileName,
                size: staged.cli.size,
                sha256: staged.cli.sha256,
                source: "staged",
            },
        };
    } catch (error) {
        stagedError = error;
    }
    try {
        const staged = await stageLocalJavaEngine({
            gradleDirectory: gradleJarDirectory,
            stagingDirectory: jarDirectory,
            expectedCommit,
            releaseCommit: release.releaseCommit,
            releaseTag: release.releaseTag,
        });
        return {
            version: staged.source.version,
            artifact: {
                fileName: staged.cli.fileName,
                size: staged.cli.size,
                sha256: staged.cli.sha256,
                source: "gradle",
            },
        };
    } catch (error) {
        if (!requireJava) return { version: null, artifact: null };
        throw new Error(
            "No source-bound BlueMap CLI is available. Run the root build entrypoint. Staged input: " +
                String(stagedError) +
                ". Local input: " +
                String(error),
        );
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const manifest = await stageRenderEngines();
    console.log(
        `Staged render engines: TypeScript ${manifest.engines.typescript.version}; ` +
            `Java ${manifest.engines["upstream-java"].version ?? "unavailable"}.`,
    );
}
