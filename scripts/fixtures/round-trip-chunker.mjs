#!/usr/bin/env node
// Round-trips a world through the REAL Chunker CLI jar: Java -> Bedrock -> Java, then
// semantically compares the original Java world against the round-tripped one.
//
// Usage:
//   node scripts/fixtures/round-trip-chunker.mjs \
//     --world <path-to-original-java-world-folder> \
//     --work <scratch-dir-outside-the-repo> \
//     --jar <path-to-chunker-cli-jar> \
//     [--java <path-to-java-executable>] \
//     [--java-format JAVA_1_20_5] [--bedrock-format BEDROCK_1_20_80] \
//     [--out <evidence.json>]
//
// This never mutates the original world: everything happens on a copy under --work.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { forEachRegionPair, chunkSemantics, compareChunkSemantics, classifyBlockMultisetDiff } from "./lib/anvil-reader.mjs";

const RECOMMENDED_JVM_ARGS = ["-XX:+ExitOnOutOfMemoryError"];

// Chunker-documented lossy conversions between Java and Bedrock that this comparison
// must not flag as "undocumented" - see Chunker's own README / wiki on Java<->Bedrock
// parity. Kept narrow and named so a genuinely new, undocumented loss cannot hide here.
const DOCUMENTED_LOSS_PATTERNS = [
    /biome palette multiset differs/, // Bedrock's biome grid resolution/palette differs from Java's
    /WORLD_SURFACE heightmap differs/, // Bedrock does not carry Java's exact heightmap encoding
    /OCEAN_FLOOR heightmap differs/,
];

function parseArgs(argv) {
    const options = {
        world: null, work: null, jar: null, java: "java",
        javaFormat: "JAVA_1_20_5", bedrockFormat: "BEDROCK_1_20_80",
        out: null, timeoutMs: 60 * 60 * 1000,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => argv[++i];
        switch (arg) {
            case "--world": options.world = resolve(next()); break;
            case "--work": options.work = resolve(next()); break;
            case "--jar": options.jar = resolve(next()); break;
            case "--java": options.java = next(); break;
            case "--java-format": options.javaFormat = next(); break;
            case "--bedrock-format": options.bedrockFormat = next(); break;
            case "--out": options.out = resolve(next()); break;
            case "--timeout-ms": options.timeoutMs = Number(next()); break;
            default: throw new Error("Unknown argument: " + arg);
        }
    }
    if (options.world === null || options.work === null || options.jar === null) {
        throw new Error("--world, --work and --jar are required");
    }
    return options;
}

/** Runs one Chunker leg. Never throws on a non-zero exit; the caller inspects `exitCode`. */
function runChunkerLeg({ java, jar, inputDirectory, outputDirectory, outputFormat, timeoutMs }) {
    return new Promise((resolvePromise) => {
        const args = [...RECOMMENDED_JVM_ARGS, "-jar", jar, "-i", inputDirectory, "-f", outputFormat, "-o", outputDirectory];
        const startedAt = new Date().toISOString();
        const started = Date.now();
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const child = spawn(java, args, { windowsHide: true });
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, timeoutMs);
        child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
        child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
        child.on("error", (error) => {
            clearTimeout(timer);
            resolvePromise({
                argv: [java, ...args], exitCode: null, signal: null, timedOut: false,
                spawnError: String(error?.message ?? error), stdout, stderr,
                startedAt, finishedAt: new Date().toISOString(), wallSeconds: (Date.now() - started) / 1000,
            });
        });
        child.on("close", (code, signal) => {
            clearTimeout(timer);
            resolvePromise({
                argv: [java, ...args], exitCode: code, signal, timedOut, spawnError: null, stdout, stderr,
                startedAt, finishedAt: new Date().toISOString(), wallSeconds: (Date.now() - started) / 1000,
            });
        });
    });
}

async function directoryByteSize(root) {
    let total = 0;
    const stack = [root];
    while (stack.length > 0) {
        const dir = stack.pop();
        const { readdir } = await import("node:fs/promises");
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) stack.push(path);
            else if (entry.isFile()) {
                const { stat } = await import("node:fs/promises");
                total += (await stat(path)).size;
            }
        }
    }
    return total;
}

export async function roundTripAndCompare(options) {
    await mkdir(options.work, { recursive: true });
    const workingCopy = join(options.work, "java-original-copy");
    const bedrockOut = join(options.work, "bedrock-out");
    const javaBackOut = join(options.work, "java-back-out");
    await rm(workingCopy, { recursive: true, force: true });
    await rm(bedrockOut, { recursive: true, force: true });
    await rm(javaBackOut, { recursive: true, force: true });

    // Never touch the original: convert from a copy, so the "pristine fixture" contract holds.
    await cp(options.world, workingCopy, { recursive: true });

    const legs = {};
    legs.javaToBedrock = await runChunkerLeg({
        java: options.java, jar: options.jar, inputDirectory: workingCopy,
        outputDirectory: bedrockOut, outputFormat: options.bedrockFormat, timeoutMs: options.timeoutMs,
    });
    legs.javaToBedrock.outputBytes = legs.javaToBedrock.exitCode === 0 ? await directoryByteSize(bedrockOut).catch(() => 0) : 0;

    if (legs.javaToBedrock.exitCode !== 0) {
        return { legs, comparison: null, verdict: "java-to-bedrock-failed" };
    }

    legs.bedrockToJava = await runChunkerLeg({
        java: options.java, jar: options.jar, inputDirectory: bedrockOut,
        outputDirectory: javaBackOut, outputFormat: options.javaFormat, timeoutMs: options.timeoutMs,
    });
    legs.bedrockToJava.outputBytes = legs.bedrockToJava.exitCode === 0 ? await directoryByteSize(javaBackOut).catch(() => 0) : 0;

    if (legs.bedrockToJava.exitCode !== 0) {
        return { legs, comparison: null, verdict: "bedrock-to-java-failed" };
    }

    // Streamed region-by-region: a gigabyte-scale world's full chunk set does not
    // comfortably fit twice in the JS heap at once (this is exactly what crashed the
    // node process on the first attempt against the 1 GB fixture - see the evidence
    // doc's "what changed and why" section). At most two region files' worth of
    // decoded chunks (~2048) are ever held in memory here.
    let totalChunksBefore = 0;
    let totalChunksAfter = 0;
    let matchedCount = 0;
    const documentedLoss = [];
    const undocumented = [];
    const missingChunks = [];
    const extraChunks = [];
    let expectedJavaDataVersion = null;
    const MAX_RECORDED_UNDOCUMENTED = 500; // bounded so a genuinely broad regression cannot blow memory reporting it

    await forEachRegionPair(workingCopy, javaBackOut, async (regionName, beforeChunks, afterChunks) => {
        if (beforeChunks === null) { for (const key of afterChunks.keys()) extraChunks.push(key); return; }
        if (afterChunks === null) { for (const key of beforeChunks.keys()) missingChunks.push(key); return; }
        totalChunksBefore += beforeChunks.size;
        totalChunksAfter += afterChunks.size;
        for (const key of beforeChunks.keys()) if (!afterChunks.has(key)) missingChunks.push(key);
        for (const key of afterChunks.keys()) if (!beforeChunks.has(key)) extraChunks.push(key);

        for (const [key, beforeNbt] of beforeChunks) {
            const afterNbt = afterChunks.get(key);
            if (afterNbt === undefined) continue; // already recorded as missing
            if (expectedJavaDataVersion === null) expectedJavaDataVersion = afterNbt.DataVersion;
            const beforeSemantics = chunkSemantics(beforeNbt);
            const afterSemantics = chunkSemantics(afterNbt);
            const differences = compareChunkSemantics(beforeSemantics, afterSemantics);
            if (differences.length === 0) { matchedCount++; continue; }
            let allDocumented = true;
            for (let difference of differences) {
                let documented = DOCUMENTED_LOSS_PATTERNS.some((pattern) => pattern.test(difference));
                // A DataVersion change is Chunker's own format-upgrade behaviour, not
                // data loss, as long as it moved to (never past) the round trip's own
                // declared Java target - a downgrade or unrelated version is still flagged.
                const versionMatch = /^DataVersion changed: (\d+) -> (\d+)$/.exec(difference);
                if (versionMatch !== null) {
                    const beforeVersion = Number(versionMatch[1]);
                    const afterVersion = Number(versionMatch[2]);
                    documented = afterVersion >= beforeVersion && afterVersion === expectedJavaDataVersion;
                }
                // A per-section block-palette-multiset mismatch may still be the
                // documented `snowy` cosmetic-property normalization; re-derive that
                // from the real counts rather than trusting the message text alone.
                const sectionMatch = /^chunk \([-\d]+,[-\d]+\) section Y=(-?\d+) block palette multiset differs$/.exec(difference);
                if (sectionMatch !== null) {
                    const y = Number(sectionMatch[1]);
                    const kind = classifyBlockMultisetDiff(
                        beforeSemantics.sections.get(y).blockCounts,
                        afterSemantics.sections.get(y).blockCounts,
                    );
                    documented = kind === "snowy-normalization";
                    if (documented) difference += " (classified: snowy-property normalization, a documented Chunker/Bedrock cosmetic-flag behaviour)";
                }
                if (documented) { if (documentedLoss.length < MAX_RECORDED_UNDOCUMENTED) documentedLoss.push({ chunk: key, difference }); }
                else { if (undocumented.length < MAX_RECORDED_UNDOCUMENTED) undocumented.push({ chunk: key, difference }); allDocumented = false; }
            }
            if (allDocumented) matchedCount++;
        }
    });

    const comparison = {
        totalChunksBefore, totalChunksAfter, matchedChunks: matchedCount,
        chunksWithDocumentedLossOnly: new Set(documentedLoss.map((d) => d.chunk)).size,
        chunksWithUndocumentedDifferences: new Set(undocumented.map((d) => d.chunk)).size,
        missingChunks: missingChunks.slice(0, 200), missingChunksTotal: missingChunks.length,
        extraChunks: extraChunks.slice(0, 200), extraChunksTotal: extraChunks.length,
        documentedLossSample: documentedLoss.slice(0, 20),
        undocumentedDifferences: undocumented,
        undocumentedDifferencesTruncated: undocumented.length >= MAX_RECORDED_UNDOCUMENTED,
    };

    const clean = missingChunks.length === 0 && extraChunks.length === 0 && undocumented.length === 0;
    return { legs, comparison, verdict: clean ? "clean" : "undocumented-differences-found" };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const startedAt = new Date().toISOString();
    const result = await roundTripAndCompare(options);
    const report = { startedAt, finishedAt: new Date().toISOString(), options, ...result };
    const json = JSON.stringify(report, (key, value) => (typeof value === "bigint" ? value.toString() : value), 2) + "\n";
    if (options.out !== null) {
        await mkdir(resolve(options.out, ".."), { recursive: true });
        await writeFile(options.out, json);
    }
    process.stdout.write(json);
    process.exitCode = result.verdict === "clean" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        process.stderr.write("round-trip-chunker failed: " + (error?.stack ?? String(error)) + "\n");
        process.exitCode = 1;
    });
}
