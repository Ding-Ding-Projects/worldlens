/**
 * Local Base64 toolkit core: standard, URL-safe and MIME alphabets, padding and line-length
 * options, strict decoding with the exact offset of the first bad character, lenient decoding,
 * text encodings, `data:` URLs, type sniffing, the same-folder sidecar naming rule and streaming
 * encoders and decoders that hold at most one partial group between chunks.
 *
 * Nothing here touches the network or the file system; the desktop main process streams files
 * through the stream classes and the interface uses the same functions for text.
 */

export type Base64Alphabet = "standard" | "url" | "mime";
export type TextEncodingName = "utf-8" | "utf-16le" | "utf-16be" | "latin1";

const STANDARD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const reverse = (chars: string): Int8Array => {
    const table = new Int8Array(128).fill(-1);
    for (let i = 0; i < chars.length; i += 1) table[chars.charCodeAt(i)] = i;
    return table;
};
const STANDARD_REVERSE = reverse(STANDARD);
const URL_REVERSE = reverse(URL_SAFE);

export interface EncodeOptions {
    readonly alphabet?: Base64Alphabet;
    /** Defaults to true for standard and MIME, false for URL-safe. */
    readonly padding?: boolean;
    /** Wrap lines at this many characters. MIME defaults to 76 with CRLF. 0 means no wrapping. */
    readonly lineLength?: number;
}

function table(alphabet: Base64Alphabet): string {
    return alphabet === "url" ? URL_SAFE : STANDARD;
}

/** Turns ASCII codes into a flat string in slices, avoiding per-character concatenation. */
function asciiToString(codes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < codes.length; i += 32_768) out += String.fromCharCode.apply(null, codes.subarray(i, i + 32_768) as unknown as number[]);
    return out;
}

function rawEncode(bytes: Uint8Array, chars: string, final: boolean): { text: string; rest: Uint8Array } {
    const whole = final ? bytes.length : bytes.length - (bytes.length % 3);
    const codes = new Uint8Array(Math.ceil(whole / 3) * 4);
    const table = Uint8Array.from(chars, (c) => c.charCodeAt(0));
    const PAD = 61; // "="
    let o = 0;
    let i = 0;
    for (; i + 2 < whole; i += 3) {
        const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
        codes[o++] = table[(n >> 18) & 63]!;
        codes[o++] = table[(n >> 12) & 63]!;
        codes[o++] = table[(n >> 6) & 63]!;
        codes[o++] = table[n & 63]!;
    }
    if (final) {
        const left = bytes.length - i;
        if (left === 1) {
            const n = bytes[i]! << 16;
            codes[o++] = table[(n >> 18) & 63]!;
            codes[o++] = table[(n >> 12) & 63]!;
            codes[o++] = PAD;
            codes[o++] = PAD;
        } else if (left === 2) {
            const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
            codes[o++] = table[(n >> 18) & 63]!;
            codes[o++] = table[(n >> 12) & 63]!;
            codes[o++] = table[(n >> 6) & 63]!;
            codes[o++] = PAD;
        }
        return { text: asciiToString(codes.subarray(0, o)), rest: new Uint8Array(0) };
    }
    return { text: asciiToString(codes.subarray(0, o)), rest: bytes.slice(whole) };
}

function finish(text: string, options: EncodeOptions): string {
    const alphabet = options.alphabet ?? "standard";
    const padding = options.padding ?? alphabet !== "url";
    let out = padding ? text : text.replace(/=+$/u, "");
    const width = options.lineLength ?? (alphabet === "mime" ? 76 : 0);
    if (width > 0) {
        const lines: string[] = [];
        for (let i = 0; i < out.length; i += width) lines.push(out.slice(i, i + width));
        out = lines.join("\r\n");
    }
    return out;
}

export function encodeBytes(bytes: Uint8Array, options: EncodeOptions = {}): string {
    return finish(rawEncode(bytes, table(options.alphabet ?? "standard"), true).text, options);
}

export type DecodeResult =
    | { readonly ok: true; readonly bytes: Uint8Array }
    | { readonly ok: false; readonly offset: number; readonly message: string };

export interface DecodeOptions {
    readonly alphabet?: Base64Alphabet;
    /** Strict refuses anything outside the alphabet, wrong padding and stray whitespace. */
    readonly strict?: boolean;
}

/**
 * Decodes Base64 text. Strict mode reports the 0-based offset of the first character that is not
 * allowed; lenient mode skips whitespace, accepts both alphabets and missing padding.
 */
export function decodeText(text: string, options: DecodeOptions = {}): DecodeResult {
    const alphabet = options.alphabet ?? "standard";
    const strict = options.strict ?? true;
    const values = new Uint8Array(text.length);
    let count = 0;
    let padSeen = -1;
    let padCount = 0;
    for (let i = 0; i < text.length; i += 1) {
        const c = text[i]!;
        if (c === "\r" || c === "\n") {
            if (strict && alphabet !== "mime") return { ok: false, offset: i, message: `Line break at character ${i + 1}. Only MIME Base64 has line breaks.` };
            continue;
        }
        if (c === " " || c === "\t") {
            if (strict) return { ok: false, offset: i, message: `Space at character ${i + 1}. Strict decoding allows no spaces.` };
            continue;
        }
        if (c === "=") {
            if (padSeen < 0) padSeen = i;
            padCount += 1;
            continue;
        }
        if (padSeen >= 0) return { ok: false, offset: i, message: `"${c}" at character ${i + 1} comes after the padding.` };
        const code = c.charCodeAt(0);
        let v = code < 128 ? (alphabet === "url" ? URL_REVERSE : STANDARD_REVERSE)[code]! : -1;
        if (v < 0 && !strict && code < 128) v = (alphabet === "url" ? STANDARD_REVERSE : URL_REVERSE)[code]!;
        if (v < 0) return { ok: false, offset: i, message: `"${c}" at character ${i + 1} is not in the ${alphabet === "url" ? "URL-safe" : "standard"} alphabet.` };
        values[count++] = v;
    }
    const rem = count % 4;
    if (rem === 1) return { ok: false, offset: text.length, message: "The text ends one character into a group, which no input can produce." };
    if (strict) {
        const expectPad = rem === 0 ? 0 : 4 - rem;
        const padRequired = alphabet !== "url";
        if (padRequired && padCount !== expectPad) return { ok: false, offset: padSeen >= 0 ? padSeen : text.length, message: `Expected ${expectPad} padding character${expectPad === 1 ? "" : "s"} at the end, found ${padCount}.` };
        if (!padRequired && padCount !== 0 && padCount !== expectPad) return { ok: false, offset: padSeen, message: "Padding does not match the length." };
    } else if (padCount > 2) {
        return { ok: false, offset: padSeen, message: "More than two padding characters." };
    }
    const out = new Uint8Array(Math.floor((count * 3) / 4));
    let o = 0;
    for (let i = 0; i < count; i += 4) {
        const a = values[i]!, b = values[i + 1]!;
        out[o++] = (a << 2) | (b >> 4);
        if (i + 2 < count) out[o++] = ((b & 15) << 4) | (values[i + 2]! >> 2);
        if (i + 3 < count) out[o++] = ((values[i + 2]! & 3) << 6) | values[i + 3]!;
    }
    return { ok: true, bytes: out.slice(0, o) };
}

export function textToBytes(text: string, encoding: TextEncodingName = "utf-8"): Uint8Array {
    if (encoding === "utf-8") return new TextEncoder().encode(text);
    if (encoding === "utf-16le" || encoding === "utf-16be") {
        const out = new Uint8Array(text.length * 2);
        const le = encoding === "utf-16le";
        for (let i = 0; i < text.length; i += 1) {
            const code = text.charCodeAt(i);
            out[i * 2] = le ? code & 255 : code >> 8;
            out[i * 2 + 1] = le ? code >> 8 : code & 255;
        }
        return out;
    }
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        if (code > 255) throw new Error(`"${text[i]}" at character ${i + 1} cannot be written in Latin-1.`);
        out[i] = code;
    }
    return out;
}

export function bytesToText(bytes: Uint8Array, encoding: TextEncodingName = "utf-8"): string {
    if (encoding === "utf-8") return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (encoding === "utf-16le") return new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
    if (encoding === "utf-16be") {
        if (bytes.length % 2 !== 0) throw new Error("UTF-16 text has an even number of bytes; this has an odd number.");
        const swapped = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i += 2) {
            swapped[i] = bytes[i + 1]!;
            swapped[i + 1] = bytes[i]!;
        }
        return new TextDecoder("utf-16le", { fatal: true }).decode(swapped);
    }
    let out = "";
    for (const b of bytes) out += String.fromCharCode(b);
    return out;
}

export function buildDataUrl(mime: string, bytes: Uint8Array): string {
    return `data:${mime || "application/octet-stream"};base64,${encodeBytes(bytes)}`;
}

export type ParsedDataUrl =
    | { readonly ok: true; readonly mime: string; readonly bytes: Uint8Array }
    | { readonly ok: false; readonly message: string };

export function parseDataUrl(url: string): ParsedDataUrl {
    const match = /^data:([^,]*?),(.*)$/su.exec(url.trim());
    if (!match) return { ok: false, message: "A data: URL starts with data: and has a comma before the content." };
    const meta = match[1]!.split(";");
    const isBase64 = meta.includes("base64");
    const mime = meta[0] || "text/plain";
    if (!isBase64) {
        try {
            return { ok: true, mime, bytes: new TextEncoder().encode(decodeURIComponent(match[2]!)) };
        } catch {
            return { ok: false, message: "The URL-encoded content is not valid." };
        }
    }
    const decoded = decodeText(match[2]!, { strict: false });
    return decoded.ok ? { ok: true, mime, bytes: decoded.bytes } : { ok: false, message: decoded.message };
}

/** Detects common file types from their first bytes. Preview code uses this, never the file name. */
export function sniffMime(bytes: Uint8Array): { readonly mime: string; readonly extension: string } {
    const starts = (...sig: number[]): boolean => sig.every((b, i) => bytes[i] === b);
    if (starts(0x89, 0x50, 0x4e, 0x47)) return { mime: "image/png", extension: ".png" };
    if (starts(0xff, 0xd8, 0xff)) return { mime: "image/jpeg", extension: ".jpg" };
    if (starts(0x47, 0x49, 0x46, 0x38)) return { mime: "image/gif", extension: ".gif" };
    if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) return { mime: "image/webp", extension: ".webp" };
    if (starts(0x25, 0x50, 0x44, 0x46)) return { mime: "application/pdf", extension: ".pdf" };
    if (starts(0x50, 0x4b, 0x03, 0x04)) return { mime: "application/zip", extension: ".zip" };
    if (starts(0x1f, 0x8b)) return { mime: "application/gzip", extension: ".gz" };
    try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, 4096));
        const trimmed = text.trimStart();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) return { mime: "application/json", extension: ".json" };
        return { mime: "text/plain", extension: ".txt" };
    } catch {
        return { mime: "application/octet-stream", extension: ".bin" };
    }
}

export const SIDECAR_SUFFIX = ".base64.txt";

/** `level.dat` encodes to `level.dat.base64.txt` beside it. */
export function sidecarName(fileName: string): string {
    return `${fileName}${SIDECAR_SUFFIX}`;
}

/** `level.dat.base64.txt` (or `level.dat.b64`) decodes back to `level.dat`; anything else returns null. */
export function restoredName(fileName: string): string | null {
    const lower = fileName.toLowerCase();
    for (const suffix of [SIDECAR_SUFFIX, ".b64"]) {
        if (lower.endsWith(suffix)) {
            const original = fileName.slice(0, -suffix.length);
            return original === "" ? null : original;
        }
    }
    return null;
}

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/gzip": ".gz",
    "application/json": ".json",
    "text/plain": ".txt",
    "text/html": ".html",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
};

/**
 * The name a decoded file gets, in the contract's order: the `.base64.txt` or `.b64` name
 * pattern, then a `data:` URL's MIME type, then the decoded bytes' signature, and `.bin` last.
 * `sourceName` is the Base64 file's own name.
 */
export function decodedFileName(sourceName: string, dataUrlMime: string | null, firstBytes: Uint8Array): { readonly name: string; readonly from: "name" | "data-url" | "signature" | "fallback" } {
    const fromName = restoredName(sourceName);
    if (fromName) return { name: fromName, from: "name" };
    const stem = sourceName.replace(/\.(txt|b64|base64)$/iu, "") || "decoded";
    const mimeExt = dataUrlMime ? MIME_EXTENSIONS[dataUrlMime.toLowerCase()] : undefined;
    if (mimeExt) return { name: `${stem}${mimeExt}`, from: "data-url" };
    const sniffed = sniffMime(firstBytes);
    if (sniffed.extension !== ".bin" && sniffed.extension !== ".txt") return { name: `${stem}${sniffed.extension}`, from: "signature" };
    return { name: `${stem}${sniffed.extension === ".txt" ? ".txt" : ".bin"}`, from: sniffed.extension === ".txt" ? "signature" : "fallback" };
}

/** Byte signatures for audio and video, used only to choose a safe preview element. */
export function previewKind(mime: string): "image" | "audio" | "video" | "text" | "hex" {
    if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("text/") || mime === "application/json") return "text";
    return "hex";
}

/** A classic 16-bytes-per-line hex dump of at most `limit` bytes. */
export function hexDump(bytes: Uint8Array, limit = 4096): string {
    const lines: string[] = [];
    const end = Math.min(bytes.length, limit);
    for (let offset = 0; offset < end; offset += 16) {
        const row = bytes.slice(offset, Math.min(offset + 16, end));
        const hex = Array.from(row, (b) => b.toString(16).padStart(2, "0")).join(" ");
        const ascii = Array.from(row, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
        lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex.padEnd(47, " ")}  ${ascii}`);
    }
    return lines.join("\n");
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/**
 * A stored (uncompressed) ZIP of the given entries, for bulk export. Base64 text compresses
 * well, but storing keeps this small, dependency-free and readable by every unzip tool.
 */
export function storeZip(entries: readonly { readonly name: string; readonly bytes: Uint8Array }[]): Uint8Array {
    const enc = new TextEncoder();
    const local: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const entry of entries) {
        const name = enc.encode(entry.name.replace(/\\/gu, "/"));
        const crc = crc32(entry.bytes);
        const size = entry.bytes.length;
        const head = new DataView(new ArrayBuffer(30));
        head.setUint32(0, 0x04034b50, true);
        head.setUint16(4, 20, true);
        head.setUint16(6, 0x0800, true);
        head.setUint32(14, crc, true);
        head.setUint32(18, size, true);
        head.setUint32(22, size, true);
        head.setUint16(26, name.length, true);
        local.push(new Uint8Array(head.buffer), name, entry.bytes);
        const dir = new DataView(new ArrayBuffer(46));
        dir.setUint32(0, 0x02014b50, true);
        dir.setUint16(4, 20, true);
        dir.setUint16(6, 20, true);
        dir.setUint16(8, 0x0800, true);
        dir.setUint32(16, crc, true);
        dir.setUint32(20, size, true);
        dir.setUint32(24, size, true);
        dir.setUint16(28, name.length, true);
        dir.setUint32(42, offset, true);
        central.push(new Uint8Array(dir.buffer), name);
        offset += 30 + name.length + size;
    }
    const centralSize = central.reduce((n, part) => n + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    const parts = [...local, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}

/** The first name that is free, `name (1).ext` style, so a write never overwrites. */
export function freeSiblingName(fileName: string, exists: (name: string) => boolean): string {
    if (!exists(fileName)) return fileName;
    const dot = fileName.indexOf(".", 1);
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : "";
    for (let n = 1; n < 10_000; n += 1) {
        const candidate = `${stem} (${n})${ext}`;
        if (!exists(candidate)) return candidate;
    }
    throw new Error(`No free name for ${fileName}.`);
}

/** Streaming encoder: feed chunks of any size, at most two bytes are carried between them. */
export class Base64StreamEncoder {
    private carry: Uint8Array = new Uint8Array(0);
    private column = 0;
    private readonly chars: string;
    private readonly width: number;
    private readonly padding: boolean;

    constructor(private readonly options: EncodeOptions = {}) {
        const alphabet = options.alphabet ?? "standard";
        this.chars = table(alphabet);
        this.width = options.lineLength ?? (alphabet === "mime" ? 76 : 0);
        this.padding = options.padding ?? alphabet !== "url";
    }

    push(chunk: Uint8Array): string {
        const joined = new Uint8Array(this.carry.length + chunk.length);
        joined.set(this.carry);
        joined.set(chunk, this.carry.length);
        const { text, rest } = rawEncode(joined, this.chars, false);
        this.carry = rest;
        return this.wrap(text);
    }

    end(): string {
        let { text } = rawEncode(this.carry, this.chars, true);
        this.carry = new Uint8Array(0);
        if (!this.padding) text = text.replace(/=+$/u, "");
        return this.wrap(text);
    }

    private wrap(text: string): string {
        if (this.width <= 0) return text;
        const parts: string[] = [];
        let at = 0;
        while (at < text.length) {
            if (this.column === this.width) {
                parts.push("\r\n");
                this.column = 0;
            }
            const take = Math.min(this.width - this.column, text.length - at);
            parts.push(text.slice(at, at + take));
            at += take;
            this.column += take;
        }
        return parts.join("");
    }
}

/** Streaming decoder: carries at most three characters between chunks. Lenient on whitespace. */
export class Base64StreamDecoder {
    private carry = "";
    private consumed = 0;

    constructor(private readonly options: DecodeOptions = {}) {}

    push(text: string): Uint8Array {
        const clean = (this.carry + text).replace(/[\r\n\t ]/gu, "");
        const whole = clean.length - (clean.length % 4);
        const head = clean.slice(0, whole);
        this.carry = clean.slice(whole);
        if (head.includes("=") && this.carry.length > 0) throw new Error("Padding appears before the end of the text.");
        return this.decode(head);
    }

    end(): Uint8Array {
        const rest = this.carry;
        this.carry = "";
        return rest === "" ? new Uint8Array(0) : this.decode(rest);
    }

    private decode(text: string): Uint8Array {
        const result = decodeText(text, { alphabet: this.options.alphabet ?? "standard", strict: false });
        if (!result.ok) throw new Error(`${result.message} (near character ${this.consumed + result.offset + 1})`);
        this.consumed += text.length;
        return result.bytes;
    }
}
