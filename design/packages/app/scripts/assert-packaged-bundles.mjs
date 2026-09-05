#!/usr/bin/env node
/**
 * assert-packaged-bundles.mjs - prove the runtimes are in the packaged output, not the config.
 *
 * ## Why this exists, exactly
 *
 * `electron-builder.config.cjs` has listed `dist/bundled` in `extraResources` for as long as
 * the staging script has existed, and v1.0.2026's installer really does carry
 * `resources/bundled/chunker/chunker-cli-1.19.1.jar`. None of that was ever in doubt, and none
 * of it helped: the app could not see the file, so every install said the converter was not
 * installed while holding thirty megabytes of it. A green packaging log proves a file was
 * copied; it never proves anything can find it.
 *
 * So this checks the **result**. It opens the directory electron-builder actually produced,
 * finds each promised runtime at the exact path the running app will look at, and hashes the
 * Chunker jar against the digest committed in `bundled-runtimes.manifest.json`. A missing or
 * altered file fails the build, because an installer that promises a runtime it does not
 * contain fails on a stranger's machine instead of on this one.
 *
 * It deliberately does not read `dist/bundled`. Asserting against the staging directory would
 * pass on exactly the build where `extraResources` had been edited away, which is the build
 * this guard exists for.
 *
 * Usage:
 *   node scripts/assert-packaged-bundles.mjs <resources-directory>
 *   node scripts/assert-packaged-bundles.mjs            # finds release/win-unpacked/resources
 *
 * It is also called from `afterPack` in the packaging config, so an ordinary `pnpm make`
 * cannot skip it by forgetting a step.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(appRoot, "bundled-runtimes.manifest.json");

const log = (message) => process.stdout.write(`[assert-packaged-bundles] ${message}\n`);

async function sha256OfFile(path) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}

/**
 * Reads the committed pin.
 *
 * Read rather than duplicated so this script and `src/main/bedrock/chunker.ts` cannot come to
 * disagree about which converter the release contains - two copies of a digest is two digests.
 */
export async function readBundledRuntimeManifest(path = manifestPath) {
    const manifest = JSON.parse(await readFile(path, "utf8"));
    if (manifest?.schemaVersion !== 1) {
        throw new Error(`${path}: unsupported schemaVersion ${String(manifest?.schemaVersion)}`);
    }
    for (const key of ["chunker", "java"]) {
        const entry = manifest[key];
        if (typeof entry?.packagedPath !== "string" || entry.packagedPath.length === 0) {
            throw new Error(`${path}: ${key}.packagedPath is missing`);
        }
    }
    if (typeof manifest.chunker.sha256 !== "string" || manifest.chunker.sha256.length !== 64) {
        throw new Error(`${path}: chunker.sha256 must be a 64-character SHA-256`);
    }
    return manifest;
}

/**
 * Checks one packaged resources directory. Returns the rows it proved; throws on the first
 * thing that is absent, the wrong size, or the wrong bytes.
 */
export async function assertPackagedBundles(resourcesDirectory, options = {}) {
    const manifest = options.manifest ?? (await readBundledRuntimeManifest());
    const root = resolve(resourcesDirectory);
    const proved = [];

    for (const [name, entry] of Object.entries({ chunker: manifest.chunker, java: manifest.java })) {
        const file = join(root, ...entry.packagedPath.split("/"));
        let size;
        try {
            const stats = await stat(file);
            if (!stats.isFile()) throw new Error("not a file");
            size = stats.size;
        } catch (error) {
            throw new Error(
                `The packaged application is missing its bundled ${name}: ${file} ` +
                    `(${error instanceof Error ? error.message : String(error)}). ` +
                    "The installer would ship without it and the app would report the runtime as " +
                    "absent on every machine. Run scripts/stage-bundled-runtimes.mjs and check " +
                    "that electron-builder's extraResources still copies dist/bundled.",
            );
        }

        if (typeof entry.sizeBytes === "number" && size !== entry.sizeBytes) {
            throw new Error(
                `Packaged ${name} is ${String(size)} bytes; the manifest pins ${String(entry.sizeBytes)}: ${file}`,
            );
        }

        // Only the jar is hashed. The JRE is a tree of thousands of files whose archive digest
        // the staging script already verified before extracting it; re-hashing every file here
        // would add minutes to a packaging run to re-answer a question already answered.
        if (name === "chunker") {
            const actual = await sha256OfFile(file);
            if (actual !== entry.sha256) {
                throw new Error(
                    `Packaged ${name} hashes to ${actual}, not the pinned ${entry.sha256}: ${file}. ` +
                        "Nothing is shipped from an unverified runtime.",
                );
            }
        }

        proved.push({ name, file, size });
        log(`${name.padEnd(8)} ok  ${String(size).padStart(10)} bytes  ${file}`);
    }

    return proved;
}

/** `release/win-unpacked/resources`, the directory `electron-builder --dir`/`--win` writes. */
function defaultResourcesDirectory() {
    return join(appRoot, "release", "win-unpacked", "resources");
}

async function main() {
    const target = process.argv[2] ?? defaultResourcesDirectory();
    await assertPackagedBundles(target);
    log("every bundled runtime is present in the packaged output.");
}

// `import.meta.main` is not available on the Node this repository builds with, so the entry
// check compares the resolved script path instead.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main().catch((error) => {
        process.stderr.write(
            `[assert-packaged-bundles] ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
    });
}
