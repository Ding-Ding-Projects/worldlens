import { readFile } from "node:fs/promises";

/**
 * Bounded verifier shared by staging, packaging and runtime repair.
 * It accepts ordinary JAR ZIPs only. ZIP64, encrypted entries, truncated central
 * directories and descriptor-less archives are rejected explicitly.
 */
export async function verifyJarFile(path) {
    try {
        return verifyJarBytes(await readFile(path));
    } catch (error) {
        return { ok: false, reason: `could not read JAR: ${String(error)}` };
    }
}

export function verifyJarBytes(bytes) {
    if (bytes.length < 4096) return { ok: false, reason: "JAR is smaller than the safety floor" };
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
    if (bytes.subarray(end + 20, end + 22).readUInt16LE(0) !== 0)
        return { ok: false, reason: "ZIP comment is not supported" };
    let cursor = centralOffset;
    let manifest = false;
    let classFile = false;
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
        if (endEntry > end || localOffset >= centralOffset)
            return { ok: false, reason: "JAR central entry exceeds its bounds" };
        const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
        manifest ||= name.toUpperCase() === "META-INF/MANIFEST.MF";
        classFile ||= name.endsWith(".class");
        cursor = endEntry;
    }
    if (!manifest) return { ok: false, reason: "JAR has no META-INF/MANIFEST.MF" };
    if (!classFile) return { ok: false, reason: "JAR has no class entry" };
    return { ok: true, reason: null };
}
