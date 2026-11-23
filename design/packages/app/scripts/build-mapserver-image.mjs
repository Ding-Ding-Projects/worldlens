#!/usr/bin/env node
/**
 * Produces the map server image tars that ship inside the app.
 *
 *   node scripts/build-mapserver-image.mjs [--version X] [--arch amd64,arm64] [--out DIR]
 *                                          [--optional] [--from-registry] [--force]
 *
 * Output: `build/mapserver/worldlens-map-server-<arch>.tar` and `mapserver-image.json`.
 *
 * For each architecture it builds the image with Docker when Docker is usable, and otherwise
 * (or with `--from-registry`) fetches the digest pinned in `mapserver-image.lock.json` from the
 * registry over HTTP and assembles the tar itself, so a build host with no Docker can still
 * produce a complete installer. When neither route can work it stops with the reason; with
 * `--optional` (used by the plain development build) it warns and exits 0 instead, and the app
 * then says clearly that hosting is unavailable in that build. A packaged build never uses it.
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHES, IMAGE_TAG, archiveFromRegistry, buildWithDocker, dockerUsable, existingImagesVerified, readLock, recordImage, writeManifest } from "./mapserver-image-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");

function option(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? fallback : process.argv[index + 1];
}
const flag = (name) => process.argv.includes(`--${name}`);

async function httpBuffer(url, headers) {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
    return Buffer.from(await response.arrayBuffer());
}

async function main() {
    const version = option("version", JSON.parse(await readFile(join(appDir, "package.json"), "utf8")).version);
    const arches = option("arch", ARCHES.join(",")).split(",").map((a) => a.trim()).filter(Boolean);
    const outDir = resolve(option("out", join(appDir, "build", "mapserver")));
    const context = resolve(appDir, "..", "mapserver");
    const lock = await readLock(join(here, "mapserver-image.lock.json"));
    const reused = flag("force") ? null : await existingImagesVerified(outDir, arches);
    if (reused !== null) {
        console.log(`map server image: reusing the verified tars already in ${outDir}`);
        return;
    }
    const useDocker = !flag("from-registry") && (await dockerUsable());
    await mkdir(outDir, { recursive: true });

    console.log(`map server image: version ${version}, ${useDocker ? "building with Docker" : "fetching the pinned digest from the registry"}`);
    let manifest;
    for (const arch of arches) {
        let tar;
        if (useDocker) {
            const file = join(outDir, `.build-${arch}.tar`);
            await buildWithDocker({ arch, tag: IMAGE_TAG, version, context, outFile: file });
            tar = await readFile(file);
            await rm(file, { force: true });
        } else {
            tar = await archiveFromRegistry({ digest: lock.digest, arch, tag: IMAGE_TAG, http: httpBuffer });
        }
        manifest = await recordImage(outDir, version, arch, tar, manifest);
        console.log(`  ${arch}: ${String(tar.length)} bytes`);
    }
    await writeManifest(outDir, manifest);
    console.log(`map server image: wrote ${join(outDir, "mapserver-image.json")}`);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (flag("optional")) {
        console.warn(`map server image: not bundled in this build (${message.split("\n")[0]})`);
        return;
    }
    console.error(`map server image: FAILED\n${message}`);
    process.exitCode = 1;
});
