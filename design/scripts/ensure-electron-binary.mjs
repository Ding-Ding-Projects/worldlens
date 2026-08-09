#!/usr/bin/env node
/**
 * Make sure `node_modules/electron` actually contains an Electron binary.
 *
 * ## The failure this exists for
 *
 * npm/pnpm's install-script gate can leave the declared `electron` package present and
 * complete-looking while `dist/electron.exe` was never extracted. `dist/` holds at most an
 * empty `locales` folder and there is no `path.txt`, so every consumer that resolves the
 * binary through the package - Playwright's `electron.launch`, `electron .`, anything using
 * `require("electron")` as a path - fails with the profoundly unhelpful
 * "Electron failed to install correctly, please delete node_modules/electron and try
 * installing again". Deleting and reinstalling does not fix it, because the reinstall hits
 * the same gate.
 *
 * ## The dead end, named so nobody spends an afternoon on it
 *
 * The package's own `node_modules/electron/install.js` is NOT the recovery on a host whose
 * Node exits before asynchronous work settles (seen on Node 26.x). It prints a `@electron/get`
 * cache hit, exits 0 in well under a second, and extracts nothing. No error is ever printed,
 * and re-running it changes nothing. Judge it only by whether the binary exists afterwards -
 * never by its exit code.
 *
 * ## The recovery, which is synchronous and needs no new dependency
 *
 * The zip is already on disk: `@electron/get` cached it under the platform cache directory,
 * one zip per content-addressed folder. So:
 *
 *   1. find `electron-v<version>-<platform>-<arch>.zip` in that cache,
 *   2. verify its SHA-256 against the checksums the electron package itself ships, so a
 *      truncated or tampered download is caught rather than extracted,
 *   3. extract it into `dist/`,
 *   4. write `path.txt` naming the platform executable.
 *
 * Wired as `prestart` and `pretest:ui` so the common entry points self-heal rather than
 * failing in a way that reads like a code defect.
 *
 * Exits 0 and prints one line when the binary is already present, so it is cheap to leave in
 * front of every launch.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** Where the platform keeps the `@electron/get` download cache. */
function cacheRoot() {
    if (process.platform === "win32") {
        const local = process.env["LOCALAPPDATA"];
        return local === undefined ? null : join(local, "electron", "Cache");
    }
    if (process.platform === "darwin") {
        const home = process.env["HOME"];
        return home === undefined ? null : join(home, "Library", "Caches", "electron");
    }
    const home = process.env["HOME"];
    return home === undefined ? null : join(home, ".cache", "electron");
}

/** The executable's name inside the zip, per platform. */
function executableName() {
    if (process.platform === "win32") return "electron.exe";
    if (process.platform === "darwin") return "Electron.app/Contents/MacOS/Electron";
    return "electron";
}

function fail(message) {
    process.stderr.write(`ensure-electron-binary: ${message}\n`);
    process.exit(1);
}

/*
 * Resolved from the package that actually declares electron, not from this script's own
 * directory. pnpm's node_modules is strict: `electron` is a dependency of `packages/app`, so
 * resolving from `design/scripts` finds nothing and the script would report "not installed"
 * about a package that is installed - the exact wrong diagnosis.
 *
 * The caller may name the owning package directory; otherwise the app package is tried, then
 * the current working directory, so running this from anywhere sensible works.
 */
const searchPaths = [
    process.argv[2],
    join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "packages", "app"),
    process.cwd(),
].filter((entry) => typeof entry === "string" && entry.length > 0);

let packageJsonPath;
for (const from of searchPaths) {
    try {
        packageJsonPath = require.resolve("electron/package.json", { paths: [from] });
        break;
    } catch {
        // try the next candidate
    }
}
if (packageJsonPath === undefined) {
    fail(
        `the \`electron\` package could not be resolved from any of:\n  ${searchPaths.join("\n  ")}\nRun the workspace install first.`,
    );
}

const electronRoot = dirname(packageJsonPath);
const version = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
const distDir = join(electronRoot, "dist");
const exeRelative = executableName();
const exePath = join(distDir, exeRelative);

if (existsSync(exePath)) {
    process.stdout.write(`ensure-electron-binary: electron ${version} binary present\n`);
    // `path.txt` is what `require("electron")` reads. A binary with no path.txt still fails,
    // so it is repaired here rather than assumed.
    const pathTxt = join(electronRoot, "path.txt");
    if (!existsSync(pathTxt)) {
        writeFileSync(pathTxt, exeRelative);
        process.stdout.write("ensure-electron-binary: wrote the missing path.txt\n");
    }
    process.exit(0);
}

process.stdout.write(
    `ensure-electron-binary: electron ${version} is installed but its binary was never extracted; recovering from the download cache\n`,
);

const root = cacheRoot();
if (root === null || !existsSync(root)) {
    fail(
        `no @electron/get cache at ${root ?? "(unknown location)"}. Nothing to recover from - run the package's own install with its scripts enabled.`,
    );
}

const zipName = `electron-v${version}-${process.platform}-${process.arch}.zip`;
let zipPath = null;
for (const entry of readdirSync(root)) {
    const candidate = join(root, entry);
    if (!statSync(candidate).isDirectory()) continue;
    const inner = join(candidate, zipName);
    if (existsSync(inner)) {
        zipPath = inner;
        break;
    }
}
if (zipPath === null) fail(`no ${zipName} anywhere under ${root}.`);

// --- Verify before extracting -------------------------------------------------------------
// The electron package ships the checksums for its own release, so this needs no network and
// no trust in the cache directory. A cache entry that does not match is a corrupt download,
// not something to unpack and hope about.
const checksumsPath = join(electronRoot, "checksums.json");
if (existsSync(checksumsPath)) {
    const checksums = JSON.parse(readFileSync(checksumsPath, "utf8"));
    const expected = checksums[zipName];
    if (typeof expected === "string") {
        const actual = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
        // electron ships these as SHA-256 hex; compare case-insensitively and say plainly
        // which side disagreed rather than "verification failed".
        if (actual.toLowerCase() !== expected.toLowerCase()) {
            fail(
                `${zipPath}\n  expected sha256 ${expected}\n  actual   sha256 ${actual}\nThe cached download is corrupt. Delete it and let the package download again.`,
            );
        }
        process.stdout.write(`ensure-electron-binary: sha256 verified against checksums.json\n`);
    } else {
        process.stdout.write(
            `ensure-electron-binary: WARNING checksums.json has no entry for ${zipName}; extracting unverified\n`,
        );
    }
} else {
    process.stdout.write(
        "ensure-electron-binary: WARNING the electron package ships no checksums.json; extracting unverified\n",
    );
}

// --- Extract ------------------------------------------------------------------------------
// `dist/` may hold a half-extraction (an empty `locales`), which would leave stale files
// beside the real ones. Clear it first so what ends up there came from this zip.
if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });

try {
    if (process.platform === "win32") {
        execFileSync(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${distDir.replace(/'/g, "''")}' -Force`,
            ],
            { stdio: "inherit" },
        );
    } else {
        execFileSync("unzip", ["-q", "-o", zipPath, "-d", distDir], { stdio: "inherit" });
    }
} catch (error) {
    fail(`extraction failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (!existsSync(exePath)) {
    fail(`extraction reported success but ${exePath} does not exist. Nothing usable was produced.`);
}

writeFileSync(join(electronRoot, "path.txt"), exeRelative);

process.stdout.write(
    `ensure-electron-binary: recovered electron ${version} into ${distDir} and wrote path.txt\n`,
);
