/**
 * Reads a .zip into path → bytes: stored and deflate entries, through the central directory.
 * Deflate uses the platform's DecompressionStream, so no library is bundled. Paths that would
 * escape (absolute, `..`) are skipped.
 */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            end = i;
            break;
        }
    }
    if (end < 0) throw new Error("That file is not a .zip.");
    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const out = new Map<string, Uint8Array>();
    for (let n = 0; n < count; n++) {
        if (view.getUint32(at, true) !== 0x02014b50)
            throw new Error("The .zip directory is damaged.");
        const method = view.getUint16(at + 10, true);
        const size = view.getUint32(at + 20, true);
        const nameLength = view.getUint16(at + 28, true);
        const extra = view.getUint16(at + 30, true);
        const comment = view.getUint16(at + 32, true);
        const local = view.getUint32(at + 42, true);
        const name = new TextDecoder()
            .decode(bytes.subarray(at + 46, at + 46 + nameLength))
            .replace(/\\/g, "/");
        at += 46 + nameLength + extra + comment;
        if (name.endsWith("/") || name.startsWith("/") || name.split("/").includes("..")) continue;
        const dataAt =
            local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const raw = bytes.subarray(dataAt, dataAt + size);
        if (method === 0) out.set(name, raw.slice());
        else if (method === 8) {
            const stream = new Blob([raw as BlobPart])
                .stream()
                .pipeThrough(new DecompressionStream("deflate-raw"));
            out.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
        } else throw new Error(`${name} uses a compression this does not read.`);
    }
    return out;
}
