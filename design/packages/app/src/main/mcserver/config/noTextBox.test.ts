/**
 * THE no-text-box guard.
 *
 * Enumerates every shipped `FieldMeta` across the ENTIRE schema registry (every flavour's
 * config file that has one - `server.properties`, `bukkit.yml`, `spigot.yml`,
 * `paper-global.yml`, `paper-world-defaults.yml`, `purpur.yml`) and fails when a field
 * whose own `default` value shows it is boolean/numeric/list/record-shaped, or whose key
 * plainly names a port, resolves to a bare `text` control. This is the one test in the
 * feature that proves the point of the whole exercise: a config GUI generated from these
 * schemas should never degrade a `difficulty` select or a `max-players` bound into a box
 * someone can type garbage into - in ANY flavour's file, not just server.properties.
 *
 * This check is deliberately generic (driven by `field.default`'s own JS shape rather than
 * a hand-maintained per-schema regex list) so a newly registered schema is covered for free
 * instead of silently escaping the guard the way an allowlist would.
 */

import { describe, expect, it } from "vitest";
import type { FieldMeta } from "@worldlens/config";
import { REGISTRY, serverPropertiesFields } from "./schemas/index.js";

const PORT_LIKE = /(?:^|[.-])port$/i;

function shapeOffense(field: FieldMeta): string | null {
    if (field.control.kind !== "text") return null;
    const value = field.default;
    if (typeof value === "boolean") return "boolean default resolved to a text control (want switch)";
    if (typeof value === "number") return "numeric default resolved to a text control (want number/slider)";
    if (Array.isArray(value)) return "array default resolved to a text control (want list)";
    if (value !== null && typeof value === "object") return "object default resolved to a text control (want key-value)";
    if (PORT_LIKE.test(field.key)) return "port-shaped key resolved to a text control (want a 1..65535 number)";
    return null;
}

describe("no-text-box guard (whole registry)", () => {
    it("never resolves a boolean/numeric/list/record/port-shaped field to a bare text control, in any registered flavour schema", () => {
        const offenders: string[] = [];
        for (const entry of REGISTRY) {
            for (const field of entry.fields) {
                const offense = shapeOffense(field);
                if (offense !== null) offenders.push(`${entry.fileKind} [${entry.flavour}] :: ${field.path} - ${offense}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("every port-shaped key in every schema is a bounded 1..65535 number control", () => {
        const offenders: string[] = [];
        for (const entry of REGISTRY) {
            for (const field of entry.fields) {
                if (!PORT_LIKE.test(field.key)) continue;
                const ok = field.control.kind === "number" && field.control.integer && field.control.min === 1 && field.control.max === 65535;
                if (!ok) offenders.push(`${entry.fileKind} [${entry.flavour}] :: ${field.path}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("every registered schema has at least one field, and every field has a non-empty label and doc", () => {
        for (const entry of REGISTRY) {
            expect(entry.fields.length, `${entry.fileKind} [${entry.flavour}] has no fields`).toBeGreaterThan(0);
            for (const field of entry.fields) {
                expect(field.label.trim(), `${entry.fileKind} :: ${field.path} has an empty label`).not.toBe("");
                expect(field.doc.trim(), `${entry.fileKind} :: ${field.path} has an empty doc`).not.toBe("");
            }
        }
    });

    // Deliberately mistyped-key regression: proves the guard actually goes red. Kept as a
    // literal in-test fixture (not a mutation of the real schema) so this test never needs
    // the real schema to be broken to prove the generic guard works.
    it("(self-test) the generic guard rejects a boolean field wearing a text control", () => {
        const broken: readonly FieldMeta[] = [
            { ...serverPropertiesFields[0]!, key: "broken-boolean", path: "broken-boolean", control: { kind: "text" }, default: false },
        ];
        const offenders = broken.map((field) => ({ field, offense: shapeOffense(field) })).filter((entry) => entry.offense !== null);
        expect(offenders).toHaveLength(1);
        expect(offenders[0]!.offense).toMatch(/boolean default/);
    });
});

describe("no-text-box guard (server.properties specifics, kept from the original narrower check)", () => {
    const BOOLEAN_LIKE = /^(?:accept-transfers|allow-|broadcast-|enable-|enforce-|force-gamemode|generate-structures|hardcore|hide-online-players|log-ips|online-mode|prevent-proxy-connections|pvp|require-resource-pack|spawn-monsters|sync-chunk-writes|use-native-transport|white-list)/;
    const ENUM_LIKE = new Set(["difficulty", "gamemode", "level-type", "region-file-compression"]);
    const LEGITIMATE_TEXT = new Set([
        "motd",
        "level-seed",
        "level-name",
        "server-ip",
        "resource-pack",
        "resource-pack-id",
        "resource-pack-prompt",
        "resource-pack-sha1",
        "rcon.password",
        "generator-settings",
        "initial-disabled-packs",
        "initial-enabled-packs",
        "text-filtering-config",
    ]);

    it("never resolves a typed field to a bare text control", () => {
        const offenders: string[] = [];
        for (const field of serverPropertiesFields) {
            const kind = field.control.kind;
            if (kind !== "text") continue;
            if (LEGITIMATE_TEXT.has(field.key)) continue;
            offenders.push(`${field.key} (control: ${kind})`);
        }
        expect(offenders).toEqual([]);
    });

    it("every boolean-shaped key is a switch control", () => {
        const offenders = serverPropertiesFields.filter((f) => BOOLEAN_LIKE.test(f.key) && f.control.kind !== "switch").map((f) => f.key);
        expect(offenders).toEqual([]);
    });

    it("every closed-set key is a select control", () => {
        const offenders = serverPropertiesFields.filter((f) => ENUM_LIKE.has(f.key) && f.control.kind !== "select").map((f) => f.key);
        expect(offenders).toEqual([]);
    });

    it("view-distance, simulation-distance, max-players and spawn-protection carry real bounds", () => {
        const bounded = ["view-distance", "simulation-distance", "max-players", "spawn-protection"];
        for (const key of bounded) {
            const field = serverPropertiesFields.find((f) => f.key === key);
            expect(field, `missing field ${key}`).toBeDefined();
            expect(field?.control.kind).toBe("number");
            if (field?.control.kind === "number") {
                expect(field.control.min).toBeTypeOf("number");
                expect(field.control.max).toBeTypeOf("number");
            }
        }
    });

    // Original self-test, kept: proves the narrower boolean-key guard also goes red.
    it("(self-test) the guard rejects a text control masquerading as a switch", () => {
        const broken: readonly { readonly key: string; readonly control: { readonly kind: string } }[] = [{ key: "pvp", control: { kind: "text" } }];
        const offenders = broken.filter((f) => BOOLEAN_LIKE.test(f.key) && f.control.kind !== "switch").map((f) => f.key);
        expect(offenders).toEqual(["pvp"]);
    });
});
