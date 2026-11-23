import { createReadStream } from "node:fs";
import type { FileHandle } from "node:fs/promises";

/** One tar member backed either by bytes in memory or by a file on disk. */
export type TarSource = { readonly name: string; readonly data: Buffer } | { readonly name: string; readonly path: string; readonly size: number; readonly mode?: number };

export const TAR_BLOCK = 512;

const octal = (value: number, width: number): string => value.toString(8).padStart(width - 1, "0") + "\0";

/** Builds one POSIX ustar header block. Names longer than 100 bytes use the prefix field. */
export function tarHeader(name: string, size: number, mode = 0o644, mtime = 0): Buffer {
    const header = Buffer.alloc(TAR_BLOCK);
    let prefix = "";
    let base = name;
    if (Buffer.byteLength(name) > 100) {
        const cut = name.lastIndexOf("/", 155);
        if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error(`Tar member name is too long: ${name}`);
        prefix = name.slice(0, cut);
        base = name.slice(cut + 1);
    }
    if (size < 0 || size > 0o77777777777) throw new Error("Tar member is too large for a ustar header.");
    header.write(base, 0, 100, "utf8");
    header.write(octal(mode, 8), 100, 8, "ascii");
    header.write(octal(0, 8), 108, 8, "ascii");
    header.write(octal(0, 8), 116, 8, "ascii");
    header.write(octal(size, 12), 124, 12, "ascii");
    header.write(octal(mtime, 12), 136, 12, "ascii");
    header.fill(0x20, 148, 156);
    header.write("0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    header.write(prefix, 345, 155, "utf8");
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    return header;
}

export const tarPadding = (size: number): number => (TAR_BLOCK - (size % TAR_BLOCK)) % TAR_BLOCK;

/** True when the block starts a ustar member: the magic is what the appliance boot script looks for. */
export function isUstarHeader(block: Buffer): boolean {
    return block.length >= TAR_BLOCK && block.subarray(257, 262).toString("ascii") === "ustar";
}

export function tarMemberName(block: Buffer): string {
    const end = block.indexOf(0);
    return block.subarray(0, end < 0 || end > 100 ? 100 : end).toString("utf8");
}

/** The whole archive, in memory. Only for small archives (the map config); disk-sized ones stream. */
export function buildTar(entries: readonly { readonly name: string; readonly data: Buffer }[]): Buffer {
    const parts: Buffer[] = [];
    for (const entry of entries) {
        parts.push(tarHeader(entry.name, entry.data.length), entry.data, Buffer.alloc(tarPadding(entry.data.length)));
    }
    parts.push(Buffer.alloc(TAR_BLOCK * 2));
    return Buffer.concat(parts);
}

/** Total bytes a streamed archive of these sources occupies, end-of-archive blocks included. */
export function tarSize(sources: readonly TarSource[]): number {
    let total = TAR_BLOCK * 2;
    for (const source of sources) {
        const size = "data" in source ? source.data.length : source.size;
        total += TAR_BLOCK + size + tarPadding(size);
    }
    return total;
}

/**
 * Streams a tar archive into an open file at `offset`. Returns the number of bytes written.
 * File-backed members are read in chunks, so a multi-gigabyte render never sits in memory.
 */
export async function writeTarTo(handle: FileHandle, offset: number, sources: readonly TarSource[]): Promise<number> {
    let position = offset;
    const put = async (buffer: Buffer): Promise<void> => {
        let done = 0;
        while (done < buffer.length) {
            const { bytesWritten } = await handle.write(buffer, done, buffer.length - done, position + done);
            done += bytesWritten;
        }
        position += buffer.length;
    };
    for (const source of sources) {
        if ("data" in source) {
            await put(tarHeader(source.name, source.data.length));
            await put(source.data);
            await put(Buffer.alloc(tarPadding(source.data.length)));
            continue;
        }
        await put(tarHeader(source.name, source.size, source.mode ?? 0o644));
        let sent = 0;
        for await (const chunk of createReadStream(source.path, { highWaterMark: 4 * 1024 * 1024 })) {
            const buffer = chunk as Buffer;
            sent += buffer.length;
            if (sent > source.size) throw new Error(`${source.path} grew while it was being packed.`);
            await put(buffer);
        }
        if (sent !== source.size) throw new Error(`${source.path} changed size while it was being packed.`);
        await put(Buffer.alloc(tarPadding(source.size)));
    }
    await put(Buffer.alloc(TAR_BLOCK * 2));
    return position - offset;
}
