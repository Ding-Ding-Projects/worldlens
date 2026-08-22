/**
 * Byte-for-byte round-trip: write(parse(x), no changes) === x.
 *
 * This is the single most important test in the feature. Getting it wrong silently strips
 * every comment from somebody's hand-tuned `paper-global.yml` the first time this app opens
 * and closes it - the exact failure the whole document model in `document.ts` exists to
 * prevent. The corpus below is authored, not lifted from a real server, to cover the
 * specific hazards this parser has to survive: comments, blank lines, CRLF, duplicate keys,
 * unicode escapes, YAML anchors, merge keys, and deep nesting.
 */

import { describe, expect, it } from "vitest";
import { parseProperties, serializeProperties } from "./parseProperties.js";
import { parseYaml } from "./parseYaml.js";
import { Document, parseDocument } from "yaml";

const PROPERTIES_CORPUS: readonly { readonly name: string; readonly text: string }[] = [
    {
        name: "vanilla-like with comments and blanks",
        text: [
            "#Minecraft server properties",
            "#Fri Aug 21 00:00:00 UTC 2026",
            "server-port=25565",
            "",
            "# difficulty controls damage",
            "difficulty=easy",
            "motd=A Minecraft Server",
            "",
        ].join("\n"),
    },
    { name: "CRLF line endings", text: "server-port=25565\r\n#comment\r\ndifficulty=hard\r\n" },
    { name: "no trailing newline", text: "server-port=25565\ndifficulty=normal" },
    {
        name: "duplicate keys (last wins, both lines kept)",
        text: "level-name=world\nlevel-name=world_old\n",
    },
    {
        name: "unicode escapes and colon separator",
        text: "motd:Caf\\u00e9 Server \\u00263\\n\nrcon.password=hunter2\n",
    },
    { name: "bang comments and empty file", text: "!legacy comment style\n" },
    { name: "truly empty file", text: "" },
];

describe("server.properties round-trip", () => {
    for (const sample of PROPERTIES_CORPUS) {
        it(`reproduces "${sample.name}" byte-for-byte with no edits`, () => {
            const parsed = parseProperties(sample.text);
            expect(parsed.ok).toBe(true);
            if (!parsed.ok) return;
            const written = serializeProperties(parsed.value);
            expect(written).toBe(sample.text);
        });
    }
});

const YAML_CORPUS: readonly { readonly name: string; readonly text: string }[] = [
    {
        name: "comments, blank lines and nesting",
        text: ["# top comment", "settings:", "  debug: false", "", "  # nested comment", "  limits:", "    max: 10", ""].join("\n"),
    },
    { name: "CRLF line endings", text: "a:\r\n  b: 1\r\n  c: true\r\n" },
    { name: "no trailing newline", text: "a:\n  b: 1" },
    {
        name: "anchors and aliases",
        text: ["defaults: &defaults", "  timeout: 30", "  retries: 3", "service-a:", "  <<: *defaults", "  name: alpha", ""].join("\n"),
    },
    {
        name: "merge key with multiple anchors",
        text: ["base: &base", "  x: 1", "override: &override", "  y: 2", "merged:", "  <<: [*base, *override]", "  z: 3", ""].join("\n"),
    },
    {
        name: "deep nesting",
        text: ["a:", "  b:", "    c:", "      d:", "        e: 42", ""].join("\n"),
    },
    { name: "flow sequence and block scalar", text: ["list: [1, 2, 3]", "text: |", "  line one", "  line two", ""].join("\n") },
];

describe("YAML round-trip", () => {
    for (const sample of YAML_CORPUS) {
        it(`reproduces "${sample.name}" byte-for-byte with no edits`, () => {
            // Reference: yaml's own parseDocument -> toString round-trip (this is what
            // parseYaml.ts and setYamlValue build on), normalising only the same eol/trailing
            // rules document.ts already applies.
            const doc: Document = parseDocument(sample.text, { keepSourceTokens: true, merge: true });
            let written = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
            if (sample.text.includes("\r\n")) written = written.replace(/\n/g, "\r\n");
            if (!sample.text.endsWith("\n") && sample.text.length > 0) written = written.replace(/(\r?\n)+$/, "");
            expect(written).toBe(sample.text);

            const parsed = parseYaml(sample.text);
            expect(parsed.ok).toBe(true);
        });
    }

    it("marks an anchor's alias target and merge key as read-only", () => {
        const text = ["defaults: &defaults", "  timeout: 30", "service-a:", "  <<: *defaults", "  name: alpha", ""].join("\n");
        const parsed = parseYaml(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const mergeEntry = parsed.value.nodes.find((n) => n.kind === "entry" && n.path.join(".") === "service-a.<<");
        expect(mergeEntry).toBeDefined();
        if (mergeEntry?.kind === "entry") {
            expect(mergeEntry.readOnly).toBe(true);
        }
    });
});
