/**
 * The data pack creator's model: what a pack holds, and the exact files the game reads.
 *
 * Every shape here follows the Java Edition data pack format for the chosen version:
 * - Folder names are singular from 1.21 (`recipe`, `function`, `tags/item`) and plural before.
 * - Ingredients are plain ids or `#tag` strings from 1.21.2; before that they are
 *   `{ "item": id }` or `{ "tag": id }` objects.
 * - Results are item stacks `{ "id", "count" }` from 1.20.5.
 * - `pack.mcmeta` uses `pack_format` up to 1.21.8 and `min_format` / `max_format`
 *   from 1.21.9 (data pack format 82 and above).
 * The format numbers come from the game's own release notes. See `docs/data-pack-creator.md`.
 *
 * Design: `design/design-sources/datapacks-and-chunks/DataPack.dc.html`. Pure.
 */

import {
    OVERLAY_DIRECTORY,
    partError,
    partFromPath,
    partKind,
    partPath,
    type PackOverlay,
    type PackPart,
} from "./datapackParts.js";

export interface PackVersion {
    readonly label: string;
    /** Major data pack format. */
    readonly major: number;
    readonly minor: number;
}

/** Newest first. Each entry is a release, with the data pack format it reads. */
export const PACK_VERSIONS: readonly PackVersion[] = [
    { label: "26.1", major: 101, minor: 1 },
    { label: "1.21.11", major: 94, minor: 1 },
    { label: "1.21.9 – 1.21.10", major: 88, minor: 0 },
    { label: "1.21.7 – 1.21.8", major: 81, minor: 0 },
    { label: "1.21.6", major: 80, minor: 0 },
    { label: "1.21.5", major: 71, minor: 0 },
    { label: "1.21.4", major: 61, minor: 0 },
    { label: "1.21.2 – 1.21.3", major: 57, minor: 0 },
    { label: "1.21 – 1.21.1", major: 48, minor: 0 },
    { label: "1.20.5 – 1.20.6", major: 41, minor: 0 },
];

export type RecipeKind =
    | "shaped"
    | "shapeless"
    | "smelting"
    | "blasting"
    | "smoking"
    | "campfire_cooking"
    | "stonecutting"
    | "smithing_transform";
export type RecipeCategory = "building" | "redstone" | "equipment" | "misc" | "food" | "blocks";

export interface Recipe {
    name: string;
    kind: RecipeKind;
    /** Shaped: 9 slots, row by row; "" is empty. Shapeless: any non-empty slots. */
    grid: string[];
    /** Cooking and stonecutting input; smithing base. */
    input: string;
    /** Smithing template and addition. */
    template: string;
    addition: string;
    result: string;
    count: number;
    /** Cooking: experience and time in ticks. */
    experience: number;
    cookingTime: number;
    category: RecipeCategory;
}

export interface PackFunction {
    name: string;
    lines: string[];
    onLoad: boolean;
    onTick: boolean;
}

export interface PackTag {
    name: string;
    registry: "item" | "block";
    values: string[];
    replace: boolean;
}

export type AdvancementFrame = "task" | "goal" | "challenge";

export interface Advancement {
    name: string;
    title: string;
    description: string;
    icon: string;
    frame: AdvancementFrame;
    /** Granted when the player has this item; "" means granted on the first tick. */
    triggerItem: string;
    parent: string;
    experience: number;
    rewardFunction: string;
    announce: boolean;
    hidden: boolean;
}

export interface LootEntry {
    item: string;
    weight: number;
    min: number;
    max: number;
}

export interface LootTable {
    name: string;
    kind: "block" | "chest" | "entity";
    rollsMin: number;
    rollsMax: number;
    entries: LootEntry[];
}

/** One predicate condition block. Groups hold other blocks. */
export type PredicateBlock =
    | { kind: "all" | "any"; children: PredicateBlock[] }
    | { kind: "not"; child: PredicateBlock | null }
    | { kind: "weather"; raining: boolean; thundering: boolean }
    | { kind: "chance"; chance: number }
    | { kind: "biome"; biome: string }
    | { kind: "time"; min: number; max: number }
    | { kind: "score"; objective: string; min: number; max: number };

export interface Predicate {
    name: string;
    root: PredicateBlock;
}

export const newPredicate = (name: string): Predicate => ({
    name,
    root: { kind: "all", children: [] },
});

export function predicateJson(b: PredicateBlock): Record<string, unknown> {
    switch (b.kind) {
        case "all":
            return { condition: "minecraft:all_of", terms: b.children.map(predicateJson) };
        case "any":
            return { condition: "minecraft:any_of", terms: b.children.map(predicateJson) };
        case "not":
            return {
                condition: "minecraft:inverted",
                term:
                    b.child === null
                        ? { condition: "minecraft:all_of", terms: [] }
                        : predicateJson(b.child),
            };
        case "weather":
            return {
                condition: "minecraft:weather_check",
                raining: b.raining,
                thundering: b.thundering,
            };
        case "chance":
            return { condition: "minecraft:random_chance", chance: b.chance };
        case "biome":
            return {
                condition: "minecraft:location_check",
                predicate: { biomes: fullId(b.biome) },
            };
        case "time":
            return {
                condition: "minecraft:time_check",
                value: { min: b.min, max: b.max },
                period: 24000,
            };
        case "score":
            return {
                condition: "minecraft:entity_scores",
                entity: "this",
                scores: { [b.objective]: { min: b.min, max: b.max } },
            };
    }
}

/** A custom biome: climate and colours. Placement in the world needs a dimension's biome source. */
export interface Biome {
    name: string;
    temperature: number;
    downfall: number;
    precipitation: boolean;
    skyColor: string;
    fogColor: string;
    waterColor: string;
    waterFogColor: string;
}

export const newBiome = (name: string): Biome => ({
    name,
    temperature: 0.8,
    downfall: 0.4,
    precipitation: true,
    skyColor: "#78a7ff",
    fogColor: "#c0d8ff",
    waterColor: "#3f76e4",
    waterFogColor: "#050533",
});

const colourInt = (hex: string): number => Number.parseInt(hex.replace("#", ""), 16) || 0;

export function biomeJson(b: Biome): Record<string, unknown> {
    return {
        has_precipitation: b.precipitation,
        temperature: b.temperature,
        downfall: b.downfall,
        effects: {
            sky_color: colourInt(b.skyColor),
            fog_color: colourInt(b.fogColor),
            water_color: colourInt(b.waterColor),
            water_fog_color: colourInt(b.waterFogColor),
        },
        spawners: {},
        spawn_costs: {},
        carvers: [],
        features: [],
    };
}

export interface DataPack {
    namespace: string;
    description: string;
    versionIndex: number;
    recipes: Recipe[];
    functions: PackFunction[];
    tags: PackTag[];
    advancements: Advancement[];
    lootTables: LootTable[];
    predicates?: Predicate[];
    biomes?: Biome[];
    /** Every other registry file, edited as checked JSON. */
    parts?: PackPart[];
    /** Folders whose files replace the base ones on some game versions. */
    overlays?: PackOverlay[];
    /** Files kept exactly as they were opened, for parts this editor does not edit yet. */
    extraFiles?: Record<string, string>;
    /** Binary files (pack.png and the like) kept as they were opened, base64. */
    extraBinary?: Record<string, string>;
}

/** Text files that are part of a pack; anything else is kept as binary. */
export const isPackText = (path: string): boolean =>
    /\.(json|mcfunction|mcmeta|txt|nbt\.snbt)$/i.test(path);

export function emptyPack(): DataPack {
    return {
        namespace: "my_pack",
        description: "",
        versionIndex: 0,
        recipes: [],
        functions: [],
        tags: [],
        advancements: [],
        lootTables: [],
        predicates: [],
        biomes: [],
        parts: [],
        overlays: [],
    };
}

export function newRecipe(name: string): Recipe {
    return {
        name,
        kind: "shaped",
        grid: new Array<string>(9).fill(""),
        input: "",
        template: "",
        addition: "",
        result: "",
        count: 1,
        experience: 0.1,
        cookingTime: 200,
        category: "misc",
    };
}
export const newFunction = (name: string): PackFunction => ({
    name,
    lines: [],
    onLoad: false,
    onTick: false,
});
export const newTag = (name: string): PackTag => ({
    name,
    registry: "item",
    values: [],
    replace: false,
});
export function newAdvancement(name: string): Advancement {
    return {
        name,
        title: "",
        description: "",
        icon: "minecraft:diamond",
        frame: "task",
        triggerItem: "",
        parent: "",
        experience: 0,
        rewardFunction: "",
        announce: true,
        hidden: false,
    };
}
export const newLootTable = (name: string): LootTable => ({
    name,
    kind: "chest",
    rollsMin: 1,
    rollsMax: 1,
    entries: [],
});

/* -------------------------------------------------------------------------- */
/* Names                                                                       */
/* -------------------------------------------------------------------------- */

const NAMESPACE = /^[a-z0-9_.-]+$/;
const PATH = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;
const RESOURCE = /^#?([a-z0-9_.-]+:)?[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

export const isNamespace = (s: string): boolean => NAMESPACE.test(s);
export const isPath = (s: string): boolean => PATH.test(s);
export const isResource = (s: string): boolean => RESOURCE.test(s);

/** `diamond` → `minecraft:diamond`; tags keep their `#`. */
export function fullId(id: string): string {
    const tag = id.startsWith("#");
    const bare = tag ? id.slice(1) : id;
    const full = bare.includes(":") ? bare : `minecraft:${bare}`;
    return tag ? `#${full}` : full;
}

/** Turns free text into a valid file name. */
export function slug(text: string): string {
    return (
        text
            .toLowerCase()
            .replace(/[^a-z0-9_./-]+/g, "_")
            .replace(/^[_/]+|[_/]+$/g, "") || "untitled"
    );
}

/* -------------------------------------------------------------------------- */
/* Files                                                                       */
/* -------------------------------------------------------------------------- */

const version = (pack: DataPack): PackVersion =>
    PACK_VERSIONS[pack.versionIndex] ?? PACK_VERSIONS[0]!;
const singular = (pack: DataPack): boolean => version(pack).major >= 48;
const stringIngredients = (pack: DataPack): boolean => version(pack).major >= 57;

function folder(
    pack: DataPack,
    kind: "recipe" | "function" | "advancement" | "loot_table" | "item" | "block",
): string {
    const one = singular(pack);
    switch (kind) {
        case "item":
        case "block":
            return `tags/${one ? kind : `${kind}s`}`;
        case "function":
            return one ? "function" : "functions";
        default:
            return one ? kind : `${kind}s`;
    }
}

function ingredient(pack: DataPack, id: string): unknown {
    const full = fullId(id);
    if (stringIngredients(pack)) return full;
    return full.startsWith("#") ? { tag: full.slice(1) } : { item: full };
}

const stack = (id: string, count: number): Record<string, unknown> =>
    count > 1 ? { id: fullId(id), count } : { id: fullId(id) };

export function packMeta(pack: DataPack): Record<string, unknown> {
    const v = version(pack);
    const description =
        pack.description.trim() === "" ? `${pack.namespace} data pack` : pack.description;
    const meta: Record<string, unknown> =
        v.major >= 82
            ? { pack: { description, min_format: [v.major, v.minor], max_format: [v.major, v.minor] } }
            : { pack: { description, pack_format: v.major } };
    const overlays = (pack.overlays ?? []).filter((o) => OVERLAY_DIRECTORY.test(o.directory));
    if (overlays.length > 0) {
        meta["overlays"] = {
            entries: overlays.map((o) => {
                const oldest = PACK_VERSIONS[Math.max(o.oldest, o.newest)] ?? PACK_VERSIONS.at(-1)!;
                const newest = PACK_VERSIONS[Math.min(o.oldest, o.newest)] ?? PACK_VERSIONS[0]!;
                // From format 82 an overlay names its range the way the pack does; before it,
                // as a whole-number range.
                return v.major >= 82
                    ? {
                          directory: o.directory,
                          min_format: [oldest.major, oldest.minor],
                          max_format: [newest.major, newest.minor],
                      }
                    : {
                          directory: o.directory,
                          formats: { min_inclusive: oldest.major, max_inclusive: newest.major },
                      };
            }),
        };
    }
    return meta;
}

/** The shaped recipe's pattern and key, trimmed to the used rows and columns. */
export function shapedPattern(
    grid: readonly string[],
): { pattern: string[]; key: Map<string, string> } | null {
    const used = grid.map((g) => g.trim() !== "");
    const rows = [0, 1, 2].filter((r) => used.slice(r * 3, r * 3 + 3).some(Boolean));
    const cols = [0, 1, 2].filter((c) => [0, 1, 2].some((r) => used[r * 3 + c]));
    if (rows.length === 0) return null;
    const symbols = "#XOABCDEFGHIJ";
    const key = new Map<string, string>();
    const symbolFor = new Map<string, string>();
    const pattern = [];
    for (let r = rows[0]!; r <= rows[rows.length - 1]!; r++) {
        let line = "";
        for (let c = cols[0]!; c <= cols[cols.length - 1]!; c++) {
            const item = (grid[r * 3 + c] ?? "").trim();
            if (item === "") {
                line += " ";
                continue;
            }
            const id = fullId(item);
            let s = symbolFor.get(id);
            if (s === undefined) {
                s = symbols[symbolFor.size]!;
                symbolFor.set(id, s);
                key.set(s, id);
            }
            line += s;
        }
        pattern.push(line);
    }
    return { pattern, key };
}

export function recipeJson(pack: DataPack, r: Recipe): Record<string, unknown> {
    const type = `minecraft:${r.kind}`;
    switch (r.kind) {
        case "shaped": {
            const p = shapedPattern(r.grid) ?? { pattern: [], key: new Map<string, string>() };
            return {
                type,
                category: r.category,
                pattern: p.pattern,
                key: Object.fromEntries([...p.key].map(([s, id]) => [s, ingredient(pack, id)])),
                result: stack(r.result, r.count),
            };
        }
        case "shapeless":
            return {
                type,
                category: r.category,
                ingredients: r.grid.filter((g) => g.trim() !== "").map((g) => ingredient(pack, g)),
                result: stack(r.result, r.count),
            };
        case "stonecutting":
            return {
                type,
                ingredient: ingredient(pack, r.input),
                result: stack(r.result, r.count),
            };
        case "smithing_transform":
            return {
                type,
                template: ingredient(pack, r.template),
                base: ingredient(pack, r.input),
                addition: ingredient(pack, r.addition),
                result: stack(r.result, 1),
            };
        default: {
            const cookingCategory =
                r.category === "food" || r.category === "blocks" ? r.category : "misc";
            return {
                type,
                category: cookingCategory,
                ingredient: ingredient(pack, r.input),
                result: stack(r.result, 1),
                experience: r.experience,
                cookingtime: r.cookingTime,
            };
        }
    }
}

/**
 * Whether `child` may take `parent` as its parent without making a loop. An advancement is
 * never its own parent, and never the parent of one it already comes before.
 */
export function canParent(list: readonly Advancement[], child: number, parent: number): boolean {
    if (child === parent || list[child] === undefined || list[parent] === undefined) return false;
    const byName = new Map(list.map((a, i) => [a.name, i]));
    const seen = new Set<number>();
    for (let at: number | undefined = parent; at !== undefined; at = byName.get(list[at]!.parent)) {
        if (at === child) return false;
        if (seen.has(at)) break;
        seen.add(at);
    }
    return true;
}

export function advancementJson(pack: DataPack, a: Advancement): Record<string, unknown> {
    const out: Record<string, unknown> = {
        display: {
            icon: { id: fullId(a.icon) },
            title: a.title === "" ? a.name : a.title,
            description: a.description,
            frame: a.frame,
            announce_to_chat: a.announce,
            hidden: a.hidden,
        },
        criteria: {
            requirement:
                a.triggerItem.trim() === ""
                    ? { trigger: "minecraft:tick" }
                    : {
                          trigger: "minecraft:inventory_changed",
                          conditions: { items: [{ items: fullId(a.triggerItem) }] },
                      },
        },
    };
    if (a.parent.trim() !== "")
        out["parent"] = a.parent.includes(":") ? a.parent : `${pack.namespace}:${a.parent}`;
    const rewards: Record<string, unknown> = {};
    if (a.experience > 0) rewards["experience"] = a.experience;
    if (a.rewardFunction.trim() !== "")
        rewards["function"] = a.rewardFunction.includes(":")
            ? a.rewardFunction
            : `${pack.namespace}:${a.rewardFunction}`;
    if (Object.keys(rewards).length > 0) out["rewards"] = rewards;
    return out;
}

export function lootTableJson(t: LootTable): Record<string, unknown> {
    const rolls =
        t.rollsMin === t.rollsMax
            ? t.rollsMin
            : { type: "minecraft:uniform", min: t.rollsMin, max: t.rollsMax };
    return {
        type: `minecraft:${t.kind}`,
        pools: [
            {
                rolls,
                entries: t.entries.map((e) => {
                    const entry: Record<string, unknown> = {
                        type: "minecraft:item",
                        name: fullId(e.item),
                        weight: e.weight,
                    };
                    if (e.min !== 1 || e.max !== 1) {
                        entry["functions"] = [
                            {
                                function: "minecraft:set_count",
                                count:
                                    e.min === e.max
                                        ? e.min
                                        : { type: "minecraft:uniform", min: e.min, max: e.max },
                            },
                        ];
                    }
                    return entry;
                }),
            },
        ],
    };
}

/** Every file the pack writes, path → text, in a stable order. */
export function packFiles(pack: DataPack): Map<string, string> {
    const files = new Map<string, string>(Object.entries(pack.extraFiles ?? {}));
    const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;
    const ns = pack.namespace;
    files.set("pack.mcmeta", json(packMeta(pack)));
    for (const r of pack.recipes)
        files.set(`data/${ns}/${folder(pack, "recipe")}/${r.name}.json`, json(recipeJson(pack, r)));
    for (const f of pack.functions)
        files.set(
            `data/${ns}/${folder(pack, "function")}/${f.name}.mcfunction`,
            `${f.lines.join("\n")}\n`,
        );
    const load = pack.functions.filter((f) => f.onLoad).map((f) => `${ns}:${f.name}`);
    const tick = pack.functions.filter((f) => f.onTick).map((f) => `${ns}:${f.name}`);
    const fnTags = singular(pack) ? "tags/function" : "tags/functions";
    if (load.length > 0) files.set(`data/minecraft/${fnTags}/load.json`, json({ values: load }));
    if (tick.length > 0) files.set(`data/minecraft/${fnTags}/tick.json`, json({ values: tick }));
    for (const t of pack.tags)
        files.set(
            `data/${ns}/${folder(pack, t.registry)}/${t.name}.json`,
            json({ replace: t.replace, values: t.values.map(fullId) }),
        );
    for (const a of pack.advancements)
        files.set(
            `data/${ns}/${folder(pack, "advancement")}/${a.name}.json`,
            json(advancementJson(pack, a)),
        );
    for (const b of pack.biomes ?? [])
        files.set(`data/${ns}/worldgen/biome/${b.name}.json`, json(biomeJson(b)));
    for (const pr of pack.predicates ?? [])
        files.set(
            `data/${ns}/${singular(pack) ? "predicate" : "predicates"}/${pr.name}.json`,
            json(predicateJson(pr.root)),
        );
    for (const l of pack.lootTables)
        files.set(
            `data/${ns}/${folder(pack, "loot_table")}/${l.name}.json`,
            json(lootTableJson(l)),
        );
    for (const part of pack.parts ?? []) {
        const path = partPath(part, ns, version(pack).major);
        if (path === null) continue;
        const text = part.text.replace(/\r\n/g, "\n");
        files.set(path, text.endsWith("\n") ? text : `${text}\n`);
    }
    return files;
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                      */
/* -------------------------------------------------------------------------- */

export interface PackProblem {
    readonly where: string;
    readonly message: string;
}

/** Commands the game knows as the first word of a function line (Java Edition). */
export const COMMAND_ROOTS: ReadonlySet<string> = new Set(
    "advancement attribute bossbar clear clone damage data datapack debug defaultgamemode difficulty effect enchant execute experience xp fill fillbiome forceload function gamemode gamerule give help item jfr kill list locate loot me msg tell w particle place playsound random recipe reload return ride rotate say schedule scoreboard seed setblock setworldspawn spawnpoint spectate spreadplayers stopsound summon tag team teammsg tm teleport tp tellraw test tick time title transfer trigger weather worldborder dialog fetchprofile swing stopwatch waypoint version".split(
        " ",
    ),
);

/** One function line's problem, or `null`. Comments, blank lines and macro lines pass. */
export function lineProblem(line: string): string | null {
    const text = line.trim();
    if (text === "" || text.startsWith("#") || text.startsWith("$")) return null;
    if (text.startsWith("/")) return "Function lines are written without the leading slash.";
    const root = text.split(/\s+/)[0]!;
    return COMMAND_ROOTS.has(root) ? null : `“${root}” is not a command this version knows.`;
}

export function packProblems(pack: DataPack): PackProblem[] {
    const out: PackProblem[] = [];
    if (!isNamespace(pack.namespace))
        out.push({ where: "Pack", message: "The namespace may only use a–z, 0–9, _ . and -." });
    const names = (kind: string, items: readonly { name: string }[]): void => {
        const seen = new Set<string>();
        for (const i of items) {
            if (!isPath(i.name))
                out.push({
                    where: `${kind} ${i.name || "(unnamed)"}`,
                    message: "The name may only use a–z, 0–9, _ . - and /.",
                });
            if (seen.has(i.name))
                out.push({ where: `${kind} ${i.name}`, message: "Two entries share this name." });
            seen.add(i.name);
        }
    };
    names("Recipe", pack.recipes);
    names("Function", pack.functions);
    names("Tag", pack.tags);
    names("Advancement", pack.advancements);
    names("Loot table", pack.lootTables);
    const parts = pack.parts ?? [];
    for (const kind of new Set(parts.map((p) => p.kind)))
        names(partKind(kind)?.label ?? kind, parts.filter((p) => p.kind === kind));
    for (const part of parts) {
        const error = partError(part);
        if (error !== null)
            out.push({
                where: `${partKind(part.kind)?.label ?? part.kind} ${part.name}`,
                message: `This is not valid JSON: ${error}`,
            });
    }
    const dirs = new Set<string>();
    for (const o of pack.overlays ?? []) {
        if (!OVERLAY_DIRECTORY.test(o.directory))
            out.push({
                where: `Overlay ${o.directory || "(unnamed)"}`,
                message: "An overlay folder may only use a–z, 0–9, _ and -.",
            });
        if (dirs.has(o.directory))
            out.push({ where: `Overlay ${o.directory}`, message: "Two overlays share this folder." });
        dirs.add(o.directory);
    }
    for (const r of pack.recipes) {
        const where = `Recipe ${r.name}`;
        if (r.result.trim() === "") out.push({ where, message: "Choose what it makes." });
        else if (r.result.startsWith("#"))
            out.push({ where, message: "A recipe result must be one item, not a tag." });
        if ((r.kind === "shaped" || r.kind === "shapeless") && r.grid.every((g) => g.trim() === ""))
            out.push({ where, message: "Put at least one item in the grid." });
        if (r.kind !== "shaped" && r.kind !== "shapeless" && r.input.trim() === "")
            out.push({ where, message: "Choose the input item." });
        if (
            r.kind === "smithing_transform" &&
            (r.template.trim() === "" || r.addition.trim() === "")
        )
            out.push({ where, message: "Smithing needs a template and an addition." });
    }
    for (const f of pack.functions) {
        f.lines.forEach((l, i) => {
            const p = lineProblem(l);
            if (p !== null) out.push({ where: `Function ${f.name}, line ${i + 1}`, message: p });
        });
    }
    for (const t of pack.tags)
        if (t.values.length === 0)
            out.push({ where: `Tag ${t.name}`, message: "Add at least one value." });
    for (const l of pack.lootTables) {
        if (l.entries.length === 0)
            out.push({ where: `Loot table ${l.name}`, message: "Add at least one drop." });
        if (l.rollsMin > l.rollsMax)
            out.push({
                where: `Loot table ${l.name}`,
                message: "The fewest rolls is more than the most.",
            });
        l.entries.forEach((e, i) => {
            if (e.min > e.max)
                out.push({
                    where: `Loot table ${l.name}, drop ${i + 1}`,
                    message: "The smallest count is more than the largest.",
                });
        });
    }
    for (const a of pack.advancements)
        if (a.icon.trim() === "")
            out.push({ where: `Advancement ${a.name}`, message: "Choose an icon." });
    return out;
}

/**
 * Opens an existing pack's files (path → text). Functions and item/block tags become editable;
 * every other file is kept exactly as it was, so saving never loses anything.
 */
export function packFromFiles(files: ReadonlyMap<string, string>): {
    pack: DataPack;
    kept: number;
} {
    const pack = emptyPack();
    const extra: Record<string, string> = {};
    const parts: { ns: string; part: PackPart }[] = [];
    const root =
        [...files.keys()].find((k) => k.endsWith("pack.mcmeta"))?.replace(/pack\.mcmeta$/, "") ??
        "";
    try {
        const meta = JSON.parse(files.get(`${root}pack.mcmeta`) ?? "{}") as {
            pack?: { description?: unknown; pack_format?: unknown; min_format?: unknown };
        };
        if (typeof meta.pack?.description === "string") pack.description = meta.pack.description;
        const major =
            typeof meta.pack?.pack_format === "number"
                ? meta.pack.pack_format
                : Array.isArray(meta.pack?.min_format)
                  ? Number(meta.pack.min_format[0])
                  : null;
        const found = PACK_VERSIONS.findIndex((v) => v.major === major);
        if (found >= 0) pack.versionIndex = found;
    } catch {
        /* an unreadable pack.mcmeta keeps the defaults */
    }
    const namespaces = new Map<string, number>();
    for (const [full, text] of files) {
        if (!full.startsWith(root)) continue;
        const path = full.slice(root.length);
        if (path === "pack.mcmeta") continue;
        const m = /^data\/([a-z0-9_.-]+)\/(.+)$/.exec(path);
        if (m) namespaces.set(m[1]!, (namespaces.get(m[1]!) ?? 0) + 1);
        const fn = /^data\/([a-z0-9_.-]+)\/functions?\/(.+)\.mcfunction$/.exec(path);
        const tag = /^data\/([a-z0-9_.-]+)\/tags\/(items?|blocks?)\/(.+)\.json$/.exec(path);
        if (fn && fn[1] !== "minecraft") {
            pack.functions.push({
                name: fn[2]!,
                lines: text.replace(/\r/g, "").replace(/\n$/, "").split("\n"),
                onLoad: false,
                onTick: false,
            });
            continue;
        }
        if (tag && tag[1] !== "minecraft") {
            try {
                const t = JSON.parse(text) as { replace?: unknown; values?: unknown };
                if (Array.isArray(t.values) && t.values.every((v) => typeof v === "string")) {
                    pack.tags.push({
                        name: tag[3]!,
                        registry: tag[2]!.startsWith("item") ? "item" : "block",
                        values: t.values as string[],
                        replace: t.replace === true,
                    });
                    continue;
                }
            } catch {
                /* kept below */
            }
        }
        const load = /^data\/minecraft\/tags\/functions?\/(load|tick)\.json$/.exec(path);
        if (load) continue; // rebuilt from each function's switches below
        const part = partFromPath(path, text);
        if (part !== null) {
            parts.push({ ns: part.namespace ?? "", part });
            continue;
        }
        extra[path] = text;
    }
    const ns = [...namespaces]
        .filter(([n]) => n !== "minecraft")
        .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (ns !== undefined) pack.namespace = ns;
    for (const kind of ["load", "tick"] as const) {
        const text =
            files.get(`${root}data/minecraft/tags/function/${kind}.json`) ??
            files.get(`${root}data/minecraft/tags/functions/${kind}.json`);
        if (text === undefined) continue;
        try {
            for (const v of (JSON.parse(text) as { values?: string[] }).values ?? []) {
                const f = pack.functions.find((x) => `${pack.namespace}:${x.name}` === v);
                if (f) f[kind === "load" ? "onLoad" : "onTick"] = true;
            }
        } catch {
            /* ignore an unreadable tag */
        }
    }
    // A part under the pack's own namespace follows the namespace if it is renamed; one under
    // another namespace (an override of `minecraft`, say) keeps the namespace it came from.
    for (const { ns: from, part } of parts) {
        if (from === pack.namespace) delete part.namespace;
        (pack.parts ??= []).push(part);
    }
    try {
        const meta = JSON.parse(files.get(`${root}pack.mcmeta`) ?? "{}") as {
            overlays?: { entries?: { directory?: unknown; formats?: unknown; min_format?: unknown; max_format?: unknown }[] };
        };
        const major = (value: unknown): number | null =>
            typeof value === "number"
                ? value
                : Array.isArray(value)
                  ? Number(value[0])
                  : null;
        const index = (m: number | null, fallback: number): number => {
            const i = PACK_VERSIONS.findIndex((v) => v.major === m);
            return i >= 0 ? i : fallback;
        };
        for (const e of meta.overlays?.entries ?? []) {
            if (typeof e.directory !== "string") continue;
            const formats = e.formats as { min_inclusive?: unknown; max_inclusive?: unknown } | number | undefined;
            const lo =
                major(e.min_format) ??
                (typeof formats === "number" ? formats : major(formats?.min_inclusive));
            const hi =
                major(e.max_format) ??
                (typeof formats === "number" ? formats : major(formats?.max_inclusive));
            (pack.overlays ??= []).push({
                directory: e.directory,
                oldest: index(lo, PACK_VERSIONS.length - 1),
                newest: index(hi, 0),
            });
        }
    } catch {
        /* overlays stay empty when pack.mcmeta cannot be read */
    }
    pack.extraFiles = extra;
    return { pack, kept: Object.keys(extra).length };
}
