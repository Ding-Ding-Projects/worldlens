import { describe, expect, it } from "vitest";
import { emptyPack, packFiles, packFromFiles, packMeta, packProblems, PACK_VERSIONS } from "./datapackModel.js";
import { NEW_PART_KINDS, PART_KINDS, newPart, partFromPath, partPath } from "./datapackParts.js";

describe("registry parts", () => {
    it("starts every kind from a file that is valid JSON", () => {
        for (const kind of PART_KINDS) {
            const part = newPart(kind.id, "x", "my_pack");
            expect(() => JSON.parse(part.text), kind.id).not.toThrow();
        }
        expect(NEW_PART_KINDS.length).toBeGreaterThanOrEqual(20);
    });

    it("writes a part to the singular folder from 1.21 and the plural one before", () => {
        const part = newPart("item_modifier", "double", "my_pack");
        expect(partPath(part, "my_pack", 94)).toBe("data/my_pack/item_modifier/double.json");
        expect(partPath(part, "my_pack", 41)).toBe("data/my_pack/item_modifiers/double.json");
        expect(partPath(newPart("structure_set", "s", "n"), "n", 94)).toBe("data/n/worldgen/structure_set/s.json");
    });

    it("tells structure_set apart from structure when reading a path", () => {
        expect(partFromPath("data/n/worldgen/structure_set/a.json", "{}")?.kind).toBe("structure_set");
        expect(partFromPath("data/n/worldgen/structure/a.json", "{}")?.kind).toBe("structure");
        expect(partFromPath("data/n/item_modifiers/a/b.json", "[]")).toMatchObject({ kind: "item_modifier", name: "a/b" });
        expect(partFromPath("data/n/tags/entity_type/a.json", "{}")).toBeNull();
    });

    it("puts parts into the pack and reports one that is not valid JSON", () => {
        const pack = emptyPack();
        pack.parts = [newPart("enchantment", "zap", pack.namespace), { kind: "damage_type", name: "ouch", text: "{" }];
        const files = packFiles(pack);
        expect(files.has("data/my_pack/enchantment/zap.json")).toBe(true);
        expect(packProblems(pack).some((p) => p.where === "Damage type ouch")).toBe(true);
    });

    it("opens parts back, including an override of another namespace", () => {
        const files = new Map([
            ["pack.mcmeta", JSON.stringify({ pack: { description: "d", pack_format: 48 } })],
            ["data/mine/enchantment/zap.json", '{"weight": 1}'],
            ["data/minecraft/worldgen/noise_settings/overworld.json", "{}"],
            ["data/mine/recipe/odd.json", '{"type":"minecraft:smithing_trim"}'],
        ]);
        const { pack } = packFromFiles(files);
        expect(pack.namespace).toBe("mine");
        const kinds = (pack.parts ?? []).map((p) => `${p.kind}:${p.namespace ?? "-"}:${p.name}`).sort();
        expect(kinds).toEqual(["enchantment:-:zap", "noise_settings:minecraft:overworld", "recipe:-:odd"]);
        const back = packFiles(pack);
        expect(back.get("data/minecraft/worldgen/noise_settings/overworld.json")).toBe("{}\n");
        expect(back.has("data/mine/recipe/odd.json")).toBe(true);
    });
});

describe("overlays", () => {
    it("writes min_format and max_format overlays from format 82, and formats before", () => {
        const pack = emptyPack();
        pack.overlays = [{ directory: "new_only", oldest: 1, newest: 0 }];
        const entries = (packMeta(pack) as { overlays: { entries: unknown[] } }).overlays.entries;
        expect(entries).toEqual([{ directory: "new_only", min_format: [94, 1], max_format: [101, 1] }]);
        pack.versionIndex = PACK_VERSIONS.findIndex((v) => v.major === 48);
        pack.overlays = [{ directory: "old", oldest: PACK_VERSIONS.length - 1, newest: pack.versionIndex }];
        expect((packMeta(pack) as { overlays: { entries: unknown[] } }).overlays.entries).toEqual([
            { directory: "old", formats: { min_inclusive: 41, max_inclusive: 48 } },
        ]);
    });

    it("reads overlays back and flags a bad folder name", () => {
        const pack = emptyPack();
        pack.overlays = [{ directory: "two", oldest: 2, newest: 0 }];
        const reopened = packFromFiles(packFiles(pack)).pack;
        expect(reopened.overlays).toEqual([{ directory: "two", oldest: 2, newest: 0 }]);
        pack.overlays.push({ directory: "Bad Name", oldest: 0, newest: 0 });
        expect(packProblems(pack).some((p) => p.where === "Overlay Bad Name")).toBe(true);
    });
});
