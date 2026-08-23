#!/usr/bin/env node
/**
 * stage-bundled-runtimes.mjs - put the app's runtime dependencies inside the installer.
 *
 * ## Why this exists
 *
 * The app needs a JVM to render locally and a Chunker jar to convert a Bedrock world. Until
 * this script, it fetched both at runtime: the settings screen offered "Download Java
 * (~140 MB)", and the Bedrock note offered "Download Chunker (~30 MB)". That is the fallback
 * shape, not the intended one. A person who installs the app has to have installed everything
 * the app needs, and it has to work with the network unplugged.
 *
 * The visible cost of not doing this is a server that opens saying "This server has no Java
 * runtime chosen yet" on a machine where nothing is wrong except that nobody has downloaded a
 * JVM yet. Bundling removes that state entirely rather than explaining it better.
 *
 * ## What it stages
 *
 * - A **JRE**, not a JDK. Temurin publishes both; the JRE is 56 MB against the JDK's 140 MB
 *   and the app only ever runs `java`, never compiles. Preferring the minimal redistributable
 *   is the whole point of bundling.
 * - The pinned **Chunker** CLI jar, the same asset and digest the runtime downloader uses, so
 *   a bundled install and a fetched one are byte-identical.
 *
 * ## Why the versions are pinned here rather than resolved live
 *
 * A build that queries "latest" produces a different installer every time upstream publishes,
 * which means the digest in the release notes describes something nobody can reproduce. Both
 * entries below are therefore committed constants, exactly as `PINNED_CHUNKER` already is in
 * `src/main/bedrock/chunker.ts`. Run this with `--refresh` to print what upstream currently
 * offers, then update the constant in a reviewed commit.
 *
 * ## Failure is loud
 *
 * A digest mismatch deletes the bytes and exits non-zero. There is no "continue without it"
 * path, because an installer that silently ships without the runtime it promises is worse than
 * a build that stops: the first one fails on a stranger's machine instead of on this one.
 *
 * Usage:
 *   node scripts/stage-bundled-runtimes.mjs            # stage into dist/bundled
 *   node scripts/stage-bundled-runtimes.mjs --check     # report, download nothing
 *   node scripts/stage-bundled-runtimes.mjs --refresh   # print upstream's current pin
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(appRoot, "dist", "bundled");

/**
 * Eclipse Temurin's Windows x64 JRE.
 *
 * `image_type=jre`, deliberately. Resolved once from
 * `https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse`
 * and pinned here. The checksum is Adoptium's own published one for this asset.
 */
const PINNED_JRE = {
    release: "jdk-25.0.4.1+1",
    version: "25.0.4.1+1-LTS",
    asset: "OpenJDK25U-jre_x64_windows_hotspot_25.0.4.1_1.zip",
    sizeBytes: 58_475_080,
    sha256: "4c95451cea98556def2c54f7782933f52a26d4a36bd85e1d59f0364464828b07",
    url:
        "https://github.com/adoptium/temurin25-binaries/releases/download/" +
        "jdk-25.0.4.1%2B1/OpenJDK25U-jre_x64_windows_hotspot_25.0.4.1_1.zip",
};

/**
 * Hive Games' Chunker CLI.
 *
 * Kept identical to `PINNED_CHUNKER` in `src/main/bedrock/chunker.ts`. If the two ever
 * disagree, a bundled install and a downloaded one stop being the same converter, and the
 * version a user is told they have stops being the version they have.
 */
const PINNED_CHUNKER = {
    version: "1.19.1",
    asset: "chunker-cli-1.19.1.jar",
    sizeBytes: 31_790_149,
    sha256: "327662e8632acdb4571f60939206d605418ac0633741e1e5a58f5d6c6866dc74",
    url: "https://github.com/HiveGamesOSS/Chunker/releases/download/1.19.1/chunker-cli-1.19.1.jar",
};

const log = (message) => process.stdout.write(`[stage-bundled-runtimes] ${message}\n`);

const sha256Of = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/**
 * Downloads `url` to `destination`, then refuses to return unless the bytes hash to `sha256`.
 *
 * The partially written file is removed on any failure. A half-downloaded archive left on disk
 * is what turns one flaky network moment into a build that fails differently every time.
 */
async function fetchVerified(url, destination, sha256, sizeBytes) {
    mkdirSync(dirname(destination), { recursive: true });

    if (existsSync(destination) && sha256Of(destination) === sha256) {
        log(`cached, digest matches: ${destination}`);
        return;
    }

    log(`downloading ${url}`);
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${String(response.status)} from ${url}`);

    const bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(destination, bytes);

    const actual = sha256Of(destination);
    if (actual !== sha256) {
        rmSync(destination, { force: true });
        throw new Error(
            `digest mismatch for ${url}\n  expected ${sha256}\n  actual   ${actual}\n` +
                "The bytes were deleted. Nothing is staged from an unverified download.",
        );
    }
    if (bytes.length !== sizeBytes) {
        log(`note: size is ${String(bytes.length)} bytes, pin says ${String(sizeBytes)}`);
    }
    log(`verified ${destination}`);
}

/**
 * Unpacks a zip with bsdtar, the same tool and the same reasoning as `src/main/java/extract.ts`:
 * Windows ships bsdtar at `System32\tar.exe` and it reads zip, so no archive library enters the
 * dependency tree. Resolved through `SystemRoot` rather than `PATH` because a machine with Git
 * or MSYS installed has a GNU tar on `PATH`, and GNU tar cannot read zip at all.
 */
function unzip(archive, intoDirectory) {
    mkdirSync(intoDirectory, { recursive: true });
    const systemRoot = process.env["SystemRoot"] ?? process.env["SYSTEMROOT"] ?? "C:\\Windows";
    const tar = process.platform === "win32" ? join(systemRoot, "System32", "tar.exe") : "tar";
    execFileSync(tar, ["-xf", archive, "-C", intoDirectory], { stdio: "inherit" });
}

/**
 * Temurin archives contain one top-level directory (`jdk-25.0.4.1+1-jre`). Flatten it, so the
 * packaged layout is `bundled/java/bin/java.exe` rather than a path with the release name in
 * it, which would otherwise have to be rediscovered at runtime every time the pin moved.
 */
function flattenSingleChild(directory) {
    const entries = readdirSync(directory, { withFileTypes: true });
    if (entries.length !== 1 || !entries[0].isDirectory()) return;
    const inner = join(directory, entries[0].name);
    const staging = `${directory}-flat`;
    rmSync(staging, { recursive: true, force: true });
    renameSync(inner, staging);
    rmSync(directory, { recursive: true, force: true });
    renameSync(staging, directory);
}

async function refresh() {
    const url =
        "https://api.adoptium.net/v3/assets/latest/25/hotspot" +
        "?architecture=x64&image_type=jre&os=windows&vendor=eclipse";
    const assets = await (await fetch(url)).json();
    const binary = assets[0]?.binary?.package;
    log("upstream currently offers:");
    process.stdout.write(
        `${JSON.stringify(
            {
                release: assets[0]?.release_name,
                version: assets[0]?.version?.openjdk_version,
                asset: binary?.name,
                sizeBytes: binary?.size,
                sha256: binary?.checksum,
                url: binary?.link,
            },
            null,
            4,
        )}\n`,
    );
    log("update PINNED_JRE in a reviewed commit if this differs.");
}

/** Total bytes under `directory`, recursively. */
function treeBytes(directory) {
    let total = 0;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        total += entry.isDirectory() ? treeBytes(full) : statSync(full).size;
    }
    return total;
}

function report() {
    // The size reported for java is the whole runtime tree, not `java.exe`. The launcher stub
    // is about 50 KB, so reporting it would have said "0.0 MB" for a 179 MB dependency, which
    // is precisely the kind of quietly-tripled download size the bundling rule asks to be
    // stated honestly instead of hidden.
    const rows = [
        ["java", join(outRoot, "java"), join(outRoot, "java", "bin", "java.exe"), PINNED_JRE.version],
        [
            "chunker",
            join(outRoot, "chunker"),
            join(outRoot, "chunker", PINNED_CHUNKER.asset),
            PINNED_CHUNKER.version,
        ],
    ];
    let missing = 0;
    for (const [name, tree, proof, version] of rows) {
        const present = existsSync(proof);
        if (!present) missing += 1;
        const size = present ? `${(treeBytes(tree) / 1048576).toFixed(1)} MB on disk` : "absent";
        log(`${name.padEnd(8)} ${version.padEnd(14)} ${present ? "staged " : "MISSING"}  ${size}`);
    }
    return missing;
}

async function main() {
    const args = new Set(process.argv.slice(2));

    if (args.has("--refresh")) {
        await refresh();
        return;
    }

    if (args.has("--check")) {
        const missing = report();
        if (missing > 0) {
            log("run without --check to stage them.");
            process.exitCode = 1;
        }
        return;
    }

    const cache = join(appRoot, "dist", "bundled-cache");

    // One call: `fetchVerified` already returns early when the cached file's digest matches,
    // so there is no separate cache-hit path to write and no way for the two to disagree.
    const jreZip = join(cache, PINNED_JRE.asset);
    await fetchVerified(PINNED_JRE.url, jreZip, PINNED_JRE.sha256, PINNED_JRE.sizeBytes);

    const javaOut = join(outRoot, "java");
    if (!existsSync(join(javaOut, "bin", "java.exe"))) {
        rmSync(javaOut, { recursive: true, force: true });
        unzip(jreZip, javaOut);
        flattenSingleChild(javaOut);
    }
    if (!existsSync(join(javaOut, "bin", "java.exe"))) {
        throw new Error(
            `no bin/java.exe under ${javaOut} after extraction. Nothing is staged from an ` +
                "archive that does not contain a runnable java.",
        );
    }

    const chunkerOut = join(outRoot, "chunker");
    const chunkerJar = join(chunkerOut, PINNED_CHUNKER.asset);
    const chunkerCache = join(cache, PINNED_CHUNKER.asset);
    await fetchVerified(PINNED_CHUNKER.url, chunkerCache, PINNED_CHUNKER.sha256, PINNED_CHUNKER.sizeBytes);
    mkdirSync(chunkerOut, { recursive: true });
    copyFileSync(chunkerCache, chunkerJar);

    writeFileSync(
        join(outRoot, "manifest.json"),
        `${JSON.stringify(
            {
                version: 1,
                java: {
                    kind: "jre",
                    release: PINNED_JRE.release,
                    version: PINNED_JRE.version,
                    sha256: PINNED_JRE.sha256,
                    source: PINNED_JRE.url,
                },
                chunker: {
                    version: PINNED_CHUNKER.version,
                    asset: PINNED_CHUNKER.asset,
                    sha256: PINNED_CHUNKER.sha256,
                    source: PINNED_CHUNKER.url,
                },
            },
            null,
            4,
        )}\n`,
        "utf8",
    );

    report();
    log("staged. These go into the installer through electron-builder's extraResources.");
}

await main().catch((error) => {
    process.stderr.write(`[stage-bundled-runtimes] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
