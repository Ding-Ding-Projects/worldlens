import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { isValidMapId } from "./config.js";

export const OUTPUT_MANIFEST_VERSION = 1;
const MAX_FILES = 500_000;
const MAX_BYTES = 20_000_000_000;
const READ_CHUNK_BYTES = 1_048_576;
const MAX_CONCURRENCY = 4;

export interface CompletedOutputManifest {
    readonly version: 1;
    readonly fileCount: number;
    readonly totalBytes: number;
    readonly payloadFingerprint: string;
    readonly maps: readonly {
        readonly id: string;
        readonly fileCount: number;
        readonly totalBytes: number;
        readonly payloadFingerprint: string;
    }[];
}

export function isCompletedOutputManifest(value: unknown): value is CompletedOutputManifest {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    if (
        record.version !== 1 ||
        typeof record.fileCount !== "number" ||
        !Number.isSafeInteger(record.fileCount) ||
        record.fileCount < 0 ||
        record.fileCount > MAX_FILES ||
        typeof record.totalBytes !== "number" ||
        !Number.isSafeInteger(record.totalBytes) ||
        record.totalBytes < 0 ||
        record.totalBytes > MAX_BYTES ||
        typeof record.payloadFingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(record.payloadFingerprint) ||
        !Array.isArray(record.maps) ||
        record.maps.length === 0 ||
        record.maps.length > 64
    )
        return false;
    const ids = new Set<string>();
    for (const value of record.maps) {
        if (typeof value !== "object" || value === null) return false;
        const map = value as Record<string, unknown>;
        if (
            typeof map.id !== "string" ||
            !isValidMapId(map.id) ||
            ids.has(map.id) ||
            typeof map.fileCount !== "number" ||
            !Number.isSafeInteger(map.fileCount) ||
            map.fileCount < 0 ||
            map.fileCount > MAX_FILES ||
            typeof map.totalBytes !== "number" ||
            !Number.isSafeInteger(map.totalBytes) ||
            map.totalBytes < 0 ||
            map.totalBytes > MAX_BYTES ||
            typeof map.payloadFingerprint !== "string" ||
            !/^[a-f0-9]{64}$/.test(map.payloadFingerprint)
        )
            return false;
        ids.add(map.id);
    }
    return true;
}

interface FileDigest {
    readonly path: string;
    readonly relativePath: string;
    readonly bytes: number;
    readonly digest: string;
}

export async function buildCompletedOutputManifest(
    root: string,
    mapIds: readonly string[] = [],
): Promise<CompletedOutputManifest | null> {
    const absoluteRoot = resolve(root);
    const rootInfo = await lstat(absoluteRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return null;
    const files: string[] = [];
    const queue = [absoluteRoot];
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
        const current = queue[queueIndex];
        if (current === undefined) break;
        const currentInfo = await lstat(current);
        if (!currentInfo.isDirectory() || currentInfo.isSymbolicLink()) return null;
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

    const results: Array<FileDigest | null> = new Array(files.length).fill(null);
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
        while (true) {
            const index = nextIndex++;
            const path = files[index];
            if (path === undefined) return;
            results[index] = await digestFile(path, absoluteRoot);
            if (results[index] === null) return;
        }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, files.length) }, worker));
    if (results.some((result) => result === null)) return null;

    const rootHash = createHash("sha256");
    const mapHashes = new Map<string, ReturnType<typeof createHash>>();
    const mapCounts = new Map<string, { fileCount: number; totalBytes: number }>();
    for (const mapId of mapIds) {
        mapHashes.set(mapId, createHash("sha256"));
        mapCounts.set(mapId, { fileCount: 0, totalBytes: 0 });
    }
    let totalBytes = 0;
    for (const result of results) {
        if (result === null) return null;
        totalBytes += result.bytes;
        if (totalBytes > MAX_BYTES) return null;
        const header = `${result.relativePath}\0${String(result.bytes)}\0`;
        rootHash.update(header);
        rootHash.update(result.digest);
        const mapId = mapIds.find((candidate) =>
            result.relativePath.startsWith(`maps/${candidate}/`),
        );
        if (mapId !== undefined) {
            mapHashes.get(mapId)?.update(header);
            mapHashes.get(mapId)?.update(result.digest);
            const count = mapCounts.get(mapId)!;
            count.fileCount += 1;
            count.totalBytes += result.bytes;
        }
    }
    const maps = mapIds.map((id) => {
        const count = mapCounts.get(id)!;
        return {
            id,
            fileCount: count.fileCount,
            totalBytes: count.totalBytes,
            payloadFingerprint: mapHashes.get(id)!.digest("hex"),
        };
    });
    return {
        version: 1,
        fileCount: files.length,
        totalBytes,
        payloadFingerprint: rootHash.digest("hex"),
        maps,
    };
}

export async function verifyCompletedOutputManifest(
    root: string,
    expected: CompletedOutputManifest,
    mapIds: readonly string[] = expected.maps.map((map) => map.id),
): Promise<boolean> {
    const actual = await buildCompletedOutputManifest(root, mapIds);
    return actual !== null && JSON.stringify(actual) === JSON.stringify(expected);
}

async function digestFile(path: string, root: string): Promise<FileDigest | null> {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink()) return null;
    const noFollow = process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW;
    const handle = await open(path, fsConstants.O_RDONLY | noFollow);
    try {
        const opened = await handle.stat();
        const afterOpen = await lstat(path);
        if (
            afterOpen.isSymbolicLink() ||
            !sameIdentity(before, opened) ||
            !sameIdentity(afterOpen, opened)
        )
            return null;
        const hash = createHash("sha256");
        const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
        let position = 0;
        while (position < opened.size) {
            const read = await handle.read(
                buffer,
                0,
                Math.min(buffer.byteLength, opened.size - position),
                position,
            );
            if (read.bytesRead === 0) return null;
            hash.update(buffer.subarray(0, read.bytesRead));
            position += read.bytesRead;
        }
        const after = await handle.stat();
        const afterPath = await lstat(path);
        if (
            !sameIdentity(opened, after) ||
            afterPath.isSymbolicLink() ||
            !sameIdentity(afterPath, after)
        )
            return null;
        return {
            path,
            relativePath: relative(root, path).replaceAll("\\", "/"),
            bytes: after.size,
            digest: hash.digest("hex"),
        };
    } finally {
        await handle.close();
    }
}

function sameIdentity(
    left: { size: number; mtimeMs: number; ctimeMs: number; ino?: number; dev?: number },
    right: { size: number; mtimeMs: number; ctimeMs: number; ino?: number; dev?: number },
): boolean {
    return (
        left.size === right.size &&
        left.mtimeMs === right.mtimeMs &&
        left.ctimeMs === right.ctimeMs &&
        (left.ino === undefined ||
            right.ino === undefined ||
            left.ino === 0 ||
            right.ino === 0 ||
            left.ino === right.ino) &&
        (left.dev === undefined ||
            right.dev === undefined ||
            left.dev === 0 ||
            right.dev === 0 ||
            left.dev === right.dev)
    );
}
