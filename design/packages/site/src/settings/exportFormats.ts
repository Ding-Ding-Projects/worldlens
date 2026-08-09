/**
 * Turning a settings snapshot into a file, in every text format that can honestly
 * carry it.
 *
 * The site used to offer JSON and Markdown, which quietly forced a choice between
 * "a file a machine can read back" and "a file a person can read". Neither is the
 * right answer for every visitor: somebody diffing their preferences in Git wants
 * YAML, somebody pasting them into a bug report wants Markdown, somebody feeding
 * them to a spreadsheet wants CSV, and somebody appending them to a log wants one
 * JSON object per line. So the module offers the whole set and, crucially, tells
 * the caller *before* the download what a chosen format would cost for the data
 * actually in hand.
 *
 * That last part is the reason this module exists at all rather than a switch
 * statement beside the download button. A format's shortcomings are not a fixed
 * property of the format: CSV loses nothing at all for a snapshot of plain string
 * values, and loses the difference between the number 3 and the text "3" the
 * moment one number appears. A warning that fires either always or never trains a
 * visitor to ignore it, so `describeExportLoss` looks at the values and reports
 * only what is genuinely at risk for them. An empty report means the format is
 * lossless for this data, and the caller may say so without hedging.
 *
 * Nothing here reads global state. `serialize` is a pure function of its three
 * arguments, including any human-readable title, which the caller localises and
 * passes in. A serialiser that reached into the active language mode would
 * produce two different files from the same snapshot depending on when it ran,
 * which is untestable and would make a settings file stop matching its own
 * checksum for reasons the visitor never chose.
 *
 * No DOM, no filesystem, no network: this is bundled into the browser build and
 * exercised under Node by the test beside it, so it must run unchanged in both.
 */

import { registerStrings } from "./i18n.js";
import type { Interpolations, StringTable } from "./i18n.js";
import type { SettingValue } from "./types.js";

/**
 * What the store hands over: ids mapped to values, where some ids carry raw
 * strings preserved from a build that knew settings this one does not. Those
 * preserved entries are exactly why the adversarial cases below matter — their
 * text was written by a different version and is not constrained by any control
 * in this build.
 */
export type SettingsSnapshot = Readonly<Record<string, SettingValue>>;

export type ExportFormatId =
    "json" | "jsonl" | "yaml" | "toml" | "xml" | "csv" | "tsv" | "markdown" | "html";

export interface ExportMeta {
    /** Schema version of the settings file, so a future import can migrate rather than guess. */
    readonly version: number;
    /** ISO-8601 instant, when the caller wants the file to say when it was made. */
    readonly generatedAt?: string | undefined;
    /**
     * Already-localised heading for the two document formats. It arrives as text
     * rather than as an i18n key because resolving a key here would make the output
     * depend on the active language mode, and the whole module is deliberately pure.
     */
    readonly title?: string | undefined;
    /** BCP 47 tag for the `lang` attribute of the HTML document, matching `title`. */
    readonly language?: string | undefined;
}

export interface ExportFormatDescriptor {
    readonly id: ExportFormatId;
    /** Including the leading dot, so a caller can concatenate without thinking about it. */
    readonly extension: string;
    readonly mimeType: string;
    /** i18n key for the format's name in a picker. */
    readonly nameKey: string;
    /** i18n key for the one-line explanation of what the format is good for. */
    readonly descriptionKey: string;
    /**
     * Whether a parser can get the id/value pairs back out at all. False for the two
     * document formats, which escape values for display and define no way back.
     */
    readonly reimportable: boolean;
    /**
     * Whether that parse also recovers the original types. CSV and TSV are readable
     * but untyped, so they are `reimportable` without being `typedRoundTrip`; the
     * distinction is the difference between "you can re-import this" and "re-importing
     * this gives you back exactly what you exported".
     */
    readonly typedRoundTrip: boolean;
}

/**
 * One loss, tied to the ids that caused it.
 *
 * Carrying the ids rather than only a count lets a caller show the visitor which
 * of their settings is the problem. A warning that says "3 values are at risk"
 * without saying which three is a warning nobody can act on.
 */
export interface ExportLoss {
    /** i18n key, always prefixed `exportFormats.loss.`. */
    readonly key: string;
    /** Empty when the loss is a property of the format itself rather than of the data. */
    readonly ids: readonly string[];
    readonly interpolations?: Interpolations | undefined;
}

/* ------------------------------------------------------------------ *
 * The closed list of formats
 * ------------------------------------------------------------------ */

/*
 * The charset parameter is carried in the MIME type because these strings end up
 * on a Blob, and a browser handed `text/csv` with no charset will let the platform
 * guess the encoding of a file that is definitively UTF-8. The guess is usually
 * right and occasionally turns a Cantonese label into mojibake on the visitor's
 * own machine, which looks like data corruption rather than a header omission.
 */
export const EXPORT_FORMATS: readonly ExportFormatDescriptor[] = [
    {
        id: "json",
        extension: ".json",
        mimeType: "application/json;charset=utf-8",
        nameKey: "exportFormats.name.json",
        descriptionKey: "exportFormats.desc.json",
        reimportable: true,
        typedRoundTrip: true,
    },
    {
        id: "jsonl",
        extension: ".jsonl",
        mimeType: "application/x-ndjson;charset=utf-8",
        nameKey: "exportFormats.name.jsonl",
        descriptionKey: "exportFormats.desc.jsonl",
        reimportable: true,
        typedRoundTrip: true,
    },
    {
        id: "yaml",
        extension: ".yaml",
        mimeType: "application/yaml;charset=utf-8",
        nameKey: "exportFormats.name.yaml",
        descriptionKey: "exportFormats.desc.yaml",
        reimportable: true,
        typedRoundTrip: true,
    },
    {
        id: "toml",
        extension: ".toml",
        mimeType: "application/toml;charset=utf-8",
        nameKey: "exportFormats.name.toml",
        descriptionKey: "exportFormats.desc.toml",
        reimportable: true,
        typedRoundTrip: true,
    },
    {
        id: "xml",
        extension: ".xml",
        mimeType: "application/xml;charset=utf-8",
        nameKey: "exportFormats.name.xml",
        descriptionKey: "exportFormats.desc.xml",
        reimportable: true,
        typedRoundTrip: true,
    },
    {
        id: "csv",
        extension: ".csv",
        mimeType: "text/csv;charset=utf-8",
        nameKey: "exportFormats.name.csv",
        descriptionKey: "exportFormats.desc.csv",
        reimportable: true,
        typedRoundTrip: false,
    },
    {
        id: "tsv",
        extension: ".tsv",
        mimeType: "text/tab-separated-values;charset=utf-8",
        nameKey: "exportFormats.name.tsv",
        descriptionKey: "exportFormats.desc.tsv",
        reimportable: true,
        typedRoundTrip: false,
    },
    {
        id: "markdown",
        extension: ".md",
        mimeType: "text/markdown;charset=utf-8",
        nameKey: "exportFormats.name.markdown",
        descriptionKey: "exportFormats.desc.markdown",
        reimportable: false,
        typedRoundTrip: false,
    },
    {
        id: "html",
        extension: ".html",
        mimeType: "text/html;charset=utf-8",
        nameKey: "exportFormats.name.html",
        descriptionKey: "exportFormats.desc.html",
        reimportable: false,
        typedRoundTrip: false,
    },
];

const BY_ID = new Map<ExportFormatId, ExportFormatDescriptor>(
    EXPORT_FORMATS.map((format) => [format.id, format]),
);

export function exportFormat(id: ExportFormatId): ExportFormatDescriptor {
    const descriptor = BY_ID.get(id);
    if (descriptor === undefined) throw new Error(`Unknown export format: ${id}`);
    return descriptor;
}

/** Guard for a value off the wire, so a stale stored preference cannot pick a format that left. */
export function isExportFormatId(value: string): value is ExportFormatId {
    return BY_ID.has(value as ExportFormatId);
}

export function exportFileName(id: ExportFormatId, base: string): string {
    return base + exportFormat(id).extension;
}

/* ------------------------------------------------------------------ *
 * Reading the snapshot
 * ------------------------------------------------------------------ */

/*
 * Ids are sorted rather than left in insertion order. A visitor who keeps their
 * settings file in Git should see a diff only where a value actually changed;
 * insertion order follows whichever control they happened to touch first, so an
 * unsorted export reshuffles unrelated lines and buries the one real change.
 */
function entries(snapshot: SettingsSnapshot): readonly (readonly [string, SettingValue])[] {
    const pairs: (readonly [string, SettingValue])[] = [];
    for (const id of Object.keys(snapshot).sort()) {
        const value = snapshot[id];
        if (value === undefined) continue;
        pairs.push([id, value] as const);
    }
    return pairs;
}

/** Every id and every string value, which is the text that has to survive escaping. */
function textPieces(snapshot: SettingsSnapshot): readonly (readonly [string, string])[] {
    const pieces: (readonly [string, string])[] = [];
    for (const [id, value] of entries(snapshot)) {
        pieces.push([id, id] as const);
        if (typeof value === "string") pieces.push([id, value] as const);
    }
    return pieces;
}

/* ------------------------------------------------------------------ *
 * Escaping primitives
 * ------------------------------------------------------------------ */

/*
 * `JSON.stringify` of a string is simultaneously a valid JSON string, a valid YAML
 * double-quoted scalar, and a valid TOML basic string, which is why one helper
 * serves three formats here. The overlap is not a coincidence — YAML and TOML both
 * took their double-quoted escape set from C by way of JSON — but it is not total
 * either, and the place it stops is worth naming: TOML rejects a backslash-v escape
 * that JSON has no way to emit, so a vertical tab leaves as a six-character unicode
 * escape and stays inside TOML grammar. Hand-rolling this is where an escaper
 * usually acquires a bug, because the character that breaks it is the one nobody
 * thought to test.
 */
function quotedString(text: string): string {
    return JSON.stringify(text);
}

/**
 * Whether a bare word would be read back as something other than the string it is.
 *
 * This is the single predicate behind two apparently different decisions: whether
 * YAML must quote a scalar, and whether a CSV value is at risk from a reader that
 * guesses types. Both are the same question — would an untyped reader change this
 * text? — so they share an answer and cannot drift apart. The date pattern is here
 * because a spreadsheet silently reinterprets `2024-01-01` as a date and writes it
 * back in the machine's own locale, which is how a stored value becomes `01/01/2024`
 * without anybody editing it.
 */
export function looksTyped(text: string): boolean {
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return true;
    if (/^(true|false|yes|no|on|off|y|n|null|nil|none|~)$/i.test(text)) return true;
    if (/^[+-]?(\.inf|\.nan)$/i.test(text)) return true;
    if (/^\d{4}-\d{2}-\d{2}([T ][\d:.+Zz-]*)?$/.test(text)) return true;
    return false;
}

/* ------------------------------------------------------------------ *
 * JSON and JSON Lines
 * ------------------------------------------------------------------ */

function serializeJson(snapshot: SettingsSnapshot, meta: ExportMeta): string {
    // The object is rebuilt from the sorted entry list rather than handed straight
    // to `JSON.stringify`, because stringify preserves insertion order and the
    // sorting above exists to keep a committed settings file diffable.
    const values: Record<string, SettingValue> = {};
    for (const [id, value] of entries(snapshot)) values[id] = value;
    const payload: Record<string, unknown> = { version: meta.version };
    if (meta.generatedAt !== undefined) payload["generatedAt"] = meta.generatedAt;
    // `values` is assigned last so it is the final key in the file. A reader scanning
    // the head of a large export then meets the version before the data it governs.
    payload["values"] = values;
    return `${JSON.stringify(payload, null, 4)}\n`;
}

/*
 * Every line carries a `type` discriminator, including the first.
 *
 * The point of a line-delimited file is that a reader can start anywhere and that
 * a truncated write costs only the last record. Both properties evaporate if the
 * first line is special by position, because a consumer that seeks into the middle
 * of the file then has no way to tell a header it missed from a record it found.
 * Tagging each line makes position irrelevant.
 */
function serializeJsonLines(snapshot: SettingsSnapshot, meta: ExportMeta): string {
    const lines: string[] = [];
    const header: Record<string, unknown> = { type: "meta", version: meta.version };
    if (meta.generatedAt !== undefined) header["generatedAt"] = meta.generatedAt;
    lines.push(JSON.stringify(header));
    for (const [id, value] of entries(snapshot)) {
        lines.push(JSON.stringify({ type: "setting", id, value }));
    }
    // Each line is terminated rather than separated, so the file ends with exactly one
    // newline and no empty final record. A reader that splits on "\n" sees one trailing
    // empty string, which is unambiguous; a file that ended without the newline would
    // leave a reader unable to tell a complete last record from a truncated one.
    return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ *
 * YAML
 * ------------------------------------------------------------------ */

/**
 * Whether a string has to be quoted to survive a YAML round trip.
 *
 * A plain scalar is resolved by the reader, not by the writer, so writing `enabled:
 * true` when the value is the four-letter *string* `true` produces a file that
 * silently changes type on the way back in — and a settings importer that receives
 * a boolean where it expected text will reject the entry and report it as corrupt.
 * The same trap catches `no` (YAML 1.1 readers resolve it to false), `0123` (an
 * integer, losing the leading zero), `1.0` (a float, so a later comparison against
 * the string fails) and `2024-01-01` (a timestamp in readers with the default
 * schema). Anything that is not obviously inert gets quotes; over-quoting costs two
 * characters, and under-quoting costs the value.
 */
export function yamlNeedsQuoting(text: string): boolean {
    if (text === "") return true;
    if (looksTyped(text)) return true;
    // Only a deliberately narrow safe set is left plain. Everything outside it —
    // punctuation that YAML gives meaning to, leading or trailing space that a reader
    // strips, and any non-ASCII text whose treatment varies between readers — is quoted.
    return !/^[A-Za-z_][A-Za-z0-9_ .-]*$/.test(text) || text.endsWith(" ");
}

function yamlScalar(value: SettingValue): string {
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return yamlNumber(value);
    return yamlNeedsQuoting(value) ? quotedString(value) : value;
}

function yamlNumber(value: number): string {
    if (Number.isNaN(value)) return ".nan";
    if (value === Number.POSITIVE_INFINITY) return ".inf";
    if (value === Number.NEGATIVE_INFINITY) return "-.inf";
    return String(value);
}

function serializeYaml(snapshot: SettingsSnapshot, meta: ExportMeta): string {
    const lines: string[] = [`version: ${meta.version}`];
    if (meta.generatedAt !== undefined)
        lines.push(`generatedAt: ${quotedString(meta.generatedAt)}`);
    const pairs = entries(snapshot);
    if (pairs.length === 0) {
        // An empty mapping has to be written in flow style. `values:` with nothing under
        // it resolves to null, and a reader would then be unable to tell "no settings
        // differ from their defaults" from "this key was never written".
        lines.push("values: {}");
    } else {
        lines.push("values:");
        // Keys are always quoted. Setting ids contain dots and could contain a colon,
        // and a plain key holding `a: b` would terminate itself early; quoting sidesteps
        // the whole class rather than testing for each member of it.
        for (const [id, value] of pairs)
            lines.push(`    ${quotedString(id)}: ${yamlScalar(value)}`);
    }
    return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ *
 * TOML
 * ------------------------------------------------------------------ */

/**
 * Whether an id can be written as a bare TOML key.
 *
 * This matters more than it looks. A bare key containing a dot is not a key with a
 * dot in it — TOML reads `theme.mode = "dark"` as a table named `theme` holding a
 * key named `mode`, so an id would come back as a nested structure and the store
 * would never find it. Almost every id in this project is dotted, so almost every
 * key is quoted, and that is correct rather than defensive.
 */
export function tomlKeyIsBare(id: string): boolean {
    return /^[A-Za-z0-9_-]+$/.test(id);
}

function tomlNumber(value: number): string {
    if (Number.isNaN(value)) return "nan";
    if (value === Number.POSITIVE_INFINITY) return "inf";
    if (value === Number.NEGATIVE_INFINITY) return "-inf";
    return String(value);
}

function serializeToml(snapshot: SettingsSnapshot, meta: ExportMeta): string {
    const lines: string[] = [`version = ${meta.version}`];
    if (meta.generatedAt !== undefined) {
        // Deliberately a quoted string rather than a TOML offset date-time. The caller's
        // stamp is whatever it is, and an unparseable bare date-time is a syntax error
        // that would make the entire file unreadable rather than one field unreliable.
        lines.push(`generatedAt = ${quotedString(meta.generatedAt)}`);
    }
    lines.push("", "[values]");
    for (const [id, value] of entries(snapshot)) {
        const key = tomlKeyIsBare(id) ? id : quotedString(id);
        const literal =
            typeof value === "boolean"
                ? value
                    ? "true"
                    : "false"
                : typeof value === "number"
                  ? tomlNumber(value)
                  : quotedString(value);
        lines.push(`${key} = ${literal}`);
    }
    return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ *
 * XML
 * ------------------------------------------------------------------ */

/**
 * Whether a code point is one XML 1.0 permits at all.
 *
 * Most control characters are not merely awkward in XML, they are forbidden
 * outright, and — this is the part that surprises people — there is no escape for
 * them either. `&#1;` is exactly as illegal as a literal U+0001, so a document
 * containing one is not a document with an encoding problem, it is a document no
 * conforming parser will open. A preserved value written by another build could
 * hold one, so the serialiser substitutes the replacement character and the loss
 * report says it did.
 */
function isXmlCodePoint(code: number): boolean {
    return (
        code === 0x9 ||
        code === 0xa ||
        code === 0xd ||
        (code >= 0x20 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
    );
}

export function hasXmlIllegalCharacter(text: string): boolean {
    for (const character of text) {
        const code = character.codePointAt(0);
        if (code === undefined || !isXmlCodePoint(code)) return true;
    }
    return false;
}

function xmlText(text: string): string {
    let out = "";
    for (const character of text) {
        const code = character.codePointAt(0);
        if (code === undefined || !isXmlCodePoint(code)) {
            out += "�";
            continue;
        }
        switch (character) {
            case "&":
                out += "&amp;";
                break;
            case "<":
                out += "&lt;";
                break;
            case ">":
                out += "&gt;";
                break;
            case '"':
                out += "&quot;";
                break;
            case "'":
                // Escaped in element text as well as in attributes. It is unnecessary
                // there, and doing it anyway means one escaper serves both positions,
                // which removes the possibility of the attribute path being the one that
                // was forgotten.
                out += "&apos;";
                break;
            default:
                out += character;
        }
    }
    return out;
}

/*
 * Ids travel as an attribute, never as the element name.
 *
 * An XML element name may not start with a digit, may not contain a space, a
 * comma, a slash or most punctuation, and this project's ids are free-form strings
 * that a different build may have written. Deriving a name from an id would mean
 * either emitting a document that is not well-formed — the worst outcome, because
 * it fails at the parser rather than at the value — or mangling the id into
 * something legal and losing the ability to get it back. An attribute value has
 * none of those restrictions, so no id can produce an invalid name here.
 */
function serializeXml(snapshot: SettingsSnapshot, meta: ExportMeta): string {
    const attributes = [`version="${xmlText(String(meta.version))}"`];
    if (meta.generatedAt !== undefined) {
        attributes.push(`generatedAt="${xmlText(meta.generatedAt)}"`);
    }
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<settings ${attributes.join(" ")}>`];
    for (const [id, value] of entries(snapshot)) {
        const type = typeof value;
        const text =
            typeof value === "number"
                ? String(value)
                : typeof value === "boolean"
                  ? value
                      ? "true"
                      : "false"
                  : value;
        lines.push(`    <setting id="${xmlText(id)}" type="${type}">${xmlText(text)}</setting>`);
    }
    lines.push("</settings>");
    return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ *
 * Delimiter-separated values
 * ------------------------------------------------------------------ */

function delimiterOf(id: "csv" | "tsv"): string {
    return id === "csv" ? "," : "\t";
}

/**
 * RFC 4180 quoting: wrap when the field could otherwise end early, and double any
 * embedded quote.
 *
 * A tab-separated file has no such standard, which is precisely why the same rule
 * is applied to it. The alternative convention — replacing a tab inside a value
 * with `\t` — is not reversible without also escaping backslashes, and a format
 * whose escaping is half-specified is worse than one whose escaping is borrowed.
 */
function delimitedField(text: string, delimiter: string): string {
    const mustQuote =
        text.includes(delimiter) ||
        text.includes('"') ||
        text.includes("\n") ||
        text.includes("\r");
    if (!mustQuote) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

function delimitedValue(value: SettingValue): string {
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
}

function serializeDelimited(snapshot: SettingsSnapshot, id: "csv" | "tsv"): string {
    const delimiter = delimiterOf(id);
    // The header names are ASCII and not localised. They are field identifiers that a
    // spreadsheet formula or a script will reference by name, so translating them would
    // break the file for the reader every time the visitor changed language.
    const lines = [["id", "value"].join(delimiter)];
    for (const [key, value] of entries(snapshot)) {
        lines.push(
            [delimitedField(key, delimiter), delimitedField(delimitedValue(value), delimiter)].join(
                delimiter,
            ),
        );
    }
    // RFC 4180 specifies CRLF, and this file uses LF throughout because the project
    // does. Every reader that handles the format accepts LF; none of them require CR.
    return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ *
 * Markdown
 * ------------------------------------------------------------------ */

/*
 * A Markdown table cell cannot contain a line break at all, and an unescaped pipe
 * ends the cell. Both are handled — the pipe by escaping, the line break by a `<br>`
 * that renderers understand — but neither is reversible, which is the honest reason
 * this format is not offered as re-importable rather than a shortcoming of the
 * escaping. Values are not wrapped in code spans: a value containing a backtick
 * would then need its own fence length computed per cell, and getting that subtly
 * wrong renders the rest of the row as code.
 */
function markdownCell(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|")
        .replace(/\r\n|\r|\n/g, "<br>");
}

function serializeMarkdown(snapshot: SettingsSnapshot, meta: ExportMeta): string {
    const lines: string[] = [];
    if (meta.title !== undefined) lines.push(`# ${markdownHeading(meta.title)}`, "");
    lines.push(`version: ${meta.version}`);
    if (meta.generatedAt !== undefined) lines.push("", `generated: ${meta.generatedAt}`);
    lines.push("", "| id | value |", "| --- | --- |");
    for (const [id, value] of entries(snapshot)) {
        lines.push(`| ${markdownCell(id)} | ${markdownCell(delimitedValue(value))} |`);
    }
    return `${lines.join("\n")}\n`;
}

/** A heading is a single line by definition, so a caller-supplied newline is folded away. */
function markdownHeading(text: string): string {
    return text.replace(/\r\n|\r|\n/g, " ");
}

/* ------------------------------------------------------------------ *
 * HTML
 * ------------------------------------------------------------------ */

/*
 * The escaper covers `&`, `<`, `>`, `"` and `'` even though text position needs
 * only the first three. Values here are arbitrary strings, some of them written by
 * another build, and the one thing this document must never do is let a value stop
 * being a value: a stored preference reading `"><script>` has to appear on the page
 * as those characters and nothing else. Escaping the full set with one function
 * means a later edit that moves a value into an attribute cannot introduce an
 * injection by forgetting to switch escapers.
 */
function htmlEscape(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function serializeHtml(snapshot: SettingsSnapshot, meta: ExportMeta): string {
    const title = meta.title ?? "settings";
    const language = meta.language ?? "en";
    const lines = [
        "<!DOCTYPE html>",
        `<html lang="${htmlEscape(language)}">`,
        "<head>",
        '<meta charset="utf-8">',
        `<title>${htmlEscape(markdownHeading(title))}</title>`,
        "</head>",
        "<body>",
        `<h1>${htmlEscape(markdownHeading(title))}</h1>`,
        `<p>version: ${htmlEscape(String(meta.version))}</p>`,
    ];
    if (meta.generatedAt !== undefined) {
        lines.push(`<p>generated: ${htmlEscape(meta.generatedAt)}</p>`);
    }
    lines.push(
        "<table>",
        '<thead><tr><th scope="col">id</th><th scope="col">value</th></tr></thead>',
        "<tbody>",
    );
    for (const [id, value] of entries(snapshot)) {
        lines.push(
            `<tr><th scope="row">${htmlEscape(id)}</th><td>${htmlEscape(delimitedValue(value))}</td></tr>`,
        );
    }
    lines.push("</tbody>", "</table>", "</body>", "</html>");
    return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ *
 * The public entry points
 * ------------------------------------------------------------------ */

export function serialize(
    format: ExportFormatId,
    snapshot: SettingsSnapshot,
    meta: ExportMeta,
): string {
    switch (format) {
        case "json":
            return serializeJson(snapshot, meta);
        case "jsonl":
            return serializeJsonLines(snapshot, meta);
        case "yaml":
            return serializeYaml(snapshot, meta);
        case "toml":
            return serializeToml(snapshot, meta);
        case "xml":
            return serializeXml(snapshot, meta);
        case "csv":
        case "tsv":
            return serializeDelimited(snapshot, format);
        case "markdown":
            return serializeMarkdown(snapshot, meta);
        case "html":
            return serializeHtml(snapshot, meta);
    }
}

function loss(key: string, ids: readonly string[]): ExportLoss {
    return {
        key,
        ids,
        ...(ids.length > 0 ? { interpolations: { count: ids.length } } : {}),
    };
}

/** Ids collected without duplicates, since one id can trip a check through both its key and its value. */
function idsWhere(
    pieces: readonly (readonly [string, string])[],
    predicate: (text: string) => boolean,
): readonly string[] {
    const found = new Set<string>();
    for (const [id, text] of pieces) {
        if (predicate(text)) found.add(id);
    }
    return [...found];
}

/**
 * What this format cannot faithfully carry, for this snapshot.
 *
 * The report is deliberately data-dependent. Reporting every caveat a format has
 * ever had would mean CSV always warns about type flattening, including for a
 * snapshot of nothing but strings where the round trip is in fact exact — and a
 * warning that is always on is a warning that is never read. So each check below
 * asks whether the situation actually arises in the values in hand, and an empty
 * array is a claim the caller may repeat without qualification: nothing is lost.
 *
 * The converse discipline matters just as much. Where a loss is a property of the
 * format itself rather than of the data — HTML is a page for reading and defines no
 * way back — it is reported unconditionally with no ids, because pretending an
 * unparseable document might be re-importable for the right data would be a
 * comforting lie about the one thing the visitor needs to know before choosing it.
 */
export function describeExportLoss(
    format: ExportFormatId,
    snapshot: SettingsSnapshot,
): readonly ExportLoss[] {
    const pairs = entries(snapshot);
    const pieces = textPieces(snapshot);
    const losses: ExportLoss[] = [];

    const nonFinite = pairs
        .filter(([, value]) => typeof value === "number" && !Number.isFinite(value))
        .map(([id]) => id);

    switch (format) {
        case "json":
        case "jsonl": {
            // JSON has no literal for infinity or NaN, and `JSON.stringify` turns both into
            // null without complaint. The value is not merely reshaped, it is gone, and the
            // file gives a reader no hint that it ever existed.
            if (nonFinite.length > 0)
                losses.push(loss("exportFormats.loss.nonFiniteNumber", nonFinite));
            break;
        }
        case "yaml":
            // YAML carries every case this module can produce: `.inf` and `.nan` for the
            // numbers JSON cannot express, and double-quoted scalars with JSON's own escape
            // set for any text. There is genuinely nothing to warn about, and saying so is
            // more useful than inventing a caveat to look thorough.
            break;
        case "toml": {
            const quotedKeys = pairs.filter(([id]) => !tomlKeyIsBare(id)).map(([id]) => id);
            if (quotedKeys.length > 0) {
                losses.push(loss("exportFormats.loss.toml.quotedKey", quotedKeys));
            }
            break;
        }
        case "xml": {
            const illegal = idsWhere(pieces, hasXmlIllegalCharacter);
            if (illegal.length > 0) {
                losses.push(loss("exportFormats.loss.xml.illegalCharacter", illegal));
            }
            // Carriage returns and attribute whitespace are lost to the parser rather than to
            // the writer: the document below is correct, and a conforming reader normalises
            // it on the way back in. That is exactly the sort of loss a visitor cannot
            // discover by looking at the file they downloaded.
            const carriageReturn = idsWhere(pieces, (text) => text.includes("\r"));
            if (carriageReturn.length > 0) {
                losses.push(loss("exportFormats.loss.xml.carriageReturn", carriageReturn));
            }
            const idWhitespace = pairs.filter(([id]) => /[\t\n\r]/.test(id)).map(([id]) => id);
            if (idWhitespace.length > 0) {
                losses.push(loss("exportFormats.loss.xml.idWhitespace", idWhitespace));
            }
            break;
        }
        case "csv":
        case "tsv": {
            const delimiter = delimiterOf(format);
            losses.push(loss("exportFormats.loss.metadataDropped", []));
            const typed = pairs.filter(([, value]) => typeof value !== "string").map(([id]) => id);
            if (typed.length > 0) losses.push(loss("exportFormats.loss.typeFlattened", typed));
            const ambiguous = pairs
                .filter(([, value]) => typeof value === "string" && looksTyped(value))
                .map(([id]) => id);
            if (ambiguous.length > 0) {
                losses.push(loss("exportFormats.loss.typeAmbiguous", ambiguous));
            }
            const newline = idsWhere(pieces, (text) => /[\n\r]/.test(text));
            if (newline.length > 0)
                losses.push(loss("exportFormats.loss.embeddedNewline", newline));
            const quoting = idsWhere(
                pieces,
                (text) => text.includes(delimiter) || text.includes('"'),
            );
            if (quoting.length > 0)
                losses.push(loss("exportFormats.loss.quotingRequired", quoting));
            break;
        }
        case "markdown": {
            losses.push(loss("exportFormats.loss.markdown.notReimportable", []));
            const escaped = idsWhere(pieces, (text) => /[|\n\r\\]/.test(text));
            if (escaped.length > 0)
                losses.push(loss("exportFormats.loss.markdown.escaped", escaped));
            break;
        }
        case "html":
            losses.push(loss("exportFormats.loss.html.notReimportable", []));
            break;
    }
    return losses;
}

/** True when the format carries this snapshot exactly. Kept separate so a caller cannot misread an empty array. */
export function isLossless(format: ExportFormatId, snapshot: SettingsSnapshot): boolean {
    return describeExportLoss(format, snapshot).length === 0;
}

/* ------------------------------------------------------------------ *
 * Copy
 * ------------------------------------------------------------------ */

/*
 * Every loss phrase is a plain string, identical at every funny level.
 *
 * These sentences are the only warning a visitor gets before a download that may
 * quietly change their data, and a funnier rendering of "your numbers become text"
 * is a rendering with more room to be misread. Only the heading varies by level,
 * because how a list is introduced cannot alter what the list says.
 *
 * The format names have no Cantonese rendering and are stored as an empty string
 * for `yue`. They are proper nouns — JSON is JSON in every language — and the i18n
 * port reads an empty secondary as "no second label", so bilingual mode shows the
 * name once instead of printing "JSON · JSON".
 */
export const EXPORT_FORMAT_STRINGS: StringTable = {
    /*
     * Two keys the picker in `settings/page.ts` needs, added here rather than in a table of its
     * own because `registerStrings` is last-write-wins per namespace: a second table registered
     * under `exportFormats` would silently replace this one and take every format name with it.
     *
     * `lossless` is the honest counterpart to the loss list. A format that carries this data
     * faithfully has to say so out loud, because an empty space where a warning usually sits
     * reads as a warning that failed to render rather than as an absence of anything to warn
     * about.
     */
    "exportFormats.pickerLabel": { en: "Export as", yue: "匯出格式" },
    "exportFormats.lossless": {
        en: "Nothing is lost: this format carries every one of these settings exactly.",
        yue: "冇任何損失：呢個格式可以原汁原味載住全部呢啲設定。",
    },
    "exportFormats.name.json": { en: "JSON", yue: "" },
    "exportFormats.name.jsonl": { en: "JSON Lines (NDJSON)", yue: "" },
    "exportFormats.name.yaml": { en: "YAML", yue: "" },
    "exportFormats.name.toml": { en: "TOML", yue: "" },
    "exportFormats.name.xml": { en: "XML", yue: "" },
    "exportFormats.name.csv": { en: "CSV", yue: "" },
    "exportFormats.name.tsv": { en: "TSV", yue: "" },
    "exportFormats.name.markdown": { en: "Markdown", yue: "" },
    "exportFormats.name.html": { en: "HTML", yue: "" },

    "exportFormats.desc.json": {
        en: "One object with exact types. This is the format the import button reads.",
        yue: "一個 object，型別原封不動。匯入掣讀嘅就係呢個。",
    },
    "exportFormats.desc.jsonl": {
        en: "One JSON object per line, so a file can be appended to and read a record at a time.",
        yue: "一行一個 JSON object，可以續寫，亦都可以一筆一筆咁讀。",
    },
    "exportFormats.desc.yaml": {
        en: "Readable by eye and exact on the way back, with quotes wherever a bare value would be misread.",
        yue: "肉眼睇得明，讀返都唔會走樣；容易睇錯嘅值會加返引號。",
    },
    "exportFormats.desc.toml": {
        en: "Config-file shape. Ids that contain a dot are written as quoted keys.",
        yue: "配置檔嘅樣。有「.」嘅 id 會用引號寫做 key。",
    },
    "exportFormats.desc.xml": {
        en: "Typed elements with escaped text, for a toolchain that already speaks XML.",
        yue: "有型別嘅元素、文字全部轉義，啱畀本身就用 XML 嘅工具。",
    },
    "exportFormats.desc.csv": {
        en: "Two columns for a spreadsheet.",
        yue: "兩欄，開得試算表。",
    },
    "exportFormats.desc.tsv": {
        en: "The same two columns, separated by tabs, for a pipeline that dislikes commas.",
        yue: "一樣嘅兩欄，用 Tab 分隔，啱怕逗號嘅流程。",
    },
    "exportFormats.desc.markdown": {
        en: "A table to paste into a document or a bug report. For reading, not for importing.",
        yue: "一個表，貼落文件或者報障度。淨係畀人睇，唔係用嚟匯入。",
    },
    "exportFormats.desc.html": {
        en: "A standalone page that opens in a browser. For reading, not for importing.",
        yue: "一版可以直接用瀏覽器開嘅 HTML。淨係畀人睇，唔係用嚟匯入。",
    },

    "exportFormats.lossHeading": {
        en: {
            1: "What this format cannot carry",
            3: "What this format cannot carry",
            5: "What this format will quietly leave behind",
        },
        yue: {
            1: "呢個格式載唔到嘅嘢",
            3: "呢個格式載唔到嘅嘢",
            5: "呢個格式會靜靜雞漏低嘅嘢",
        },
    },
    "exportFormats.lossNone": {
        en: "Nothing is lost. This format carries every value in this export exactly.",
        yue: "冇嘢會蝕。呢個格式可以原封不動載晒今次匯出嘅每一個值。",
    },
    "exportFormats.loss.metadataDropped": {
        en: "The schema version is not part of this file. It has an id column and a value column and nothing else.",
        yue: "呢個檔案冇 schema 版本號。淨係得一個 id 欄同一個 value 欄，冇其他。",
    },
    "exportFormats.loss.typeFlattened": {
        en: "{count} values are numbers or true/false and are written as plain text, so a reader cannot tell the number 3 from the text 3.",
        yue: "有 {count} 個值係數字或者 true/false，寫出嚟變咗純文字，讀返嘅時候分唔到數字 3 同文字 3。",
    },
    "exportFormats.loss.typeAmbiguous": {
        en: "{count} text values look like a number, true/false, or a date. A reader that guesses types will change them.",
        yue: "有 {count} 個文字值樣衰似數字、true/false 或者日期。讀嗰陣自己估型別嘅程式會改咗佢哋。",
    },
    "exportFormats.loss.quotingRequired": {
        en: "{count} values contain the separator or a quote character. They are quoted following RFC 4180, but a reader that just splits on the separator will read them wrongly.",
        yue: "有 {count} 個值入面有分隔符或者引號。已經按 RFC 4180 加咗引號，但係淨係靠分隔符切開嘅程式會讀錯。",
    },
    "exportFormats.loss.embeddedNewline": {
        en: "{count} values contain a line break, so one record spans several lines and a reader that works line by line will split it in two.",
        yue: "有 {count} 個值入面有換行，即係一筆記錄佔幾行；逐行讀嘅程式會將佢斬開兩截。",
    },
    "exportFormats.loss.toml.quotedKey": {
        en: "{count} ids need a quoted key because of the characters in them. A reader that only understands bare keys will read a dotted id as a nested table instead of as one id.",
        yue: "有 {count} 個 id 因為入面嘅字元要用引號做 key。淨係識淨 key 嘅程式，會將有「.」嘅 id 當成巢狀表，唔會當成一個 id。",
    },
    "exportFormats.loss.xml.illegalCharacter": {
        en: "{count} values contain characters that XML 1.0 cannot represent at all, not even escaped. They are written as the replacement character U+FFFD.",
        yue: "有 {count} 個值入面有啲字元，XML 1.0 根本表達唔到，轉義都唔得。佢哋會寫成替代字元 U+FFFD。",
    },
    "exportFormats.loss.xml.carriageReturn": {
        en: "{count} values contain a carriage return. An XML reader turns it into a line feed, so the text comes back changed.",
        yue: "有 {count} 個值入面有 carriage return。XML 讀嗰陣會變成換行，所以讀返出嚟嘅文字會唔同咗。",
    },
    "exportFormats.loss.xml.idWhitespace": {
        en: "{count} ids contain a tab or a line break. Ids are carried as attributes, and an XML reader collapses whitespace inside an attribute into a single space.",
        yue: "有 {count} 個 id 入面有 Tab 或者換行。id 係擺喺屬性度，XML 讀嗰陣會將屬性入面嘅空白壓成一個空格。",
    },
    "exportFormats.loss.nonFiniteNumber": {
        en: "{count} numbers are infinite or not a number. JSON has no way to write either, so they are written as null.",
        yue: "有 {count} 個數字係無限大或者唔係數字。JSON 兩樣都寫唔到，所以會寫成 null。",
    },
    "exportFormats.loss.markdown.escaped": {
        en: "{count} values contain a vertical bar, a backslash, or a line break. The table escapes them, so the text a reader recovers is not the text that was stored.",
        yue: "有 {count} 個值入面有直線、反斜線或者換行。表格會將佢哋轉義，所以讀返出嚟嘅文字唔等於原本存低嗰個。",
    },
    "exportFormats.loss.markdown.notReimportable": {
        en: "Markdown is a table for reading. There is no defined way to read it back in as settings.",
        yue: "Markdown 係一個畀人睇嘅表。冇一套定義好嘅方法可以讀返做設定。",
    },
    "exportFormats.loss.html.notReimportable": {
        en: "HTML is a page for reading. Values are escaped for display and there is no defined way to read them back in as settings.",
        yue: "HTML 係一版畀人睇嘅嘢。啲值為咗顯示已經轉義咗，冇定義好嘅方法讀返做設定。",
    },
};

/*
 * Registered here rather than by the caller, for the same reason the settings and
 * appearance tables are: a surface that forgets renders raw keys, and the loss
 * report is the one piece of copy in this module that a visitor sees at the moment
 * a mistake becomes irreversible.
 */
registerStrings("exportFormats", EXPORT_FORMAT_STRINGS);
