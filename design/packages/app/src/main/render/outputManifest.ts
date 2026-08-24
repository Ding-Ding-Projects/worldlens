import { createHash } from "node:crypto";
import { lstat, open, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export const OUTPUT_MANIFEST_VERSION = 1;
const MAX_FILES = 500_000;
const MAX_BYTES = 20_000_000_000;
const SAMPLE_BYTES = 65_536;

export interface CompletedOutputManifest {
    readonly version: 1;
    readonly fileCount: number;
    readonly totalBytes: number;
    readonly payloadFingerprint: string;
}

export async function buildCompletedOutputManifest(
    root: string,
): Promise<CompletedOutputManifest | null> {
    const absoluteRoot = resolve(root);
    const files: string[] = [];
    const queue = [absoluteRoot];
    let queueIndex = 0;
    while (queueIndex < queue.length) {
        const current = queue[queueIndex++];
        if (current === undefined) break;
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const path = join(current, entry.name);
            const info = await lstat(path);
            if (info.isSymbolicLink()) return null;
            if (info.isDirectory()) queue.push(path);
            else if (info.isFile()) files.push(path);
            if (files.length > MAX_FILES) return null;
        }
    }
    files.sort((left, right) =>
        relative(absoluteRoot, left).localeCompare(relative(absoluteRoot, right)),
    );
    const hash = createHash("sha256");
    let totalBytes = 0;
    for (const path of files) {
        const info = await lstat(path);
        totalBytes += info.size;
        if (totalBytes > MAX_BYTES) return null;
        const relativePath = relative(absoluteRoot, path).replaceAll("\\", "/");
        hash.update(`${relativePath}\0${String(info.size)}\0`);
        const handle = await open(path, "r");
        try {
            const sample = Buffer.allocUnsafe(Math.min(SAMPLE_BYTES, info.size));
            const read = await handle.read(sample, 0, sample.byteLength, 0);
            hash.update(sample.subarray(0, read.bytesRead));
        } finally {
            await handle.close();
        }
    }
    return {
        version: 1,
        fileCount: files.length,
        totalBytes,
        payloadFingerprint: hash.digest("hex"),
    };
}

export async function verifyCompletedOutputManifest(
    root: string,
    expected: CompletedOutputManifest,
): Promise<boolean> {
    const actual = await buildCompletedOutputManifest(root);
    return actual !== null && JSON.stringify(actual) === JSON.stringify(expected);
}
