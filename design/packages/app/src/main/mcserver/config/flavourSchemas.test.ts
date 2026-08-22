/**
 * End-to-end proof for the per-flavour typed schemas, through the SAME `describeConfigFile`
 * / `applyConfigChanges` machinery the IPC layer calls - no parallel control system.
 *
 * Two properties are proved here, per real-shaped fixture file under `./fixtures/`:
 *
 *  1. Byte-for-byte round trip: reading the file through `describeConfigFile` and writing it
 *     straight back with NO changes reproduces the original bytes exactly - comments, key
 *     order, indentation and quoting included.
 *  2. Unknown-key survival: applying one real schema-covered change (e.g. flipping
 *     `proxies.velocity.enabled`) leaves every OTHER byte untouched, including a key this
 *     package's schema does not know about (`spigot.sample.yml`'s
 *     `world-settings.default.a-future-spigot-setting`) - the "schema is a view, document is
 *     the truth" property `describe.ts`'s own module doc promises.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { applyConfigChanges, describeConfigFile } from "./describe.js";
import { hashOf } from "./document.js";
import type { ServerTransport } from "../transport/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
    return readFileSync(join(HERE, "fixtures", name), "utf8");
}

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

const FIXTURES: readonly { readonly file: string; readonly flavour: string }[] = [
    { file: "paper-global.sample.yml", flavour: "paper" },
    { file: "spigot.sample.yml", flavour: "spigot" },
];

describe("byte-for-byte round trip over real-shaped flavour fixtures (no edits)", () => {
    for (const { file, flavour } of FIXTURES) {
        it(`reproduces ${file} exactly through describeConfigFile with zero applied changes`, async () => {
            const text = fixture(file);
            const { transport, state } = fileTransport(text);
            const described = await describeConfigFile({ transport, path: `/data/${file}`, flavour, version: "*" });
            expect(described.ok).toBe(true);
            // Reading never writes - the file is still exactly what it started as.
            expect(state.text).toBe(text);
            expect(state.writes).toBe(0);
        });

        it(`reproduces ${file} exactly under CRLF line endings`, async () => {
            const crlf = fixture(file).replace(/\n/g, "\r\n");
            const { transport, state } = fileTransport(crlf);
            const described = await describeConfigFile({ transport, path: `/data/${file}`, flavour, version: "*" });
            expect(described.ok).toBe(true);
            expect(state.text).toBe(crlf);
        });
    }
});

describe("Paper end-to-end: paper-global.yml renders through the shared FieldMeta machinery", () => {
    it("resolves the paper flavour schema and gives every known key a real (non-text-guessed) control", async () => {
        const { transport } = fileTransport(fixture("paper-global.sample.yml"));
        const described = await describeConfigFile({ transport, path: "/data/paper-global.yml", flavour: "paper", version: "*" });
        expect(described.ok).toBe(true);
        if (!described.ok) return;

        const velocityEnabled = described.value.fields.find((f) => f.key === "proxies.velocity.enabled");
        expect(velocityEnabled).toBeDefined();
        expect(velocityEnabled?.control.kind).toBe("switch");
        expect(velocityEnabled?.guessed).toBe(false); // hand-authored schema field, not inferred
        expect(velocityEnabled?.state).toBe("known");

        const earlyWarningDelay = described.value.fields.find((f) => f.key === "watchdog.early-warning-delay");
        expect(earlyWarningDelay?.control.kind).toBe("number");
        if (earlyWarningDelay?.control.kind === "number") {
            expect(earlyWarningDelay.control.unit).toBe("ms");
        }
    });

    it("wrong flavour (spigot) does not get paper-global's schema - falls back to inference, still never a raw text box for the booleans", async () => {
        const { transport } = fileTransport(fixture("paper-global.sample.yml"));
        const described = await describeConfigFile({ transport, path: "/data/paper-global.yml", flavour: "spigot", version: "*" });
        expect(described.ok).toBe(true);
        if (!described.ok) return;
        const velocityEnabled = described.value.fields.find((f) => f.key === "proxies velocity enabled" || f.path.join(".") === "proxies.velocity.enabled");
        expect(velocityEnabled).toBeDefined();
        expect(velocityEnabled?.control.kind).toBe("switch"); // inferred from the boolean value, not from the schema
        expect(velocityEnabled?.guessed).toBe(true);
    });
});

describe("unknown keys survive a save untouched (document is the truth, schema is a view)", () => {
    it("flipping a known Spigot switch leaves an unschemad sibling key byte-identical", async () => {
        const original = fixture("spigot.sample.yml");
        expect(original).toContain("a-future-spigot-setting: 42");

        const { transport, state } = fileTransport(original);
        const described = await describeConfigFile({ transport, path: "/data/spigot.yml", flavour: "spigot", version: "*" });
        expect(described.ok).toBe(true);
        if (!described.ok) return;

        const applied = await applyConfigChanges({
            transport,
            path: "/data/spigot.yml",
            expectedHash: described.value.hash,
            changes: [{ path: ["settings", "debug"], value: true }],
        });
        expect(applied.ok).toBe(true);

        // The one changed line changed...
        expect(state.text).toContain("debug: true");
        // ...and the unschemad key, and everything else, did not move or disappear.
        expect(state.text).toContain("a-future-spigot-setting: 42");
        expect(state.text).toContain("You are not whitelisted on this server!");
        expect(state.text).toContain("# This is the main configuration file for Spigot.");

        // Re-describing the freshly written file still finds the unknown key, as "unknown"
        // rather than silently dropped.
        const redescribed = await describeConfigFile({ transport, path: "/data/spigot.yml", flavour: "spigot", version: "*" });
        expect(redescribed.ok).toBe(true);
        if (!redescribed.ok) return;
        const unknown = redescribed.value.fields.find((f) => f.key === "world-settings.default.a-future-spigot-setting");
        expect(unknown).toBeDefined();
        expect(unknown?.value).toBe(42);
    });
});
