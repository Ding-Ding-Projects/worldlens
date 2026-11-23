#!/usr/bin/env node
/**
 * build-liveviewer-image.mjs - put the live viewer's container image inside the installer.
 *
 * Hosting a viewer must work on a machine with no internet access beyond its own Docker,
 * so the application never pulls the image when somebody clicks Host. This script makes
 * the image part of the build instead, as two files in `dist/liveviewer/`:
 *
 *   liveviewer-image.tar    a docker-archive that `docker load` accepts
 *   liveviewer-image.json   { reference, imageId, version, bytes, sha256 }
 *
 * `src/main/liveviewer/bundledImage.ts` checks the tar against that checksum before every
 * load, and `electron-builder.config.cjs` copies the directory into the installer.
 *
 * ## Two routes, one result
 *
 * 1. Docker route (default when a Docker daemon is usable): build the image from this
 *    checkout and `docker save` it. This is what a workstation does.
 * 2. Registry route (`--registry`, or automatically when Docker is not usable): fetch the
 *    image CI published, by the digest pinned in `liveviewer-image.pin.json`, straight from
 *    the registry over its plain HTTP API and assemble the archive here. Every blob is
 *    verified against its digest as it arrives, and the manifest against the pin, so the
 *    registry is only a transport: whatever it answers, the bytes must hash to the pin.
 *    This is what a build host without Docker (the Windows packaging job) uses.
 *
 * The pin is committed on purpose. A build that resolved "latest" would produce a different
 * installer every time CI published, and the digest in the release notes would describe
 * nothing anybody could reproduce.
 *
 * Usage:
 *   node scripts/build-liveviewer-image.mjs              # docker route, else registry route
 *   node scripts/build-liveviewer-image.mjs --registry   # registry route only
 *   node scripts/build-liveviewer-image.mjs --docker     # docker route only
 *   node scripts/build-liveviewer-image.mjs --optional   # exit 0 with a warning when no route works
 *   node scripts/build-liveviewer-image.mjs --pin <file> # alternate pin file (testing)
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "../../..");
const outDir = join(appRoot, "dist", "liveviewer");
const defaultPin = join(appRoot, "liveviewer-image.pin.json");

const log = (message) => process.stdout.write(`[liveviewer-image] ${message}\n`);

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

export function sha256Hex(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

async function sha256File(path) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}

function run(command, args, options = {}) {
    return new Promise((resolveRun) => {
        const child = spawn(command, args, { windowsHide: true, ...options });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk) => (stdout += chunk));
        child.stderr?.on("data", (chunk) => (stderr += chunk));
        child.on("error", (error) => resolveRun({ code: null, stdout, stderr: String(error.message) }));
        child.on("close", (code) => resolveRun({ code, stdout, stderr }));
    });
}

/* -------------------------------------------------------------------------- */
/* A minimal ustar writer (regular files only)                                */
/* -------------------------------------------------------------------------- */

function octal(value, width) {
    return value.toString(8).padStart(width - 1, "0") + "\0";
}

export function tarHeader(name, size) {
    if (Buffer.byteLength(name) > 100) throw new Error(`tar entry name is too long: ${name}`);
    const header = Buffer.alloc(512, 0);
    header.write(name, 0, "utf8");
    header.write(octal(0o644, 8), 100, "ascii");
    header.write(octal(0, 8), 108, "ascii");
    header.write(octal(0, 8), 116, "ascii");
    header.write(octal(size, 12), 124, "ascii");
    header.write(octal(0, 12), 136, "ascii");
    header.write("        ", 148, "ascii");
    header.write("0", 156, "ascii");
    header.write("ustar\0", 257, "ascii");
    header.write("00", 263, "ascii");
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
    return header;
}

function padding(size) {
    return Buffer.alloc((512 - (size % 512)) % 512, 0);
}

function writeChunk(stream, chunk) {
    return new Promise((resolveWrite, reject) => {
        stream.write(chunk, (error) => (error ? reject(error) : resolveWrite()));
    });
}

/** Writes `entries` ({ name, buffer } or { name, path, size }) to `target` as a tar file. */
export async function writeTar(target, entries) {
    const stream = createWriteStream(target);
    try {
        for (const entry of entries) {
            const size = entry.buffer ? entry.buffer.length : entry.size;
            await writeChunk(stream, tarHeader(entry.name, size));
            if (entry.buffer) await writeChunk(stream, entry.buffer);
            else for await (const chunk of createReadStream(entry.path)) await writeChunk(stream, chunk);
            await writeChunk(stream, padding(size));
        }
        await writeChunk(stream, Buffer.alloc(1024, 0));
    } finally {
        await new Promise((resolveEnd) => stream.end(resolveEnd));
    }
}

/* -------------------------------------------------------------------------- */
/* Registry route                                                             */
/* -------------------------------------------------------------------------- */

const MANIFEST_ACCEPT = [
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

const GZIP_LAYERS = new Set([
    "application/vnd.docker.image.rootfs.diff.tar.gzip",
    "application/vnd.oci.image.layer.v1.tar+gzip",
]);
const RAW_LAYERS = new Set(["application/vnd.oci.image.layer.v1.tar", "application/vnd.docker.image.rootfs.diff.tar"]);

export function parseImageReference(image) {
    const match = /^([a-z0-9.-]+(?::\d+)?)\/([a-z0-9._\/-]+)$/i.exec(image);
    if (!match) throw new Error(`The pinned image name is not a registry path: ${image}`);
    return { registry: match[1], repository: match[2] };
}

export function parseBearerChallenge(header) {
    if (!header || !/^bearer /i.test(header)) return null;
    const fields = {};
    for (const part of header.slice(7).matchAll(/(\w+)="([^"]*)"/g)) fields[part[1]] = part[2];
    return fields.realm ? fields : null;
}

class RegistryClient {
    constructor(registry, repository, fetchImpl = fetch) {
        this.registry = registry === "docker.io" ? "registry-1.docker.io" : registry;
        this.repository = repository;
        this.fetch = fetchImpl;
        this.token = null;
    }

    async request(path, accept) {
        const url = `https://${this.registry}/v2/${this.repository}/${path}`;
        const attempt = () => this.fetch(url, { headers: { ...(accept ? { Accept: accept } : {}), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, redirect: "follow" });
        let response = await attempt();
        if (response.status === 401 && this.token === null) {
            const challenge = parseBearerChallenge(response.headers.get("www-authenticate"));
            if (challenge) {
                const tokenUrl = new URL(challenge.realm);
                if (challenge.service) tokenUrl.searchParams.set("service", challenge.service);
                tokenUrl.searchParams.set("scope", challenge.scope ?? `repository:${this.repository}:pull`);
                const granted = await this.fetch(tokenUrl);
                if (!granted.ok) throw new Error(`The registry refused an anonymous pull token (${granted.status}).`);
                const body = await granted.json();
                this.token = body.token ?? body.access_token ?? null;
                if (this.token === null) throw new Error("The registry returned no pull token.");
                response = await attempt();
            }
        }
        if (!response.ok) throw new Error(`The registry answered ${response.status} for ${path}.`);
        return response;
    }

    /** Fetches a manifest by digest and proves its bytes hash to that digest. */
    async manifest(digest) {
        const response = await this.request(`manifests/${digest}`, MANIFEST_ACCEPT);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (`sha256:${sha256Hex(buffer)}` !== digest) throw new Error(`The manifest ${digest} does not hash to its digest.`);
        return JSON.parse(buffer.toString("utf8"));
    }

    /** Downloads a blob to `target`, hashing as it arrives, and removes it on a mismatch. */
    async blob(digest, target) {
        const response = await this.request(`blobs/${digest}`);
        const hash = createHash("sha256");
        const stream = createWriteStream(target);
        let size = 0;
        try {
            for await (const chunk of response.body) {
                hash.update(chunk);
                size += chunk.length;
                await writeChunk(stream, chunk);
            }
        } finally {
            await new Promise((resolveEnd) => stream.end(resolveEnd));
        }
        if (`sha256:${hash.digest("hex")}` !== digest) {
            await rm(target, { force: true });
            throw new Error(`The blob ${digest} does not hash to its digest.`);
        }
        return size;
    }
}

/** Picks the linux/amd64 manifest from an index, or returns the manifest itself. */
export function selectPlatformManifest(document, platform = { os: "linux", architecture: "amd64" }) {
    if (!Array.isArray(document.manifests)) return null;
    const entry = document.manifests.find((candidate) => candidate.platform?.os === platform.os && candidate.platform?.architecture === platform.architecture);
    return entry ? entry.digest : undefined;
}

export async function buildFromRegistry(pin, work, fetchImpl = fetch) {
    const { registry, repository } = parseImageReference(pin.image);
    if (!/^sha256:[a-f0-9]{64}$/.test(pin.digest)) throw new Error("The pinned digest is not a sha256 digest.");
    const client = new RegistryClient(registry, repository, fetchImpl);
    let manifest = await client.manifest(pin.digest);
    const platformDigest = selectPlatformManifest(manifest);
    if (platformDigest === undefined) throw new Error("The pinned image has no linux/amd64 build.");
    if (platformDigest !== null) manifest = await client.manifest(platformDigest);
    if (!manifest.config?.digest || !Array.isArray(manifest.layers)) throw new Error("The pinned image manifest is not an image manifest.");

    await mkdir(work, { recursive: true });
    const entries = [];
    const configPath = join(work, "config.json");
    await client.blob(manifest.config.digest, configPath);
    const configHex = manifest.config.digest.slice(7);
    entries.push({ name: `${configHex}.json`, path: configPath, size: (await stat(configPath)).size });

    const layerNames = [];
    for (const [index, layer] of manifest.layers.entries()) {
        if (!GZIP_LAYERS.has(layer.mediaType) && !RAW_LAYERS.has(layer.mediaType)) throw new Error(`Unsupported layer type: ${layer.mediaType}`);
        const hex = layer.digest.slice(7);
        const name = `${index}-${hex}${GZIP_LAYERS.has(layer.mediaType) ? ".tar.gz" : ".tar"}`;
        const path = join(work, `layer-${index}`);
        await client.blob(layer.digest, path);
        entries.push({ name, path, size: (await stat(path)).size });
        layerNames.push(name);
    }
    const reference = `${pin.image.split("@")[0]}:${pin.version ?? "bundled"}`;
    entries.push({ name: "manifest.json", buffer: Buffer.from(JSON.stringify([{ Config: `${configHex}.json`, RepoTags: [reference], Layers: layerNames }])) });
    return { entries, reference, imageId: manifest.config.digest };
}

/* -------------------------------------------------------------------------- */
/* Docker route                                                               */
/* -------------------------------------------------------------------------- */

async function dockerUsable() {
    const result = await run("docker", ["version", "--format", "{{.Server.Version}}"]);
    return result.code === 0 && result.stdout.trim() !== "";
}

async function buildWithDocker(version, tarPath) {
    const reference = `worldlens-live-viewer:bundled-${version}`;
    log(`building ${reference} from this checkout`);
    const built = await run("docker", ["build", "-f", "design/packages/liveviewer/Dockerfile", "-t", reference, "."], { cwd: repoRoot, stdio: ["ignore", "inherit", "inherit"] });
    if (built.code !== 0) throw new Error("docker build failed.");
    const saved = await run("docker", ["save", "-o", tarPath, reference]);
    if (saved.code !== 0) throw new Error(`docker save failed: ${saved.stderr.trim()}`);
    const inspected = await run("docker", ["image", "inspect", "--format", "{{.Id}}", reference]);
    if (inspected.code !== 0) throw new Error("docker image inspect failed.");
    return { reference, imageId: inspected.stdout.trim() };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function readPin(path) {
    try {
        const pin = JSON.parse(await readFile(path, "utf8"));
        if (typeof pin.image === "string" && typeof pin.digest === "string" && /^sha256:[a-f0-9]{64}$/.test(pin.digest)) return pin;
    } catch {
        /* a missing or unreadable pin is reported by the caller */
    }
    return null;
}

async function main() {
    const args = process.argv.slice(2);
    const optional = args.includes("--optional");
    const forceRegistry = args.includes("--registry");
    const forceDocker = args.includes("--docker");
    const pinFlag = args.indexOf("--pin");
    const pinPath = pinFlag >= 0 ? resolve(args[pinFlag + 1]) : defaultPin;
    const packageJson = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));

    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    const tarPath = join(outDir, "liveviewer-image.tar");
    const work = join(outDir, ".work");

    let produced = null;
    const reasons = [];
    if (!forceRegistry && (await dockerUsable())) {
        try {
            produced = await buildWithDocker(packageJson.version, tarPath);
        } catch (error) {
            reasons.push(`docker route: ${error.message}`);
        }
    } else if (forceDocker) {
        reasons.push("docker route: no usable Docker daemon.");
    }
    if (produced === null && !forceDocker) {
        const pin = await readPin(pinPath);
        if (pin === null) {
            reasons.push(`registry route: no valid pin at ${pinPath}.`);
        } else {
            try {
                log(`fetching ${pin.image}@${pin.digest.slice(0, 19)}... by digest`);
                const built = await buildFromRegistry(pin, work);
                await writeTar(tarPath, built.entries);
                produced = { reference: built.reference, imageId: built.imageId };
            } catch (error) {
                reasons.push(`registry route: ${error.message}`);
            }
        }
    }
    await rm(work, { recursive: true, force: true });

    if (produced === null) {
        await rm(outDir, { recursive: true, force: true });
        const message = `No route produced the live viewer image. ${reasons.join(" ")}`;
        if (optional) {
            log(`WARNING: ${message} The build continues without it; hosting will say the image is not part of this build.`);
            return;
        }
        throw new Error(message);
    }

    const bytes = (await stat(tarPath)).size;
    const sha256 = await sha256File(tarPath);
    const meta = { reference: produced.reference, imageId: produced.imageId, version: packageJson.version, bytes, sha256 };
    const metaTemp = join(outDir, "liveviewer-image.json.tmp");
    await writeFile(metaTemp, JSON.stringify(meta, null, 2));
    await rename(metaTemp, join(outDir, "liveviewer-image.json"));
    log(`wrote ${tarPath} (${bytes} bytes, sha256 ${sha256})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`[liveviewer-image] ${error.message}\n`);
        process.exit(1);
    });
}
