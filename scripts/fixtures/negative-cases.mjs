#!/usr/bin/env node
// Negative-case evidence for the Chunker round-trip pipeline: corrupt input, invalid
// configuration, interruption mid-conversion, and (best-effort) storage exhaustion.
// Every case records exact evidence and asserts the pipeline reports FAILURE - never a
// bare "exit code zero" or "output folder is non-empty" treated as success.
//
// Usage: node scripts/fixtures/negative-cases.mjs --world <small-java-world> --work <scratch-dir> --jar <jar> [--out <report.json>]
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readWorldChunks } from "./lib/anvil-reader.mjs";

function parseArgs(argv) {
    const options = { world: null, work: null, jar: null, java: "java", out: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => argv[++i];
        if (arg === "--world") options.world = resolve(next());
        else if (arg === "--work") options.work = resolve(next());
        else if (arg === "--jar") options.jar = resolve(next());
        else if (arg === "--java") options.java = next();
        else if (arg === "--out") options.out = resolve(next());
        else throw new Error("Unknown argument: " + arg);
    }
    if (options.world === null || options.work === null || options.jar === null) {
        throw new Error("--world, --work and --jar are required");
    }
    return options;
}

function run(java, args, { killAfterMs } = {}) {
    return new Promise((resolvePromise) => {
        const child = spawn(java, args, { windowsHide: true });
        let stdout = "";
        let stderr = "";
        let killed = false;
        const killTimer = killAfterMs !== undefined
            ? setTimeout(() => { killed = true; child.kill("SIGKILL"); }, killAfterMs)
            : null;
        child.stdout.on("data", (c) => { stdout += c.toString("utf8"); });
        child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
        child.on("close", (code, signal) => {
            if (killTimer) clearTimeout(killTimer);
            resolvePromise({ exitCode: code, signal, killed, stdout, stderr });
        });
        child.on("error", (error) => {
            if (killTimer) clearTimeout(killTimer);
            resolvePromise({ exitCode: null, signal: null, killed: false, spawnError: String(error?.message ?? error), stdout, stderr });
        });
    });
}

async function directoryExistsWithFiles(dir) {
    try {
        const { readdir } = await import("node:fs/promises");
        const entries = await readdir(dir, { recursive: true });
        return entries.length > 0;
    } catch {
        return false;
    }
}

/** Case 1: truncate one region file in a copy of the world, then run Chunker on it. */
async function caseCorruptInput(options) {
    const dir = join(options.work, "case-corrupt-input");
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const input = join(dir, "input");
    await cp(options.world, input, { recursive: true });
    const chunks = await readWorldChunks(input);
    const before = chunks.size;
    const { readdir, truncate } = await import("node:fs/promises");
    const regionFiles = await readdir(join(input, "region"));
    const target = join(input, "region", regionFiles[0]);
    const originalSize = (await stat(target)).size;
    await truncate(target, Math.floor(originalSize / 3)); // sever mid-chunk-table

    const output = join(dir, "output");
    const result = await run(options.java, ["-jar", options.jar, "-i", input, "-f", "BEDROCK_1_20_80", "-o", output]);
    const outputExists = await directoryExistsWithFiles(output);
    // Whatever Chunker does with a truncated region file - refuse it, or silently skip
    // the damaged chunks - the truth is decided by re-reading the *world*, never by the
    // process exit code alone: a 0 exit with fewer chunks recovered is still a failure
    // to preserve the original data, which is exactly what this case exists to catch.
    let recoveredChunks = null;
    let recoverError = null;
    try {
        recoveredChunks = outputExists ? (await readWorldChunks(output)).size : 0;
    } catch (error) {
        recoverError = String(error?.message ?? error);
    }
    const dataLoss = recoveredChunks === null || recoveredChunks < before;
    return {
        name: "corrupt-input-truncated-region",
        truncatedFile: regionFiles[0], originalSize, truncatedSize: Math.floor(originalSize / 3),
        chunksBeforeCorruption: before, exitCode: result.exitCode, recoveredChunks, recoverError,
        verdictIsFailure: result.exitCode !== 0 || dataLoss,
        note: "A non-zero exit OR fewer recovered chunks than the pristine input both count as failure; a 0 exit with full chunk recovery would mean Chunker silently repaired real corruption, which would need separate verification before being trusted.",
    };
}

/** Case 2: hand Chunker a malformed -c converter-settings JSON file. */
async function caseInvalidConfiguration(options) {
    const dir = join(options.work, "case-invalid-config");
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const badConfig = join(dir, "converter-settings.json");
    await writeFile(badConfig, "{ this is not valid json ,,, ]"); // deliberately malformed
    const output = join(dir, "output");
    const result = await run(options.java, [
        "-jar", options.jar, "-i", options.world, "-f", "BEDROCK_1_20_80", "-o", output, "-c", badConfig,
    ]);
    const outputExists = await directoryExistsWithFiles(output);
    return {
        name: "invalid-converter-settings-json",
        exitCode: result.exitCode, stderrTail: result.stderr.slice(-2000), outputProduced: outputExists,
        verdictIsFailure: result.exitCode !== 0,
        note: "Malformed -c JSON must be refused before any output is trusted; an empty or partial output directory does not itself prove failure, the non-zero exit does.",
    };
}

/** Case 3: kill the JVM mid-conversion, then verify the partial output is reported as partial. */
async function caseInterruptedMidConversion(options) {
    const dir = join(options.work, "case-interrupted");
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const output = join(dir, "output");
    // Kill fast and deterministically: the JVM needs real wall time just to start, so a
    // short-but-nonzero delay reliably lands inside the conversion rather than before it
    // even opens the jar (verified against this fixture's own small worlds).
    const result = await run(options.java, ["-jar", options.jar, "-i", options.world, "-f", "BEDROCK_1_20_80", "-o", output], { killAfterMs: 150 });
    const before = (await readWorldChunks(options.world)).size;
    const outputExists = await directoryExistsWithFiles(output);
    let recoveredChunks = 0;
    if (outputExists) {
        try { recoveredChunks = (await readWorldChunks(output)).size; } catch { recoveredChunks = null; }
    }
    const isPartial = result.killed && (recoveredChunks === null || recoveredChunks < before);
    return {
        name: "interrupted-mid-conversion",
        killed: result.killed, exitCode: result.exitCode, signal: result.signal,
        chunksInSource: before, recoveredChunks, outputExists,
        verdictIsFailure: result.exitCode !== 0 || isPartial,
        note: "A killed JVM must never be reported as a successful conversion; partial or absent output after SIGKILL is the expected, correctly-detected failure state.",
    };
}

/** Case 4 (best-effort): a destination with essentially no free space. */
async function caseStorageExhaustion(options) {
    // A genuine size-limited volume (subst'd drive, tmpfs) needs elevated/privileged
    // setup this pig's lane does not have on this host. Best-effort substitute that is
    // still a real, honest test: point the output at a path whose parent does not exist
    // and is not creatable (a file, not a directory, sitting where a directory is
    // needed), which exercises the same "cannot write output" failure path.
    const dir = join(options.work, "case-storage");
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const blocker = join(dir, "blocks-output");
    await writeFile(blocker, "not a directory");
    const output = join(blocker, "output"); // blocker exists as a FILE, not a dir
    const result = await run(options.java, ["-jar", options.jar, "-i", options.world, "-f", "BEDROCK_1_20_80", "-o", output]);
    return {
        name: "storage-exhaustion-best-effort-unwritable-destination",
        exitCode: result.exitCode, stderrTail: result.stderr.slice(-2000),
        verdictIsFailure: result.exitCode !== 0,
        note: "A genuine size-limited volume needs host-level privileges this lane does not have; this substitutes an unwritable destination (a file occupying the required output directory's path) to exercise the same write-failure path honestly, and says so rather than claiming full storage-exhaustion coverage.",
        limitation: "not a genuine disk-full simulation - see note",
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    await mkdir(options.work, { recursive: true });
    const cases = [];
    for (const runCase of [caseCorruptInput, caseInvalidConfiguration, caseInterruptedMidConversion, caseStorageExhaustion]) {
        const result = await runCase(options);
        cases.push(result);
        process.stderr.write("[" + result.name + "] verdictIsFailure=" + result.verdictIsFailure + "\n");
    }
    const allCorrectlyFailed = cases.every((c) => c.verdictIsFailure);
    const report = { startedAt: new Date().toISOString(), options, cases, allCorrectlyFailed };
    const json = JSON.stringify(report, null, 2) + "\n";
    if (options.out !== null) await writeFile(options.out, json);
    process.stdout.write(json);
    process.exitCode = allCorrectlyFailed ? 0 : 1;
}

main().catch((error) => {
    process.stderr.write("negative-cases failed: " + (error?.stack ?? String(error)) + "\n");
    process.exitCode = 1;
});
