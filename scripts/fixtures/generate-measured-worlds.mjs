#!/usr/bin/env node
// Generates the two large deterministic world fixtures (>= 1,000,000,000 and
// >= 10,000,000,000 decimal bytes of source-folder) via @worldlens/worldgen's
// generateMeasuredWorld, and writes a provenance manifest beside each.
//
// Usage:
//   node scripts/fixtures/generate-measured-worlds.mjs --out <dir> [--only small|large] [--resume]
//
// Scratch destinations must live outside the repository (see the fixture task's
// scratch-directory rule); this script never writes inside the checkout.
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { generateMeasuredWorld } from "../../design/packages/worldgen/dist/measuredWorld.js";

const FIXTURES = [
    { key: "small", name: "fixture-1gb-seed-1001", seed: 1001, targetBytes: 1_000_000_000 },
    { key: "large", name: "fixture-10gb-seed-2002", seed: 2002, targetBytes: 10_000_000_000 },
];

function parseArgs(argv) {
    let out = null;
    let only = null;
    let resume = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--out") out = argv[++i];
        else if (arg === "--only") only = argv[++i];
        else if (arg === "--resume") resume = true;
        else throw new Error("Unknown argument: " + arg);
    }
    if (out === null) throw new Error("--out <dir> is required");
    return { out: resolve(out), only, resume };
}

function generatorCommit() {
    try {
        return execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" }).trim();
    } catch (error) {
        return "unknown (" + String(error?.message ?? error) + ")";
    }
}

async function main() {
    const { out, only, resume } = parseArgs(process.argv.slice(2));
    await mkdir(out, { recursive: true });
    const commit = generatorCommit();
    const targets = FIXTURES.filter((f) => only === null || f.key === only);
    const summaries = [];

    for (const fixture of targets) {
        const startedAt = new Date().toISOString();
        const started = Date.now();
        let lastLog = 0;
        process.stderr.write(
            "[" + fixture.key + "] generating seed=" + fixture.seed + " target=" + fixture.targetBytes + " bytes into " + out + "\n",
        );
        const result = await generateMeasuredWorld({
            seed: fixture.seed,
            name: fixture.name,
            outDir: out,
            targetBytes: fixture.targetBytes,
            resume,
            onProgress: (progress) => {
                const now = Date.now();
                if (now - lastLog < 5000) return;
                lastLog = now;
                process.stderr.write(
                    "  [" + fixture.key + "] " + progress.bytes + " / " + progress.targetBytes +
                        " bytes, " + progress.chunkCount + " chunks, " + progress.regionCount + " regions\n",
                );
            },
        });
        const finishedAt = new Date().toISOString();
        const elapsedSeconds = (Date.now() - started) / 1000;

        const provenance = {
            schema: 1,
            fixtureKey: fixture.key,
            name: fixture.name,
            seed: fixture.seed,
            format: "1.20.4",
            dataVersion: 3700,
            generatorCommit: commit,
            generatorPackage: "@worldlens/worldgen",
            targetBytes: fixture.targetBytes,
            actualBytes: result.bytes,
            overshootBytes: result.overshootBytes,
            regionCount: result.regionCount,
            chunkCount: result.chunkCount,
            cancelled: result.cancelled,
            worldFolder: result.worldFolder,
            manifestPath: result.manifestPath,
            manifestSha256: result.manifestSha256,
            startedAt,
            finishedAt,
            elapsedSeconds,
        };
        const provenancePath = join(out, fixture.name + ".provenance.json");
        await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + "\n");
        process.stderr.write(
            "[" + fixture.key + "] done: " + result.bytes + " bytes (overshoot " + result.overshootBytes +
                "), " + result.chunkCount + " chunks, " + result.regionCount + " regions, " +
                elapsedSeconds.toFixed(1) + "s -> " + provenancePath + "\n",
        );
        summaries.push(provenance);
    }

    process.stdout.write(JSON.stringify(summaries, null, 2) + "\n");
}

main().then(
    () => { process.exitCode = 0; },
    (error) => {
        process.stderr.write("generate-measured-worlds failed: " + (error?.stack ?? String(error)) + "\n");
        process.exitCode = 1;
    },
);
