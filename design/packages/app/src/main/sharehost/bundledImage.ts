/**
 * The map server image that ships inside the app.
 *
 * Hosting must not download anything, so the image is carried as a `docker save` tar for
 * each architecture, produced by `scripts/build-mapserver-image.mjs` at build time and
 * described by `mapserver-image.json` beside the tars. Before a tar is sent to a machine its
 * SHA-256 is checked against that manifest, so a corrupted or swapped file is refused here
 * rather than loaded into somebody's Docker.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ImageArch = "amd64" | "arm64";

export interface BundledImage {
    /** `worldlens-map-server:<version>`, the reference the container is started from. */
    readonly ref: string;
    readonly tarPath: string;
    readonly sha256: string;
    /**
     * The image's layer diff ids, used to skip `docker load` when the same image is already
     * there. Layer ids are identical under both Docker image stores, where an image id is not.
     */
    readonly layers: readonly string[];
    readonly version: string;
}

interface Manifest {
    readonly version: 1;
    readonly image: string;
    readonly tag: string;
    readonly appVersion?: string;
    readonly images: Readonly<Record<string, { readonly file: string; readonly sha256: string; readonly layers: readonly string[] } | undefined>>;
}

export class BundledImageError extends Error {
    constructor(message: string) { super(message); this.name = "BundledImageError"; }
}

/** Maps what `docker info` calls an architecture onto the two this app ships. */
export function archFromDocker(value: string): ImageArch | null {
    const arch = value.trim().toLowerCase();
    if (arch === "x86_64" || arch === "amd64") return "amd64";
    if (arch === "aarch64" || arch === "arm64") return "arm64";
    return null;
}

async function hashFile(path: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return hash.digest("hex");
}

function parseManifest(raw: string): Manifest {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) throw new BundledImageError("The map server image manifest is not an object.");
    const manifest = value as Partial<Manifest>;
    if (manifest.version !== 1 || typeof manifest.image !== "string" || typeof manifest.tag !== "string" || typeof manifest.images !== "object" || manifest.images === null) {
        throw new BundledImageError("The map server image manifest is not in a known format.");
    }
    return manifest as Manifest;
}

/** True when `docker image inspect --format {{json .RootFS.Layers}}` output is this image. */
export function sameLayers(inspectOutput: string, image: Pick<BundledImage, "layers">): boolean {
    try {
        const found: unknown = JSON.parse(inspectOutput);
        return Array.isArray(found) && found.length === image.layers.length && found.every((layer, index) => layer === image.layers[index]);
    } catch {
        return false;
    }
}

const verified = new Map<string, string>();

/** Finds the bundled tar for `arch` and proves it is the file the build produced. */
export async function readBundledImage(directory: string, arch: ImageArch): Promise<BundledImage> {
    let manifest: Manifest;
    try {
        manifest = parseManifest(await readFile(join(directory, "mapserver-image.json"), "utf8"));
    } catch (error) {
        if (error instanceof BundledImageError) throw error;
        throw new BundledImageError("The map server image is not bundled with this build, so there is nothing to host from. Rebuild with scripts/build-mapserver-image.mjs.");
    }
    const entry = manifest.images[arch];
    if (entry === undefined) throw new BundledImageError(`This build carries no map server image for ${arch}.`);
    if (!/^[A-Za-z0-9._-]+$/.test(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Array.isArray(entry.layers) || entry.layers.length === 0) throw new BundledImageError("The map server image manifest names an unsafe file.");
    const tarPath = join(directory, entry.file);
    const cached = verified.get(tarPath);
    if (cached !== entry.sha256) {
        let actual: string;
        try { actual = await hashFile(tarPath); } catch { throw new BundledImageError(`The bundled map server image file ${entry.file} is missing.`); }
        if (actual !== entry.sha256) throw new BundledImageError(`The bundled map server image ${entry.file} does not match its recorded checksum, so it was not used.`);
        verified.set(tarPath, entry.sha256);
    }
    return { ref: `${manifest.image}:${manifest.tag}`, tarPath, sha256: entry.sha256, layers: entry.layers, version: manifest.appVersion ?? manifest.tag };
}
