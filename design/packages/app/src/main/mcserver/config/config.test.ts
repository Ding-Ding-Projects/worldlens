import { describe, expect, it } from "vitest";
import { parseProperties, setPropertiesValue } from "./parseProperties.js";
import { parseYaml, setYamlValue } from "./parseYaml.js";
import { reconcile } from "./reconcile.js";
import { inferField } from "./inferSchema.js";
import { serverPropertiesFields } from "./schemas/serverProperties.js";
import { resolveSchema } from "./schemas/index.js";
import { hashOf } from "./document.js";

describe("parseProperties + setPropertiesValue", () => {
    it("edits exactly one line's value span, leaving comments and siblings untouched", () => {
        const text = "#comment\nserver-port=25565\n# difficulty\ndifficulty=easy\nmotd=Hi\n";
        const parsed = parseProperties(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;

        const edited = setPropertiesValue(parsed.value, "difficulty", "hard", parsed.value.hash);
        expect(edited.ok).toBe(true);
        if (!edited.ok) return;

        expect(edited.value.sourceText).toBe("#comment\nserver-port=25565\n# difficulty\ndifficulty=hard\nmotd=Hi\n");
    });

    it("refuses a stale-hash write and writes nothing", () => {
        const text = "server-port=25565\n";
        const parsed = parseProperties(text);
        if (!parsed.ok) throw new Error("parse failed");
        const result = setPropertiesValue(parsed.value, "server-port", 25566, "not-the-real-hash");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("stale-document");
    });

    it("reports not-found for a key the file does not have", () => {
        const parsed = parseProperties("server-port=25565\n");
        if (!parsed.ok) throw new Error("parse failed");
        const result = setPropertiesValue(parsed.value, "does-not-exist", 1, parsed.value.hash);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("not-found");
    });

    it("refuses an object value with invalid-value", () => {
        const parsed = parseProperties("server-port=25565\n");
        if (!parsed.ok) throw new Error("parse failed");
        const result = setPropertiesValue(parsed.value, "server-port", { nope: true }, parsed.value.hash);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("invalid-value");
    });
});

describe("parseYaml + setYamlValue", () => {
    it("edits one scalar leaf, preserving comments elsewhere", () => {
        const text = ["# top", "settings:", "  debug: false", "  # nested", "  limit: 10", ""].join("\n");
        const parsed = parseYaml(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;

        const edited = setYamlValue(parsed.value, ["settings", "debug"], true, parsed.value.hash);
        expect(edited.ok).toBe(true);
        if (!edited.ok) return;
        expect(edited.value.sourceText).toContain("# top");
        expect(edited.value.sourceText).toContain("# nested");
        expect(edited.value.sourceText).toMatch(/debug: true/);
    });

    it("refuses to write through a read-only alias target", () => {
        const text = ["defaults: &defaults", "  timeout: 30", "service-a:", "  <<: *defaults", "  name: alpha", ""].join("\n");
        const parsed = parseYaml(text);
        if (!parsed.ok) throw new Error("parse failed");
        const result = setYamlValue(parsed.value, ["service-a", "<<"], "nope", parsed.value.hash);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("read-only");
    });

    it("refuses a stale-hash write", () => {
        const parsed = parseYaml("a:\n  b: 1\n");
        if (!parsed.ok) throw new Error("parse failed");
        const result = setYamlValue(parsed.value, ["a", "b"], 2, "stale");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("stale-document");
    });

    it("hashOf is deterministic and changes when the text changes", () => {
        expect(hashOf("a")).toBe(hashOf("a"));
        expect(hashOf("a")).not.toBe(hashOf("b"));
    });
});

describe("reconcile", () => {
    it("marks a schema field missing from the document as missing", () => {
        const parsed = parseProperties("server-port=25565\n");
        if (!parsed.ok) throw new Error("parse failed");
        const fields = reconcile(parsed.value, serverPropertiesFields);
        const motd = fields.find((f) => f.path.join(".") === "motd");
        expect(motd?.state).toBe("missing");
    });

    it("marks a present, well-typed schema field known", () => {
        const parsed = parseProperties("difficulty=easy\n");
        if (!parsed.ok) throw new Error("parse failed");
        const fields = reconcile(parsed.value, serverPropertiesFields);
        const difficulty = fields.find((f) => f.path.join(".") === "difficulty");
        expect(difficulty?.state).toBe("known");
    });

    it("never drops an unknown key: it appears reconciled with an inferred control", () => {
        const parsed = parseProperties("server-port=25565\nsome-plugin-key=true\n");
        if (!parsed.ok) throw new Error("parse failed");
        const fields = reconcile(parsed.value, serverPropertiesFields);
        const unknown = fields.find((f) => f.path.join(".") === "some-plugin-key");
        expect(unknown?.state).toBe("unknown");
        expect(unknown?.inferred?.control.kind).toBe("switch");
    });

    it("resolveSchema finds the vanilla schema for server.properties on any flavour", () => {
        expect(resolveSchema("server.properties", "paper", "1.21")).toBe(serverPropertiesFields);
        expect(resolveSchema("nonexistent-file", "paper", "1.21")).toBeUndefined();
    });
});

describe("inferSchema", () => {
    it("infers switch for booleans", () => {
        expect(inferField("some-flag", true).control.kind).toBe("switch");
    });

    it("infers a bounded number for a port-shaped key", () => {
        const inferred = inferField("query-port", 25565);
        expect(inferred.control.kind).toBe("number");
        if (inferred.control.kind === "number") {
            expect(inferred.control.min).toBe(1);
            expect(inferred.control.max).toBe(65535);
        }
    });

    it("infers color for a hex string", () => {
        expect(inferField("accent", "#ff00aa").control.kind).toBe("color");
    });

    it("infers list for an array of scalars", () => {
        expect(inferField("worlds", ["a", "b"]).control.kind).toBe("list");
    });

    it("falls back to free text only when nothing else fits, and is badged guessed", () => {
        const inferred = inferField("description", "just some prose");
        expect(inferred.control.kind).toBe("text");
        expect(inferred.guessed).toBe(true);
    });
});
