import { lstat, readFile, stat } from "node:fs/promises";

const MAX_JAR_BYTES = 512 * 1024 * 1024;

export async function verifyJarFile(path) {
    try {
        await assertSafePath(path);
        const info = await stat(path);
        if (!info.isFile() || info.size > MAX_JAR_BYTES)
            return { ok: false, reason: "JAR exceeds the hard byte limit" };
        return verifyJarBytes(await readFile(path));
    } catch (error) {
        return { ok: false, reason: `could not read JAR: ${String(error)}` };
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

async function assertSafePath(path) {
    const absolute = path.replaceAll("/", "\\");
    const root = /^[A-Za-z]:\\/.test(absolute)
        ? absolute.slice(0, 3)
        : absolute.startsWith("\\")
          ? "\\"
          : "/";
    let current = root;
    for (const part of absolute
        .slice(root.length)
        .split(/[\\/]+/u)
        .filter(Boolean)) {
        current =
            current.endsWith("\\") || current.endsWith("/")
                ? `${current}${part}`
                : `${current}\\${part}`;
        if ((await lstat(current)).isSymbolicLink())
            throw new Error(`JAR path contains a symlink or reparse point: ${current}`);
    }
}
