import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    bindRegistryReports,
    serializeEntity,
    serializeSnbt,
    serializeVanilla,
    type RegistryData,
} from "./vanilla.js";
const data: RegistryData = {
    version: "1.21.4",
    distributionSha256: "a".repeat(64),
    revision: "fixture",
    values: {
        "minecraft:block": ["minecraft:stone", "minecraft:oak_log"],
        "minecraft:item": ["minecraft:stone"],
        "minecraft:entity_type": ["minecraft:player", "minecraft:pig"],
        "minecraft:data_component_type": ["minecraft:custom_name"],
    },
    blocks: {
        "minecraft:oak_log": { properties: { axis: ["x", "y", "z"] } },
        "minecraft:stone": { properties: {} },
    },
    tags: { "minecraft:block": ["minecraft:logs"] },
    componentEncoding: "json",
    itemEncoding: "components",
    heterogeneousLists: false,
};
describe("structured vanilla command operands", () => {
    it("serializes player identity and permission-constrained selectors without raw grammar", () => {
        expect(serializeEntity({ kind: "entity", player: "MapOwner" }, null)).toBe("MapOwner");
        expect(
            serializeEntity(
                {
                    kind: "entity",
                    selector: {
                        variable: "e",
                        filters: [
                            { key: "type", value: "minecraft:pig" },
                            { key: "distance", min: 1, max: 5 },
                            { key: "limit", value: 1 },
                        ],
                    },
                },
                { onlyAllowEntities: 1 },
                data,
            ),
        ).toBe("@e[type=minecraft:pig,distance=1..5,limit=1]");
        expect(() => serializeEntity({ kind: "entity", player: "x\nstop" }, null)).toThrow();
        expect(() =>
            serializeEntity(
                { kind: "entity", selector: { variable: "a", filters: [] } },
                { single: true },
                data,
            ),
        ).toThrow("one entity");
        expect(() =>
            serializeEntity(
                { kind: "entity", selector: { variable: "e", filters: [] } },
                { playersOnly: true },
                data,
            ),
        ).toThrow("players only");
        expect(() =>
            serializeEntity(
                {
                    kind: "entity",
                    selector: {
                        variable: "e",
                        filters: [{ key: "type", value: "minecraft:not_registered" }],
                    },
                },
                null,
                data,
            ),
        ).toThrow("registry");
    });
    it("serializes registry-backed block states and rejects unknown property values/injection", () => {
        expect(
            serializeVanilla(
                "minecraft:block_state",
                null,
                { kind: "block", id: "minecraft:oak_log", properties: { axis: "y" } },
                data,
            ),
        ).toBe("minecraft:oak_log[axis=y]");
        expect(() =>
            serializeVanilla(
                "minecraft:block_state",
                null,
                { kind: "block", id: "minecraft:oak_log", properties: { axis: "y] run stop" } },
                data,
            ),
        ).toThrow("property");
        expect(() =>
            serializeVanilla(
                "minecraft:block_state",
                null,
                { kind: "block", id: "minecraft:stone", properties: { axis: "y" } },
                data,
            ),
        ).toThrow("property");
        expect(() =>
            serializeVanilla(
                "minecraft:block_state",
                null,
                { kind: "block", id: "minecraft:stone", properties: {} },
                undefined,
            ),
        ).toThrow("registry");
        expect(
            serializeVanilla(
                "minecraft:block_predicate",
                null,
                { kind: "block", id: "minecraft:logs", tag: true, properties: {} },
                data,
            ),
        ).toBe("#minecraft:logs");
    });
    it("validates item component identities and exact version syntax", () => {
        const item = {
            kind: "item" as const,
            id: "minecraft:stone",
            components: [
                {
                    id: "minecraft:custom_name",
                    value: { type: "string" as const, value: "Map stone" },
                },
            ],
        };
        expect(serializeVanilla("minecraft:item_stack", null, item, data)).toBe(
            'minecraft:stone[minecraft:custom_name="Map stone"]',
        );
        expect(() =>
            serializeVanilla(
                "minecraft:item_stack",
                null,
                { ...item, components: [{ id: "minecraft:unknown", remove: true }] },
                data,
            ),
        ).toThrow("registry");
        expect(() =>
            serializeVanilla("minecraft:item_stack", null, item, {
                ...data,
                itemEncoding: "legacy-nbt",
            }),
        ).toThrow("unsupported");
        expect(() =>
            serializeVanilla(
                "minecraft:item_stack",
                null,
                { kind: "item", id: "minecraft:stone", nbt: { type: "compound", values: {} } },
                data,
            ),
        ).toThrow("components");
    });
    it("preserves NBT type suffixes, exact long precision and safe quoted strings", () => {
        expect(
            serializeSnbt({
                type: "compound",
                values: {
                    Count: { type: "byte", value: "1" },
                    Long: { type: "long", value: "9223372036854775807" },
                    Name: { type: "string", value: 'a"b' },
                },
            }),
        ).toBe('{"Count":1b,"Long":9223372036854775807L,"Name":"a\\"b"}');
        expect(() => serializeSnbt({ type: "byte", value: "128" })).toThrow("bounds");
        expect(() => serializeSnbt({ type: "long", value: "9223372036854775808" })).toThrow(
            "bounds",
        );
        expect(() =>
            serializeSnbt({
                type: "list",
                values: [
                    { type: "byte", value: "1" },
                    { type: "string", value: "x" },
                ],
            }),
        ).toThrow("Mixed");
        expect(
            serializeSnbt(
                {
                    type: "list",
                    values: [
                        { type: "byte", value: "1" },
                        { type: "string", value: "x" },
                    ],
                },
                true,
            ),
        ).toBe('[1b,"x"]');
    });
    it("serializes text component/nbt path/range/rotation and rejects mismatched operands", () => {
        expect(
            serializeVanilla(
                "minecraft:component",
                null,
                { kind: "component", value: { text: "Hello", bold: true } },
                data,
            ),
        ).toBe('{"text":"Hello","bold":true}');
        expect(
            serializeVanilla(
                "minecraft:nbt_path",
                null,
                { kind: "nbt-path", segments: [{ key: "Items" }, { index: 0 }, { key: "id" }] },
                data,
            ),
        ).toBe('"Items"[0]."id"');
        expect(
            serializeVanilla("minecraft:int_range", null, { kind: "range", min: 1, max: 3 }, data),
        ).toBe("1..3");
        expect(() =>
            serializeVanilla("minecraft:int_range", null, { kind: "range", min: 1.5 }, data),
        ).toThrow("range");
        expect(() =>
            serializeVanilla(
                "minecraft:rotation",
                null,
                { kind: "rotation", yaw: Infinity, pitch: 0 },
                data,
            ),
        ).toThrow("rotation");
        expect(() =>
            serializeVanilla(
                "minecraft:block_state",
                null,
                { kind: "entity", player: "Player" },
                data,
            ),
        ).toThrow("match");
    });
    it("binds registry reports to exact source bytes and refuses mismatched versions/digests", () => {
        const registries = Buffer.from(
            JSON.stringify({
                "minecraft:block": { entries: { "minecraft:stone": { protocol_id: 1 } } },
            }),
        );
        const blocks = Buffer.from(
            JSON.stringify({ "minecraft:stone": { states: [{ id: 1, default: true }] } }),
        );
        const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
        const receipt = {
            version: data.version,
            distributionSha256: data.distributionSha256,
            registriesSha256: hash(registries),
            blocksSha256: hash(blocks),
            componentEncoding: "json" as const,
            itemEncoding: "components" as const,
            heterogeneousLists: false,
        };
        expect(
            bindRegistryReports({ target: data }, registries, blocks, receipt).values[
                "minecraft:block"
            ],
        ).toEqual(["minecraft:stone"]);
        expect(() =>
            bindRegistryReports({ target: data }, registries, blocks, {
                ...receipt,
                version: "26.3",
            }),
        ).toThrow("provenance");
        expect(() =>
            bindRegistryReports({ target: data }, Buffer.from("{}"), blocks, receipt),
        ).toThrow("provenance");
    });
});
