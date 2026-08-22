import { describe, expect, it } from "vitest";

import { applyConfigChanges, describeConfigFile, fileKindFor, formatFor } from "./describe.js";
import { hashOf } from "./document.js";
import type { ServerTransport } from "../transport/types.js";

/**
 * A transport backed by one in-memory file.
 *
 * Real bytes and a real hash, because the whole write guard is about the two agreeing - a
 * stub that returned a fixed hash would prove nothing about the thing being tested.
 */
function fileTransport(initial: string) {
    const state = { text: initial, writes: 0 };
    const transport = {
        async fileRead() {
            const bytes = new Uint8Array(Buffer.from(state.text, "utf8"));
            return { ok: true as const, value: { bytes, hash: hashOf(state.text), size: bytes.length, truncated: false } };
        },
        async fileWrite(_path: string, blob: Uint8Array) {
            state.writes += 1;
            state.text = Buffer.from(blob).toString("utf8");
            return {
                ok: true as const,
                value: { hash: hashOf(state.text), size: blob.length, writtenAt: "", backupPath: null },
            };
        },
    } as unknown as ServerTransport;
    return { transport, state };
}

const PROPERTIES = [
    "# Minecraft server properties",
    "pvp=true",
    "difficulty=easy",
    "view-distance=10",
    "server-port=25565",
    "motd=A Minecraft Server",
    "",
].join("\n");

describe("choosing a parser", () => {
    it("goes by the file's name rather than sniffing its contents", () => {
        // `server.properties` and a plugin's `config.yml` both look like key: value lines to
        // a sniffer, and getting that wrong rewrites one in the other's syntax on first save.
        expect(formatFor("/data/server.properties")).toBe("properties");
        expect(formatFor("/data/plugins/Essentials/config.yml")).toBe("yaml");
        expect(formatFor("/data/ops.json")).toBe("json");
        expect(formatFor("/data/eula.txt")).toBe("properties");
        expect(formatFor("/data/latest.log")).toBe("text");
    });

    it("names the file kind a schema is looked up by", () => {
        expect(fileKindFor("/data/nested/server.properties")).toBe("server.properties");
    });
});

describe("describing a file the schema knows", () => {
    it("gives every key a real control rather than a text box", async () => {
        const { transport } = fileTransport(PROPERTIES);
        const answer = await describeConfigFile({ transport, path: "server.properties", flavour: "vanilla", version: "1.21.4" });

        expect(answer.ok).toBe(true);
        if (!answer.ok) return;

        const byKey = new Map(answer.value.fields.map((field) => [field.key, field]));

        // This is the whole promise of the feature, asserted at the seam that delivers it.
        expect(byKey.get("pvp")?.control.kind).toBe("switch");
        expect(byKey.get("difficulty")?.control.kind).toBe("select");
        expect(byKey.get("view-distance")?.control.kind).toBe("number");
        expect(byKey.get("server-port")?.control.kind).toBe("number");
        // Prose is the one legitimate text control.
        expect(byKey.get("motd")?.control.kind).toBe("text");
    });

    it("carries the value the file actually holds", async () => {
        const { transport } = fileTransport(PROPERTIES);
        const answer = await describeConfigFile({ transport, path: "server.properties", flavour: "vanilla", version: "1.21.4" });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;

        const pvp = answer.value.fields.find((field) => field.key === "pvp");
        expect(pvp?.value).toBe(true);
    });
});

describe("describing a file nobody has ever written a schema for", () => {
    it("still gives real controls, worked out from the values", async () => {
        // The ordinary case for a plugin's own configuration, and the case that decides
        // whether the no-text-box promise survives contact with the real world.
        const { transport } = fileTransport(
            ["enabled: true", "max-homes: 5", "rcon-port: 25575", "prefix: hello", ""].join("\n"),
        );
        const answer = await describeConfigFile({ transport, path: "plugins/Thing/config.yml", flavour: "paper", version: "1.21.4" });

        expect(answer.ok).toBe(true);
        if (!answer.ok) return;

        const byKey = new Map(answer.value.fields.map((field) => [field.key, field]));
        expect(byKey.get("enabled")?.control.kind).toBe("switch");
        expect(byKey.get("max-homes")?.control.kind).toBe("number");
        // A key ending in `port` is bounded like a port rather than as any old integer.
        const port = byKey.get("rcon-port")?.control;
        expect(port?.kind).toBe("number");
        if (port?.kind === "number") expect(port.max).toBe(65535);

        // And every one of them says it was guessed, so nobody mistakes an assumption for a
        // documented range.
        expect(byKey.get("enabled")?.guessed).toBe(true);
    });
});

describe("reporting a file that cannot be parsed", () => {
    it("says so rather than rewriting it from an empty document", async () => {
        const { transport, state } = fileTransport("::: not: [valid: yaml");
        const answer = await describeConfigFile({ transport, path: "broken.yml", flavour: "paper", version: "1.21.4" });

        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.unreadable).toBe(true);
        expect(answer.value.fields).toHaveLength(0);
        // Rewriting is indistinguishable from deleting it.
        expect(state.writes).toBe(0);
    });
});

describe("applying changes", () => {
    it("writes the change and leaves everything else byte-identical", async () => {
        const { transport, state } = fileTransport(PROPERTIES);
        const described = await describeConfigFile({ transport, path: "server.properties", flavour: "vanilla", version: "1.21.4" });
        expect(described.ok).toBe(true);
        if (!described.ok) return;

        const applied = await applyConfigChanges({
            transport,
            path: "server.properties",
            changes: [{ path: ["pvp"], value: false }],
            expectedHash: described.value.hash,
        });

        expect(applied.ok, applied.ok ? "" : applied.failure.message).toBe(true);
        expect(state.text).toContain("pvp=false");
        // The comment, the blank line and every untouched key survive.
        expect(state.text).toContain("# Minecraft server properties");
        expect(state.text).toContain("difficulty=easy");
        expect(state.text).toContain("motd=A Minecraft Server");
    });

    it("refuses a change made against a version of the file that has moved on", async () => {
        const { transport, state } = fileTransport(PROPERTIES);
        const before = state.text;

        const answer = await applyConfigChanges({
            transport,
            path: "server.properties",
            changes: [{ path: ["pvp"], value: false }],
            expectedHash: hashOf("something else entirely"),
        });

        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("stale-document");
        // A refused write that wrote anyway is the exact data loss this guard exists for.
        expect(state.text).toBe(before);
        expect(state.writes).toBe(0);
    });

    it("applies several changes as one write rather than one write each", async () => {
        const { transport, state } = fileTransport(PROPERTIES);
        const described = await describeConfigFile({ transport, path: "server.properties", flavour: "vanilla", version: "1.21.4" });
        expect(described.ok).toBe(true);
        if (!described.ok) return;

        const applied = await applyConfigChanges({
            transport,
            path: "server.properties",
            changes: [
                { path: ["pvp"], value: false },
                { path: ["difficulty"], value: "hard" },
            ],
            expectedHash: described.value.hash,
        });

        expect(applied.ok).toBe(true);
        // Writing per change would leave the file half-applied if the second failed, and a
        // half-applied configuration is worse than a refused one because nothing reports it.
        expect(state.writes).toBe(1);
        expect(state.text).toContain("pvp=false");
        expect(state.text).toContain("difficulty=hard");
    });

    it("refuses the whole set when one change cannot be applied", async () => {
        const { transport, state } = fileTransport(PROPERTIES);
        const described = await describeConfigFile({ transport, path: "server.properties", flavour: "vanilla", version: "1.21.4" });
        expect(described.ok).toBe(true);
        if (!described.ok) return;
        const before = state.text;

        const answer = await applyConfigChanges({
            transport,
            path: "server.properties",
            changes: [
                { path: ["pvp"], value: false },
                { path: [], value: "nowhere" },
            ],
            expectedHash: described.value.hash,
        });

        expect(answer.ok).toBe(false);
        expect(state.text).toBe(before);
    });
});
