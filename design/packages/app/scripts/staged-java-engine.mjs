import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

import { verifyJarFile } from "./jar-verifier.mjs";

export const STAGED_JAVA_ENGINE_SCHEMA = 1;
export const BLUEMAP_SOURCE_REPOSITORY = "https://github.com/BlueMap-Minecraft/BlueMap";
export const MAX_STAGED_JAVA_BYTES = 512 * 1024 * 1024;

/**
 * Validate the manifest and the physical CLI jar that electron-builder is about
 * to copy. The packager must not trust an index, a filename, or a hash alone.
 * This is shared by local packaging and the CI staging command so the two routes
 * cannot quietly grow different acceptance rules.
 */
export async function validateStagedJavaEngine(staging, options = {}) {
    const root = resolve(staging);
    const manifestPath = join(root, "manifest.json");
    let manifest;
    try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
        throw new Error(`Cannot package with an unreadable BlueMap CLI manifest: ${String(error)}`);
    }

    const source = assertManifestShape(manifest, manifestPath);
    if (options.expectedVersion !== undefined && source.version !== options.expectedVersion) {
        throw new Error(
            `Cannot package a stale BlueMap CLI manifest: expected version ${options.expectedVersion}, got ${source.version}`,
        );
    }
    if (options.expectedCommit !== undefined && source.commit !== options.expectedCommit) {
        throw new Error(
            `Cannot package a BlueMap CLI manifest from commit ${source.commit}; expected ${options.expectedCommit}`,
        );
    }

    const cliEntries = manifest.jars.filter((entry) => entry.implementation === "cli");
    if (cliEntries.length !== 1) {
        throw new Error(`Cannot package without exactly one staged BlueMap CLI manifest entry: ${manifestPath}`);
    }
    const cli = cliEntries[0];
    assertJarRecord(cli, source, manifestPath);
    const jarPath = resolve(root, cli.fileName);
    if (!isChildPath(root, jarPath)) {
        throw new Error(`Cannot package a staged BlueMap CLI path outside the staging directory: ${cli.fileName}`);
    }

    const verification = await verifyJarFile(jarPath, { root });
    if (!verification.ok) {
        throw new Error(`Cannot package an invalid staged BlueMap CLI JAR: ${verification.reason}`);
    }
    if (verification.size !== cli.size || verification.sha256 !== cli.sha256) {
        throw new Error(
            `Cannot package a staged BlueMap CLI jar whose size or SHA-256 differs from its manifest: ${jarPath}`,
        );
    }

    return { manifest, source, cli, jarPath };
}

function assertManifestShape(manifest, manifestPath) {
    if (manifest === null || typeof manifest !== "object" || manifest.schemaVersion !== STAGED_JAVA_ENGINE_SCHEMA) {
        throw new Error(`Cannot package with an unsupported BlueMap CLI manifest schema: ${manifestPath}`);
    }
    const source = manifest.source;
    if (
        source === null ||
        typeof source !== "object" ||
        source.repository !== BLUEMAP_SOURCE_REPOSITORY ||
        !/^[0-9a-f]{40}$/i.test(source.commit) ||
        source.path !== "vendor/BlueMap" ||
        typeof source.version !== "string" ||
        !/^\d+\.\d+(?:[-.][0-9A-Za-z.-]+)*$/.test(source.version)
    ) {
        throw new Error(`Cannot package without complete BlueMap source provenance: ${manifestPath}`);
    }
    if (!Array.isArray(manifest.jars) || manifest.jars.length === 0) {
        throw new Error(`Cannot package without a complete staged BlueMap CLI manifest: ${manifestPath}`);
    }
    return source;
}

function assertJarRecord(entry, source, manifestPath) {
    const expectedFile = `bluemap-${source.version}-cli.jar`;
    if (
        entry.version !== source.version ||
        entry.fileName !== expectedFile ||
        !Number.isSafeInteger(entry.size) ||
        entry.size <= 0 ||
        !/^[0-9a-f]{64}$/.test(entry.sha256)
    ) {
        throw new Error(`Cannot package with a mismatched BlueMap CLI filename, version, size, or SHA-256: ${manifestPath}`);
    }
    if (basename(entry.fileName) !== entry.fileName || entry.fileName.includes("\\")) {
        throw new Error(`Cannot package a staged BlueMap CLI path containing traversal: ${entry.fileName}`);
    }
    if (
        entry.source === null ||
        typeof entry.source !== "object" ||
        entry.source.repository !== source.repository ||
        entry.source.commit !== source.commit ||
        entry.source.path !== source.path
    ) {
        throw new Error(`Cannot package without matching BlueMap CLI artifact provenance: ${manifestPath}`);
    }
}

function isChildPath(root, candidate) {
    const distance = relative(root, candidate);
    return distance.length > 0 && distance !== ".." && !distance.startsWith(`..${sep}`);
}

export async function hashFile(path, options = {}) {
    const maxBytes = options.maxBytes ?? MAX_STAGED_JAVA_BYTES;
    const before = await stat(path);
    if (!before.isFile()) throw new Error(`hash target is not a regular file: ${path}`);
    if (before.size > maxBytes) throw new Error(`hash target exceeds the ${maxBytes}-byte limit: ${path}`);

    const hash = createHash("sha256");
    let size = 0;
    const stream = createReadStream(path, { highWaterMark: 1024 * 1024 });
    try {
        for await (const chunk of stream) {
            size += chunk.length;
            if (size > maxBytes) throw new Error(`hash target exceeded the ${maxBytes}-byte limit while reading: ${path}`);
            hash.update(chunk);
        }
    } finally {
        stream.destroy();
    }
    const after = await stat(path);
    if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs
    ) {
        throw new Error(`hash target changed while it was being read: ${path}`);
    }
    return { size, sha256: hash.digest("hex") };
}
