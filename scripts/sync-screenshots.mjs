#!/usr/bin/env node
/**
 * sync-screenshots.mjs: refresh the captures committed at `docs/screenshots/`.
 *
 * The images in this repository are the ones the README, the feature documents and the
 * wiki point at. They come from the Playwright capture matrix in `design/packages/app`,
 * which drives the real packaged application and writes its set to
 * `design/packages/app/screenshots/`. This script copies that local output here.
 *
 * It used to download a `screenshots` artifact from a CI run instead. That route is dead:
 * the capture job was removed from `.github/workflows/ci.yml`, which now builds and
 * packages release inputs only, so no run will ever produce that artifact again. A script
 * that keeps asking a workflow for something the workflow no longer makes does not fail
 * usefully, it just always reports "nothing found", and the next person concludes the
 * captures cannot be refreshed at all. Pointing it at the route that actually exists is
 * the only way `--check` keeps meaning anything.
 *
 * The captures are produced locally, on a hidden Windows desktop, because the matrix has
 * no visible-desktop fallback and fails closed without a debugger port. Build the UI and
 * app outputs, launch `launch-headless.cmd` on an off-screen desktop with a fresh profile,
 * then attach the matrix to it:
 *
 *   $env:WORLDLENS_CDP_PORT = '9333'
 *   $env:WORLDLENS_CAPTURE_COMMIT = (git rev-parse HEAD)
 *   pnpm --filter @worldlens/app screenshots
 *
 * `.claude/skills/run-worldlens/SKILL.md` is the full procedure, including
 * `WORLDLENS_DRIVER_OUTPUT` for a task-owned evidence directory. Run that first, then run
 * this to move the result into the tree.
 *
 * It exists because the alternative is a person remembering to do it. A surface that
 * changed three commits ago and is still illustrated by a picture of the old one is worse
 * than no picture, because a reader has no way to tell which they are looking at, and the
 * caption underneath will confidently describe the wrong thing.
 *
 * Nothing is generated, edited or substituted. Every file written here came out of a run
 * of the real application, and a missing capture set is reported rather than papered over.
 *
 * Usage:
 *   node scripts/sync-screenshots.mjs
 *   node scripts/sync-screenshots.mjs --from path/to/screenshots   # another capture run
 *   node scripts/sync-screenshots.mjs --check                      # report drift, write nothing
 *
 * Needs no network access and no GitHub CLI: the source is a directory on this machine.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const outDir = join(repoRoot, "docs", "screenshots");

/**
 * Where `pnpm --filter @worldlens/app screenshots` writes. Hardcoded rather than read from
 * an environment variable, so that running this with nothing set syncs the set a person
 * just captured instead of silently syncing an empty default somewhere else.
 */
const DEFAULT_SOURCE = join(repoRoot, "design", "packages", "app", "screenshots");

/** The first eight bytes of every PNG. A file that does not start with these is not one. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Files kept beside the images.
 *
 * `captions.md` is what a person reads and what gets pasted into an issue; `manifest.json`
 * records which commit and which run produced the set, and which surfaces were not
 * captured. Both are part of the evidence, so both are committed with the pictures.
 */
const SIDECARS = new Set(["captions.md", "manifest.json"]);

function log(message) {
    process.stdout.write(`[sync-screenshots] ${message}\n`);
}

function digest(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

/**
 * What the local capture run left behind, described in the terms a reader can check.
 *
 * `manifest.json` is read only to say which commit and which capture mode the set claims,
 * so the log line names the run being copied instead of just a path. A set without one is
 * still copied: refusing would make a partial run, which is exactly when a person most
 * wants the pictures, unusable.
 */
async function describeSource(dir) {
    let note = dir;
    try {
        const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
        const commit = String(manifest.commit ?? "(no commit recorded)");
        note = `${dir} (commit ${commit}, capture mode ${manifest.captureMode ?? "unrecorded"})`;
    } catch {
        note = `${dir} (no manifest.json; the capture run did not finish writing its sidecars)`;
    }
    return note;
}

async function main() {
    const argv = process.argv.slice(2);
    const check = argv.includes("--check");
    const fromIndex = argv.indexOf("--from");
    const source = resolve(fromIndex >= 0 ? argv[fromIndex + 1] : DEFAULT_SOURCE);

    if (!existsSync(source)) {
        // Named rather than implied. The failure this prevents is a person reading "nothing
        // to sync" as "the captures are current" when in fact the capture matrix was never
        // run, which is the ordinary state of a fresh clone.
        log(`no capture output at ${source}; nothing was read and nothing was written`);
        log("run the capture matrix first: see .claude/skills/run-worldlens/SKILL.md");
        process.exitCode = 1;
        return;
    }
    log(`using ${await describeSource(source)}`);

    const incoming = new Map();
    for (const name of await readdir(source)) {
        if (name.endsWith(".caption.txt")) continue; // The captions live in captions.md.
        const path = join(source, name);
        if (!name.endsWith(".png") && !SIDECARS.has(name)) continue;
        const bytes = await readFile(path);
        if (name.endsWith(".png") && !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
            throw new Error(`${name} is not a PNG; refusing to commit it as a capture`);
        }
        incoming.set(name, bytes);
    }

    if (incoming.size === 0) throw new Error(`${source} held no captures`);

    const existing = new Map();
    if (existsSync(outDir)) {
        for (const name of await readdir(outDir)) {
            existing.set(name, await readFile(join(outDir, name)));
        }
    }

    const added = [...incoming.keys()].filter((name) => !existing.has(name)).sort();
    const changed = [...incoming.entries()]
        .filter(([name, bytes]) => existing.has(name) && digest(existing.get(name)) !== digest(bytes))
        .map(([name]) => name)
        .sort();
    // Kept, not deleted: a capture that this run could not take is a gap in this run,
    // and removing the picture a document still links to turns one missing surface into
    // a broken page. `manifest.json` is where a missing surface is reported.
    const onlyHere = [...existing.keys()].filter((name) => !incoming.has(name)).sort();

    for (const name of [...added, ...changed]) log(`  ${added.includes(name) ? "new" : "updated"}  ${name}`);
    for (const name of onlyHere) log(`  kept (not in this run)  ${name}`);

    if (check) {
        const drift = added.length + changed.length;
        log(drift === 0 ? "committed captures match the local capture output" : `${drift} file(s) would change`);
        process.exitCode = drift === 0 ? 0 : 1;
        return;
    }

    await mkdir(outDir, { recursive: true });
    for (const [name, bytes] of incoming) await writeFile(join(outDir, name), bytes);
    log(`wrote ${incoming.size} file(s): ${added.length} new, ${changed.length} updated, ${onlyHere.length} kept`);
}

await main();
