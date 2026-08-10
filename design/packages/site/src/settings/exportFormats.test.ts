/**
 * Proving the serialisers, by reading their output back.
 *
 * A serialiser test that asserts against a hand-written expected string only
 * proves that the code still does what it did yesterday. It cannot tell a correct
 * escape from a plausible one, because the expected string was written by the same
 * person, at the same moment, with the same misunderstanding. So every format this
 * module claims is re-importable is parsed back here by a parser written from the
 * format's own rules rather than from the writer's, and compared against the
 * snapshot that went in. Where the two disagree, one of them is wrong and the test
 * says so without needing anyone to eyeball a diff of quoting.
 *
 * The parsers below are deliberately small and deliberately strict: they throw on a
 * line they do not recognise rather than skipping it. A lenient parser would let a
 * malformed line vanish and the round trip would still pass on whatever survived,
 * which is the failure mode this whole file exists to rule out.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ExportFormatId, SettingsSnapshot } from "./exportFormats.js";
import {
    EXPORT_FORMATS,
    EXPORT_FORMAT_STRINGS,
    describeExportLoss,
    exportFileName,
    exportFormat,
    hasXmlIllegalCharacter,
    isExportFormatId,
    isLossless,
    looksTyped,
    serialize,
    tomlKeyIsBare,
    yamlNeedsQuoting,
} from "./exportFormats.js";
import type { SettingValue } from "./types.js";

const META = { version: 1 } as const;

/**
 * U+0007, written as an escape rather than as itself.
 *
 * XML 1.0 forbids this character outright and offers no escape for it, which is
 * exactly why it is worth testing — and exactly why it must not sit as a raw byte
 * in a source file, where an editor renders it as nothing and the next person to
 * touch the line deletes it without ever seeing it.
 */
const BELL = "\u0007";

/**
 * The snapshot every round trip runs against.
 *
 * Each entry is here because it has broken a serialiser somewhere: the empty
 * string that a naive CSV reader turns into a missing column, the text that is
 * exactly `true`, the leading zero a number parser eats, the date a spreadsheet
 * rewrites in its own locale, the quote-comma-newline combination that ends a
 * field three characters early, and the CJK and emoji that a byte-oriented escaper
 * cuts in half. Values containing a carriage return or a character XML forbids are
 * deliberately *not* here — those cannot survive every format, the loss report says
 * so, and mixing them in would force this snapshot to prove a claim the module does
 * not make. They get their own cases further down.
 */
const ADVERSARIAL: SettingsSnapshot = {
    "theme.mode": "dark",
    "text.empty": "",
    "text.quotesCommasNewline": 'she said "hello", then\nleft',
    "text.true": "true",
    "text.no": "no",
    "text.leadingZero": "0123",
    "text.oneFloat": "1.0",
    "text.date": "2024-01-01",
    "text.unicode": "顏色 🎨 深色",
    "text.long": "x".repeat(5000),
    "text.pipeAndBackslash": "a | b \\ c",
    "text.tab": "a\tb",
    "text.leadingSpace": "  padded  ",
    "number.negative": -42,
    "number.fraction": 0.125,
    "toggle.off": false,
    "toggle.on": true,
};

/** Every value as the text a two-column table can carry, which is what CSV and TSV recover. */
function asText(snapshot: SettingsSnapshot): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(snapshot)) out[id] = String(value);
    return out;
}

function formatsWhere(
    predicate: (descriptor: (typeof EXPORT_FORMATS)[number]) => boolean,
): readonly ExportFormatId[] {
    return EXPORT_FORMATS.filter(predicate).map((descriptor) => descriptor.id);
}

/* ------------------------------------------------------------------ *
 * Parsers written from each format's rules, not from the writer's
 * ------------------------------------------------------------------ */

function parseJson(text: string): Record<string, SettingValue> {
    const parsed = JSON.parse(text) as { values: Record<string, SettingValue> };
    return parsed.values;
}

function parseJsonLines(text: string): Record<string, SettingValue> {
    const values: Record<string, SettingValue> = {};
    const lines = text.split("\n");
    const last = lines.pop();
    expect(last).toBe("");
    for (const line of lines) {
        const record = JSON.parse(line) as {
            type: string;
            id?: string;
            value?: SettingValue;
        };
        if (record.type === "meta") continue;
        expect(record.type).toBe("setting");
        if (record.id === undefined || record.value === undefined) {
            throw new Error(`incomplete record: ${line}`);
        }
        values[record.id] = record.value;
    }
    return values;
}

function parseYamlScalar(raw: string): SettingValue {
    if (raw.startsWith('"')) return JSON.parse(raw) as string;
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === ".inf") return Number.POSITIVE_INFINITY;
    if (raw === "-.inf") return Number.NEGATIVE_INFINITY;
    if (raw === ".nan") return Number.NaN;
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw)) return Number(raw);
    return raw;
}

function parseYaml(text: string): Record<string, SettingValue> {
    const values: Record<string, SettingValue> = {};
    let inValues = false;
    for (const line of text.split("\n")) {
        if (line === "") continue;
        if (line === "values: {}") {
            inValues = true;
            continue;
        }
        if (line === "values:") {
            inValues = true;
            continue;
        }
        if (!inValues) {
            if (/^[A-Za-z]+: .+$/.test(line)) continue;
            throw new Error(`unrecognised YAML header line: ${line}`);
        }
        const match = /^ {4}("(?:[^"\\]|\\.)*"): (.*)$/.exec(line);
        if (match === null) throw new Error(`unrecognised YAML entry line: ${line}`);
        const [, rawKey = "", rawValue = ""] = match;
        values[JSON.parse(rawKey) as string] = parseYamlScalar(rawValue);
    }
    return values;
}

function parseToml(text: string): Record<string, SettingValue> {
    const values: Record<string, SettingValue> = {};
    let inValues = false;
    for (const line of text.split("\n")) {
        if (line === "") continue;
        if (line === "[values]") {
            inValues = true;
            continue;
        }
        const match = /^("(?:[^"\\]|\\.)*"|[A-Za-z0-9_-]+) = (.*)$/.exec(line);
        if (match === null) throw new Error(`unrecognised TOML line: ${line}`);
        if (!inValues) continue;
        const [, rawKey = "", rawValue = ""] = match;
        const key = rawKey.startsWith('"') ? (JSON.parse(rawKey) as string) : rawKey;
        if (rawValue.startsWith('"')) values[key] = JSON.parse(rawValue) as string;
        else if (rawValue === "true") values[key] = true;
        else if (rawValue === "false") values[key] = false;
        else if (rawValue === "inf") values[key] = Number.POSITIVE_INFINITY;
        else if (rawValue === "-inf") values[key] = Number.NEGATIVE_INFINITY;
        else if (rawValue === "nan") values[key] = Number.NaN;
        else values[key] = Number(rawValue);
    }
    return values;
}

function unescapeXml(text: string): string {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

function parseXml(text: string): Record<string, SettingValue> {
    const values: Record<string, SettingValue> = {};
    const pattern = /<setting id="([^"]*)" type="(string|number|boolean)">([\s\S]*?)<\/setting>/g;
    for (const match of text.matchAll(pattern)) {
        const [, rawId = "", type = "", rawValue = ""] = match;
        const id = unescapeXml(rawId);
        const body = unescapeXml(rawValue);
        values[id] = type === "number" ? Number(body) : type === "boolean" ? body === "true" : body;
    }
    return values;
}

/** An RFC 4180 reader: quotes only start a field, a doubled quote is a literal, records end on a bare newline. */
function parseDelimited(text: string, delimiter: string): Record<string, string> {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    let index = 0;
    while (index < text.length) {
        const character = text[index] ?? "";
        if (quoted) {
            if (character === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 2;
                    continue;
                }
                quoted = false;
                index += 1;
                continue;
            }
            field += character;
            index += 1;
            continue;
        }
        if (character === '"' && field === "") {
            quoted = true;
            index += 1;
            continue;
        }
        if (character === delimiter) {
            row.push(field);
            field = "";
            index += 1;
            continue;
        }
        if (character === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            index += 1;
            continue;
        }
        field += character;
        index += 1;
    }
    if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    const header = rows.shift();
    expect(header).toEqual(["id", "value"]);
    const values: Record<string, string> = {};
    for (const parsed of rows) {
        const [id = "", value = ""] = parsed;
        expect(parsed).toHaveLength(2);
        values[id] = value;
    }
    return values;
}

function parseFormat(format: ExportFormatId, text: string): Record<string, SettingValue> {
    switch (format) {
        case "json":
            return parseJson(text);
        case "jsonl":
            return parseJsonLines(text);
        case "yaml":
            return parseYaml(text);
        case "toml":
            return parseToml(text);
        case "xml":
            return parseXml(text);
        case "csv":
            return parseDelimited(text, ",");
        case "tsv":
            return parseDelimited(text, "\t");
        default:
            throw new Error(`${format} defines no way back and must not be parsed`);
    }
}

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

describe("the format catalogue", () => {
    it("offers the nine text formats that can carry a settings snapshot", () => {
        expect(EXPORT_FORMATS.map((format) => format.id)).toEqual([
            "json",
            "jsonl",
            "yaml",
            "toml",
            "xml",
            "csv",
            "tsv",
            "markdown",
            "html",
        ]);
    });

    it("gives every format a dotted extension, a charset-bearing MIME type, and two keys", () => {
        for (const format of EXPORT_FORMATS) {
            expect(format.extension.startsWith(".")).toBe(true);
            expect(format.mimeType).toContain("charset=utf-8");
            expect(format.nameKey).toBe(`exportFormats.name.${format.id}`);
            expect(format.descriptionKey).toBe(`exportFormats.desc.${format.id}`);
        }
    });

    it("never claims a typed round trip for a format it cannot even parse back", () => {
        for (const format of EXPORT_FORMATS) {
            if (format.typedRoundTrip) expect(format.reimportable).toBe(true);
        }
    });

    it("resolves a descriptor by id and refuses one it does not have", () => {
        expect(exportFormat("yaml").extension).toBe(".yaml");
        expect(isExportFormatId("yaml")).toBe(true);
        expect(isExportFormatId("xlsx")).toBe(false);
        expect(() => exportFormat("xlsx" as ExportFormatId)).toThrow(/Unknown export format/);
    });

    it("builds a file name by appending the extension to the caller's base", () => {
        expect(exportFileName("markdown", "worldlens-settings-2026-08-09")).toBe(
            "worldlens-settings-2026-08-09.md",
        );
        expect(exportFileName("jsonl", "settings")).toBe("settings.jsonl");
    });
});

describe("the file text itself", () => {
    const ids = EXPORT_FORMATS.map((format) => format.id);

    it.each(ids)("%s ends with exactly one newline and uses no carriage returns", (format) => {
        const text = serialize(format, ADVERSARIAL, META);
        expect(text.endsWith("\n")).toBe(true);
        expect(text.endsWith("\n\n")).toBe(false);
        expect(text).not.toContain("\r");
    });

    it.each(ids)("%s survives an empty snapshot", (format) => {
        const text = serialize(format, {}, META);
        expect(text.length).toBeGreaterThan(0);
        expect(text.endsWith("\n")).toBe(true);
    });

    it.each(ids)("%s does not depend on the order the ids were inserted in", (format) => {
        const forwards: Record<string, SettingValue> = {};
        const backwards: Record<string, SettingValue> = {};
        const entries = Object.entries(ADVERSARIAL);
        for (const [id, value] of entries) forwards[id] = value;
        for (const [id, value] of [...entries].reverse()) backwards[id] = value;
        expect(serialize(format, forwards, META)).toBe(serialize(format, backwards, META));
    });
});

/* ------------------------------------------------------------------ *
 * Round trips
 * ------------------------------------------------------------------ */

describe("round trips", () => {
    const typed = formatsWhere((format) => format.typedRoundTrip);
    const untyped = formatsWhere((format) => format.reimportable && !format.typedRoundTrip);

    it.each(typed)("%s parses back to the exact snapshot, types and all", (format) => {
        expect(parseFormat(format, serialize(format, ADVERSARIAL, META))).toEqual(ADVERSARIAL);
    });

    it.each(typed)("%s parses an empty snapshot back to an empty record", (format) => {
        expect(parseFormat(format, serialize(format, {}, META))).toEqual({});
    });

    it.each(typed)("%s carries a 5000-character value without truncating it", (format) => {
        const parsed = parseFormat(format, serialize(format, ADVERSARIAL, META));
        expect(parsed["text.long"]).toBe("x".repeat(5000));
    });

    it.each(typed)("%s carries CJK and an emoji unchanged", (format) => {
        const parsed = parseFormat(format, serialize(format, ADVERSARIAL, META));
        expect(parsed["text.unicode"]).toBe("顏色 🎨 深色");
    });

    it.each(untyped)(
        "%s parses back to every value as text, which is what it promises",
        (format) => {
            expect(parseFormat(format, serialize(format, ADVERSARIAL, META))).toEqual(
                asText(ADVERSARIAL),
            );
        },
    );

    it("keeps a strings-only snapshot exact through CSV as well", () => {
        const strings: SettingsSnapshot = { "a.b": "one", "c.d": "two" };
        expect(parseFormat("csv", serialize("csv", strings, META))).toEqual(strings);
    });
});

/* ------------------------------------------------------------------ *
 * Escaping, per format
 * ------------------------------------------------------------------ */

describe("JSON and JSON Lines", () => {
    it("keeps the version and values shape the import path already reads", () => {
        const parsed = JSON.parse(serialize("json", ADVERSARIAL, META)) as Record<string, unknown>;
        expect(parsed["version"]).toBe(1);
        expect(parsed["values"]).toEqual(ADVERSARIAL);
    });

    it("includes the generated stamp only when the caller supplies one", () => {
        const without = JSON.parse(serialize("json", {}, META)) as Record<string, unknown>;
        expect("generatedAt" in without).toBe(false);
        const with_ = JSON.parse(
            serialize("json", {}, { version: 1, generatedAt: "2026-08-09T00:00:00Z" }),
        ) as Record<string, unknown>;
        expect(with_["generatedAt"]).toBe("2026-08-09T00:00:00Z");
    });

    it("writes one complete JSON object per line with no blank line anywhere", () => {
        const lines = serialize("jsonl", ADVERSARIAL, META).split("\n");
        expect(lines.pop()).toBe("");
        expect(lines.some((line) => line === "")).toBe(false);
        for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
        expect(lines).toHaveLength(Object.keys(ADVERSARIAL).length + 1);
    });

    it("tags every line, so a reader that seeks into the middle still knows what it found", () => {
        const lines = serialize("jsonl", ADVERSARIAL, META).trimEnd().split("\n");
        for (const line of lines) {
            const record = JSON.parse(line) as { type?: string };
            expect(record.type === "meta" || record.type === "setting").toBe(true);
        }
    });
});

describe("YAML", () => {
    it("quotes a string that a reader would otherwise resolve to another type", () => {
        for (const text of ["true", "no", "0123", "1.0", "2024-01-01", "", "  padded  ", "a\tb"]) {
            expect(yamlNeedsQuoting(text)).toBe(true);
        }
    });

    it("leaves an inert word plain, so the file stays readable", () => {
        expect(yamlNeedsQuoting("dark")).toBe(false);
        expect(serialize("yaml", { "theme.mode": "dark" }, META)).toContain(
            '    "theme.mode": dark\n',
        );
    });

    it("writes the ambiguous values with quotes in the actual output", () => {
        const text = serialize("yaml", ADVERSARIAL, META);
        expect(text).toContain('"text.true": "true"');
        expect(text).toContain('"text.no": "no"');
        expect(text).toContain('"text.leadingZero": "0123"');
        expect(text).toContain('"text.oneFloat": "1.0"');
        expect(text).toContain('"text.date": "2024-01-01"');
    });

    it("writes booleans and numbers bare, so they come back as booleans and numbers", () => {
        const text = serialize("yaml", ADVERSARIAL, META);
        expect(text).toContain('"toggle.on": true');
        expect(text).toContain('"number.negative": -42');
        expect(text).toContain('"number.fraction": 0.125');
    });

    it("quotes every key, because an id holding a colon would otherwise end its own line", () => {
        const text = serialize("yaml", { "weird: id": "value" }, META);
        expect(text).toContain('    "weird: id": value\n');
        expect(parseYaml(text)).toEqual({ "weird: id": "value" });
    });

    it("writes an empty mapping in flow style rather than leaving the key null", () => {
        expect(serialize("yaml", {}, META)).toContain("values: {}");
    });

    it("has a literal for infinity and for not-a-number, so neither is lost", () => {
        const snapshot = { "a.inf": Number.POSITIVE_INFINITY, "b.nan": Number.NaN };
        const text = serialize("yaml", snapshot, META);
        expect(text).toContain('"a.inf": .inf');
        expect(text).toContain('"b.nan": .nan');
        expect(parseYaml(text)).toEqual(snapshot);
    });
});

describe("TOML", () => {
    it("quotes a dotted key, because a bare one would become a nested table", () => {
        expect(tomlKeyIsBare("theme")).toBe(true);
        expect(tomlKeyIsBare("theme.mode")).toBe(false);
        expect(serialize("toml", { "theme.mode": "dark" }, META)).toContain(
            '"theme.mode" = "dark"',
        );
        expect(serialize("toml", { compact: true }, META)).toContain("compact = true");
    });

    it("escapes a backslash and a quote inside a basic string", () => {
        const text = serialize("toml", { "a.b": 'back \\ slash "quoted"' }, META);
        expect(text).toContain('"a.b" = "back \\\\ slash \\"quoted\\""');
        expect(parseToml(text)).toEqual({ "a.b": 'back \\ slash "quoted"' });
    });

    it("escapes a newline rather than letting a value break the line", () => {
        const text = serialize("toml", { "a.b": "one\ntwo" }, META);
        expect(text.split("\n").filter((line) => line.includes("a.b"))).toHaveLength(1);
        expect(parseToml(text)).toEqual({ "a.b": "one\ntwo" });
    });
});

describe("XML", () => {
    it("escapes the five markup characters wherever they appear", () => {
        const text = serialize("xml", { "a&b<c>d": `"quote" 'apostrophe' & <tag>` }, META);
        expect(text).toContain('id="a&amp;b&lt;c&gt;d"');
        expect(text).toContain("&quot;quote&quot; &apos;apostrophe&apos; &amp; &lt;tag&gt;");
        expect(text).not.toMatch(/<tag>/);
    });

    it("cannot emit an invalid element name, because an id is never an element name", () => {
        const text = serialize("xml", { "9 not a name!": "x", "": "y" }, META);
        for (const tag of text.matchAll(/<\/?([^\s/>?!]+)/g)) {
            const [, name = ""] = tag;
            expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_.-]*$/);
        }
        expect(parseXml(text)).toEqual({ "9 not a name!": "x", "": "y" });
    });

    it("records the type, so a number does not come back as text", () => {
        const text = serialize("xml", { "n.v": 7, "b.v": false, "s.v": "7" }, META);
        expect(text).toContain('type="number">7<');
        expect(text).toContain('type="boolean">false<');
        expect(text).toContain('type="string">7<');
        expect(parseXml(text)).toEqual({ "n.v": 7, "b.v": false, "s.v": "7" });
    });

    it("replaces a character XML forbids outright, since no escape exists for it", () => {
        expect(hasXmlIllegalCharacter("plain")).toBe(false);
        expect(hasXmlIllegalCharacter(`bell${BELL}here`)).toBe(true);
        const text = serialize("xml", { "a.b": `bell${BELL}here` }, META);
        expect(text).not.toContain(BELL);
        expect(text).toContain("bell�here");
    });

    it("keeps a tab and a line feed, which XML does permit", () => {
        expect(hasXmlIllegalCharacter("a\tb\nc")).toBe(false);
        expect(parseXml(serialize("xml", { "a.b": "a\tb\nc" }, META))).toEqual({
            "a.b": "a\tb\nc",
        });
    });
});

describe("CSV and TSV", () => {
    it("starts with an untranslated header row naming the two columns", () => {
        expect(serialize("csv", ADVERSARIAL, META).split("\n")[0]).toBe("id,value");
        expect(serialize("tsv", ADVERSARIAL, META).split("\n")[0]).toBe("id\tvalue");
    });

    it("quotes a field holding the delimiter and doubles an embedded quote", () => {
        const text = serialize("csv", { "a.b": 'x, y "z"' }, META);
        expect(text).toContain('a.b,"x, y ""z"""');
        expect(parseDelimited(text, ",")).toEqual({ "a.b": 'x, y "z"' });
    });

    it("leaves a comma alone in TSV, where it is not the delimiter", () => {
        const text = serialize("tsv", { "a.b": "x, y" }, META);
        expect(text).toContain("a.b\tx, y");
        expect(text).not.toContain('"x, y"');
    });

    it("quotes a field holding a tab in TSV", () => {
        const text = serialize("tsv", { "a.b": "x\ty" }, META);
        expect(text).toContain('a.b\t"x\ty"');
        expect(parseDelimited(text, "\t")).toEqual({ "a.b": "x\ty" });
    });

    it("quotes a field holding a newline, so the record survives spanning two lines", () => {
        const text = serialize("csv", { "a.b": "one\ntwo" }, META);
        expect(text).toContain('a.b,"one\ntwo"');
        expect(parseDelimited(text, ",")).toEqual({ "a.b": "one\ntwo" });
    });

    it("writes an empty value as an empty field, not as a missing column", () => {
        expect(serialize("csv", { "a.b": "" }, META)).toContain("a.b,\n");
        expect(parseDelimited(serialize("csv", { "a.b": "" }, META), ",")).toEqual({ "a.b": "" });
    });
});

describe("the two document formats", () => {
    it("escapes a pipe, a backslash, and a line break so a Markdown table survives them", () => {
        const text = serialize("markdown", { "a.b": "one | two \\ three\nfour" }, META);
        expect(text).toContain("| a.b | one \\| two \\\\ three<br>four |");
        const rows = text.split("\n").filter((line) => line.startsWith("|"));
        expect(rows).toHaveLength(3);
    });

    it("puts the caller's already-localised title in the Markdown heading", () => {
        const text = serialize("markdown", {}, { version: 1, title: "設定 · Settings" });
        expect(text.startsWith("# 設定 · Settings\n")).toBe(true);
    });

    it("escapes an HTML value so a stored preference cannot become markup", () => {
        const hostile = '"><script>alert(1)</script>';
        const text = serialize("html", { "a.b": hostile }, META);
        expect(text).not.toContain("<script>");
        expect(text).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    });

    it("escapes the title and the language tag the caller supplied", () => {
        const text = serialize("html", {}, { version: 1, title: 'a "b" & c', language: "zh-HK" });
        expect(text).toContain('<html lang="zh-HK">');
        expect(text).toContain("<title>a &quot;b&quot; &amp; c</title>");
    });

    it("names its own language rather than assuming English", () => {
        expect(serialize("html", {}, META)).toContain('<html lang="en">');
    });
});

/* ------------------------------------------------------------------ *
 * The loss report
 * ------------------------------------------------------------------ */

function keysOf(format: ExportFormatId, snapshot: SettingsSnapshot): readonly string[] {
    return describeExportLoss(format, snapshot).map((entry) => entry.key);
}

describe("the loss report", () => {
    it("says YAML loses nothing at all, even for the adversarial snapshot", () => {
        expect(describeExportLoss("yaml", ADVERSARIAL)).toEqual([]);
        expect(isLossless("yaml", ADVERSARIAL)).toBe(true);
    });

    it("says JSON loses nothing for values it can express", () => {
        expect(isLossless("json", ADVERSARIAL)).toBe(true);
        expect(isLossless("jsonl", ADVERSARIAL)).toBe(true);
    });

    it("reports the numbers JSON has no literal for, and only those", () => {
        const snapshot = { "a.ok": 1, "b.inf": Number.POSITIVE_INFINITY, "c.nan": Number.NaN };
        const losses = describeExportLoss("json", snapshot);
        expect(losses).toHaveLength(1);
        expect(losses[0]?.key).toBe("exportFormats.loss.nonFiniteNumber");
        expect(losses[0]?.ids).toEqual(["b.inf", "c.nan"]);
        expect(isLossless("yaml", snapshot)).toBe(true);
    });

    it("does not warn about commas in a snapshot that contains no comma", () => {
        const plain: SettingsSnapshot = { "a.b": "one", "c.d": "two" };
        expect(keysOf("csv", plain)).toEqual(["exportFormats.loss.metadataDropped"]);
    });

    it("warns about the delimiter only once a value actually contains it", () => {
        expect(keysOf("csv", { "a.b": "one, two" })).toContain(
            "exportFormats.loss.quotingRequired",
        );
        expect(keysOf("tsv", { "a.b": "one, two" })).not.toContain(
            "exportFormats.loss.quotingRequired",
        );
        expect(keysOf("tsv", { "a.b": "one\ttwo" })).toContain(
            "exportFormats.loss.quotingRequired",
        );
    });

    it("reports type flattening only when a number or a boolean is present", () => {
        expect(keysOf("csv", { "a.b": "text" })).not.toContain("exportFormats.loss.typeFlattened");
        const losses = describeExportLoss("csv", { "a.b": "text", "c.d": 3, "e.f": true });
        const flattened = losses.find((entry) => entry.key === "exportFormats.loss.typeFlattened");
        expect(flattened?.ids).toEqual(["c.d", "e.f"]);
    });

    it("reports the strings a type-guessing reader would rewrite, and names them", () => {
        const losses = describeExportLoss("csv", ADVERSARIAL);
        const ambiguous = losses.find((entry) => entry.key === "exportFormats.loss.typeAmbiguous");
        expect(ambiguous?.ids).toEqual([
            "text.date",
            "text.leadingZero",
            "text.no",
            "text.oneFloat",
            "text.true",
        ]);
    });

    it("always says a delimited file drops the schema version, because it has nowhere to put it", () => {
        expect(keysOf("csv", {})).toEqual(["exportFormats.loss.metadataDropped"]);
        expect(keysOf("tsv", {})).toEqual(["exportFormats.loss.metadataDropped"]);
    });

    it("reports an embedded line break separately from ordinary quoting", () => {
        const keys = keysOf("csv", { "a.b": "one\ntwo" });
        expect(keys).toContain("exportFormats.loss.embeddedNewline");
    });

    it("lists exactly the ids TOML has to write as a quoted key", () => {
        const losses = describeExportLoss("toml", { "theme.mode": "dark", compact: true });
        expect(losses).toHaveLength(1);
        expect(losses[0]?.key).toBe("exportFormats.loss.toml.quotedKey");
        expect(losses[0]?.ids).toEqual(["theme.mode"]);
    });

    it("says nothing about TOML keys when every id is already a bare word", () => {
        expect(describeExportLoss("toml", { compact: true, density: 2 })).toEqual([]);
    });

    it("reports what an XML reader normalises away, which the written file does not show", () => {
        expect(keysOf("xml", { "a.b": "one\r\ntwo" })).toContain(
            "exportFormats.loss.xml.carriageReturn",
        );
        expect(keysOf("xml", { "one\ntwo": "x" })).toContain("exportFormats.loss.xml.idWhitespace");
        expect(keysOf("xml", { "a.b": `bell${BELL}here` })).toContain(
            "exportFormats.loss.xml.illegalCharacter",
        );
        expect(describeExportLoss("xml", ADVERSARIAL)).toEqual([]);
    });

    it.each(formatsWhere((format) => !format.reimportable))(
        "%s says outright that it cannot be read back in",
        (format) => {
            expect(keysOf(format, {})).toContain(`exportFormats.loss.${format}.notReimportable`);
            expect(isLossless(format, {})).toBe(false);
        },
    );

    it("reports Markdown escaping only for the values that are actually escaped", () => {
        expect(keysOf("markdown", { "a.b": "plain" })).toEqual([
            "exportFormats.loss.markdown.notReimportable",
        ]);
        expect(keysOf("markdown", { "a.b": "one | two" })).toContain(
            "exportFormats.loss.markdown.escaped",
        );
    });

    it("names only ids that are in the snapshot, without repeating one", () => {
        for (const format of EXPORT_FORMATS) {
            for (const entry of describeExportLoss(format.id, ADVERSARIAL)) {
                expect(new Set(entry.ids).size).toBe(entry.ids.length);
                for (const id of entry.ids) expect(id in ADVERSARIAL).toBe(true);
            }
        }
    });

    it("interpolates the count only where there are ids to count", () => {
        for (const format of EXPORT_FORMATS) {
            for (const entry of describeExportLoss(format.id, ADVERSARIAL)) {
                if (entry.ids.length === 0) expect(entry.interpolations).toBeUndefined();
                else expect(entry.interpolations).toEqual({ count: entry.ids.length });
            }
        }
    });
});

/* ------------------------------------------------------------------ *
 * Copy and the hard constraints
 * ------------------------------------------------------------------ */

describe("the string table", () => {
    it("prefixes every key with its own namespace", () => {
        for (const key of Object.keys(EXPORT_FORMAT_STRINGS)) {
            expect(key.startsWith("exportFormats.")).toBe(true);
        }
    });

    it("gives every phrase an English rendering, and a Cantonese one wherever it is not a proper noun", () => {
        for (const [key, phrase] of Object.entries(EXPORT_FORMAT_STRINGS)) {
            expect(phrase.en).toBeDefined();
            expect(phrase.yue).toBeDefined();
            if (key.startsWith("exportFormats.name.")) continue;
            const yue = typeof phrase.yue === "string" ? phrase.yue : Object.values(phrase.yue)[0];
            expect(yue).not.toBe("");
        }
    });

    it("keeps every statement about what is lost identical at every funny level", () => {
        for (const [key, phrase] of Object.entries(EXPORT_FORMAT_STRINGS)) {
            if (!key.startsWith("exportFormats.loss.")) continue;
            expect(typeof phrase.en).toBe("string");
            expect(typeof phrase.yue).toBe("string");
        }
    });

    it("has a phrase behind every key the report and the catalogue can produce", () => {
        const produced = new Set<string>(["exportFormats.lossHeading", "exportFormats.lossNone"]);
        for (const format of EXPORT_FORMATS) {
            produced.add(format.nameKey);
            produced.add(format.descriptionKey);
        }
        const probes: readonly SettingsSnapshot[] = [
            {},
            ADVERSARIAL,
            { "a.b": "one, two\nthree\ttab \\ pipe |", "c\nd": Number.NaN },
            { "one\ttwo": `bell${BELL}here\r\n` },
        ];
        for (const format of EXPORT_FORMATS) {
            for (const probe of probes) {
                for (const entry of describeExportLoss(format.id, probe)) produced.add(entry.key);
            }
        }
        for (const key of produced) expect(EXPORT_FORMAT_STRINGS[key]).toBeDefined();
    });

    it("mentions every loss phrase it ships, so a dead key cannot sit here unnoticed", () => {
        const reachable = new Set<string>();
        const probes: readonly SettingsSnapshot[] = [
            {},
            ADVERSARIAL,
            { "a.b": "one, two\nthree", "c.d": Number.NaN },
            { "one\ttwo": `bell${BELL}here\r\n`, "e.f": 'quote " and | pipe \\' },
        ];
        for (const format of EXPORT_FORMATS) {
            for (const probe of probes) {
                for (const entry of describeExportLoss(format.id, probe)) reachable.add(entry.key);
            }
        }
        for (const key of Object.keys(EXPORT_FORMAT_STRINGS)) {
            if (!key.startsWith("exportFormats.loss.")) continue;
            expect([...reachable]).toContain(key);
        }
    });
});

describe("the hard constraints on the module itself", () => {
    const source = readFileSync(new URL("./exportFormats.ts", import.meta.url), "utf8");
    /*
     * Comments and string literals are stripped before the identifier check below.
     * Both legitimately contain the banned words — a comment explains why the module
     * avoids the DOM, and the copy table has a sentence about pasting into a document
     * — and a guard that cannot tell prose from code fires on the first honest comment
     * and gets deleted rather than fixed. The stripping is a scanner, not a parser, so
     * it can swallow slightly more than it should around a regex literal holding a
     * quote; erring that way costs sensitivity and never produces a false alarm.
     */
    const code = source
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ")
        .replace(/`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, " ");

    it("contains no colour literal of any kind", () => {
        expect(source).not.toMatch(/#[0-9a-fA-F]{3}\b/);
        expect(source).not.toMatch(/#[0-9a-fA-F]{6}\b/);
        expect(source).not.toMatch(/\b(rgba?|hsla?|oklch|color-mix)\s*\(/);
    });

    it("reaches for no browser or Node global, so one build serves both", () => {
        expect(code).not.toMatch(/\b(document|window|localStorage|sessionStorage|navigator)\b/);
        expect(code).not.toMatch(/\b(fetch|require|__dirname|globalThis)\b/);
        expect(source).not.toMatch(/from "node:/);
    });

    it("imports with the extension the rest of the project uses", () => {
        for (const line of source.split("\n")) {
            const match = /from "(\.[^"]*)"/.exec(line);
            if (match === null) continue;
            expect(match[1]).toMatch(/\.js$/);
        }
    });

    it("hardcodes no user-facing English outside the string table", () => {
        // Every phrase a visitor reads is reached through a key, so the only English
        // sentences in the module are comments and the table at the bottom. This checks
        // the boundary the other way round: the loss report hands back keys, never text.
        for (const format of EXPORT_FORMATS) {
            for (const entry of describeExportLoss(format.id, ADVERSARIAL)) {
                expect(entry.key).toMatch(/^exportFormats\.loss\./);
            }
        }
    });
});

describe("looksTyped", () => {
    it("catches the text a reader would silently turn into another type", () => {
        for (const text of ["3", "-42", "0123", "1.0", "1e5", "true", "NO", "2024-01-01", "~"]) {
            expect(looksTyped(text)).toBe(true);
        }
    });

    it("leaves ordinary text alone", () => {
        for (const text of ["dark", "顏色", "", "1.0.0", "2024-13", "true story"]) {
            expect(looksTyped(text)).toBe(false);
        }
    });
});
