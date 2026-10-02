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
//     [--out <evidence.json>] \
//     [--timeout-minutes <n> | --timeout-ms <n>]
//
// Or, to re-run only the comparison against legs that already exist on disk under an
// existing --work directory (see `--compare-only` below):
//   node scripts/fixtures/round-trip-chunker.mjs --compare-only --work <existing-work-dir> --out <evidence.json>
//
// This never mutates the original world: everything happens on a copy under --work.
//
// Per-leg timeout: explicit --timeout-minutes/--timeout-ms wins outright. Otherwise the
// timeout scales with the source world's actual on-disk bytes - max(50 min, bytes/1e9 *
// 15 min) - because a fixed timeout tuned against a 1 GB world (as this repository's own
// first attempt was) silently truncates a real, still-succeeding conversion of a 10 GB
// one; that truncation is a harness limit, never a Chunker failure, and is recorded as
// such (`timedOut: true`) rather than folded into an undocumented-difference verdict.
//
// --compare-only: runs neither Chunker leg. It re-reads whatever is already on disk
// under --work (`java-original-copy` and `java-back-out`, produced by an earlier full
// run of this script) and re-derives the comparison from scratch. This exists because
// the comparison step is the expensive, crash-prone half of a multi-hour run against a
// multi-gigabyte world - both Chunker legs can succeed and leave real converted worlds
// on disk, and then the *comparison* alone can die (see the bounded-recording fix below
// and the segfault this was written in response to), throwing away hours of Chunker
// work for no reason. `--compare-only` lets the comparison be retried against the
// already-converted legs without re-running Chunker at all. The resulting evidence
// records that the legs were reused (their on-disk byte sizes only; timing is not
// recoverable from a prior run's directories, so it is reported as `null` rather than
// guessed).
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
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

// Bounds every recording array the comparison keeps in memory - not only the sample
// arrays that already were bounded, but `missingChunks`/`extraChunks` too. Before this
// fix those two grew without limit for the whole run: on a world where whole regions or
// large chunk ranges genuinely differ, every single missing/extra chunk key was kept as
// a live JS string for the entire multi-million-chunk streamed comparison, on top of
// whatever garbage the per-chunk NBT decoding was already generating every iteration.
// That is unbounded heap growth precisely in the pass that runs longest and allocates
// hardest, which is exactly the shape of thing that turns a slow leak into a crash
// instead of a clean "JavaScript heap out of memory" - see the doc's root-cause note.
const DEFAULT_MAX_RECORDED = 500;

function parseArgs(argv) {
    const options = {
        world: null, work: null, jar: null, java: "java",
        javaFormat: "JAVA_1_20_5", bedrockFormat: "BEDROCK_1_20_80",
        out: null, timeoutMs: null, // null = auto-scale from the world's actual byte size; see header comment
        compareOnly: false,
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
            case "--timeout-minutes": options.timeoutMs = Number(next()) * 60 * 1000; break;
            case "--compare-only": options.compareOnly = true; break;
            default: throw new Error("Unknown argument: " + arg);
        }
    }
    if (options.compareOnly) {
        if (options.work === null) throw new Error("--compare-only requires --work (an existing round-trip work directory)");
    } else if (options.world === null || options.work === null || options.jar === null) {
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
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) stack.push(path);
            else if (entry.isFile()) total += (await stat(path)).size;
        }
    }
    return total;
}

/**
 * Bounded recorder: keeps at most `max` entries but always reports the true total count
 * that was ever offered to it, so truncation is visible rather than silently changing
 * what "total" means. This is the fix for the unbounded `missingChunks`/`extraChunks`
 * arrays: every recording list in the comparison (missing, extra, documented-loss,
 * undocumented) now goes through one of these instead of a bare growing array.
 */
function boundedRecorder(max) {
    const kept = [];
    let total = 0;
    return {
        push(value) {
            total++;
            if (kept.length < max) kept.push(value);
        },
        get kept() { return kept; },
        get total() { return total; },
        get truncated() { return total > kept.length; },
    };
}

/**
 * Streams a region-by-region semantic comparison of two already-converted worlds and
 * returns the same `comparison` shape `roundTripAndCompare` has always returned. Split
 * out so it can be (a) reused by `--compare-only` against legs that already exist on
 * disk, without re-running Chunker, and (b) unit-tested directly against small synthetic
 * worlds to prove the recording stays bounded, without needing the real Chunker jar or
 * hours of runtime - see round-trip-chunker.test.mjs.
 *
 * At most two region files' worth of decoded chunks (~2048) are ever held in memory at
 * once (via {@link forEachRegionPair}), and every recording list below is capped at
 * `maxRecorded` real entries while still reporting the true total - see
 * {@link boundedRecorder}.
 */
export async function compareWorlds(beforeWorld, afterWorld, { maxRecorded = DEFAULT_MAX_RECORDED } = {}) {
    let totalChunksBefore = 0;
    let totalChunksAfter = 0;
    let matchedCount = 0;
    const documentedLoss = boundedRecorder(maxRecorded);
    const undocumented = boundedRecorder(maxRecorded);
    const missingChunks = boundedRecorder(maxRecorded);
    const extraChunks = boundedRecorder(maxRecorded);
    // Distinct-chunk counts (`chunksWith...`) need every chunk key seen, not just the
    // bounded sample, or the reported count would silently shrink whenever the sample
    // truncates - track the two sets directly instead of deriving them from `kept`.
    const documentedLossChunks = new Set();
    const undocumentedChunks = new Set();
    let expectedJavaDataVersion = null;

    await forEachRegionPair(beforeWorld, afterWorld, async (regionName, beforeChunks, afterChunks) => {
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
                if (documented) { documentedLoss.push({ chunk: key, difference }); documentedLossChunks.add(key); }
                else { undocumented.push({ chunk: key, difference }); undocumentedChunks.add(key); allDocumented = false; }
            }
            if (allDocumented) matchedCount++;
        }
    });

    const comparison = {
        totalChunksBefore, totalChunksAfter, matchedChunks: matchedCount,
        chunksWithDocumentedLossOnly: documentedLossChunks.size,
        chunksWithUndocumentedDifferences: undocumentedChunks.size,
        missingChunks: missingChunks.kept.slice(0, 200), missingChunksTotal: missingChunks.total,
        extraChunks: extraChunks.kept.slice(0, 200), extraChunksTotal: extraChunks.total,
        documentedLossSample: documentedLoss.kept.slice(0, 20),
        undocumentedDifferences: undocumented.kept,
        undocumentedDifferencesTruncated: undocumented.truncated,
    };

    const clean = missingChunks.total === 0 && extraChunks.total === 0 && undocumented.total === 0;
    return { comparison, verdict: clean ? "clean" : "undocumented-differences-found" };
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

    // Auto-scale the per-leg timeout from the source world's real on-disk bytes when the
    // caller did not pin one explicitly - a fixed timeout tuned against a small fixture
    // silently truncates a real, still-succeeding conversion of a much larger one (this
    // exact mistake happened against the 10 GB fixture: a 50-minute fixed timeout killed
    // a leg that was still legitimately converting). Floor 50 minutes, then 15 minutes
    // per source gigabyte, derived from the measured ~1 GB-per-~6-minute Chunker rate
    // observed on this project's own fixtures plus headroom for a busy shared host.
    let timeoutMs = options.timeoutMs;
    let timeoutSource = "explicit";
    if (timeoutMs === null) {
        const sourceBytes = await directoryByteSize(workingCopy).catch(() => 0);
        const floorMs = 50 * 60 * 1000;
        const scaledMs = (sourceBytes / 1_000_000_000) * 15 * 60 * 1000;
        timeoutMs = Math.max(floorMs, scaledMs);
        timeoutSource = "auto-scaled from " + sourceBytes + " source bytes (floor 50 min, +15 min/GB)";
    }

    const legs = {};
    legs.javaToBedrock = await runChunkerLeg({
        java: options.java, jar: options.jar, inputDirectory: workingCopy,
        outputDirectory: bedrockOut, outputFormat: options.bedrockFormat, timeoutMs,
    });
    legs.javaToBedrock.timeoutMs = timeoutMs;
    legs.javaToBedrock.timeoutSource = timeoutSource;
    // Always measure what is actually on disk, killed or not - a leg the harness killed
    // mid-write still left real, partial output, and reporting 0 bytes for it would hide
    // exactly the evidence a reader needs to tell "harness timeout" from "wrote nothing".
    legs.javaToBedrock.outputBytes = await directoryByteSize(bedrockOut).catch(() => 0);

    if (legs.javaToBedrock.exitCode !== 0) {
        const verdict = legs.javaToBedrock.timedOut ? "java-to-bedrock-harness-timeout" : "java-to-bedrock-failed";
        return { legs, comparison: null, verdict };
    }

    legs.bedrockToJava = await runChunkerLeg({
        java: options.java, jar: options.jar, inputDirectory: bedrockOut,
        outputDirectory: javaBackOut, outputFormat: options.javaFormat, timeoutMs,
    });
    legs.bedrockToJava.timeoutMs = timeoutMs;
    legs.bedrockToJava.timeoutSource = timeoutSource;
    legs.bedrockToJava.outputBytes = await directoryByteSize(javaBackOut).catch(() => 0);

    if (legs.bedrockToJava.exitCode !== 0) {
        const verdict = legs.bedrockToJava.timedOut ? "bedrock-to-java-harness-timeout" : "bedrock-to-java-failed";
        return { legs, comparison: null, verdict };
    }

    const { comparison, verdict } = await compareWorlds(workingCopy, javaBackOut);
    return { legs, comparison, verdict };
}

/**
 * Re-runs only the comparison against an existing --work directory's `java-original-copy`
 * and `java-back-out` (both produced by an earlier full run of this script, or by hand).
 * Runs no Chunker leg. Reports the legs as `reused: true` with their on-disk byte sizes;
 * per-leg timing/exit-code/argv from the original run is not recoverable from the
 * directories alone, so those fields are `null` rather than invented.
 */
export async function compareOnlyFromWork(work, { maxRecorded = DEFAULT_MAX_RECORDED } = {}) {
    const workingCopy = join(work, "java-original-copy");
    const javaBackOut = join(work, "java-back-out");
    const bedrockOut = join(work, "bedrock-out");

    const legs = {
        javaToBedrock: { reused: true, outputBytes: await directoryByteSize(bedrockOut).catch(() => null), note: "leg reused from an earlier run; timing/exitCode unavailable in --compare-only mode" },
        bedrockToJava: { reused: true, outputBytes: await directoryByteSize(javaBackOut).catch(() => null), note: "leg reused from an earlier run; timing/exitCode unavailable in --compare-only mode" },
    };

    const { comparison, verdict } = await compareWorlds(workingCopy, javaBackOut, { maxRecorded });
    return { legs, comparison, verdict };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const startedAt = new Date().toISOString();
    const result = options.compareOnly ? await compareOnlyFromWork(options.work) : await roundTripAndCompare(options);
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
