#!/usr/bin/env node
/**
 * fetch-appliance-base.mjs - put the appliance base images inside the installer's resources.
 *
 * The appliance builder composes a finished render onto a small Linux disk image. There are two:
 * the PC image (x86_64, VMware, VirtualBox, USB stick, export) and the Raspberry Pi image
 * (aarch64). Both are built in CI by `.github/workflows/appliance.yml` (see
 * `appliance/build-base.sh` and `appliance/build-base-rpi.sh`) and published with a SHA-256.
 * This script downloads each pinned asset at BUILD time, never at click time, verifies both the
 * compressed and the expanded digest, and stages the COMPRESSED file under `dist/appliance/` so
 * electron-builder copies it to `resources/appliance/`. The app expands it into its own data
 * folder on first use (appliance/ipc.ts), which keeps the installer about 400 MB smaller than
 * shipping raw images, with nothing downloaded at click time.
 *
 * Failure is loud: a digest mismatch deletes the bytes and exits non-zero, and a pin that has
 * not been filled in yet is reported as exactly that. There is no "continue without it" path.
 *
 * Usage:
 *   node scripts/fetch-appliance-base.mjs                                   # every pinned base
 *   node scripts/fetch-appliance-base.mjs --arch aarch64-rpi                # one base
 *   node scripts/fetch-appliance-base.mjs --arch x86_64 --from path/to.img  # stage a local image
 *   node scripts/fetch-appliance-base.mjs --check                           # report the pins
 *   node scripts/fetch-appliance-base.mjs --optional                        # skip unpinned bases
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

/** Each base: its image file name and the manifest the app reads (see appliance/ipc.ts). */
const BASES = {
    x86_64: { image: "worldlens-appliance-base-x86_64.img", manifest: "base.json" },
    "aarch64-rpi": { image: "worldlens-appliance-base-aarch64-rpi.img", manifest: "base-rpi.json" },
};

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

async function writeManifest(arch, entry) {
    const { manifest } = BASES[arch];
    await writeFile(path.join(outDir, manifest), JSON.stringify(entry, null, 2));
    console.log(`staged ${arch}: ${path.join(outDir, entry.file)} (${Math.round(entry.bytes / 1048576)} MiB, image sha256 ${entry.sha256})`);
}

/** Compresses a local image with zstd and records both digests, as the CI asset would carry. */
async function stageLocal(arch, source) {
    const zstName = `${BASES[arch].image}.zst`;
    const target = path.join(outDir, zstName);
    const imgSha256 = await sha256File(source);
    await pipeline(createReadStream(source), zlib.createZstdCompress(), createWriteStream(target));
    await writeManifest(arch, { file: zstName, compression: "zstd", sha256: imgSha256, zstSha256: await sha256File(target), bytes: (await stat(source)).size });
}

/** The pin for one base. Older pin files kept the PC base at the top level. */
function pinFor(all, arch) {
    if (all[arch]) return all[arch];
    if (arch === "x86_64" && "url" in all) return { url: all.url, zstSha256: all.zstSha256, imgSha256: all.imgSha256 };
    return { url: null, zstSha256: null, imgSha256: null };
}
const complete = (pin) => Boolean(pin.url && pin.zstSha256 && pin.imgSha256);

async function stage(arch, pin) {
    const zstName = `${BASES[arch].image}.zst`;
    const target = path.join(outDir, zstName);
    if (!(existsSync(target) && (await sha256File(target)) === pin.zstSha256)) {
        const partial = `${target}.partial`;
        console.log(`downloading ${pin.url}`);
        const response = await fetch(pin.url);
        if (!response.ok || !response.body) throw new Error(`${arch}: download failed: HTTP ${response.status}`);
        await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
        if ((await sha256File(partial)) !== pin.zstSha256) {
            await rm(partial, { force: true });
            throw new Error(`${arch}: the downloaded base does not match the pinned sha256; deleted it`);
        }
        await rm(target, { force: true });
        await rename(partial, target);
    }
    // Prove the expanded image matches too, without keeping it: the app expands it on first use.
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of createReadStream(target).pipe(zlib.createZstdDecompress())) {
        hash.update(chunk);
        bytes += chunk.length;
    }
    if (hash.digest("hex") !== pin.imgSha256) {
        await rm(target, { force: true });
        throw new Error(`${arch}: the expanded base does not match the pinned image sha256; deleted it`);
    }
    await writeManifest(arch, { file: zstName, compression: "zstd", sha256: pin.imgSha256, zstSha256: pin.zstSha256, bytes });
}

const pins = JSON.parse(await readFile(pinFile, "utf8"));
const only = value("--arch");
if (only !== undefined && !(only in BASES)) {
    console.error(`--arch must be one of: ${Object.keys(BASES).join(", ")}`);
    process.exit(2);
}
const arches = only ? [only] : Object.keys(BASES);

if (flag("--check")) {
    const report = Object.fromEntries(arches.map((arch) => [arch, pinFor(pins, arch)]));
    console.log(JSON.stringify(report, null, 2));
    process.exit(arches.every((arch) => complete(pinFor(pins, arch))) ? 0 : 1);
}

await mkdir(outDir, { recursive: true });

const local = value("--from");
if (local) {
    if (!only) {
        console.error("--from needs --arch to say which base the image is.");
        process.exit(2);
    }
    if (!existsSync(local)) {
        console.error(`--from: ${local} does not exist`);
        process.exit(1);
    }
    await stageLocal(only, local);
    process.exit(0);
}

if (typeof zlib.createZstdDecompress !== "function" || typeof zlib.createZstdCompress !== "function") {
    console.error("This Node.js has no built-in zstd (needs 22.15 or newer).");
    process.exit(1);
}
let failed = false;
for (const arch of arches) {
    const pin = pinFor(pins, arch);
    if (!complete(pin)) {
        if (flag("--optional")) {
            console.warn(`no pinned ${arch} appliance base yet; this build will say it does not carry one.`);
            continue;
        }
        console.error(`appliance-base.pin.json has no pinned ${arch} asset yet. Run the Appliance workflow, then record its url, zst sha256 and image sha256 under "${arch}".`);
        failed = true;
        continue;
    }
    try {
        await stage(arch, pin);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        failed = true;
    }
}
process.exit(failed ? 1 : 0);
