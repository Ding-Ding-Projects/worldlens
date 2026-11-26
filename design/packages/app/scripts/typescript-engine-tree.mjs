/**
 * typescript-engine-tree.mjs - what a usable copy of the TypeScript render engine contains.
 *
 * One description, read by three callers that must never disagree: the staging script that
 * builds the tree, the packaging check that inspects the installer's output, and the running
 * app that decides whether the copy it was installed with can render.
 *
 * ## Why the packages are checked one by one
 *
 * `tsc` leaves the engine's bare imports (`@worldlens/nbt`, `pngjs`, ...) intact, so Node
 * resolves them from `typescript/node_modules` beside the engine. Releases 1.0.2490 to
 * 1.0.2502 shipped `typescript/dist/index.js` and a manifest reading `"available": true`
 * with no `node_modules` at all, because electron-builder drops a directory of that name at
 * the root of a copied file set. The engine files were there and nothing could load them.
 * A manifest is a claim; the files it names are the evidence, so every package it lists is
 * opened here.
 */

import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Where Node looks for the engine's bare imports, relative to the render-engines root. */
export const TYPESCRIPT_ENGINE_PACKAGE_ROOT = "typescript/node_modules";

/** Packages the engine imports directly. A manifest that omits one describes another engine. */
export const TYPESCRIPT_ENGINE_REQUIRED_PACKAGES = ["@worldlens/nbt", "@worldlens/shared"];

/** Files the driver opens by path rather than by package name. */
export const TYPESCRIPT_ENGINE_REQUIRED_FILES = [
    "typescript/dist/index.js",
    "typescript/render-ts.mjs",
    "shared/dist/index.js",
];

const REPAIR_ARCHIVE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.zip$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

async function isFile(path) {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

async function isDirectory(path) {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

function isSafeRelativePath(value) {
    return (
        typeof value === "string" &&
        value.length > 0 &&
        !isAbsolute(value) &&
        !/^[a-zA-Z]:/u.test(value) &&
        !value.split(/[\\/]+/u).includes("..")
    );
}

function isSafePackageName(value) {
    return typeof value === "string" && /^(?:@[^/\\]+\/[^/\\]+|[^@/\\][^/\\]*)$/u.test(value);
}

function normalizeRelativePath(value) {
    return value.replace(/^\.\//u, "").replaceAll("\\", "/");
}

function readRepairArchive(value) {
    if (typeof value !== "object" || value === null) return null;
    const { fileName, size, sha256 } = value;
    if (typeof fileName !== "string" || !REPAIR_ARCHIVE_NAME.test(fileName)) return null;
    if (!Number.isSafeInteger(size) || size <= 0) return null;
    if (typeof sha256 !== "string" || !SHA256.test(sha256)) return null;
    return { fileName, size, sha256 };
}

/**
 * Inspect one render-engines root and name every piece of the TypeScript engine that is
 * absent. `ok` is true only when nothing is missing; `missing` is written for a person.
 *
 * @param {string} root the directory holding `manifest.json`, `typescript/` and `shared/`
 */
export async function inspectTypeScriptEngineTree(root) {
    const missing = [];
    let version = null;
    let repairArchive = null;
    let records = null;

    try {
        const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
        const engine = manifest?.engines?.typescript;
        if (manifest?.manifestVersion !== 1 || typeof engine !== "object" || engine === null) {
            missing.push("a render-engine manifest that describes the TypeScript engine (manifest.json)");
        } else {
            if (engine.available !== true) {
                missing.push("a manifest entry that marks the TypeScript engine as available");
            }
            version =
                typeof engine.version === "string" && engine.version.length > 0
                    ? engine.version
                    : "unknown";
            repairArchive = readRepairArchive(engine.repairArchive);
            if (Array.isArray(engine.packageResolution?.packages)) {
                records = engine.packageResolution.packages;
            } else {
                missing.push("the manifest's list of the packages the engine imports");
            }
        }
    } catch {
        missing.push("the render-engine manifest (manifest.json)");
    }

    for (const file of TYPESCRIPT_ENGINE_REQUIRED_FILES) {
        if (!(await isFile(join(root, file)))) missing.push(`the engine file ${file}`);
    }
    if (!(await isDirectory(join(root, "typescript", "assets")))) {
        missing.push("the engine's asset folder typescript/assets");
    }

    if (records !== null) {
        const names = new Set();
        for (const record of records) {
            const name = record?.name;
            if (
                !isSafePackageName(name) ||
                names.has(name) ||
                record.root !== `${TYPESCRIPT_ENGINE_PACKAGE_ROOT}/${name}` ||
                !isSafeRelativePath(record.main)
            ) {
                missing.push("a well-formed package list in the manifest");
                continue;
            }
            names.add(name);
            const packageRoot = join(root, record.root);
            let packageManifest;
            try {
                packageManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
            } catch {
                missing.push(`the package ${name} (${record.root})`);
                continue;
            }
            if (
                packageManifest?.name !== name ||
                !isSafeRelativePath(packageManifest.main) ||
                normalizeRelativePath(packageManifest.main) !== record.main ||
                !(await isFile(join(packageRoot, record.main)))
            ) {
                missing.push(`the entry file of the package ${name} (${record.root}/${record.main})`);
            }
        }
        for (const required of TYPESCRIPT_ENGINE_REQUIRED_PACKAGES) {
            if (!names.has(required)) missing.push(`the package ${required} in the manifest's package list`);
        }
    }

    const unique = [...new Set(missing)];
    return { ok: unique.length === 0, version, missing: unique, repairArchive };
}

/**
 * Prove the engine's whole import graph loads, by importing it in a fresh process.
 *
 * The tree is copied out of the workspace first. Node resolves a bare import by walking up
 * the directory tree, so a copy probed in place inside a checkout finds the checkout's own
 * `node_modules` and passes while carrying none of its own packages - which is the exact
 * build this check exists to stop.
 *
 * @param {string} root the render-engines root to probe
 * @param {{ execPath?: string, timeoutMs?: number }} [options]
 */
export async function probeTypeScriptEngineTree(root, options = {}) {
    const isolated = await mkdtemp(join(tmpdir(), "worldlens-engine-probe-"));
    try {
        await cp(root, isolated, {
            recursive: true,
            force: true,
            filter: (source) => !source.toLowerCase().endsWith(".zip"),
        });
        const entries = [
            join(isolated, "typescript", "dist", "index.js"),
            join(isolated, "shared", "dist", "index.js"),
        ].map((entry) => pathToFileURL(entry).href);
        const script = "for (const entry of process.argv.slice(1)) await import(entry);";
        return await new Promise((resolve) => {
            const child = spawn(
                options.execPath ?? process.execPath,
                ["--input-type=module", "-e", script, ...entries],
                { cwd: isolated, stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
            );
            let stderr = "";
            child.stderr.on("data", (chunk) => {
                if (stderr.length < 8192) stderr += String(chunk);
            });
            const timer = setTimeout(() => {
                child.kill();
                resolve({ ok: false, detail: "the engine did not finish loading in time" });
            }, options.timeoutMs ?? 120_000);
            child.on("error", (error) => {
                clearTimeout(timer);
                resolve({ ok: false, detail: String(error.message ?? error) });
            });
            child.on("exit", (code) => {
                clearTimeout(timer);
                resolve(
                    code === 0
                        ? { ok: true, detail: null }
                        : { ok: false, detail: stderr.trim().replaceAll(isolated, "<engine>") || `exit code ${String(code)}` },
                );
            });
        });
    } finally {
        await rm(isolated, { recursive: true, force: true });
    }
}
