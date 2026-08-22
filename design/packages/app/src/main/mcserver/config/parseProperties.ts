/**
 * Line-oriented `server.properties` parsing and editing.
 *
 * Java's `Properties` format is one `key=value` (or `key:value`, or whitespace-separated)
 * pair per line, `#`/`!` comments, and `\`-continued lines. Real `server.properties` files
 * never use continuation lines or bare-whitespace separators in practice, so this parser
 * supports the format Mojang's own writer actually produces: `key=value`, one pair per
 * line, `#` comments, blank lines, and duplicate keys (the last one wins for effective
 * value, but every physical line is kept as its own node so a duplicate is visible and
 * editable rather than silently merged away).
 *
 * Editing a key rewrites ONLY that line's value span. The key, the separator character,
 * any inline whitespace around them, and every other line in the file are untouched -
 * this is what makes the round-trip test possible at all.
 */

import { type ConfigDocument, type DocumentNode, detectEol, detectTrailingNewline, hashOf } from "./document.js";
import { type ConfigAnswer, fail, ok } from "./answer.js";

interface PropertiesLine {
    readonly raw: string;
    /** Index of the separator (`=` or `:`) in `raw`, or -1 when this line has none. */
    readonly separatorIndex: number;
}

function splitLines(sourceText: string, eol: "\n" | "\r\n"): string[] {
    const body = eol === "\r\n" ? sourceText.replace(/\r\n/g, "\n") : sourceText;
    const withoutTrailing = body.endsWith("\n") ? body.slice(0, -1) : body;
    return withoutTrailing.length === 0 && sourceText.length === 0 ? [] : withoutTrailing.split("\n");
}

/** Unescapes a Java-`Properties` value: `\n`, `\t`, `\`, `\uXXXX`, `\:`, `\=`, `\ `. */
function unescapeValue(text: string): string {
    let out = "";
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (ch !== "\\" || i === text.length - 1) {
            out += ch;
            continue;
        }
        const next = text[i + 1] ?? "";
        if (next === "u") {
            const hex = text.slice(i + 2, i + 6);
            out += String.fromCharCode(Number.parseInt(hex, 16));
            i += 5;
            continue;
        }
        const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", f: "\f", "\\": "\\", ":": ":", "=": "=", " ": " " };
        out += map[next] ?? next;
        i += 1;
    }
    return out;
}

/** Escapes a value for `.properties` output: only what `unescapeValue` would unescape. */
export function escapePropertiesValue(value: string): string {
    let out = "";
    for (const ch of value) {
        if (ch === "\\") out += "\\\\";
        else if (ch === "\n") out += "\n";
        else if (ch === "\t") out += "\t";
        else if (ch === "\r") out += "\r";
        else out += ch;
    }
    return out;
}

function findSeparator(line: string): number {
    let escaped = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === "\\") {
            escaped = true;
            continue;
        }
        if (ch === "=" || ch === ":") return i;
    }
    return -1;
}

function coerceScalar(raw: string): unknown {
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw !== "" && /^-?\d+$/.test(raw)) {
        const asNumber = Number.parseInt(raw, 10);
        if (Number.isSafeInteger(asNumber)) return asNumber;
    }
    return raw;
}

export function parseProperties(sourceText: string): ConfigAnswer<ConfigDocument> {
    const eol = detectEol(sourceText);
    const trailingNewline = detectTrailingNewline(sourceText);
    const rawLines = splitLines(sourceText, eol);
    const nodes: DocumentNode[] = [];

    for (const raw of rawLines) {
        const trimmedStart = raw.replace(/^\s+/, "");
        if (trimmedStart === "") {
            nodes.push({ kind: "blank" });
            continue;
        }
        if (trimmedStart.startsWith("#") || trimmedStart.startsWith("!")) {
            nodes.push({ kind: "comment", raw });
            continue;
        }
        const separatorIndex = findSeparator(raw);
        if (separatorIndex < 0) {
            // A bare key with no separator is valid Properties (value = ""); Mojang's own
            // writer never emits one, but a hand-edited file might, so it is kept rather
            // than rejected.
            nodes.push({ kind: "opaque", raw });
            continue;
        }
        const rawKey = raw.slice(0, separatorIndex);
        const rawValue = raw.slice(separatorIndex + 1);
        const key = unescapeValue(rawKey.trim());
        const value = coerceScalar(unescapeValue(rawValue.trim()));
        nodes.push({ kind: "entry", path: [key], raw, value });
    }

    return ok({
        format: "properties",
        sourceText,
        encoding: "utf8",
        eol,
        trailingNewline,
        nodes,
        hash: hashOf(sourceText),
    });
}

/** Re-serializes a document's nodes back into `.properties` source text. */
export function serializeProperties(document: ConfigDocument): string {
    const lines = document.nodes.map((node) => {
        if (node.kind === "blank") return "";
        if (node.kind === "comment" || node.kind === "opaque") return node.raw;
        return node.raw;
    });
    const body = lines.join(document.eol);
    return document.trailingNewline ? body + document.eol : body;
}

/**
 * Rewrites exactly one key's value span, leaving everything else in the line - and every
 * other line in the file - byte-identical. Refuses when `expectedHash` is stale, when the
 * key does not exist (properties keys are added by `addPropertiesEntry`, not edited into
 * existence), or when the value cannot be represented in `.properties` (an object or a
 * non-flat array).
 */
export function setPropertiesValue(document: ConfigDocument, key: string, value: unknown, expectedHash: string): ConfigAnswer<ConfigDocument> {
    if (expectedHash !== document.hash) return fail("stale-document", `Document changed since it was read (expected ${expectedHash}, have ${document.hash}).`);
    if (typeof value === "object" && value !== null) return fail("invalid-value", "server.properties values must be scalars.");

    const index = document.nodes.findIndex((node) => node.kind === "entry" && node.path.length === 1 && node.path[0] === key);
    if (index < 0) return fail("not-found", `No key "${key}" in this file.`);

    const node = document.nodes[index];
    if (node === undefined || node.kind !== "entry") return fail("not-found", `No key "${key}" in this file.`);

    const separatorIndex = findSeparator(node.raw);
    const prefix = separatorIndex >= 0 ? node.raw.slice(0, separatorIndex + 1) : `${key}=`;
    const stringValue = typeof value === "boolean" || typeof value === "number" ? String(value) : escapePropertiesValue(String(value));
    const newRaw = `${prefix}${stringValue}`;

    const nextNodes = document.nodes.slice();
    nextNodes[index] = { kind: "entry", path: [key], raw: newRaw, value };

    const draft: ConfigDocument = { ...document, nodes: nextNodes };
    const sourceText = serializeProperties(draft);
    return ok({ ...draft, sourceText, hash: hashOf(sourceText) });
}
