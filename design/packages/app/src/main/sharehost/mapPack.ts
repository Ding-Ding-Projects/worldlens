/**
 * Packing a rendered map into one tar, ready to be streamed into a volume.
 *
 * Two jobs that belong together: choosing which files go in, and writing them in a format
 * the map server's `--extract-tar` reads. The tar is plain ustar, with a pax header only
 * when a name is too long for the fixed field, so Go's `archive/tar` in the image reads it
 * with no extra tool and the same bytes work for a local volume and an SSH one.
 *
 * ## What is rewritten on the way in
 *
 * The tar holds `worldlens-map.json` first, then the map under `map/`, which is the layout
 * the map server reads from its volume (`/data/worldlens-map.json`, `/data/map`).
 *
 * `map/settings.json` is the one file that is not copied as it stands. A host that serves plain
 * files cannot answer a request for `0.prbm` out of `0.prbm.gz` the way BlueMap's own server
 * does, so the viewer is told to decompress tiles itself (`clientDecompression: true`) and
 * the map list is cut to the maps the person ticked. The render on this PC is never touched:
 * the edited copy exists only inside the tar.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const BLOCK = 512;
const MAX_FILES = 500_000;

export class PackCancelled extends Error {
    constructor() { super("Packing the map was cancelled."); this.name = "PackCancelled"; }
}

export interface PackOptions {
    /** The render's web root: `index.html`, `settings.json`, `maps/<id>/...`. */
    readonly webRoot: string;
    /** Map ids to include. */
    readonly maps: readonly string[];
    readonly outFile: string;
    /** Written as the first member, `worldlens-map.json`, which the map server reads. */
    readonly config: Readonly<Record<string, unknown>>;
    readonly signal?: AbortSignal;
    readonly onProgress?: (done: number, total: number) => void;
}

export interface PackReport {
    readonly files: number;
    /** Bytes of file content, which is what the person thinks of as "the size of the map". */
    readonly contentBytes: number;
    /** Bytes of the tar itself. */
    readonly tarBytes: number;
}

function octal(value: number, width: number): Buffer {
    const buffer = Buffer.alloc(width, 0);
    buffer.write(value.toString(8).padStart(width - 1, "0"), 0, "ascii");
    return buffer;
}

function header(name: string, size: number, type: "0" | "5" | "x", mode: number, prefix = ""): Buffer {
    const block = Buffer.alloc(BLOCK, 0);
    block.write(name, 0, 100, "utf8");
    octal(mode, 8).copy(block, 100);
    octal(0, 8).copy(block, 108);
    octal(0, 8).copy(block, 116);
    octal(size, 12).copy(block, 124);
    octal(Math.floor(Date.now() / 1000), 12).copy(block, 136);
    block.fill(0x20, 148, 156);
    block.write(type, 156, 1, "ascii");
    block.write("ustar\0", 257, "ascii");
    block.write("00", 263, "ascii");
    if (prefix !== "") block.write(prefix, 345, 155, "utf8");
    let sum = 0;
    for (const byte of block) sum += byte;
    block.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
    return block;
}

function padding(size: number): Buffer {
    const rest = size % BLOCK;
    return rest === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - rest, 0);
}

function paxRecord(key: string, value: string): Buffer {
    const body = ` ${key}=${value}\n`;
    let length = Buffer.byteLength(body) + 1;
    while (Buffer.byteLength(`${String(length)}${body}`) !== length) length = Buffer.byteLength(`${String(length)}${body}`);
    return Buffer.from(`${String(length)}${body}`, "utf8");
}

/** Writes one tar and counts what it wrote. Backpressure is honoured, so a 10 GB map streams. */
class TarSink {
    private readonly stream;
    bytes = 0;
    constructor(file: string) { this.stream = createWriteStream(file); }

    write(chunk: Buffer): Promise<void> {
        this.bytes += chunk.length;
        return new Promise((resolve, reject) => {
            const onError = (error: Error): void => reject(error);
            this.stream.once("error", onError);
            if (this.stream.write(chunk)) { this.stream.off("error", onError); resolve(); }
            else this.stream.once("drain", () => { this.stream.off("error", onError); resolve(); });
        });
    }

    async entryName(name: string, size: number, type: "0" | "5", mode: number): Promise<void> {
        if (Buffer.byteLength(name) <= 100) { await this.write(header(name, size, type, mode)); return; }
        // ustar can split a long path across its name and prefix fields at a slash.
        for (let i = name.length - 1; i > 0; i -= 1) {
            if (name[i] !== "/") continue;
            const prefix = name.slice(0, i);
            const rest = name.slice(i + 1);
            if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100) {
                await this.write(header(rest, size, type, mode, prefix));
                return;
            }
        }
        const pax = paxRecord("path", name);
        await this.write(header("PaxHeader", pax.length, "x", 0o644));
        await this.write(pax);
        await this.write(padding(pax.length));
        await this.write(header(name.slice(0, 100), size, type, mode));
    }

    async addBuffer(name: string, content: Buffer): Promise<void> {
        await this.entryName(name, content.length, "0", 0o644);
        await this.write(content);
        await this.write(padding(content.length));
    }

    async addFile(name: string, path: string, size: number): Promise<void> {
        await this.entryName(name, size, "0", 0o644);
        let seen = 0;
        for await (const chunk of createReadStream(path)) {
            const data = chunk as Buffer;
            seen += data.length;
            if (seen > size) throw new Error(`${name} grew while it was being packed.`);
            await this.write(data);
        }
        if (seen !== size) throw new Error(`${name} changed size while it was being packed.`);
        await this.write(padding(size));
    }

    async finish(): Promise<void> {
        await this.write(Buffer.alloc(BLOCK * 2, 0));
        await new Promise<void>((resolve, reject) => { this.stream.once("error", reject); this.stream.end(resolve); });
    }
}

function safeMapId(value: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new Error(`Unsafe map id: ${value}`);
    return value;
}

interface Entry { readonly rel: string; readonly size: number }

async function walk(root: string, current: string, out: Entry[]): Promise<void> {
    if (current.split("/").filter(Boolean).length > 64) throw new Error(`The map is nested too deeply at ${current}.`);
    for (const row of await readdir(join(root, current), { withFileTypes: true })) {
        const rel = current === "" ? row.name : `${current}/${row.name}`;
        const info = await lstat(join(root, rel));
        if (info.isSymbolicLink()) throw new Error(`The map contains a symbolic link, which is not hosted: ${rel}`);
        if (info.isDirectory()) await walk(root, rel, out);
        else if (info.isFile()) {
            out.push({ rel, size: info.size });
            if (out.length > MAX_FILES) throw new Error("The map has too many files to host.");
        } else throw new Error(`The map contains something that is not a plain file: ${rel}`);
    }
}

/** Reads a map list entry, which BlueMap writes as either a bare id or `{ id }`. */
function entryId(entry: unknown): string | null {
    if (typeof entry === "string") return entry;
    if (typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string") return (entry as { id: string }).id;
    return null;
}

/** The settings a static host needs, with the map list cut to the chosen maps. */
export function hostedSettings(raw: string, maps: readonly string[]): string {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("The map's settings.json is not an object.");
    const settings = parsed as Record<string, unknown>;
    const root = settings["mapDataRoot"];
    if (typeof root === "string" && /^https?:\/\//.test(root)) {
        throw new Error(`This map reads its tiles from ${root} instead of its own files, so hosting its files would not host the map.`);
    }
    settings["clientDecompression"] = true;
    if (Array.isArray(settings["maps"])) {
        settings["maps"] = settings["maps"].filter((entry) => {
            const id = entryId(entry);
            return id !== null && maps.includes(id);
        });
    }
    return `${JSON.stringify(settings, null, 2)}\n`;
}

export async function packMap(options: PackOptions): Promise<PackReport> {
    if (options.maps.length === 0) throw new Error("Choose at least one map to host.");
    const selected = options.maps.map(safeMapId);
    const entries: Entry[] = [];
    await walk(options.webRoot, "", entries);
    const chosen = entries
        .filter((entry) => !entry.rel.startsWith("maps/") || selected.includes(entry.rel.split("/")[1] ?? ""))
        .filter((entry) => entry.rel !== "settings.json")
        .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    const present = new Set(entries.filter((entry) => entry.rel.startsWith("maps/")).map((entry) => entry.rel.split("/")[1]));
    for (const id of selected) if (!present.has(id)) throw new Error(`The render has no map called ${id}.`);

    const settings = Buffer.from(hostedSettings(await readFile(join(options.webRoot, "settings.json"), "utf8"), selected), "utf8");
    const sink = new TarSink(options.outFile);
    let contentBytes = settings.length;
    try {
        await sink.addBuffer("worldlens-map.json", Buffer.from(`${JSON.stringify(options.config, null, 2)}\n`, "utf8"));
        await sink.addBuffer("map/settings.json", settings);
        for (let i = 0; i < chosen.length; i += 1) {
            if (options.signal?.aborted === true) throw new PackCancelled();
            const entry = chosen[i] as Entry;
            await sink.addFile(`map/${entry.rel}`, join(options.webRoot, entry.rel), entry.size);
            contentBytes += entry.size;
            options.onProgress?.(i + 1, chosen.length);
        }
        await sink.finish();
    } catch (error) {
        await sink.finish().catch(() => undefined);
        throw error;
    }
    return { files: chosen.length + 2, contentBytes, tarBytes: sink.bytes };
}

/** Each map's size on disk, for the "Maps to include" list. */
export async function listMapSizes(webRoot: string): Promise<readonly { readonly id: string; readonly bytes: number }[]> {
    const entries: Entry[] = [];
    await walk(webRoot, "maps", entries).catch(() => undefined);
    const sizes = new Map<string, number>();
    for (const entry of entries) {
        const id = entry.rel.split("/")[1];
        if (id !== undefined) sizes.set(id, (sizes.get(id) ?? 0) + entry.size);
    }
    return [...sizes.entries()].map(([id, bytes]) => ({ id, bytes })).sort((a, b) => a.id.localeCompare(b.id));
}
