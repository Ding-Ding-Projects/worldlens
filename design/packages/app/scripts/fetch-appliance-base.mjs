#!/usr/bin/env node
/**
 * fetch-appliance-base.mjs - put the appliance base image inside the installer's resources.
 *
 * The appliance builder composes a finished render onto a small Linux disk image. That image is
 * built in CI by `.github/workflows/appliance.yml` (see `appliance/build-base.sh`) and published
 * with a SHA-256. This script downloads the pinned asset at BUILD time, never at click time,
 * verifies it, expands it, and stages it as `dist/appliance/` so electron-builder can copy it
 * to `resources/appliance/` (see docs/appliance.md for the one extraResources entry).
 *
 * Failure is loud: a digest mismatch deletes the bytes and exits non-zero, and a pin that has
 * not been filled in yet is reported as exactly that. There is no "continue without it" path.
 *
 * Usage:
 *   node scripts/fetch-appliance-base.mjs                      # download the pinned asset
 *   node scripts/fetch-appliance-base.mjs --from path/to.img   # stage a locally built image
 *   node scripts/fetch-appliance-base.mjs --check              # report the pin, download nothing
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const pinFile = path.join(appRoot, "appliance-base.pin.json");
const outDir = path.join(appRoot, "dist", "appliance");
const IMAGE_NAME = "worldlens-appliance-base-x86_64.img";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};

async function sha256File(file) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest("hex");
}

async function writeManifest(sha256, bytes) {
    await writeFile(path.join(outDir, "base.json"), JSON.stringify({ file: IMAGE_NAME, sha256, bytes }, null, 2));
    console.log(`staged ${path.join(outDir, IMAGE_NAME)} (${Math.round(bytes / 1048576)} MiB, sha256 ${sha256})`);
}

const pin = JSON.parse(await readFile(pinFile, "utf8"));

if (flag("--check")) {
    console.log(JSON.stringify(pin, null, 2));
    process.exit(pin.url && pin.zstSha256 && pin.imgSha256 ? 0 : 1);
}

await mkdir(outDir, { recursive: true });
const target = path.join(outDir, IMAGE_NAME);

const local = value("--from");
if (local) {
    if (!existsSync(local)) {
        console.error(`--from: ${local} does not exist`);
        process.exit(1);
    }
    await rm(target, { force: true });
    await pipeline(createReadStream(local), createWriteStream(target));
    await writeManifest(await sha256File(target), (await stat(target)).size);
    process.exit(0);
}

if (!pin.url || !pin.zstSha256 || !pin.imgSha256) {
    console.error("appliance-base.pin.json has no pinned asset yet. Run the Appliance workflow, then record the asset url, its zst sha256 and the expanded image sha256 in the pin.");
    process.exit(1);
}
if (typeof zlib.createZstdDecompress !== "function") {
    console.error("This Node.js has no built-in zstd (needs 22.15 or newer).");
    process.exit(1);
}

if (existsSync(target) && (await sha256File(target)) === pin.imgSha256) {
    await writeManifest(pin.imgSha256, (await stat(target)).size);
    process.exit(0);
}

const zst = path.join(outDir, `${IMAGE_NAME}.zst.partial`);
console.log(`downloading ${pin.url}`);
const response = await fetch(pin.url);
if (!response.ok || !response.body) {
    console.error(`download failed: HTTP ${response.status}`);
    process.exit(1);
}
await pipeline(Readable.fromWeb(response.body), createWriteStream(zst));
if ((await sha256File(zst)) !== pin.zstSha256) {
    await rm(zst, { force: true });
    console.error("downloaded appliance base does not match the pinned sha256; deleted it");
    process.exit(1);
}
const partial = `${target}.partial`;
await pipeline(createReadStream(zst), zlib.createZstdDecompress(), createWriteStream(partial));
await rm(zst, { force: true });
if ((await sha256File(partial)) !== pin.imgSha256) {
    await rm(partial, { force: true });
    console.error("expanded appliance base does not match the pinned image sha256; deleted it");
    process.exit(1);
}
await rm(target, { force: true });
await rename(partial, target);
await writeManifest(pin.imgSha256, (await stat(target)).size);
