/**
 * The editable NBT tree.
 *
 * The streaming reader and writer elsewhere in this package map NBT onto typed objects and
 * discard everything an object cannot hold: duplicate keys, the declared type of an empty
 * list, string bytes that are not valid text, NaN payloads. An editor has to keep all of
 * that, because opening a file and saving it without a change must give back the same bytes.
 * This tree therefore models the file itself rather than the data it describes.
 */

/** Every NBT tag type except End, which is a delimiter and never a value. */
export type TagKind =
    | "byte"
    | "short"
    | "int"
    | "long"
    | "float"
    | "double"
    | "byteArray"
    | "string"
    | "list"
    | "compound"
    | "intArray"
    | "longArray";

/** The wire id of each tag type. */
export const TAG_IDS: Readonly<Record<TagKind, number>> = {
    byte: 1,
    short: 2,
    int: 3,
    long: 4,
    float: 5,
    double: 6,
    byteArray: 7,
    string: 8,
    list: 9,
    compound: 10,
    intArray: 11,
    longArray: 12,
};

/** Every kind, in wire order, for pickers and exhaustive tests. */
export const TAG_KINDS: readonly TagKind[] = [
    "byte",
    "short",
    "int",
    "long",
    "float",
    "double",
    "byteArray",
    "string",
    "list",
    "compound",
    "intArray",
    "longArray",
];

const KIND_BY_ID = new Map<number, TagKind>(TAG_KINDS.map((kind) => [TAG_IDS[kind], kind]));

export function kindForId(id: number): TagKind | null {
    return KIND_BY_ID.get(id) ?? null;
}

/** The element type a list declares; `end` is how an empty list is allowed to say nothing. */
export type ListKind = TagKind | "end";

export type ScalarValue = number | bigint | string;
export type ArrayValue = number[] | bigint[];

/**
 * One tag.
 *
 * - Scalars keep their value in `value`; arrays keep theirs in `value` as a plain array.
 * - A compound or a list keeps its members in `children`; compound members are named, list
 *   members have a `null` name.
 * - `id` is stable for the life of an open document and never reused, so an interface can
 *   hold on to a node across edits, moves and undo.
 */
export interface NbtNode {
    id: number;
    kind: TagKind;
    name: string | null;
    value: ScalarValue | ArrayValue | null;
    children: NbtNode[] | null;
    /** For a list: the declared element type. */
    listKind: ListKind | null;
    /** Original bytes of the name when they do not survive a text round trip. */
    rawName: Uint8Array | null;
    /** Original bytes of a string value when they do not survive a text round trip. */
    rawText: Uint8Array | null;
    /** Original bit pattern of a NaN float or double, so the payload survives. */
    rawBits: bigint | null;
}

export type Compression = "gzip" | "zlib" | "none";
export type Endianness = "big" | "little";

/** A whole NBT file: the root compound plus everything about how it was wrapped. */
export interface NbtDocument {
    root: NbtNode;
    endianness: Endianness;
    compression: Compression;
    /** Bedrock `level.dat` carries an eight-byte header: a version and the payload length. */
    bedrockHeader: { version: number } | null;
    /** Bytes after the root compound, kept so nothing is silently dropped. */
    trailing: Uint8Array;
    nextId: number;
}

/** A refusal with a message fit for the person editing, not for a log. */
export class NbtError extends Error {
    constructor(
        message: string,
        readonly code:
            | "malformed"
            | "unsupported"
            | "invalid-value"
            | "invalid-operation"
            | "not-found"
            | "snbt",
    ) {
        super(message);
        this.name = "NbtError";
    }
}

/** The inclusive range of each integer kind. */
export const INTEGER_RANGES: Readonly<Record<"byte" | "short" | "int" | "long", { min: bigint; max: bigint }>> = {
    byte: { min: -128n, max: 127n },
    short: { min: -32768n, max: 32767n },
    int: { min: -2147483648n, max: 2147483647n },
    long: { min: -(2n ** 63n), max: 2n ** 63n - 1n },
};

export function isContainerKind(kind: TagKind): boolean {
    return kind === "list" || kind === "compound";
}

export function isArrayKind(kind: TagKind): boolean {
    return kind === "byteArray" || kind === "intArray" || kind === "longArray";
}

export function isNumericKind(kind: TagKind): boolean {
    return (
        kind === "byte" ||
        kind === "short" ||
        kind === "int" ||
        kind === "long" ||
        kind === "float" ||
        kind === "double"
    );
}

/** Allocates the next node id for a document. */
export function allocateId(doc: { nextId: number }): number {
    return doc.nextId++;
}

/** A fresh node with the empty value of its kind. */
export function createNode(doc: { nextId: number }, kind: TagKind, name: string | null): NbtNode {
    return {
        id: allocateId(doc),
        kind,
        name,
        value: defaultValue(kind),
        children: kind === "list" || kind === "compound" ? [] : null,
        listKind: kind === "list" ? "end" : null,
        rawName: null,
        rawText: null,
        rawBits: null,
    };
}

export function defaultValue(kind: TagKind): ScalarValue | ArrayValue | null {
    switch (kind) {
        case "byte":
        case "short":
        case "int":
        case "float":
        case "double":
            return 0;
        case "long":
            return 0n;
        case "string":
            return "";
        case "byteArray":
        case "intArray":
            return [];
        case "longArray":
            return [];
        default:
            return null;
    }
}
