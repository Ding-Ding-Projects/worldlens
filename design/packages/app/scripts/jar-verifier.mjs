import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";

const MAX_JAR_BYTES = 512 * 1024 * 1024;

export async function verifyJarFile(path, options = {}) {
    let handle;
    try {
        if (typeof options.root !== "string" || options.root.length === 0)
            return { ok: false, reason: "JAR verification requires an approved root" };
        const identity = await assertSafePath(path, options.root);
        const before = await lstat(path);
        const beforeReal = identity.candidateReal;
        if (before.isSymbolicLink())
            return { ok: false, reason: "JAR path is a symlink or reparse point" };
        handle = await open(path, "r");
        const info = await handle.stat();
        const after = await lstat(path);
        const afterReal = await realpath(path);
        if (
            after.isSymbolicLink() ||
            beforeReal !== afterReal ||
            !sameIdentity(before, after) ||
            !sameIdentity(info, after)
        ) {
            return { ok: false, reason: "JAR path changed while it was being opened" };
        }
        if (!info.isFile() || info.size > MAX_JAR_BYTES)
            return { ok: false, reason: "JAR exceeds the hard byte limit" };
        const bytes = await handle.readFile();
        const verified = verifyJarBytes(bytes);
        if (!verified.ok) return verified;
        return {
            ...verified,
            size: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
        };
    } catch (error) {
        return { ok: false, reason: `could not read JAR: ${String(error)}` };
    } finally {
        await handle?.close().catch(() => undefined);
    }
}

export function verifyJarBytes(bytes) {
    if (bytes.length < 4096) return { ok: false, reason: "JAR is smaller than the safety floor" };
    if (bytes.length > MAX_JAR_BYTES)
        return { ok: false, reason: "JAR exceeds the hard byte limit" };
    if (bytes.readUInt32LE(0) !== 0x04034b50)
        return { ok: false, reason: "JAR has no local ZIP header" };
    const tailStart = Math.max(0, bytes.length - 65_557);
    const end = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]), tailStart);
    if (end < 0 || end + 22 > bytes.length)
        return { ok: false, reason: "JAR has no bounded ZIP end record" };
    const entries = bytes.readUInt16LE(end + 10);
    const centralSize = bytes.readUInt32LE(end + 12);
    const centralOffset = bytes.readUInt32LE(end + 16);
    if (entries === 0 || centralOffset + centralSize > end)
        return { ok: false, reason: "JAR central directory is out of bounds" };
    if (bytes.readUInt16LE(end + 20) !== 0)
        return { ok: false, reason: "ZIP comment is not supported" };
    let cursor = centralOffset;
    let manifest = false;
    let classFile = false;
    const ranges = [];
    for (let index = 0; index < entries; index += 1) {
        if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
            return { ok: false, reason: "JAR central entry is truncated" };
        const flags = bytes.readUInt16LE(cursor + 8);
        if ((flags & 1) !== 0)
            return { ok: false, reason: "encrypted JAR entries are not supported" };
        const compressedSize = bytes.readUInt32LE(cursor + 20);
        const uncompressedSize = bytes.readUInt32LE(cursor + 24);
        const nameLength = bytes.readUInt16LE(cursor + 28);
        const extraLength = bytes.readUInt16LE(cursor + 30);
        const commentLength = bytes.readUInt16LE(cursor + 32);
        const localOffset = bytes.readUInt32LE(cursor + 42);
        if ([compressedSize, uncompressedSize, localOffset].some((value) => value === 0xffffffff))
            return { ok: false, reason: "ZIP64 JAR entries are not supported" };
        const endEntry = cursor + 46 + nameLength + extraLength + commentLength;
        if (
            endEntry > end ||
            localOffset + 30 > centralOffset ||
            bytes.readUInt32LE(localOffset) !== 0x04034b50
        )
            return { ok: false, reason: "JAR local entry is missing or out of bounds" };
        const localNameLength = bytes.readUInt16LE(localOffset + 26);
        const localExtraLength = bytes.readUInt16LE(localOffset + 28);
        if (localNameLength !== nameLength || localExtraLength !== extraLength)
            return { ok: false, reason: "JAR local descriptor lengths differ" };
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataStart > centralOffset || dataEnd > centralOffset)
            return { ok: false, reason: "JAR compressed data exceeds its bounds" };
        if (ranges.some((range) => localOffset < range.end && dataEnd > range.start))
            return { ok: false, reason: "JAR local records overlap" };
        ranges.push({ start: localOffset, end: dataEnd });
        const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
        manifest ||= name.toUpperCase() === "META-INF/MANIFEST.MF";
        classFile ||= name.endsWith(".class");
        cursor = endEntry;
    }
    if (!manifest) return { ok: false, reason: "JAR has no META-INF/MANIFEST.MF" };
    if (!classFile) return { ok: false, reason: "JAR has no class entry" };
    return { ok: true, reason: null };
}

async function assertSafePath(path, approvedRoot) {
    const rootAbsolute = resolve(approvedRoot);
    const candidateAbsolute = resolve(path);
    const distance = relative(rootAbsolute, candidateAbsolute);
    if (
        distance.length === 0 ||
        isAbsolute(distance) ||
        distance === ".." ||
        distance.startsWith(`..${sep}`)
    )
        throw new Error("JAR path escapes its approved root");
    await walkSafeComponents(rootAbsolute);
    await walkSafeComponents(candidateAbsolute);
    const rootReal = await realpath(rootAbsolute);
    const candidateReal = await realpath(candidateAbsolute);
    const realDistance = relative(rootReal, candidateReal);
    if (
        realDistance.length === 0 ||
        isAbsolute(realDistance) ||
        realDistance === ".." ||
        realDistance.startsWith(`..${sep}`)
    )
        throw new Error("JAR realpath escapes its approved root");
    return { rootReal, candidateReal };
}

async function walkSafeComponents(absolute) {
    const root = parse(absolute).root;
    const parts = relative(root, absolute).split(sep).filter(Boolean);
    let current = root;
    for (const part of parts) {
        current = join(current, part);
        if ((await lstat(current)).isSymbolicLink())
            throw new Error(`JAR path contains a symlink or reparse point: ${current}`);
    }
}

function sameIdentity(left, right) {
    return (
        left.dev === right.dev &&
        left.ino === right.ino &&
        left.size === right.size &&
        left.mtimeMs === right.mtimeMs
    );
}
