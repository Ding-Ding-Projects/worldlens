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

describe("predicates", () => {
    it("writes nested condition blocks as the game's predicate JSON", async () => {
        const { predicateJson, newPredicate } = await import("./datapackModel.js");
        const root = {
            kind: "all" as const,
            children: [
                { kind: "weather" as const, raining: true, thundering: false },
                { kind: "not" as const, child: { kind: "biome" as const, biome: "plains" } },
                { kind: "chance" as const, chance: 0.25 },
            ],
        };
        expect(predicateJson(root)).toEqual({
            condition: "minecraft:all_of",
            terms: [
                { condition: "minecraft:weather_check", raining: true, thundering: false },
                {
                    condition: "minecraft:inverted",
                    term: {
                        condition: "minecraft:location_check",
                        predicate: { biomes: "minecraft:plains" },
                    },
                },
                { condition: "minecraft:random_chance", chance: 0.25 },
            ],
        });
        const pack = { ...emptyPack(), predicates: [{ ...newPredicate("rainy"), root }] };
        expect([...packFiles(pack).keys()]).toContain("data/my_pack/predicate/rainy.json");
    });
});

describe("opening an existing pack", () => {
    it("makes functions and tags editable, keeps everything else, and writes it all back", async () => {
        const { packFromFiles } = await import("./datapackModel.js");
        const { readZip } = await import("./zipRead.js");
        const { zipStore } = await import("./zipStore.js");
        const zip = zipStore(
            new Map([
                [
                    "my pack/pack.mcmeta",
                    JSON.stringify({ pack: { description: "Hi", pack_format: 61 } }),
                ],
                ["my pack/data/heap/function/tick.mcfunction", "say hi\nsay bye\n"],
                [
                    "my pack/data/heap/tags/item/gems.json",
                    JSON.stringify({ values: ["minecraft:diamond"] }),
                ],
                [
                    "my pack/data/heap/recipe/odd.json",
                    '{"type":"minecraft:crafting_special_bookcloning"}',
                ],
                [
                    "my pack/data/minecraft/tags/function/tick.json",
                    JSON.stringify({ values: ["heap:tick"] }),
                ],
            ]),
        );
        const files = await readZip(zip);
        const { pack, kept } = packFromFiles(
            new Map([...files].map(([k, v]) => [k, new TextDecoder().decode(v)])),
        );
        expect(pack).toMatchObject({
            namespace: "heap",
            description: "Hi",
            functions: [{ name: "tick", lines: ["say hi", "say bye"], onTick: true }],
            tags: [{ name: "gems", registry: "item" }],
        });
        expect(PACK_VERSIONS[pack.versionIndex]!.major).toBe(61);
        expect(kept).toBe(1);
        const out = packFiles(pack);
        expect(out.get("data/heap/recipe/odd.json")).toContain("bookcloning");
        expect(out.get("data/minecraft/tags/function/tick.json")).toContain("heap:tick");
    });
});

describe("biomes", () => {
    it("writes climate and colours as a worldgen biome", async () => {
        const { biomeJson, newBiome } = await import("./datapackModel.js");
        expect(biomeJson({ ...newBiome("misty"), skyColor: "#ff0000" })).toMatchObject({
            temperature: 0.8,
            downfall: 0.4,
            has_precipitation: true,
            effects: { sky_color: 0xff0000 },
        });
        const pack = { ...emptyPack(), versionIndex: 0, biomes: [newBiome("misty")] };
        expect([...packFiles(pack).keys()]).toContain("data/my_pack/worldgen/biome/misty.json");
        expect(packProblems(pack)).toEqual([]);
    });
});
