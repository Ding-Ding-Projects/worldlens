#!/usr/bin/env node
/**
 * Fetch the exact JDBC jars used by the SQL cross-engine oracle.
 *
 * Maven Central is the only source. The checked-in manifest pins the coordinate,
 * expected filename, byte count, and SHA-256. A downloaded jar is first written to
 * a per-file temporary name, verified, and then renamed into the output directory;
 * a bad response can therefore never replace a previously verified jar.
 *
 * Usage:
 *   node tools/oracle/driver-fetch/fetch-drivers.mjs
 *   node tools/oracle/driver-fetch/fetch-drivers.mjs --check
 *   node tools/oracle/driver-fetch/fetch-drivers.mjs --driver postgresql --output <dir>
 */

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, rename, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "driver-manifest.json");
const GRADLE_PATH = join(HERE, "build.gradle.kts");
const DEFAULT_OUTPUT = join(HERE, "build", "drivers");
const MAX_DRIVER_BYTES = 64 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;

function fail(message) {
    throw new Error(`[fetch-drivers] ${message}`);
}

async function loadManifest() {
    let manifest;
    try {
        manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    } catch (error) {
        fail(`cannot read ${MANIFEST_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (manifest?.schemaVersion !== 1 || typeof manifest.repository !== "string")
        fail("manifest schemaVersion must be 1 and repository must be a string");
    if (!/^https:\/\/repo1\.maven\.org\/maven2\/?$/.test(manifest.repository))
        fail("manifest repository must be the canonical HTTPS Maven Central URL");
    if (!Array.isArray(manifest.drivers) || manifest.drivers.length === 0)
        fail("manifest must contain at least one driver");
    const ids = new Set();
    for (const driver of manifest.drivers) {
        if (
            !driver ||
            typeof driver.id !== "string" ||
            !/^[a-z][a-z0-9-]*$/.test(driver.id) ||
            ids.has(driver.id) ||
            typeof driver.group !== "string" ||
            typeof driver.artifact !== "string" ||
            typeof driver.version !== "string" ||
            !/^[^/\\]+\.jar$/.test(driver.file) ||
            !/^[0-9a-f]{64}$/.test(driver.sha256) ||
            !Number.isSafeInteger(driver.bytes) ||
            driver.bytes < 1 ||
            driver.bytes > MAX_DRIVER_BYTES ||
            typeof driver.class !== "string"
        )
            fail("manifest contains an invalid or duplicate driver record");
        ids.add(driver.id);
    }
    return manifest;
}

async function assertGradleCoordinates(manifest) {
    let buildScript;
    try {
        buildScript = await readFile(GRADLE_PATH, "utf8");
    } catch (error) {
        fail(`cannot read ${GRADLE_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const declared = new Set(
        [...buildScript.matchAll(/^\s*jdbcDrivers\("([^"]+)"\)\s*$/gm)].map((match) => match[1]),
    );
    const expected = new Set(manifest.drivers.map(coordinate));
    const missing = [...expected].filter((value) => !declared.has(value));
    const extra = [...declared].filter((value) => !expected.has(value));
    if (missing.length > 0 || extra.length > 0)
        fail(`manifest/Gradle JDBC coordinate drift; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`);
}

function parseArgs(argv) {
    const options = { check: false, output: DEFAULT_OUTPUT, ids: null };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--check") options.check = true;
        else if (arg === "--output") {
            const value = argv[++index];
            if (!value) fail("--output needs a directory");
            options.output = resolve(value);
        } else if (arg === "--driver") {
            const value = argv[++index];
            if (!value) fail("--driver needs an id");
            options.ids = options.ids ?? [];
            options.ids.push(value);
        } else if (arg === "--help" || arg === "-h") {
            process.stdout.write("usage: fetch-drivers.mjs [--check] [--driver id] [--output dir]\n");
            return null;
        } else fail(`unknown argument '${arg}'`);
    }
    if (!isAbsolute(options.output)) fail("output directory must resolve to an absolute path");
    return options;
}

function artifactUrl(manifest, driver) {
    const groupPath = driver.group.split(".").join("/");
    return `${manifest.repository.replace(/\/$/, "")}/${groupPath}/${driver.artifact}/${driver.version}/${driver.file}`;
}

function coordinate(driver) {
    return `${driver.group}:${driver.artifact}:${driver.version}`;
}

async function digestFile(path) {
    const hash = createHash("sha256");
    let bytes = 0;
    const stream = createReadStream(path);
    stream.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_DRIVER_BYTES) stream.destroy(new Error("driver exceeds the bounded size"));
        else hash.update(chunk);
    });
    await new Promise((resolvePromise, reject) => {
        stream.on("end", resolvePromise);
        stream.on("error", reject);
    });
    return { bytes, sha256: hash.digest("hex") };
}

async function verifyFile(path, driver) {
    let info;
    try {
        info = await digestFile(path);
    } catch (error) {
        return {
            ok: false,
            reason: `${coordinate(driver)} cannot read: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    if (info.bytes !== driver.bytes)
        return { ok: false, reason: `${coordinate(driver)} byte count ${info.bytes} != ${driver.bytes}` };
    if (info.sha256 !== driver.sha256)
        return { ok: false, reason: `${coordinate(driver)} SHA-256 ${info.sha256} != ${driver.sha256}` };
    return { ok: true, ...info };
}

async function download(path, url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: "error" });
    if (!response.ok)
        fail(`${url} (${url.split("/maven2/")[1] ?? "unknown coordinate"}) returned HTTP ${response.status}`);
    const announced = response.headers.get("content-length");
    if (announced !== null && Number(announced) > MAX_DRIVER_BYTES)
        fail(`Maven Central response is larger than ${MAX_DRIVER_BYTES} bytes`);
    if (response.body === null) fail(`Maven Central returned no body for ${url}`);
    let bytes = 0;
    const limiter = new Transform({
        transform(chunk, encoding, callback) {
            bytes += chunk.length;
            if (bytes > MAX_DRIVER_BYTES) callback(new Error(`driver exceeds the bounded size of ${MAX_DRIVER_BYTES} bytes`));
            else callback(null, chunk);
        },
    });
    await pipeline(response.body, limiter, createWriteStream(path, { flags: "wx" }));
}

async function replaceManagedFile(destination, temporary, driver) {
    const backup = `${destination}.${randomUUID()}.backup`;
    let hadDestination = false;
    let installed = false;
    try {
        try {
            const existing = await lstat(destination);
            if (!existing.isFile()) fail(`${coordinate(driver)} destination is not a regular file: ${destination}`);
            hadDestination = true;
        } catch (error) {
            if (error?.code !== "ENOENT") throw error;
        }
        if (hadDestination) await rename(destination, backup);
        await rename(temporary, destination);
        installed = true;
        if (hadDestination) await rm(backup, { force: true });
    } catch (error) {
        if (!installed) {
            await rm(destination, { force: true }).catch(() => undefined);
            if (hadDestination) {
                await rename(backup, destination).catch((restoreError) => {
                    throw new Error(
                        `${coordinate(driver)} replacement failed and restoring the previous jar failed: ${
                            restoreError instanceof Error ? restoreError.message : String(restoreError)
                        }`,
                    );
                });
            }
        }
        throw error;
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options === null) return 0;
    const manifest = await loadManifest();
    await assertGradleCoordinates(manifest);
    const selected = manifest.drivers.filter((driver) => options.ids === null || options.ids.includes(driver.id));
    if (selected.length === 0) fail("no manifest drivers matched --driver");
    await mkdir(options.output, { recursive: true });
    let bad = false;
    for (const driver of selected) {
        const destination = join(options.output, driver.file);
        const existing = await verifyFile(destination, driver);
        if (existing.ok) {
            process.stdout.write(`[fetch-drivers] verified ${coordinate(driver)} (${existing.bytes} bytes)\n`);
            continue;
        }
        if (options.check) {
            process.stderr.write(`[fetch-drivers] ${coordinate(driver)} at ${destination}: ${existing.reason}\n`);
            bad = true;
            continue;
        }
        const temporary = `${destination}.${randomUUID()}.part`;
        try {
            process.stdout.write(`[fetch-drivers] fetching ${coordinate(driver)} from Maven Central\n`);
            await download(temporary, artifactUrl(manifest, driver));
            const downloaded = await verifyFile(temporary, driver);
            if (!downloaded.ok) fail(`${driver.id} verification failed: ${downloaded.reason}`);
            // Windows cannot replace an existing destination with rename() while a
            // scanner has it open. Keep the old jar in a sibling backup until the
            // verified replacement is installed, so a failed final rename never
            // destroys the last usable driver.
            await replaceManagedFile(destination, temporary, driver);
            process.stdout.write(
                `[fetch-drivers] verified ${coordinate(driver)} (${downloaded.bytes} bytes, ${downloaded.sha256})\n`,
            );
        } catch (error) {
            bad = true;
            process.stderr.write(`[fetch-drivers] ${driver.id}: ${error instanceof Error ? error.message : String(error)}\n`);
        } finally {
            await rm(temporary, { force: true }).catch(() => undefined);
        }
    }
    return bad ? 2 : 0;
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
});
