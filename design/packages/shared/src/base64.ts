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
export type TextEncodingName = "utf-8" | "utf-16le" | "latin1";

const STANDARD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

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

function rawEncode(bytes: Uint8Array, chars: string, final: boolean): { text: string; rest: Uint8Array } {
    const whole = final ? bytes.length : bytes.length - (bytes.length % 3);
    let out = "";
    let i = 0;
    for (; i + 2 < whole; i += 3) {
        const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
        out += chars[(n >> 18) & 63]! + chars[(n >> 12) & 63]! + chars[(n >> 6) & 63]! + chars[n & 63]!;
    }
    if (final) {
        const left = bytes.length - i;
        if (left === 1) {
            const n = bytes[i]! << 16;
            out += chars[(n >> 18) & 63]! + chars[(n >> 12) & 63]! + "==";
        } else if (left === 2) {
            const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
            out += chars[(n >> 18) & 63]! + chars[(n >> 12) & 63]! + chars[(n >> 6) & 63]! + "=";
        }
        return { text: out, rest: new Uint8Array(0) };
    }
    return { text: out, rest: bytes.slice(whole) };
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
    const values: number[] = [];
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
        let v = (alphabet === "url" ? URL_SAFE : STANDARD).indexOf(c);
        if (v < 0 && !strict) v = (alphabet === "url" ? STANDARD : URL_SAFE).indexOf(c);
        if (v < 0) return { ok: false, offset: i, message: `"${c}" at character ${i + 1} is not in the ${alphabet === "url" ? "URL-safe" : "standard"} alphabet.` };
        values.push(v);
    }
    const rem = values.length % 4;
    if (rem === 1) return { ok: false, offset: text.length, message: "The text ends one character into a group, which no input can produce." };
    if (strict) {
        const expectPad = rem === 0 ? 0 : 4 - rem;
        const padRequired = alphabet !== "url";
        if (padRequired && padCount !== expectPad) return { ok: false, offset: padSeen >= 0 ? padSeen : text.length, message: `Expected ${expectPad} padding character${expectPad === 1 ? "" : "s"} at the end, found ${padCount}.` };
        if (!padRequired && padCount !== 0 && padCount !== expectPad) return { ok: false, offset: padSeen, message: "Padding does not match the length." };
    } else if (padCount > 2) {
        return { ok: false, offset: padSeen, message: "More than two padding characters." };
    }
    const out = new Uint8Array(Math.floor((values.length * 3) / 4));
    let o = 0;
    for (let i = 0; i < values.length; i += 4) {
        const a = values[i]!, b = values[i + 1]!, c = values[i + 2], d = values[i + 3];
        out[o++] = (a << 2) | (b >> 4);
        if (c !== undefined) out[o++] = ((b & 15) << 4) | (c >> 2);
        if (d !== undefined) out[o++] = ((c! & 3) << 6) | d;
    }
    return { ok: true, bytes: out.slice(0, o) };
}

export function textToBytes(text: string, encoding: TextEncodingName = "utf-8"): Uint8Array {
    if (encoding === "utf-8") return new TextEncoder().encode(text);
    if (encoding === "utf-16le") {
        const out = new Uint8Array(text.length * 2);
        for (let i = 0; i < text.length; i += 1) {
            const code = text.charCodeAt(i);
            out[i * 2] = code & 255;
            out[i * 2 + 1] = code >> 8;
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

/** `level.dat.base64.txt` decodes back to `level.dat`; anything else returns null. */
export function restoredName(fileName: string): string | null {
    if (!fileName.toLowerCase().endsWith(SIDECAR_SUFFIX)) return null;
    const original = fileName.slice(0, -SIDECAR_SUFFIX.length);
    return original === "" ? null : original;
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
        let out = "";
        for (const c of text) {
            if (this.column === this.width) {
                out += "\r\n";
                this.column = 0;
            }
            out += c;
            this.column += 1;
        }
        return out;
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
