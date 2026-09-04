#!/usr/bin/env node

/**
 * Stages the CLI artifact downloaded from the reusable BlueMap build into the
 * exact directory the app and electron-builder use in a checkout.
 *
 * The input manifest is produced by tools/describe-jars.mjs. This command is
 * the one workflow path for turning that release artifact into a packager input:
 * it verifies provenance, filename, version, bytes, digest, and JAR structure,
 * then writes the same authoritative manifest beside the copied JAR.
 */

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
    BLUEMAP_SOURCE_PATH,
    BLUEMAP_SOURCE_REPOSITORY,
    STAGED_JAVA_ENGINE_SCHEMA,
    hashFile,
} from "../design/packages/app/scripts/staged-java-engine.mjs";
import { verifyJarFile } from "../design/packages/app/scripts/jar-verifier.mjs";

function fail(message) {
    process.stderr.write(`stage-packaged-jars: ${message}\n`);
    process.exitCode = 1;
}

function parseArguments(argv) {
    const options = {
        artifactDir: null,
        manifest: null,
        stage: null,
        expectedVersion: null,
        expectedCommit: null,
        expectedRunId: null,
        expectedRunAttempt: null,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const next = () => {
            const value = argv[++index];
            if (value === undefined) throw new Error(`${argument} needs a value`);
            return value;
        };
        switch (argument) {
            case "--artifact-dir": options.artifactDir = resolve(next()); break;
            case "--manifest": options.manifest = resolve(next()); break;
            case "--stage": options.stage = resolve(next()); break;
            case "--expected-version": options.expectedVersion = next(); break;
            case "--expected-commit": options.expectedCommit = next(); break;
            case "--expected-run-id": options.expectedRunId = next(); break;
            case "--expected-run-attempt": options.expectedRunAttempt = next(); break;
            case "-h":
            case "--help":
                process.stdout.write("Usage: node scripts/stage-packaged-jars.mjs --artifact-dir <dir> --manifest <manifest.json> --stage <dir> --expected-version <version> --expected-commit <sha> --expected-run-id <run-id> --expected-run-attempt <attempt>\n");
                process.exit(0);
                break;
            default: throw new Error(`unrecognized argument '${argument}'`);
        }
    }
    for (const [name, value] of Object.entries(options)) {
        if (value === null) throw new Error(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
    }
    return options;
}

async function main() {
    let options;
    try {
        options = parseArguments(process.argv.slice(2));
        assertExpectedIdentity(options);
        const sourceManifest = JSON.parse(await readFile(options.manifest, "utf8"));
        assertReleaseManifest(sourceManifest, options);
        const cli = sourceManifest.jars.find((entry) => entry.implementation === "cli");
        const artifact = resolve(options.artifactDir, cli.fileName);
        const artifactVerification = await verifyJarFile(artifact, { root: options.artifactDir });
        if (!artifactVerification.ok) throw new Error(`downloaded CLI artifact is not a valid JAR: ${artifactVerification.reason}`);
        const actual = await hashFile(artifact);
        if (actual.size !== cli.size || actual.sha256 !== cli.sha256) {
            throw new Error(`downloaded CLI artifact does not match manifest bytes or SHA-256: ${artifact}`);
        }

        await rm(options.stage, { recursive: true, force: true });
        await mkdir(options.stage, { recursive: true });
        const destination = join(options.stage, cli.fileName);
        await copyFile(artifact, destination);
        const stagedVerification = await verifyJarFile(destination, { root: options.stage });
        if (!stagedVerification.ok || stagedVerification.size !== cli.size || stagedVerification.sha256 !== cli.sha256) {
            throw new Error(`copied CLI artifact failed the post-copy manifest check: ${destination}`);
        }

        const manifest = {
            schemaVersion: STAGED_JAVA_ENGINE_SCHEMA,
            generatedAt: sourceManifest.generatedAt,
            stagedAt: new Date().toISOString(),
            source: sourceManifest.source,
            workflow: sourceManifest.workflow ?? null,
            requiredJavaFeature: sourceManifest.requiredJavaFeature ?? null,
            jars: [cli],
        };
        await writeFile(join(options.stage, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`, "utf8");
        await writeFile(join(options.stage, "SHA256SUMS.txt"), `${cli.sha256}  ${cli.fileName}\n`, "utf8");
        process.stdout.write(`staged ${cli.fileName} (${cli.size} bytes, ${cli.sha256}) from ${cli.source.commit}\n`);
    } catch (error) {
        fail(String(error instanceof Error ? error.message : error));
    }
}

function assertExpectedIdentity(options) {
    if (
        typeof options.expectedVersion !== "string" ||
        !/^\d+\.\d+(?:[-.][0-9A-Za-z.-]+)*$/.test(options.expectedVersion)
    ) {
        throw new Error("expected BlueMap version is empty or malformed");
    }
    if (typeof options.expectedCommit !== "string" || !/^[0-9a-f]{40}$/i.test(options.expectedCommit)) {
        throw new Error("expected BlueMap source commit is empty or not a 40-hex SHA");
    }
    if (typeof options.expectedRunId !== "string" || !/^[1-9][0-9]*$/.test(options.expectedRunId)) {
        throw new Error("expected workflow run ID is empty or malformed");
    }
    if (
        typeof options.expectedRunAttempt !== "string" ||
        !/^[1-9][0-9]*$/.test(options.expectedRunAttempt)
    ) {
        throw new Error("expected workflow run attempt is empty or malformed");
    }
}

function assertReleaseManifest(manifest, options) {
    if (manifest === null || typeof manifest !== "object") throw new Error("manifest must be an object");
    if (manifest.schemaVersion !== STAGED_JAVA_ENGINE_SCHEMA) throw new Error("manifest.schemaVersion mismatch");
    if (manifest.source?.repository !== BLUEMAP_SOURCE_REPOSITORY) throw new Error("manifest.source.repository mismatch");
    if (manifest.source?.path !== BLUEMAP_SOURCE_PATH) throw new Error("manifest.source.path mismatch");
    if (manifest.source?.version !== options.expectedVersion) throw new Error("manifest.source.version mismatch");
    if (manifest.source?.commit !== options.expectedCommit) throw new Error("manifest.source.commit mismatch");
    if (manifest.workflow?.runId !== options.expectedRunId) throw new Error("manifest.workflow.runId mismatch");
    if (manifest.workflow?.runAttempt !== options.expectedRunAttempt) throw new Error("manifest.workflow.runAttempt mismatch");
    if (!Array.isArray(manifest.jars)) throw new Error("manifest.jars must be an array");
    const cliEntries = manifest.jars.filter((entry) => entry?.implementation === "cli");
    if (cliEntries.length !== 1) throw new Error("manifest.jars[implementation=cli] must contain exactly one entry");
    const cli = cliEntries[0];
    if (cli.version !== options.expectedVersion) throw new Error("manifest.jars[cli].version mismatch");
    if (cli.fileName !== `bluemap-${options.expectedVersion}-cli.jar`) throw new Error("manifest.jars[cli].fileName mismatch");
    if (!Number.isSafeInteger(cli.size) || cli.size <= 0) throw new Error("manifest.jars[cli].size is missing or invalid");
    if (!/^[0-9a-f]{64}$/.test(cli.sha256)) throw new Error("manifest.jars[cli].sha256 is missing or invalid");
    if (cli.source?.repository !== manifest.source.repository) throw new Error("manifest.jars[cli].source.repository mismatch");
    if (cli.source?.commit !== manifest.source.commit) throw new Error("manifest.jars[cli].source.commit mismatch");
    if (cli.source?.path !== manifest.source.path) throw new Error("manifest.jars[cli].source.path mismatch");
}

await main();
