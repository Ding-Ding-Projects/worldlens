/**
 * Helpers for producing the bundled map server image tars.
 *
 * Two routes lead to the same artefact, a `docker load`-able tar per architecture:
 *
 *  - build it with Docker (`buildWithDocker`), which is what a developer machine and CI do;
 *  - fetch the pinned digest from the container registry over plain HTTP and assemble the tar
 *    itself (`archiveFromRegistry`), which needs no Docker at all and is what a build host
 *    without Docker uses. Every blob is checked against its digest on the way in, so a registry
 *    that serves something else is refused rather than bundled.
 *
 * `mapserver-image.json` records, for each tar, its SHA-256 and the layer diff ids of the image
 * inside. The app re-checks the SHA-256 before sending a tar anywhere, and uses the layer ids to
 * tell whether the image is already on a machine (layer ids match under both Docker image
 * stores, where an image id does not).
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const IMAGE_NAME = "worldlens-map-server";
export const REGISTRY_REPOSITORY = "ding-ding-projects/worldlens-map-server";
export const ARCHES = ["amd64", "arm64"];
/** The tag every bundled image carries, so the app and the appliance start the same reference. */
export const IMAGE_TAG = "bundled";

export function sha256Hex(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

/* ---------------------------------- tar ---------------------------------- */

function octal(value, width) {
    const buffer = Buffer.alloc(width, 0);
    buffer.write(value.toString(8).padStart(width - 1, "0"), 0, "ascii");
    return buffer;
}

function tarHeader(name, size, type) {
    if (Buffer.byteLength(name) > 100) throw new Error(`tar name too long: ${name}`);
    const block = Buffer.alloc(512, 0);
    block.write(name, 0, 100, "utf8");
    octal(type === "5" ? 0o755 : 0o644, 8).copy(block, 100);
    octal(0, 8).copy(block, 108);
    octal(0, 8).copy(block, 116);
    octal(size, 12).copy(block, 124);
    octal(0, 12).copy(block, 136);
    block.fill(0x20, 148, 156);
    block.write(type, 156, 1, "ascii");
    block.write("ustar\0", 257, "ascii");
    block.write("00", 263, "ascii");
    let sum = 0;
    for (const byte of block) sum += byte;
    block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
    return block;
}

/** A tar of `{ name, body }` entries, with the directories a loader expects. */
export function writeTar(entries) {
    const parts = [];
    const seen = new Set();
    for (const entry of entries) {
        const dirs = entry.name.split("/").slice(0, -1);
        for (let i = 1; i <= dirs.length; i += 1) {
            const dir = `${dirs.slice(0, i).join("/")}/`;
            if (!seen.has(dir)) { seen.add(dir); parts.push(tarHeader(dir, 0, "5")); }
        }
        parts.push(tarHeader(entry.name, entry.body.length, "0"), entry.body);
        const rest = entry.body.length % 512;
        if (rest !== 0) parts.push(Buffer.alloc(512 - rest, 0));
    }
    parts.push(Buffer.alloc(1024, 0));
    return Buffer.concat(parts);
}

/** Every regular entry of a tar, by name. */
export function readTar(buffer) {
    const entries = new Map();
    let offset = 0;
    while (offset + 512 <= buffer.length) {
        const block = buffer.subarray(offset, offset + 512);
        if (block.every((byte) => byte === 0)) break;
        const name = block.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
        const size = parseInt(block.subarray(124, 136).toString("ascii").replace(/\0.*$/s, "").trim() || "0", 8);
        const type = String.fromCharCode(block[156]);
        if (type === "0" || type === "\0") entries.set(name, buffer.subarray(offset + 512, offset + 512 + size));
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    return entries;
}

/** The layer diff ids of the image inside a `docker save` or registry-built archive. */
export function layersFromArchive(buffer) {
    const entries = readTar(buffer);
    const manifest = entries.get("manifest.json");
    if (manifest === undefined) throw new Error("The image archive has no manifest.json.");
    const config = entries.get(JSON.parse(manifest.toString("utf8"))[0].Config);
    if (config === undefined) throw new Error("The image archive is missing its config blob.");
    const diffIds = JSON.parse(config.toString("utf8")).rootfs?.diff_ids;
    if (!Array.isArray(diffIds) || diffIds.length === 0) throw new Error("The image config lists no layers.");
    return diffIds;
}

/* ------------------------------- docker route ------------------------------ */

export function run(command, args, options = {}) {
    return new Promise((resolve) => {
        execFile(command, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...options }, (error, stdout, stderr) => {
            resolve({ ok: error === null, code: error === null ? 0 : (typeof error.code === "number" ? error.code : null), stdout: String(stdout), stderr: String(stderr) });
        });
    });
}

export async function dockerUsable(runner = run) {
    const result = await runner("docker", ["version", "--format", "{{.Server.Version}}"]);
    return result.ok && result.stdout.trim() !== "";
}

export async function buildWithDocker({ arch, tag, version, context, outFile, runner = run }) {
    const result = await runner("docker", [
        "buildx", "build", "--platform", `linux/${arch}`, "--provenance=false",
        "--build-arg", `MAPSERVER_VERSION=${version}`,
        "--output", `type=docker,dest=${outFile},name=${IMAGE_NAME}:${tag}`,
        context,
    ]);
    if (!result.ok) throw new Error(`docker buildx build failed for ${arch}:\n${result.stderr.split("\n").slice(-20).join("\n")}`);
}

/* ------------------------------ registry route ----------------------------- */

const MANIFEST_TYPES = [
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
];

function checked(buffer, digest, what) {
    if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error(`${what} has an unusable digest: ${digest}`);
    if (`sha256:${sha256Hex(buffer)}` !== digest) throw new Error(`${what} does not match its digest ${digest}; the registry served something else.`);
    return buffer;
}

/**
 * Assembles a loadable tar from the registry. `http(url, headers)` returns a Buffer and is a
 * parameter so the tests need no network.
 */
export async function archiveFromRegistry({ repository = REGISTRY_REPOSITORY, digest, arch, tag, http, host = "ghcr.io" }) {
    if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "")) throw new Error("No pinned digest is recorded in mapserver-image.lock.json, so the image cannot be fetched. Build it with Docker, or let CI push it and record its digest.");
    const token = JSON.parse((await http(`https://${host}/token?service=${host}&scope=repository:${repository}:pull`, {})).toString("utf8")).token;
    const headers = { Authorization: `Bearer ${token}`, Accept: MANIFEST_TYPES.join(", ") };
    const base = `https://${host}/v2/${repository}`;
    let manifestBody = checked(await http(`${base}/manifests/${digest}`, headers), digest, "The image manifest");
    let manifest = JSON.parse(manifestBody.toString("utf8"));
    let manifestDigest = digest;
    if (Array.isArray(manifest.manifests)) {
        const wanted = manifest.manifests.find((entry) => entry.platform?.os === "linux" && entry.platform?.architecture === arch);
        if (wanted === undefined) throw new Error(`The pinned image has no linux/${arch} build.`);
        manifestDigest = wanted.digest;
        manifestBody = checked(await http(`${base}/manifests/${manifestDigest}`, headers), manifestDigest, "The platform manifest");
        manifest = JSON.parse(manifestBody.toString("utf8"));
    }
    const blobs = [];
    const fetchBlob = async (descriptor, what) => checked(await http(`${base}/blobs/${descriptor.digest}`, headers), descriptor.digest, what);
    const config = await fetchBlob(manifest.config, "The image config");
    blobs.push({ name: `blobs/sha256/${manifest.config.digest.slice(7)}`, body: config });
    const layerNames = [];
    for (const layer of manifest.layers) {
        const body = await fetchBlob(layer, "An image layer");
        const name = `blobs/sha256/${layer.digest.slice(7)}`;
        blobs.push({ name, body });
        layerNames.push(name);
    }
    const ref = `${IMAGE_NAME}:${tag}`;
    const index = {
        schemaVersion: 2,
        mediaType: "application/vnd.oci.image.index.v1+json",
        manifests: [{
            mediaType: manifest.mediaType ?? "application/vnd.oci.image.manifest.v1+json",
            digest: manifestDigest,
            size: manifestBody.length,
            annotations: { "io.containerd.image.name": `docker.io/library/${ref}`, "org.opencontainers.image.ref.name": tag },
        }],
    };
    return writeTar([
        ...blobs,
        { name: `blobs/sha256/${manifestDigest.slice(7)}`, body: manifestBody },
        { name: "manifest.json", body: Buffer.from(JSON.stringify([{ Config: `blobs/sha256/${manifest.config.digest.slice(7)}`, RepoTags: [ref], Layers: layerNames }])) },
        { name: "index.json", body: Buffer.from(JSON.stringify(index)) },
        { name: "oci-layout", body: Buffer.from(JSON.stringify({ imageLayoutVersion: "1.0.0" })) },
    ]);
}

/* -------------------------------- manifest --------------------------------- */

export async function recordImage(outDir, appVersion, arch, tarBuffer, existing) {
    const file = `${IMAGE_NAME}-${arch}.tar`;
    await writeFile(join(outDir, file), tarBuffer);
    return {
        version: 1,
        image: IMAGE_NAME,
        tag: IMAGE_TAG,
        appVersion,
        images: { ...(existing?.images ?? {}), [arch]: { file, sha256: sha256Hex(tarBuffer), layers: layersFromArchive(tarBuffer) } },
    };
}

/**
 * True when `outDir` already holds every requested architecture, each tar matching its recorded
 * SHA-256. This is how a build host that received the tars from the Linux image job (the
 * Windows installer job) reuses them instead of trying to build a Linux image itself.
 */
export async function existingImagesVerified(outDir, arches) {
    try {
        const manifest = JSON.parse(await readFile(join(outDir, "mapserver-image.json"), "utf8"));
        for (const arch of arches) {
            const entry = manifest.images?.[arch];
            if (entry === undefined) return null;
            if (sha256Hex(await readFile(join(outDir, entry.file))) !== entry.sha256) return null;
        }
        return manifest;
    } catch {
        return null;
    }
}

export async function writeManifest(outDir, manifest) {
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "mapserver-image.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function readLock(path) {
    try { return JSON.parse(await readFile(path, "utf8")); } catch { return { image: `ghcr.io/${REGISTRY_REPOSITORY}`, digest: null }; }
}
