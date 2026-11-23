import { describe, expect, it } from "vitest";
import {
    emptyPack,
    lineProblem,
    newFunction,
    newLootTable,
    newRecipe,
    newTag,
    packFiles,
    packMeta,
    packProblems,
    recipeJson,
    shapedPattern,
    PACK_VERSIONS,
} from "./datapackModel.js";
import { crc32, zipStore } from "./zipStore.js";

const at = (label: string) => PACK_VERSIONS.findIndex((v) => v.label.startsWith(label));

describe("data pack model", () => {
    it("writes pack.mcmeta in the right shape for the version", () => {
        const p = { ...emptyPack(), versionIndex: at("26.1") };
        expect(packMeta(p)).toEqual({
            pack: { description: "my_pack data pack", min_format: [101, 1], max_format: [101, 1] },
        });
        expect(packMeta({ ...p, versionIndex: at("1.21.4") })).toEqual({
            pack: { description: "my_pack data pack", pack_format: 61 },
        });
    });

    it("trims a shaped pattern and gives each item one symbol", () => {
        const grid = [
            "",
            "",
            "",
            "minecraft:stick",
            "diamond",
            "",
            "minecraft:stick",
            "diamond",
            "",
        ];
        expect(shapedPattern(grid)).toEqual({
            pattern: ["#X", "#X"],
            key: new Map([
                ["#", "minecraft:stick"],
                ["X", "minecraft:diamond"],
            ]),
        });
        expect(shapedPattern(new Array(9).fill(""))).toBeNull();
    });

    it("writes ingredients as strings from 1.21.2 and as objects before", () => {
        const r = {
            ...newRecipe("r"),
            kind: "shapeless" as const,
            grid: ["minecraft:dirt", "#minecraft:logs", "", "", "", "", "", "", ""],
            result: "diamond",
            count: 2,
        };
        expect(recipeJson({ ...emptyPack(), versionIndex: at("1.21.4") }, r)).toMatchObject({
            ingredients: ["minecraft:dirt", "#minecraft:logs"],
            result: { id: "minecraft:diamond", count: 2 },
        });
        expect(recipeJson({ ...emptyPack(), versionIndex: at("1.21 ") }, r)).toMatchObject({
            ingredients: [{ item: "minecraft:dirt" }, { tag: "minecraft:logs" }],
        });
        const smelt = {
            ...newRecipe("s"),
            kind: "smelting" as const,
            input: "minecraft:sand",
            result: "minecraft:glass",
        };
        expect(recipeJson(emptyPack(), smelt)).toMatchObject({
            type: "minecraft:smelting",
            ingredient: "minecraft:sand",
            cookingtime: 200,
        });
    });

    it("uses singular folders from 1.21 and function tags for load and tick", () => {
        const p = {
            ...emptyPack(),
            recipes: [
                {
                    ...newRecipe("gem"),
                    grid: ["dirt", "", "", "", "", "", "", "", ""],
                    result: "diamond",
                },
            ],
            functions: [{ ...newFunction("tick"), lines: ["say hi"], onTick: true }],
        };
        const modern = [...packFiles(p).keys()];
        expect(modern).toContain("data/my_pack/recipe/gem.json");
        expect(modern).toContain("data/my_pack/function/tick.mcfunction");
        expect(packFiles(p).get("data/minecraft/tags/function/tick.json")).toContain(
            "my_pack:tick",
        );
        const old = [...packFiles({ ...p, versionIndex: at("1.20.5") }).keys()];
        expect(old).toContain("data/my_pack/recipes/gem.json");
        expect(old).toContain("data/minecraft/tags/functions/tick.json");
    });

    it("checks names, empty recipes, commands and ranges", () => {
        expect(lineProblem("say hi")).toBeNull();
        expect(lineProblem("# note")).toBeNull();
        expect(lineProblem("/say hi")).toMatch(/slash/);
        expect(lineProblem("sya hi")).toMatch(/not a command/);
        const p = {
            ...emptyPack(),
            namespace: "Bad Name",
            recipes: [newRecipe("r")],
            tags: [newTag("t")],
            lootTables: [{ ...newLootTable("l"), rollsMin: 3, rollsMax: 1 }],
        };
        const where = packProblems(p).map((x) => x.where);
        expect(where).toEqual(
            expect.arrayContaining(["Pack", "Recipe r", "Tag t", "Loot table l"]),
        );
        expect(packProblems(emptyPack())).toEqual([]);
    });
});

describe("zip writer", () => {
    it("computes the standard CRC-32", () => {
        expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    });

    it("writes stored entries with a central directory and refuses escaping paths", () => {
        const zip = zipStore(
            new Map([
                ["pack.mcmeta", "{}"],
                ["data/a.json", "[]"],
            ]),
        );
        const view = new DataView(zip.buffer);
        expect(view.getUint32(0, true)).toBe(0x04034b50);
        const end = zip.length - 22;
        expect(view.getUint32(end, true)).toBe(0x06054b50);
        expect(view.getUint16(end + 10, true)).toBe(2);
        expect(new TextDecoder().decode(zip.slice(30, 41))).toBe("pack.mcmeta");
        expect(() => zipStore(new Map([["../evil", "x"]]))).toThrow(/Unsafe/);
    });
});
