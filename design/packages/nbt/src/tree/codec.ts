import { deflateSync, gunzipSync, gzipSync, inflateSync } from "node:zlib";
import { decodeModifiedUtf8, encodeModifiedUtf8 } from "../ModifiedUtf8.js";
import {
    NbtError,
    TAG_IDS,
    allocateId,
    kindForId,
    type Compression,
    type Endianness,
    type NbtDocument,
    type NbtNode,
    type TagKind,
} from "./types.js";

/** Minecraft refuses anything nested deeper than this, so a file that is has been damaged. */
const MAX_DEPTH = 512;
const BEDROCK_HEADER_BYTES = 8;

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const UTF8_ENCODER = new TextEncoder();

interface TextCodec {
    decode(bytes: Uint8Array): string;
    encode(text: string): Uint8Array;
}

/** Java edition stores modified UTF-8; Bedrock stores ordinary UTF-8. */
function textCodecFor(endianness: Endianness): TextCodec {
    return endianness === "big"
        ? { decode: decodeModifiedUtf8, encode: encodeModifiedUtf8 }
        : { decode: (b) => UTF8_DECODER.decode(b), encode: (t) => UTF8_ENCODER.encode(t) };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/* -------------------------------------------------------------------------------------- */
/* Reading                                                                                */
/* -------------------------------------------------------------------------------------- */

class Reader {
    pos = 0;
    private readonly view: DataView;
    constructor(
        private readonly data: Uint8Array,
        private readonly little: boolean,
        readonly text: TextCodec,
    ) {
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    }

    get remaining(): number {
        return this.data.length - this.pos;
    }

    need(count: number): void {
        if (count < 0 || count > this.remaining)
            throw new NbtError(`The data ends early at byte ${this.pos}.`, "malformed");
    }

    u8(): number {
        this.need(1);
        return this.data[this.pos++]!;
    }
    i8(): number {
        this.need(1);
        const v = this.view.getInt8(this.pos);
        this.pos += 1;
        return v;
    }
    i16(): number {
        this.need(2);
        const v = this.view.getInt16(this.pos, this.little);
        this.pos += 2;
        return v;
    }
    u16(): number {
        this.need(2);
        const v = this.view.getUint16(this.pos, this.little);
        this.pos += 2;
        return v;
    }
    i32(): number {
        this.need(4);
        const v = this.view.getInt32(this.pos, this.little);
        this.pos += 4;
        return v;
    }
    i64(): bigint {
        this.need(8);
        const v = this.view.getBigInt64(this.pos, this.little);
        this.pos += 8;
        return v;
    }
    f32(): { value: number; raw: bigint | null } {
        this.need(4);
        const value = this.view.getFloat32(this.pos, this.little);
        const raw = Number.isNaN(value) ? BigInt(this.view.getUint32(this.pos, this.little)) : null;
        this.pos += 4;
        return { value, raw };
    }
    f64(): { value: number; raw: bigint | null } {
        this.need(8);
        const value = this.view.getFloat64(this.pos, this.little);
        const raw = Number.isNaN(value) ? this.view.getBigUint64(this.pos, this.little) : null;
        this.pos += 8;
        return { value, raw };
    }
    bytes(count: number): Uint8Array {
        this.need(count);
        const out = this.data.subarray(this.pos, this.pos + count);
        this.pos += count;
        return out;
    }
}

interface ReadText {
    value: string;
    raw: Uint8Array | null;
}

function readText(reader: Reader): ReadText {
    const length = reader.u16();
    const bytes = reader.bytes(length);
    let value: string;
    try {
        value = reader.text.decode(bytes);
    } catch {
        // Not text at all: keep the bytes, show a lossy rendering.
        return { value: new TextDecoder("utf-8").decode(bytes), raw: Uint8Array.from(bytes) };
    }
    const again = reader.text.encode(value);
    return { value, raw: sameBytes(again, bytes) ? null : Uint8Array.from(bytes) };
}

function readPayload(reader: Reader, doc: { nextId: number }, kind: TagKind, name: ReadText | null, depth: number): NbtNode {
    if (depth > MAX_DEPTH) throw new NbtError("The tags are nested too deeply.", "malformed");
    const node: NbtNode = {
        id: allocateId(doc),
        kind,
        name: name === null ? null : name.value,
        value: null,
        children: null,
        listKind: null,
        rawName: name?.raw ?? null,
        rawText: null,
        rawBits: null,
    };
    switch (kind) {
        case "byte":
            node.value = reader.i8();
            break;
        case "short":
            node.value = reader.i16();
            break;
        case "int":
            node.value = reader.i32();
            break;
        case "long":
            node.value = reader.i64();
            break;
        case "float": {
            const f = reader.f32();
            node.value = f.value;
            node.rawBits = f.raw;
            break;
        }
        case "double": {
            const f = reader.f64();
            node.value = f.value;
            node.rawBits = f.raw;
            break;
        }
        case "string": {
            const t = readText(reader);
            node.value = t.value;
            node.rawText = t.raw;
            break;
        }
        case "byteArray": {
            const length = reader.i32();
            if (length < 0) throw new NbtError("A byte array has a negative length.", "malformed");
            reader.need(length);
            const out: number[] = new Array<number>(length);
            for (let i = 0; i < length; i++) out[i] = reader.i8();
            node.value = out;
            break;
        }
        case "intArray": {
            const length = reader.i32();
            if (length < 0) throw new NbtError("An int array has a negative length.", "malformed");
            reader.need(length * 4);
            const out: number[] = new Array<number>(length);
            for (let i = 0; i < length; i++) out[i] = reader.i32();
            node.value = out;
            break;
        }
        case "longArray": {
            const length = reader.i32();
            if (length < 0) throw new NbtError("A long array has a negative length.", "malformed");
            reader.need(length * 8);
            const out: bigint[] = new Array<bigint>(length);
            for (let i = 0; i < length; i++) out[i] = reader.i64();
            node.value = out;
            break;
        }
        case "list": {
            const elementId = reader.u8();
            const length = reader.i32();
            if (length < 0) throw new NbtError("A list has a negative length.", "malformed");
            node.children = [];
            if (elementId === 0) {
                if (length > 0) throw new NbtError("A non-empty list declares no element type.", "malformed");
                node.listKind = "end";
                break;
            }
            const elementKind = kindForId(elementId);
            if (elementKind === null) throw new NbtError(`A list declares an unknown element type (${elementId}).`, "malformed");
            node.listKind = elementKind;
            // Every element takes at least one byte except an empty compound's end marker.
            if (length > reader.remaining) throw new NbtError("A list is longer than the data it sits in.", "malformed");
            for (let i = 0; i < length; i++) node.children.push(readPayload(reader, doc, elementKind, null, depth + 1));
            break;
        }
        case "compound": {
            node.children = [];
            for (;;) {
                const id = reader.u8();
                if (id === 0) break;
                const childKind = kindForId(id);
                if (childKind === null) throw new NbtError(`A tag has an unknown type (${id}).`, "malformed");
                const childName = readText(reader);
                node.children.push(readPayload(reader, doc, childKind, childName, depth + 1));
            }
            break;
        }
    }
    return node;
}

/** Parses an uncompressed NBT payload (a named root compound). */
export function parseNbtPayload(
    data: Uint8Array,
    endianness: Endianness = "big",
): { root: NbtNode; trailing: Uint8Array; nextId: number } {
    const reader = new Reader(data, endianness === "little", textCodecFor(endianness));
    const doc = { nextId: 1 };
    const id = reader.u8();
    if (id !== TAG_IDS.compound) throw new NbtError("The file does not start with a compound tag.", "malformed");
    const name = readText(reader);
    const root = readPayload(reader, doc, "compound", name, 0);
    return { root, trailing: Uint8Array.from(reader.bytes(reader.remaining)), nextId: doc.nextId };
}

/* -------------------------------------------------------------------------------------- */
/* Writing                                                                                */
/* -------------------------------------------------------------------------------------- */

class Writer {
    private buffer = new Uint8Array(4096);
    private view = new DataView(this.buffer.buffer);
    length = 0;
    constructor(
        private readonly little: boolean,
        readonly text: TextCodec,
    ) {}

    private ensure(extra: number): void {
        const need = this.length + extra;
        if (need <= this.buffer.length) return;
        let size = this.buffer.length;
        while (size < need) size *= 2;
        const next = new Uint8Array(size);
        next.set(this.buffer.subarray(0, this.length));
        this.buffer = next;
        this.view = new DataView(next.buffer);
    }
    u8(v: number): void {
        this.ensure(1);
        this.buffer[this.length++] = v & 0xff;
    }
    i16(v: number): void {
        this.ensure(2);
        this.view.setInt16(this.length, v, this.little);
        this.length += 2;
    }
    u16(v: number): void {
        this.ensure(2);
        this.view.setUint16(this.length, v, this.little);
        this.length += 2;
    }
    i32(v: number): void {
        this.ensure(4);
        this.view.setInt32(this.length, v, this.little);
        this.length += 4;
    }
    i64(v: bigint): void {
        this.ensure(8);
        this.view.setBigInt64(this.length, v, this.little);
        this.length += 8;
    }
    f32(v: number, raw: bigint | null): void {
        this.ensure(4);
        if (Number.isNaN(v) && raw !== null) this.view.setUint32(this.length, Number(raw), this.little);
        else this.view.setFloat32(this.length, v, this.little);
        this.length += 4;
    }
    f64(v: number, raw: bigint | null): void {
        this.ensure(8);
        if (Number.isNaN(v) && raw !== null) this.view.setBigUint64(this.length, raw, this.little);
        else this.view.setFloat64(this.length, v, this.little);
        this.length += 8;
    }
    bytes(b: Uint8Array): void {
        this.ensure(b.length);
        this.buffer.set(b, this.length);
        this.length += b.length;
    }
    result(): Uint8Array {
        return this.buffer.slice(0, this.length);
    }
}

function writeText(writer: Writer, text: string, raw: Uint8Array | null): void {
    const bytes = raw ?? writer.text.encode(text);
    if (bytes.length > 0xffff) throw new NbtError("A string is longer than 65,535 bytes.", "invalid-value");
    writer.u16(bytes.length);
    writer.bytes(bytes);
}

function writePayload(writer: Writer, node: NbtNode): void {
    switch (node.kind) {
        case "byte":
            writer.u8(node.value as number);
            break;
        case "short":
            writer.i16(node.value as number);
            break;
        case "int":
            writer.i32(node.value as number);
            break;
        case "long":
            writer.i64(node.value as bigint);
            break;
        case "float":
            writer.f32(node.value as number, node.rawBits);
            break;
        case "double":
            writer.f64(node.value as number, node.rawBits);
            break;
        case "string":
            writeText(writer, node.value as string, node.rawText);
            break;
        case "byteArray": {
            const v = node.value as number[];
            writer.i32(v.length);
            for (const x of v) writer.u8(x);
            break;
        }
        case "intArray": {
            const v = node.value as number[];
            writer.i32(v.length);
            for (const x of v) writer.i32(x);
            break;
        }
        case "longArray": {
            const v = node.value as bigint[];
            writer.i32(v.length);
            for (const x of v) writer.i64(x);
            break;
        }
        case "list": {
            const children = node.children ?? [];
            const kind = node.listKind ?? "end";
            writer.u8(kind === "end" ? 0 : TAG_IDS[kind]);
            writer.i32(children.length);
            for (const child of children) writePayload(writer, child);
            break;
        }
        case "compound":
            for (const child of node.children ?? []) {
                writer.u8(TAG_IDS[child.kind]);
                writeText(writer, child.name ?? "", child.rawName);
                writePayload(writer, child);
            }
            writer.u8(0);
            break;
    }
}

/** Serialises the root compound to an uncompressed NBT payload. */
export function writeNbtPayload(root: NbtNode, endianness: Endianness = "big", trailing?: Uint8Array): Uint8Array {
    const writer = new Writer(endianness === "little", textCodecFor(endianness));
    writer.u8(TAG_IDS.compound);
    writeText(writer, root.name ?? "", root.rawName);
    writePayload(writer, root);
    if (trailing !== undefined && trailing.length > 0) writer.bytes(trailing);
    return writer.result();
}

/* -------------------------------------------------------------------------------------- */
/* Files                                                                                  */
/* -------------------------------------------------------------------------------------- */

export function detectCompression(bytes: Uint8Array): Compression {
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return "gzip";
    if (bytes.length >= 2 && bytes[0] === 0x78 && ((bytes[0]! << 8) | bytes[1]!) % 31 === 0) return "zlib";
    return "none";
}

export function compressPayload(payload: Uint8Array, compression: Compression): Uint8Array {
    switch (compression) {
        case "gzip":
            return gzipSync(payload);
        case "zlib":
            return deflateSync(payload);
        default:
            return payload;
    }
}

export function decompressPayload(bytes: Uint8Array, compression: Compression): Uint8Array {
    try {
        if (compression === "gzip") return gunzipSync(bytes);
        if (compression === "zlib") return inflateSync(bytes);
    } catch {
        throw new NbtError("The compressed data is damaged.", "malformed");
    }
    return bytes;
}

export interface ReadOptions {
    /** Force a byte order instead of detecting it. */
    endianness?: Endianness;
}

function readLe32(bytes: Uint8Array, offset: number): number {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, true);
}

/**
 * Reads a whole NBT file: detects gzip, zlib or none, then the Bedrock header and byte order.
 *
 * Detection never guesses silently. A Bedrock file is recognised by its header agreeing with
 * its own length; otherwise the file is Java and big-endian unless the caller says so.
 */
export function readNbtFile(bytes: Uint8Array, options: ReadOptions = {}): NbtDocument {
    const compression = detectCompression(bytes);
    const payload = decompressPayload(bytes, compression);
    let body = payload;
    let bedrockHeader: { version: number } | null = null;
    let endianness: Endianness = options.endianness ?? "big";
    if (
        options.endianness !== "big" &&
        payload.length > BEDROCK_HEADER_BYTES &&
        compression === "none" &&
        readLe32(payload, 4) === payload.length - BEDROCK_HEADER_BYTES
    ) {
        bedrockHeader = { version: readLe32(payload, 0) };
        body = payload.subarray(BEDROCK_HEADER_BYTES);
        endianness = "little";
    } else if (options.endianness === undefined && payload.length > 3 && payload[0] === TAG_IDS.compound) {
        // Big-endian: name length 0x0000..; little-endian root names are usually short, so the
        // first length byte is non-zero in the low position. Try the likely order first.
        const bigLength = (payload[1]! << 8) | payload[2]!;
        const littleLength = payload[1]! | (payload[2]! << 8);
        if (bigLength > payload.length - 3 && littleLength <= payload.length - 3) endianness = "little";
    }
    const parsed = parseNbtPayload(body, endianness);
    return {
        root: parsed.root,
        endianness,
        compression,
        bedrockHeader,
        trailing: parsed.trailing,
        nextId: parsed.nextId,
    };
}

/** Serialises a document back to file bytes in the wrapping it was opened with. */
export function writeNbtFile(doc: NbtDocument): Uint8Array {
    const payload = writeNbtPayload(doc.root, doc.endianness, doc.trailing);
    if (doc.bedrockHeader !== null) {
        const out = new Uint8Array(BEDROCK_HEADER_BYTES + payload.length);
        const view = new DataView(out.buffer);
        view.setInt32(0, doc.bedrockHeader.version, true);
        view.setInt32(4, payload.length, true);
        out.set(payload, BEDROCK_HEADER_BYTES);
        return out;
    }
    return compressPayload(payload, doc.compression);
}
