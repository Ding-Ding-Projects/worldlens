import {
    INTEGER_RANGES,
    NbtError,
    allocateId,
    type ListKind,
    type NbtNode,
    type TagKind,
} from "./types.js";

/**
 * SNBT, the text form of NBT that the game's own commands use, printed and parsed here so
 * a subtree can be viewed, edited and copied between files as text.
 *
 * The printer is exact for every value: longs keep all 64 bits, floats print the shortest
 * text that reads back as the same single-precision number, and strings choose the quote
 * that needs the fewest escapes. The parser accepts what the printer writes plus the
 * conveniences people type: `true` and `false`, bare integers and decimals, unquoted words.
 */

/* ------------------------------------------------------------------ printing */

const BARE_KEY = /^[A-Za-z0-9._+-]+$/;

export function quoteSnbtString(text: string): string {
    const doubles = (text.match(/"/g) ?? []).length;
    const singles = (text.match(/'/g) ?? []).length;
    const quote = doubles > singles ? "'" : '"';
    let out = quote;
    for (const ch of text) {
        if (ch === "\\" || ch === quote) out += "\\" + ch;
        else if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "\\r";
        else if (ch === "\t") out += "\\t";
        else out += ch;
    }
    return out + quote;
}

function key(name: string): string {
    return BARE_KEY.test(name) ? name : quoteSnbtString(name);
}

function shortestFloat32(v: number): string {
    for (let precision = 1; precision <= 9; precision++) {
        const text = v.toPrecision(precision);
        if (Math.fround(Number(text)) === v) return String(Number(text));
    }
    return String(v);
}

function decimal(text: string): string {
    // Make sure a whole number still reads as a decimal, and keep exponents parseable.
    if (/^-?\d+$/.test(text)) return text + ".0";
    return text;
}

function printFloating(kind: "float" | "double", v: number): string {
    if (Number.isNaN(v)) return kind === "float" ? "NaNf" : "NaNd";
    if (!Number.isFinite(v)) return (v < 0 ? "-Infinity" : "Infinity") + (kind === "float" ? "f" : "d");
    const text = kind === "float" ? shortestFloat32(v) : String(v);
    return decimal(text) + (kind === "float" ? "f" : "d");
}

/** The SNBT text of a single scalar or an element, without any name. */
export function scalarSnbt(node: NbtNode): string {
    switch (node.kind) {
        case "byte":
            return `${node.value as number}b`;
        case "short":
            return `${node.value as number}s`;
        case "int":
            return String(node.value as number);
        case "long":
            return `${node.value as bigint}L`;
        case "float":
            return printFloating("float", node.value as number);
        case "double":
            return printFloating("double", node.value as number);
        case "string":
            return quoteSnbtString(node.value as string);
        default:
            return "";
    }
}

export interface PrintOptions {
    /** Indent with this many spaces and break lines; 0 keeps it on one line. */
    indent?: number;
    /** Stop printing past this many characters and say so (default unlimited). */
    maxLength?: number;
}

export function toSnbt(node: NbtNode, options: PrintOptions = {}): string {
    const indent = options.indent ?? 0;
    const limit = options.maxLength ?? Number.POSITIVE_INFINITY;
    const parts: string[] = [];
    let size = 0;
    const emit = (text: string): void => {
        if (size > limit) return;
        parts.push(text);
        size += text.length;
    };
    const nl = (depth: number): string => (indent > 0 ? "\n" + " ".repeat(indent * depth) : "");
    const walk = (n: NbtNode, depth: number): void => {
        if (size > limit) return;
        switch (n.kind) {
            case "byteArray":
                emit(`[B;${(n.value as number[]).map((v) => `${v}b`).join(",")}]`);
                return;
            case "intArray":
                emit(`[I;${(n.value as number[]).join(",")}]`);
                return;
            case "longArray":
                emit(`[L;${(n.value as bigint[]).map((v) => `${v}L`).join(",")}]`);
                return;
            case "list": {
                const kids = n.children ?? [];
                if (kids.length === 0) {
                    emit("[]");
                    return;
                }
                emit("[");
                kids.forEach((child, i) => {
                    if (i > 0) emit(",");
                    emit(nl(depth + 1));
                    walk(child, depth + 1);
                });
                emit(nl(depth) + "]");
                return;
            }
            case "compound": {
                const kids = n.children ?? [];
                if (kids.length === 0) {
                    emit("{}");
                    return;
                }
                emit("{");
                kids.forEach((child, i) => {
                    if (i > 0) emit(",");
                    emit(nl(depth + 1));
                    emit(key(child.name ?? "") + (indent > 0 ? ": " : ":"));
                    walk(child, depth + 1);
                });
                emit(nl(depth) + "}");
                return;
            }
            default:
                emit(scalarSnbt(n));
        }
    };
    walk(node, 0);
    const text = parts.join("");
    return text.length > limit ? text.slice(0, limit) + "…" : text;
}

/* ------------------------------------------------------------------ parsing */

class SnbtParser {
    pos = 0;
    constructor(
        private readonly text: string,
        private readonly doc: { nextId: number },
    ) {}

    fail(message: string): never {
        throw new NbtError(`${message} (at character ${this.pos + 1})`, "snbt");
    }

    private ws(): void {
        while (this.pos < this.text.length && /\s/.test(this.text[this.pos]!)) this.pos++;
    }

    atEnd(): boolean {
        this.ws();
        return this.pos >= this.text.length;
    }

    private peek(): string {
        this.ws();
        return this.text[this.pos] ?? "";
    }

    private expect(ch: string): void {
        if (this.peek() !== ch) this.fail(`Expected "${ch}"`);
        this.pos++;
    }

    private newNode(kind: TagKind, name: string | null): NbtNode {
        return {
            id: allocateId(this.doc),
            kind,
            name,
            value: null,
            children: null,
            listKind: null,
            rawName: null,
            rawText: null,
            rawBits: null,
        };
    }

    value(name: string | null): NbtNode {
        const ch = this.peek();
        if (ch === "") this.fail("Expected a value");
        if (ch === "{") return this.compound(name);
        if (ch === "[") return this.bracket(name);
        if (ch === '"' || ch === "'") {
            const node = this.newNode("string", name);
            node.value = this.quoted();
            return node;
        }
        return this.word(name);
    }

    private quoted(): string {
        const quote = this.text[this.pos]!;
        this.pos++;
        let out = "";
        for (;;) {
            if (this.pos >= this.text.length) this.fail("A string is missing its closing quote");
            const ch = this.text[this.pos++]!;
            if (ch === quote) return out;
            if (ch === "\\") {
                const next = this.text[this.pos++];
                if (next === undefined) this.fail("A string ends with a backslash");
                if (next === "n") out += "\n";
                else if (next === "r") out += "\r";
                else if (next === "t") out += "\t";
                else if (next === "u") {
                    const hex = this.text.slice(this.pos, this.pos + 4);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("A \\u escape needs four hex digits");
                    out += String.fromCharCode(parseInt(hex, 16));
                    this.pos += 4;
                } else out += next;
            } else out += ch;
        }
    }

    private compound(name: string | null): NbtNode {
        const node = this.newNode("compound", name);
        node.children = [];
        this.expect("{");
        if (this.peek() === "}") {
            this.pos++;
            return node;
        }
        for (;;) {
            const ch = this.peek();
            let childName: string;
            if (ch === '"' || ch === "'") childName = this.quoted();
            else {
                const match = /^[A-Za-z0-9._+-]+/.exec(this.text.slice(this.pos));
                if (match === null) this.fail("Expected a key");
                childName = match[0];
                this.pos += childName.length;
            }
            this.expect(":");
            node.children.push(this.value(childName));
            const sep = this.peek();
            this.pos++;
            if (sep === "}") return node;
            if (sep !== ",") {
                this.pos--;
                this.fail('Expected "," or "}"');
            }
            if (this.peek() === "}") {
                this.pos++;
                return node;
            }
        }
    }

    private bracket(name: string | null): NbtNode {
        this.expect("[");
        const header = /^([BIL]);/.exec(this.text.slice(this.pos).replace(/^\s+/, ""));
        if (header !== null) {
            this.ws();
            this.pos += 2;
            return this.array(name, header[1] as "B" | "I" | "L");
        }
        const node = this.newNode("list", name);
        node.children = [];
        node.listKind = "end";
        if (this.peek() === "]") {
            this.pos++;
            return node;
        }
        for (;;) {
            const child = this.value(null);
            if (node.listKind === "end") node.listKind = child.kind;
            else if (node.listKind !== child.kind)
                this.fail(`A list holds one type, but ${node.listKind} and ${child.kind} are mixed`);
            node.children.push(child);
            const sep = this.peek();
            this.pos++;
            if (sep === "]") return node;
            if (sep !== ",") {
                this.pos--;
                this.fail('Expected "," or "]"');
            }
            if (this.peek() === "]") {
                this.pos++;
                return node;
            }
        }
    }

    private array(name: string | null, flavour: "B" | "I" | "L"): NbtNode {
        const kind: TagKind = flavour === "B" ? "byteArray" : flavour === "I" ? "intArray" : "longArray";
        const node = this.newNode(kind, name);
        const values: (number | bigint)[] = [];
        if (this.peek() === "]") {
            this.pos++;
            node.value = values as number[];
            return node;
        }
        for (;;) {
            const element = this.word(null);
            const wanted: TagKind = flavour === "B" ? "byte" : flavour === "I" ? "int" : "long";
            if (element.kind !== wanted && element.kind !== "int")
                this.fail(`A ${kind} holds ${wanted} values, not ${element.kind}`);
            if (wanted === "byte") rangeCheck("byte", BigInt(element.value as number));
            values.push(wanted === "long" ? BigInt(element.value as number | bigint) : (element.value as number));
            const sep = this.peek();
            this.pos++;
            if (sep === "]") break;
            if (sep !== ",") {
                this.pos--;
                this.fail('Expected "," or "]"');
            }
            if (this.peek() === "]") {
                this.pos++;
                break;
            }
        }
        node.value = values as number[] | bigint[];
        return node;
    }

    private word(name: string | null): NbtNode {
        const match = /^[A-Za-z0-9._+\-]+/.exec(this.text.slice(this.pos));
        if (match === null) this.fail("Expected a value");
        const raw = match[0];
        this.pos += raw.length;
        const node = this.newNode("string", name);
        const typed = parseBareNumber(raw);
        if (typed !== null) {
            node.kind = typed.kind;
            node.value = typed.value;
            if (typed.kind === "float" || typed.kind === "double") {
                if (typeof typed.value === "number" && Number.isNaN(typed.value)) node.rawBits = null;
            }
            return node;
        }
        if (raw === "true" || raw === "false") {
            node.kind = "byte";
            node.value = raw === "true" ? 1 : 0;
            return node;
        }
        node.value = raw;
        return node;
    }
}

function rangeCheck(kind: "byte" | "short" | "int" | "long", v: bigint): void {
    const r = INTEGER_RANGES[kind];
    if (v < r.min || v > r.max) throw new NbtError(`${v} is outside the range of a ${kind} (${r.min} to ${r.max}).`, "invalid-value");
}

/** Parses a bare token (no quotes) as a typed number, or null when it is not a number. */
export function parseBareNumber(raw: string): { kind: TagKind; value: number | bigint } | null {
    let m = /^([+-]?\d+)([bB])$/.exec(raw);
    if (m !== null) {
        const v = BigInt(m[1]!);
        rangeCheck("byte", v);
        return { kind: "byte", value: Number(v) };
    }
    m = /^([+-]?\d+)([sS])$/.exec(raw);
    if (m !== null) {
        const v = BigInt(m[1]!);
        rangeCheck("short", v);
        return { kind: "short", value: Number(v) };
    }
    m = /^([+-]?\d+)([lL])$/.exec(raw);
    if (m !== null) {
        const v = BigInt(m[1]!);
        rangeCheck("long", v);
        return { kind: "long", value: v };
    }
    m = /^([+-]?\d+)$/.exec(raw);
    if (m !== null) {
        const v = BigInt(m[1]!);
        rangeCheck("int", v);
        return { kind: "int", value: Number(v) };
    }
    m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|NaN|[+-]?Infinity)([fFdD])$/.exec(raw);
    if (m !== null) {
        const n = floating(m[1]!);
        return m[2]!.toLowerCase() === "f" ? { kind: "float", value: Math.fround(n) } : { kind: "double", value: n };
    }
    m = /^([+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?|[+-]?\d+[eE][+-]?\d+)$/.exec(raw);
    if (m !== null) return { kind: "double", value: Number(m[1]) };
    return null;
}

function floating(text: string): number {
    if (text === "NaN") return Number.NaN;
    if (text.endsWith("Infinity")) return text.startsWith("-") ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    return Number(text);
}

/**
 * Parses SNBT into a detached node tree whose ids come from `doc`.
 *
 * `name` becomes the top node's name; callers that replace an existing tag pass its name
 * so a paste keeps the tag where it was.
 */
export function parseSnbt(text: string, doc: { nextId: number }, name: string | null = null): NbtNode {
    if (text.length > 16 * 1024 * 1024) throw new NbtError("That text is too long to read as SNBT.", "snbt");
    const parser = new SnbtParser(text, doc);
    const node = parser.value(name);
    if (!parser.atEnd()) parser.fail("There is extra text after the value");
    return node;
}

/** Re-exported so callers can report an element type in the way SNBT spells it. */
export function listKindLabel(kind: ListKind | null): string {
    return kind === null || kind === "end" ? "empty" : kind;
}
