/**
 * assert-packaged-render-engines.mjs - prove the TypeScript engine in the packaged output runs.
 *
 * ## Why this exists, exactly
 *
 * Releases 1.0.2490 through 1.0.2502 shipped an engine nobody could start. The staging
 * directory was complete and the packaging config listed it, and electron-builder still left
 * the engine's packages out: its copy filter drops a directory named `node_modules` at the
 * root of a file set, whatever the `filter` patterns say. The manifest in those installers
 * read `"available": true`, the engine picker believed it, and every render stopped at once.
 *
 * So, like `assert-packaged-bundles.mjs`, this reads the directory electron-builder actually
 * wrote. It never looks at `dist/render-engines`: asserting against the staging directory
 * passes on exactly the build this guard exists for.
 *
 * Three things are proved about `resources/render-engines`:
 *
 * 1. every engine file and every package the manifest lists is present;
 * 2. the reinstall archive is present with the size and SHA-256 the manifest records;
 * 3. the engine's whole import graph loads in a fresh process, from a copy outside this
 *    checkout so the checkout's own `node_modules` cannot answer for it.
 *
 * Usage:
 *   node scripts/assert-packaged-render-engines.mjs <resources-directory>
 *   node scripts/assert-packaged-render-engines.mjs      # release/win-unpacked/resources
 *
 * It is also called from `afterPack`, so `pnpm make` cannot skip it by forgetting a step.
 */

import { inspectTypeScriptEngineTree, probeTypeScriptEngineTree } from "./typescript-engine-tree.mjs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const log = (message) => process.stdout.write(`[assert-packaged-render-engines] ${message}\n`);

async function sha256OfFile(path) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}

/**
 * Checks one packaged resources directory. Throws on the first thing that would stop the
 * TypeScript engine from rendering on a user's machine.
 *
 * @param {string} resourcesDirectory
 * @param {{ probe?: boolean }} [options] `probe: false` skips the load probe (tests only)
 */
export async function assertPackagedRenderEngines(resourcesDirectory, options = {}) {
    const root = join(resolve(resourcesDirectory), "render-engines");
    const inspection = await inspectTypeScriptEngineTree(root);
    if (!inspection.ok) {
        throw new Error(
            `The packaged TypeScript engine in ${root} is incomplete; missing ` +
                `${inspection.missing.join("; ")}. The installer would offer an engine that ` +
                "cannot start. Run scripts/stage-render-engines.mjs and check that electron-builder's " +
                "extraResources copies dist/render-engines as one file set, so the engine's " +
                "node_modules folder is not at the root of a file set (electron-builder drops it there).",
        );
    }

    const archive = inspection.repairArchive;
    if (archive === null) {
        throw new Error(
            `The packaged render-engine manifest in ${root} names no reinstall archive, so a ` +
                "damaged installation could not repair its TypeScript engine.",
        );
    }
    const archivePath = join(root, archive.fileName);
    let size;
    try {
        size = (await stat(archivePath)).size;
    } catch {
        throw new Error(`The packaged TypeScript engine reinstall archive is missing: ${archivePath}`);
    }
    if (size !== archive.size) {
        throw new Error(
            `The packaged reinstall archive is ${String(size)} bytes; the manifest records ` +
                `${String(archive.size)}: ${archivePath}`,
        );
    }
    const digest = await sha256OfFile(archivePath);
    if (digest !== archive.sha256) {
        throw new Error(
            `The packaged reinstall archive hashes to ${digest}, not the recorded ${archive.sha256}: ${archivePath}`,
        );
    }

    if (options.probe !== false) {
        const probe = await probeTypeScriptEngineTree(root);
        if (!probe.ok) {
            throw new Error(
                `The packaged TypeScript engine in ${root} has every listed file and still does ` +
                    `not load: ${String(probe.detail)}`,
            );
        }
    }

    log(`typescript ok  version ${String(inspection.version)}  ${root}`);
    log(`reinstall archive ok  ${String(size).padStart(10)} bytes  ${archivePath}`);
    return { root, version: inspection.version, archivePath, archiveSize: size };
}

async function main() {
    const target = process.argv[2] ?? join(appRoot, "release", "win-unpacked", "resources");
    await assertPackagedRenderEngines(target);
    log("the TypeScript engine in the packaged output is complete and loads.");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main().catch((error) => {
        process.stderr.write(
            `[assert-packaged-render-engines] ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
    });
}
