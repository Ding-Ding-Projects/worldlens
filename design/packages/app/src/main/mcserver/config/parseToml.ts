/**
 * Line-oriented TOML parsing and editing, for `velocity.toml`.
 *
 * This is not a general TOML implementation. It supports exactly the subset Velocity's own
 * writer produces: top-level `key = value` pairs, single-level `[section]` headers (plain
 * or quoted keys), `#` comments, blank lines, and arrays of strings or numbers written
 * either on one line (`try = ["lobby"]`) or across several (`forced-hosts` style blocks).
 * Nested inline tables (`{ ... }`) and array-of-tables (`[[...]]`) do not appear in a
 * Velocity config and are not attempted; a line this parser cannot classify is kept as an
 * opaque node rather than misread, so an unsupported construct degrades to "preserved but
 * not editable through this GUI" instead of corrupted.
 *
 * Editing rewrites only the touched entry's own line(s); everything else - including a
 * comment sitting between two keys, or a `[section]` header - is untouched. As with
 * `parseYaml.ts`, the internal line separator is always `\n`; the caller's original CRLF
 * or LF choice is restored once, on the whole assembled text, rather than per line.
 */

import { type ConfigDocument, type DocumentNode, type EntryNode, detectEol, detectTrailingNewline, hashOf } from "./document.js";
import { type ConfigAnswer, fail, ok } from "./answer.js";

function splitLines(sourceText: string): string[] {
    const body = sourceText.replace(/\r\n/g, "\n");
    const withoutTrailing = body.endsWith("\n") ? body.slice(0, -1) : body;
    return withoutTrailing.length === 0 && sourceText.length === 0 ? [] : withoutTrailing.split("\n");
}

function unquoteKey(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith("\"") && trimmed.endsWith("\"") && trimmed.length >= 2) {
        return trimmed.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function parseScalarToken(token: string): unknown {
    const t = token.trim();
    if (t === "true") return true;
    if (t === "false") return false;
    if (t.startsWith("\"") && t.endsWith("\"") && t.length >= 2) {
        return t
            .slice(1, -1)
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\\"/g, "\"")
            .replace(/\\\\/g, "\\");
    }
    if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1);
    if (/^-?\d+$/.test(t)) {
        const n = Number.parseInt(t, 10);
        if (Number.isSafeInteger(n)) return n;
    }
    if (/^-?\d+\.\d+$/.test(t)) return Number.parseFloat(t);
    return t;
}

/** Splits a bracketed array body on top-level commas (no nested arrays/tables expected). */
function splitArrayItems(body: string): string[] {
    const items: string[] = [];
    let current = "";
    let inString: "\"" | "'" | null = null;
    for (let i = 0; i < body.length; i += 1) {
        const ch = body[i] ?? "";
        if (inString !== null) {
            current += ch;
            if (ch === "\\" && inString === "\"") {
                current += body[i + 1] ?? "";
                i += 1;
                continue;
            }
            if (ch === inString) inString = null;
            continue;
        }
        if (ch === "\"" || ch === "'") {
            inString = ch;
            current += ch;
            continue;
        }
        if (ch === ",") {
            items.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    if (current.trim() !== "") items.push(current);
    return items.map((item) => item.trim()).filter((item) => item !== "");
}

export function parseToml(sourceText: string): ConfigAnswer<ConfigDocument> {
    const eol = detectEol(sourceText);
    const trailingNewline = detectTrailingNewline(sourceText);
    const rawLines = splitLines(sourceText);
    const nodes: DocumentNode[] = [];
    let section: readonly string[] = [];

    for (let i = 0; i < rawLines.length; i += 1) {
        const raw = rawLines[i] ?? "";
        const trimmed = raw.trim();

        if (trimmed === "") {
            nodes.push({ kind: "blank" });
            continue;
        }
        if (trimmed.startsWith("#")) {
            nodes.push({ kind: "comment", raw });
            continue;
        }
        const sectionMatch = /^\[([^[\]]+)]$/.exec(trimmed);
        if (sectionMatch) {
            section = [unquoteKey(sectionMatch[1] ?? "")];
            nodes.push({ kind: "opaque", raw });
            continue;
        }

        const eq = trimmed.indexOf("=");
        if (eq < 0) {
            nodes.push({ kind: "opaque", raw });
            continue;
        }
        const rawKey = trimmed.slice(0, eq);
        let valueText = trimmed.slice(eq + 1).trim();
        const key = unquoteKey(rawKey);
        const path = [...section, key];

        // An array may span multiple physical lines. Keep consuming until the brackets
        // balance, so a bracket inside a quoted string never terminates it early.
        let combinedRaw = raw;
        if (valueText.startsWith("[")) {
            let depth = 0;
            let inString: "\"" | "'" | null = null;
            let closed = false;
            let scan = valueText;
            let scanLine = i;
            while (!closed) {
                for (let c = 0; c < scan.length; c += 1) {
                    const ch = scan[c] ?? "";
                    if (inString !== null) {
                        if (ch === "\\" && inString === "\"") {
                            c += 1;
                            continue;
                        }
                        if (ch === inString) inString = null;
                        continue;
                    }
                    if (ch === "\"" || ch === "'") {
                        inString = ch;
                        continue;
                    }
                    if (ch === "[") depth += 1;
                    if (ch === "]") {
                        depth -= 1;
                        if (depth === 0) {
                            closed = true;
                            break;
                        }
                    }
                }
                if (closed) break;
                scanLine += 1;
                const nextLine = rawLines[scanLine];
                if (nextLine === undefined) break; // unterminated - stop, leave as best-effort text
                combinedRaw += `\n${nextLine}`;
                valueText += `\n${nextLine}`;
                scan = nextLine;
            }
            i = scanLine;
        }

        let value: unknown;
        if (valueText.startsWith("[") && valueText.trimEnd().endsWith("]")) {
            const inner = valueText.trim().slice(1, -1);
            value = splitArrayItems(inner.replace(/\n/g, " ")).map(parseScalarToken);
        } else {
            value = parseScalarToken(valueText);
        }

        const entry: EntryNode = { kind: "entry", path, raw: combinedRaw, value };
        nodes.push(entry);
    }

    return ok({
        format: "toml",
        sourceText,
        encoding: "utf8",
        eol,
        trailingNewline,
        nodes,
        hash: hashOf(sourceText),
    });
}

function serializeScalar(value: unknown): string {
    if (typeof value === "boolean") return String(value);
    if (typeof value === "number") return String(value);
    if (Array.isArray(value)) return `[${value.map(serializeScalar).join(", ")}]`;
    const s = String(value);
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`;
}

/** Re-serializes a document's nodes back into TOML source text. */
export function serializeToml(document: ConfigDocument): string {
    const lines = document.nodes.map((node) => {
        if (node.kind === "blank") return "";
        return node.raw;
    });
    const body = lines.join("\n");
    let text = document.trailingNewline ? `${body}\n` : body;
    if (document.eol === "\r\n") text = text.replace(/\n/g, "\r\n");
    return text;
}

/** Rewrites exactly one key's value, leaving its key text, comments and every other line untouched. */
export function setTomlValue(document: ConfigDocument, path: readonly string[], value: unknown, expectedHash: string): ConfigAnswer<ConfigDocument> {
    if (expectedHash !== document.hash) return fail("stale-document", `Document changed since it was read (expected ${expectedHash}, have ${document.hash}).`);

    const index = document.nodes.findIndex(
        (node): node is EntryNode => node.kind === "entry" && node.path.length === path.length && node.path.every((segment, i) => segment === path[i]),
    );
    if (index < 0) return fail("not-found", `No key "${path.join(".")}" in this file.`);
    const node = document.nodes[index];
    if (node === undefined || node.kind !== "entry") return fail("not-found", `No key "${path.join(".")}" in this file.`);

    const firstLine = node.raw.split("\n")[0] ?? "";
    const eq = firstLine.indexOf("=");
    const prefix = eq >= 0 ? firstLine.slice(0, eq + 1) : `${String(path[path.length - 1])} =`;
    const newRaw = `${prefix} ${serializeScalar(value)}`;

    const nextNodes = document.nodes.slice();
    nextNodes[index] = { kind: "entry", path: node.path, raw: newRaw, value };

    const draft: ConfigDocument = { ...document, nodes: nextNodes };
    const sourceText = serializeToml(draft);
    return ok({ ...draft, sourceText, hash: hashOf(sourceText) });
}
