/**
 * The viewer image that ships inside the application.
 *
 * Hosting never downloads at click time. `scripts/build-liveviewer-image.mjs` writes two
 * files at build time: a docker-archive tar and a small JSON description next to it. This
 * module finds them and checks the tar against the recorded SHA-256 before anything is
 * handed to Docker, so a truncated or replaced file is refused rather than loaded.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const IMAGE_TAR = "liveviewer-image.tar";
export const IMAGE_META = "liveviewer-image.json";

export interface BundledImage {
    /** The tag the archive carries, which `docker load` restores. */
    readonly reference: string;
    /** The image id (config digest) the archive must produce, when recorded. */
    readonly imageId: string | null;
    readonly version: string;
    readonly tarPath: string;
    readonly bytes: number;
    readonly sha256: string;
}

export type BundledImageResult =
    | { readonly ok: true; readonly image: BundledImage }
    | { readonly ok: false; readonly reason: "missing" | "corrupt"; readonly message: string };

function sha256File(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash("sha256");
        const stream = createReadStream(path);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

export async function readBundledImage(directory: string): Promise<BundledImageResult> {
    let meta: Record<string, unknown>;
    try {
        meta = JSON.parse(await readFile(join(directory, IMAGE_META), "utf8")) as Record<string, unknown>;
    } catch {
        return { ok: false, reason: "missing", message: "The live viewer image is not part of this build." };
    }
    const tarPath = join(directory, IMAGE_TAR);
    let size: number;
    try {
        size = (await stat(tarPath)).size;
    } catch {
        return { ok: false, reason: "missing", message: "The live viewer image file is missing from this build." };
    }
    const { reference, sha256, version, imageId } = meta;
    if (typeof reference !== "string" || !/^[a-z0-9][a-z0-9./_:-]{1,200}$/i.test(reference) || typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256) || typeof version !== "string") {
        return { ok: false, reason: "corrupt", message: "The live viewer image description is not valid." };
    }
    if (typeof meta.bytes === "number" && meta.bytes !== size) {
        return { ok: false, reason: "corrupt", message: "The live viewer image file has the wrong size." };
    }
    if ((await sha256File(tarPath)) !== sha256) {
        return { ok: false, reason: "corrupt", message: "The live viewer image file does not match its recorded checksum." };
    }
    return {
        ok: true,
        image: {
            reference,
            imageId: typeof imageId === "string" && /^sha256:[a-f0-9]{64}$/.test(imageId) ? imageId : null,
            version,
            tarPath,
            bytes: size,
            sha256,
        },
    };
}
