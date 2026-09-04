#!/usr/bin/env node
/**
 * What the workflows need to know about this repository's own shape.
 *
 * Every value here is *discovered*, never restated. That distinction is the whole
 * point: `design/packages/app` appears as a literal string a dozen times across
 * `ci.yml` alone, `node-version: 22` is copied into every workflow while the real
 * constraint lives in `engines.node`, and the product name is duplicated out of
 * `electron-builder.config.cjs` by hand. Move or rename any of them and Der
 * Machine breaks in a way nothing announces until a run fails.
 *
 * So packages are found by their **name** in the pnpm workspace, not by their
 * path. Renaming a directory changes nothing here. Renaming a *package* is a
 * deliberate act that fails loudly, which is the right way round.
 *
 *   node scripts/workflow-manifest.mjs            # human-readable
 *   node scripts/workflow-manifest.mjs --json     # the whole manifest
 *   node scripts/workflow-manifest.mjs --github-output   # for a job's outputs
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** POSIX form, because every one of these strings ends up inside YAML. */
function posix(from, to) {
    return relative(from, to).split(sep).join("/");
}

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Finds the one pnpm workspace root, without assuming it is `design/`.
 *
 * It genuinely is `design/` today, and hard-coding that is exactly the class of
 * assumption this file exists to remove.
 */
function findWorkspaceRoot(root) {
    const found = [];
    const walk = (dir, depth) => {
        if (depth > 2) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full, depth + 1);
            else if (entry.name === "pnpm-workspace.yaml") found.push(dir);
        }
    };
    if (existsSync(join(root, "pnpm-workspace.yaml"))) found.push(root);
    walk(root, 0);
    if (found.length !== 1) {
        throw new Error(
            `Expected exactly one pnpm-workspace.yaml under ${root}; found ${String(found.length)}.`,
        );
    }
    return found[0];
}

/**
 * The `packages:` globs, read with a flat line scan.
 *
 * The same style `workflowTemplateSafety.ts` already uses, and for the same
 * reason: this is a two-key document, and taking on a YAML dependency to read it
 * would be a dependency the build has to carry forever.
 */
function readWorkspaceGlobs(workspaceRoot) {
    const text = readFileSync(join(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
    const globs = [];
    let inPackages = false;
    for (const raw of text.split(/\r?\n/)) {
        if (/^packages:\s*$/.test(raw)) {
            inPackages = true;
            continue;
        }
        if (inPackages) {
            const item = /^\s*-\s*(.+?)\s*$/.exec(raw);
            if (item) {
                globs.push(item[1].replace(/^["']|["']$/g, ""));
                continue;
            }
            if (raw.trim() !== "") break;
        }
    }
    if (globs.length === 0) throw new Error("pnpm-workspace.yaml declared no packages.");
    return globs;
}

/** Expands the simple `dir/*` globs pnpm workspaces actually use. */
function expandGlobs(workspaceRoot, globs) {
    const dirs = [];
    for (const glob of globs) {
        if (glob.endsWith("/*")) {
            const parent = join(workspaceRoot, glob.slice(0, -2));
            if (!existsSync(parent)) continue;
            for (const entry of readdirSync(parent, { withFileTypes: true })) {
                if (entry.isDirectory()) dirs.push(join(parent, entry.name));
            }
        } else {
            const exact = join(workspaceRoot, glob);
            if (existsSync(exact) && statSync(exact).isDirectory()) dirs.push(exact);
        }
    }
    return dirs;
}

/** Every workspace package, keyed by the name in its own package.json. */
function readPackages(workspaceRoot) {
    const byName = new Map();
    for (const dir of expandGlobs(workspaceRoot, readWorkspaceGlobs(workspaceRoot))) {
        const manifest = join(dir, "package.json");
        if (!existsSync(manifest)) continue;
        const pkg = readJson(manifest);
        if (typeof pkg.name === "string") byName.set(pkg.name, dir);
    }
    return byName;
}

/**
 * Locates a package by name, and fails loudly rather than guessing.
 *
 * A missing package is a real change somebody made, and the workflows are about
 * to be generated from this answer - a silent fallback would bake the wrong path
 * into YAML that then fails minutes into a run, far from the cause.
 */
function requirePackage(byName, name) {
    const dir = byName.get(name);
    if (dir === undefined) {
        throw new Error(
            `No workspace package is named ${name}. If it was renamed, update scripts/workflow-manifest.mjs; ` +
                `if it moved, nothing here needs to change.`,
        );
    }
    return dir;
}

/**
 * Reads the electron-builder config by requiring it.
 *
 * Requiring rather than parsing, deliberately. Its module body only deletes some
 * `CSC_*` environment variables and defines two hook functions that are never
 * called at load; `module.exports` is a static object literal. A regex parse
 * would have to re-implement string escaping and would silently miss the day
 * somebody computes one of these values. The env mutation is contained by
 * snapshotting and restoring around the call, so importing this module into a
 * test process cannot leak it.
 */
function readBuilderConfig(appDir) {
    const before = { ...process.env };
    try {
        const require_ = createRequire(import.meta.url);
        return require_(join(appDir, "electron-builder.config.cjs"));
    } finally {
        for (const key of Object.keys(process.env)) {
            if (!(key in before)) delete process.env[key];
        }
        Object.assign(process.env, before);
    }
}

/** The major Node version `engines.node` actually demands. */
function readNodeMajor(workspaceRoot) {
    const engines = readJson(join(workspaceRoot, "package.json")).engines;
    const raw = engines?.node;
    if (typeof raw !== "string") throw new Error("The workspace root declares no engines.node.");
    const major = /(\d+)/.exec(raw);
    if (major === null) throw new Error(`engines.node is not a version range: ${raw}`);
    return major[1];
}

/**
 * The managed workflow file names, taken from the packaging config.
 *
 * These are currently stated twice - once as an `extraResources` filter and once
 * as `CI_WORKFLOW_FILE_NAMES` - and two lists of the same thing are two lists
 * that will disagree. This reads the packaging one, which is the copy that
 * decides what actually ships inside the installer.
 */
function readManagedWorkflows(builder, appDir, repoRoot) {
    const resources = Array.isArray(builder.extraResources) ? builder.extraResources : [];
    const entry = resources.find((item) => item !== null && typeof item === "object" && item.to === "workflows");
    if (entry === undefined) return { sourceDir: null, files: [] };
    const sourceDir = posix(repoRoot, resolve(appDir, String(entry.from)));
    const files = (Array.isArray(entry.filter) ? entry.filter : [])
        .filter((value) => typeof value === "string" && value.endsWith(".yml"))
        .sort();
    return { sourceDir, files };
}

/** Everything the workflows need, discovered from the repository as it is now. */
export function readWorkflowManifest({ repoRoot = REPO_ROOT } = {}) {
    const workspaceRoot = findWorkspaceRoot(repoRoot);
    const byName = readPackages(workspaceRoot);

    const appDir = requirePackage(byName, "@worldlens/app");
    const builder = readBuilderConfig(appDir);
    const managed = readManagedWorkflows(builder, appDir, repoRoot);

    const appDirRelative = posix(repoRoot, appDir);
    return Object.freeze({
        workspaceRoot: posix(repoRoot, workspaceRoot),
        packageManagerFile: `${posix(repoRoot, workspaceRoot)}/package.json`,
        nodeMajor: readNodeMajor(workspaceRoot),

        appDir: appDirRelative,
        appPackageJson: `${appDirRelative}/package.json`,
        siteDir: posix(repoRoot, requirePackage(byName, "@worldlens/site")),
        cliDir: posix(repoRoot, requirePackage(byName, "@worldlens/cli")),
        worldgenDir: posix(repoRoot, requirePackage(byName, "@worldlens/worldgen")),

        productName: String(builder.productName ?? ""),
        appId: String(builder.appId ?? ""),
        winArtifactName: String(builder.squirrelWindows?.artifactName ?? builder.win?.artifactName ?? ""),

        managedWorkflowDir: managed.sourceDir,
        managedWorkflowFiles: Object.freeze(managed.files),
    });
}

function main(argv) {
    const manifest = readWorkflowManifest();
    if (argv.includes("--json")) {
        process.stdout.write(`${JSON.stringify(manifest, null, 4)}\n`);
        return;
    }
    if (argv.includes("--github-output")) {
        // One `key=value` per line, which is the shape a job's `outputs` wants.
        for (const [key, value] of Object.entries(manifest)) {
            if (Array.isArray(value)) continue;
            const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
            process.stdout.write(`${kebab}=${String(value)}\n`);
        }
        return;
    }
    for (const [key, value] of Object.entries(manifest)) {
        process.stdout.write(`${key.padEnd(20)} ${Array.isArray(value) ? value.join(", ") : String(value)}\n`);
    }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    main(process.argv.slice(2));
}
