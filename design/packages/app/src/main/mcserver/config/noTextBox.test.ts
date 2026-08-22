/**
 * THE no-text-box guard.
 *
 * Enumerates every shipped `FieldMeta` and fails when a field whose declared *shape*
 * demands a real control - boolean, enum, numeric, port, colour, path, list, record -
 * resolves to a bare `text` control. This is the one test in the feature that proves the
 * point of the whole exercise: a config GUI generated from these schemas should never
 * degrade a `difficulty` select or a `max-players` bound into a box someone can type
 * garbage into.
 */

import { describe, expect, it } from "vitest";
import { serverPropertiesFields } from "./schemas/serverProperties.js";

const BOOLEAN_LIKE = /^(?:accept-transfers|allow-|broadcast-|enable-|enforce-|force-gamemode|generate-structures|hardcore|hide-online-players|log-ips|online-mode|prevent-proxy-connections|pvp|require-resource-pack|spawn-monsters|sync-chunk-writes|use-native-transport|white-list)/;
const PORT_LIKE = /(?:^|[.-])port$/i;
const ENUM_LIKE = new Set(["difficulty", "gamemode", "level-type", "region-file-compression"]);
// motd and free-form message/URL/seed/generator-settings fields are the only legitimate text.
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

describe("no-text-box guard", () => {
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

    it("every port-shaped key is a bounded 1..65535 number control", () => {
        const offenders = serverPropertiesFields
            .filter((f) => PORT_LIKE.test(f.key))
            .filter((f) => !(f.control.kind === "number" && f.control.integer && f.control.min === 1 && f.control.max === 65535))
            .map((f) => f.key);
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

    // Deliberately mistyped-key regression: proves the guard actually goes red. Kept as a
    // literal in-test fixture (not the real schema) so this test never needs the real schema
    // to be broken to prove the guard works.
    it("(self-test) the guard rejects a text control masquerading as a switch", () => {
        const broken: readonly { readonly key: string; readonly control: { readonly kind: string } }[] = [{ key: "pvp", control: { kind: "text" } }];
        const offenders = broken.filter((f) => BOOLEAN_LIKE.test(f.key) && f.control.kind !== "switch").map((f) => f.key);
        expect(offenders).toEqual(["pvp"]);
    });
});
