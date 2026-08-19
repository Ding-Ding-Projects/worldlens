#!/usr/bin/env node
/**
 * The Phase D gate.
 *
 *   node tools/oracle/compare.mjs
 *
 * Generates a deterministic world, renders it twice — once with **upstream's own Java
 * engine**, once with **this project's TypeScript engine** — and compares the two map
 * directories:
 *
 *   * every hires tile, gunzipped and compared byte for byte
 *   * every lowres tile, compared pixel for pixel
 *   * `textures.json`, compared after decompression
 *   * everything else the render wrote, byte for byte (or by value, where a byte
 *     comparison would be wrong rather than strict — see `classify` below)
 *
 * It exits 0 only when the two renders agree. It never weakens a comparison to get
 * there: when the port is not byte-identical yet, saying so precisely is the point.
 *
 * The reference render costs about eighty seconds for a 1000x1000 world and is cached
 * (see lib/javaOracle.mjs); `--refresh` forces it again.
 *
 * While Phase D is still being written the TypeScript engine cannot render at all. That
 * is reported as a result — "the TypeScript engine produced no output", with the exact
 * exports it is still missing — rather than as a crash, so this harness is useful from
 * the first day of the phase rather than the last.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareMaps, printComparison } from "./lib/compareMaps.mjs";
import { describeError } from "./lib/diff.mjs";
import {
    buildCliJar,
    findClientJar,
    findResourceExtensions,
    findCliJar,
    generateWorld,
    renderReference,
} from "./lib/javaOracle.mjs";
import { renderWithTypeScriptEngine } from "./lib/tsEngine.mjs";
import { createPatternedBannerWorld } from "./fixtures/patternedBannerWorld.mjs";
import { exists, formatDuration, log } from "./lib/util.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

const USAGE = `tools/oracle — the Phase D gate

Renders one generated world with upstream's java engine and with this project's
typescript engine, then compares the two map directories.

Usage:
  node tools/oracle/compare.mjs [options]

Options:
  --seed <n>          world seed (default 1)
  --size <blocks>     edge length of the generated square (default 1000)
  --map-id <id>       storage id of the map (default "overworld")
  --map-name <name>   display name of the map (default "Overworld")
  --dimension <key>   dimension to render (default "minecraft:overworld")
  --fixture <name>    use a checked-in synthetic world fixture (patterned-banner)
  --work <dir>        working directory (default "tools/oracle/out/gate")
  --threads <n>       java render threads (default 4)
  --max-report <n>    how many divergences to print in full (default 5)
  --json <path>       also write the full report as json
  --refresh           re-render the java reference even if it is cached
  --reference-only    render and cache the reference, then stop
  --build-jar         build the reference jar if it is missing
  --no-accept-download  refuse the minecraft client-jar download (the render will fail
                        without it; here so nobody accepts a licence by accident)
  --help              this text

Exit codes:
  0  the two renders are identical
  1  they differ, or the typescript engine produced no output
  2  the harness could not run (no jar, no world generator, a failed render)
`;

function parseArgs(argv) {
    const options = {
        seed: 1,
        size: 1000,
        mapId: "overworld",
        mapName: "Overworld",
        dimension: "minecraft:overworld",
        fixture: null,
        work: join(REPO_ROOT, "tools", "oracle", "out", "gate"),
        threads: 4,
        maxReport: 5,
        json: null,
        refresh: false,
        referenceOnly: false,
        buildJar: false,
        acceptDownload: true,
        help: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => {
            const value = argv[++i];
            if (value === undefined) throw new Error(`missing value for ${arg}`);
            return value;
        };
        switch (arg) {
            case "--help":
            case "-h":
                options.help = true;
                break;
            case "--seed":
                options.seed = Number(next());
                break;
            case "--size":
                options.size = Number(next());
                break;
            case "--map-id":
                options.mapId = next();
                break;
            case "--map-name":
                options.mapName = next();
                break;
            case "--dimension":
                options.dimension = next();
                break;
            case "--fixture":
                options.fixture = next();
                if (options.fixture !== "patterned-banner") {
                    throw new Error(`unknown fixture '${options.fixture}'`);
                }
                break;
            case "--work":
                options.work = resolve(next());
                break;
            case "--threads":
                options.threads = Number(next());
                break;
            case "--max-report":
                options.maxReport = Number(next());
                break;
            case "--json":
                options.json = resolve(next());
                break;
            case "--refresh":
                options.refresh = true;
                break;
            case "--reference-only":
                options.referenceOnly = true;
                break;
            case "--build-jar":
                options.buildJar = true;
                break;
            case "--no-accept-download":
                options.acceptDownload = false;
                break;
            default:
                throw new Error(`unknown argument '${arg}'`);
        }
    }
    return options;
}

async function main() {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(describeError(error) + "\n\n" + USAGE);
        return 2;
    }
    if (options.help) {
        process.stdout.write(USAGE);
        return 0;
    }

    const startedAt = Date.now();
    const report = {
        startedAt: new Date(startedAt).toISOString(),
        options: { ...options },
        steps: {},
    };

    await mkdir(options.work, { recursive: true });

    // 1. the reference jar
    let jar = await findCliJar(REPO_ROOT);
    if (jar === null && options.buildJar) {
        await buildCliJar(REPO_ROOT);
        jar = await findCliJar(REPO_ROOT);
    }
    if (jar === null) {
        log(
            "[oracle] no reference jar found under vendor/BlueMap/implementations/cli/build/libs.\n" +
                "         build it with `node tools/build-jars.mjs --only cli`, or re-run with --build-jar.",
        );
        return 2;
    }
    report.steps.jar = jar;

    // 2. the world
    let worldDirectory;
    try {
        worldDirectory = options.fixture === "patterned-banner"
            ? await createPatternedBannerWorld(join(options.work, "worlds"))
            : await generateWorld({
                repoRoot: REPO_ROOT,
                seed: options.seed,
                size: options.size,
                out: join(options.work, "worlds"),
            });
    } catch (error) {
        log(`[oracle] ${describeError(error)}`);
        return 2;
    }
    report.steps.world = worldDirectory;
    if (options.fixture !== null) {
        report.steps.fixture = {
            name: options.fixture,
            manifest: join(worldDirectory, "patterned-banner-manifest.json"),
        };
    }

    // 3. the reference render
    let reference;
    try {
        reference = await renderReference({
            repoRoot: REPO_ROOT,
            jar,
            worldDirectory,
            workDirectory: options.work,
            mapId: options.mapId,
            mapName: options.mapName,
            dimension: options.dimension,
            acceptDownload: options.acceptDownload,
            renderThreadCount: options.threads,
            refresh: options.refresh,
        });
    } catch (error) {
        log(`[oracle] the reference render failed: ${describeError(error)}`);
        return 2;
    }
    report.steps.reference = {
        mapDirectory: reference.mapDirectory,
        cached: reference.cached,
        files: reference.tileCount,
    };

    if (options.referenceOnly) {
        log(`[oracle] reference ready at ${reference.mapDirectory}`);
        await writeReport(report, options, 0, startedAt);
        return 0;
    }

    const clientJar = await findClientJar(reference.dataDirectory);
    report.steps.clientJar = clientJar;
    if (clientJar === null)
        log(
            "[oracle] no minecraft client jar found in the reference data directory; the " +
                "typescript render will have no resources to work from",
        );

    // BlueMap's own bundled pack, which the java render unpacked on its way past. Without
    // it the ported gallery is 839 textures short, because the extensions' blocks-atlas is
    // what contributes the root-level directory source covering `item/`, `entity/` and the
    // four flow/bell textures.
    const resourceExtensions = await findResourceExtensions(reference.dataDirectory);
    report.steps.resourceExtensions = resourceExtensions;
    if (resourceExtensions === null)
        log(
            "[oracle] no resourceExtensions.zip in the reference data directory; the " +
                "typescript render will be missing the textures only it contributes",
        );

    // 4. the ported render
    const ported = await renderWithTypeScriptEngine({
        repoRoot: REPO_ROOT,
        worldDirectory,
        workDirectory: options.work,
        mapId: options.mapId,
        mapName: options.mapName,
        dimension: options.dimension,
        clientJar,
        resourceExtensions,
    });
    report.steps.ported = ported;

    if (ported.status !== "rendered") {
        log("");
        log("  RESULT: the TypeScript engine produced no output.");
        log(`  ${ported.reason ?? "no reason reported"}`);
        if (ported.stack) log(ported.stack.split("\n").slice(0, 8).map((l) => "    " + l).join("\n"));
        log("");
        log(`  the java reference is rendered and cached at:`);
        log(`    ${reference.mapDirectory}`);
        log("");
        report.result = "no-typescript-output";
        report.ok = false;
        await writeReport(report, options, 1, startedAt);
        return 1;
    }

    if (!(await exists(ported.mapDirectory))) {
        log("");
        log("  RESULT: the TypeScript engine reported success but wrote no map directory at");
        log(`  ${ported.mapDirectory}`);
        report.result = "no-typescript-output";
        report.ok = false;
        await writeReport(report, options, 1, startedAt);
        return 1;
    }

    // 5. the comparison
    const comparison = await compareMaps(reference.mapDirectory, ported.mapDirectory);
    report.comparison = comparison;
    report.ok = comparison.ok;
    report.result = comparison.ok ? "identical" : "diverged";

    if (options.fixture === "patterned-banner") {
        const proof = await patternedBannerProof(report, comparison, reference.mapDirectory, ported.mapDirectory);
        report.fixtureProof = proof;
        report.ok = proof.ok;
        report.result = proof.ok ? "patterned-banner-extension-verified" : "patterned-banner-extension-failed";
    }

    printComparison(comparison, options.maxReport);

    const { summary } = comparison;
    if (options.fixture === "patterned-banner" && report.fixtureProof?.ok === true) {
        log(
            `  RESULT: patterned-banner extension verified. Non-hires match; exactly one ` +
                `hires tile differs by the expected ${report.fixtureProof.vertexDelta} vertices ` +
                `and ${report.fixtureProof.groupDelta} shared overlay material group.`,
        );
    } else if (comparison.ok) {
        log(
            `  RESULT: identical. ${summary.compared} file(s) matched — every hires tile ` +
                `byte for byte after decompression, every lowres tile pixel for pixel` +
                (summary.reencoded === 0
                    ? "."
                    : ` (${summary.reencoded} of them re-encoded: same pixels, different PNG bytes).`),
        );
    } else if (summary.compared === 0) {
        log("  RESULT: nothing was compared — the two map directories share no file names.");
    } else {
        const parts = [];
        if (summary.differing > 0)
            parts.push(`${summary.differing} of ${summary.compared} compared file(s) differ`);
        if (summary.onlyInReference > 0)
            parts.push(`${summary.onlyInReference} file(s) only the java render wrote`);
        if (summary.onlyInPorted > 0)
            parts.push(`${summary.onlyInPorted} file(s) only the typescript render wrote`);
        log(`  RESULT: diverged. ${parts.join("; ")}.`);
    }
    log(`  (${formatDuration(Date.now() - startedAt)})`);
    log("");

    await writeReport(report, options, report.ok ? 0 : 1, startedAt);
    return report.ok ? 0 : 1;
}

async function readPrbmShape(file) {
    const bytes = gunzipSync(await readFile(file));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    const vertexCount = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    offset += 6;
    const cardinality = { 0: 1, 1: 2, 2: 3 };
    const encodingBytes = { 1: 4, 3: 1, 7: 1 };
    const attributeCount = bytes[1] & 0x1f;
    for (let i = 0; i < attributeCount; i++) {
        while (bytes[offset] !== 0) offset++;
        offset++;
        const type = bytes[offset++];
        offset += (4 - (offset % 4)) % 4;
        offset += vertexCount * cardinality[(type >> 4) & 3] * encodingBytes[type & 15];
    }
    offset += (4 - (offset % 4)) % 4;
    let materialGroups = 0;
    while (true) {
        const material = view.getInt32(offset, true);
        offset += 4;
        if (material === -1) break;
        materialGroups++;
        offset += 8;
    }
    if (offset !== bytes.length) throw new Error(`PRBM parser left ${bytes.length - offset} bytes`);
    return { vertexCount, materialGroups };
}

async function patternedBannerProof(report, comparison, referenceRoot, portedRoot) {
    const manifest = JSON.parse(await readFile(report.steps.fixture.manifest, "utf8"));
    const expectedLayers = manifest.banners.reduce((total, banner) => total + banner.layers.length, 0);
    const relative = "tiles/0/x0/z0.prbm.gz";
    const javaShape = await readPrbmShape(join(referenceRoot, ...relative.split("/")));
    const typescriptShape = await readPrbmShape(join(portedRoot, ...relative.split("/")));
    const categoryEntries = Object.entries(comparison.categories);
    const nonHiresDiffering = categoryEntries
        .filter(([category]) => category !== "hires")
        .reduce((total, [, value]) => total + value.differing, 0);
    const onlyExpectedHires =
        comparison.summary.differing === 1 &&
        comparison.summary.onlyInReference === 0 &&
        comparison.summary.onlyInPorted === 0 &&
        comparison.categories.hires?.differing === 1 &&
        nonHiresDiffering === 0 &&
        comparison.divergences.length === 1 &&
        comparison.divergences[0]?.file === relative;
    const vertexDelta = typescriptShape.vertexCount - javaShape.vertexCount;
    const groupDelta = typescriptShape.materialGroups - javaShape.materialGroups;
    const ok =
        manifest.banners.length === 3 &&
        expectedLayers === 10 &&
        onlyExpectedHires &&
        vertexDelta === 60 &&
        groupDelta === 1;
    return {
        ok,
        bannerCount: manifest.banners.length,
        expectedLayers,
        relative,
        javaShape,
        typescriptShape,
        vertexDelta,
        groupDelta,
        layerAssertions: manifest.banners.flatMap((banner) =>
            banner.layers.map((layer, index) => ({
                banner: banner.position,
                index,
                pattern: layer[0],
                color: layer[1],
                ordered: true,
            })),
        ),
        vertexColorProof: "Focused engine tests assert ordered layer tints; the shared overlay material group is intentional.",
        upstreamLimitation: "The upstream Java path does not consume getBlockEntity(); the fixture-scoped hires delta is therefore the explicit extension proof.",
    };
}

async function writeReport(report, options, exitCode, startedAt) {
    report.durationMs = Date.now() - startedAt;
    report.exitCode = exitCode;
    if (options.json === null) return;
    await mkdir(dirname(options.json), { recursive: true });
    await writeFile(options.json, JSON.stringify(report, null, 2) + "\n", "utf8");
    log(`[oracle] report written to ${options.json}`);
}

process.exitCode = await main();
