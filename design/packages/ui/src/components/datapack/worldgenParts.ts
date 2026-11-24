/**
 * Typed views over the world generation parts' JSON: placed features, ore veins, structure
 * spacing and noise settings.
 *
 * Every edit is a patch on the parsed file, not a rebuild, so a field this editor does not
 * draw is never lost: change the sea level and the noise router you wrote by hand stays as
 * it was. A placement step this editor does not know is shown by name and kept.
 */

type Json = Record<string, unknown>;

const obj = (v: unknown): Json | null =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : null;
const short = (id: unknown): string => (typeof id === "string" ? id.replace(/^minecraft:/, "") : "");

export function parseObject(text: string): Json | null {
    try {
        return obj(JSON.parse(text));
    } catch {
        return null;
    }
}

export const writeJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/* -------------------------------------------------------------------------- */
/* Placed features                                                             */
/* -------------------------------------------------------------------------- */

export type PlacementStep =
    | { kind: "count"; count: number }
    | { kind: "rarity_filter"; chance: number }
    | { kind: "in_square" }
    | { kind: "biome" }
    | { kind: "height_range"; spread: "uniform" | "trapezoid"; low: number; high: number }
    | { kind: "other"; name: string; raw: Json };

export const NEW_PLACEMENT_KINDS = ["count", "rarity_filter", "in_square", "height_range", "biome"] as const;
export type NewPlacementKind = (typeof NEW_PLACEMENT_KINDS)[number];

const absolute = (v: unknown): number | null => {
    const o = obj(v);
    return o !== null && typeof o["absolute"] === "number" && Object.keys(o).length === 1 ? o["absolute"] : null;
};

export function readPlacement(raw: Json): PlacementStep {
    const name = short(raw["type"]);
    const keys = Object.keys(raw).filter((k) => k !== "type");
    const other = (): PlacementStep => ({ kind: "other", name: name || "(no type)", raw });
    switch (name) {
        case "count":
            return typeof raw["count"] === "number" && keys.length === 1 ? { kind: "count", count: raw["count"] } : other();
        case "rarity_filter":
            return typeof raw["chance"] === "number" && keys.length === 1 ? { kind: "rarity_filter", chance: raw["chance"] } : other();
        case "in_square":
        case "biome":
            return keys.length === 0 ? { kind: name } : other();
        case "height_range": {
            const h = obj(raw["height"]);
            if (h === null || keys.length !== 1) return other();
            const spread = short(h["type"]);
            const low = absolute(h["min_inclusive"]);
            const high = absolute(h["max_inclusive"]);
            const extra = Object.keys(h).filter((k) => !["type", "min_inclusive", "max_inclusive"].includes(k));
            if ((spread !== "uniform" && spread !== "trapezoid") || low === null || high === null || extra.length > 0)
                return other();
            return { kind: "height_range", spread, low, high };
        }
        default:
            return other();
    }
}

export function writePlacement(step: PlacementStep): Json {
    switch (step.kind) {
        case "other":
            return step.raw;
        case "count":
            return { type: "minecraft:count", count: step.count };
        case "rarity_filter":
            return { type: "minecraft:rarity_filter", chance: step.chance };
        case "height_range":
            return {
                type: "minecraft:height_range",
                height: {
                    type: `minecraft:${step.spread}`,
                    min_inclusive: { absolute: step.low },
                    max_inclusive: { absolute: step.high },
                },
            };
        default:
            return { type: `minecraft:${step.kind}` };
    }
}

export function newPlacement(kind: NewPlacementKind): PlacementStep {
    switch (kind) {
        case "count":
            return { kind, count: 4 };
        case "rarity_filter":
            return { kind, chance: 8 };
        case "height_range":
            return { kind, spread: "uniform", low: -64, high: 16 };
        default:
            return { kind };
    }
}

export interface PlacedFeature {
    feature: string;
    steps: PlacementStep[];
}

export function readPlaced(text: string): PlacedFeature | null {
    const o = parseObject(text);
    if (o === null || !Array.isArray(o["placement"])) return null;
    const steps = (o["placement"] as unknown[]).map((s) => obj(s));
    if (steps.some((s) => s === null)) return null;
    return {
        feature: typeof o["feature"] === "string" ? o["feature"] : "",
        steps: (steps as Json[]).map(readPlacement),
    };
}

/** Writes the placed feature back, keeping any field this view does not cover. */
export function writePlaced(text: string, placed: PlacedFeature): string {
    const o = parseObject(text) ?? {};
    return writeJson({ ...o, feature: placed.feature, placement: placed.steps.map(writePlacement) });
}

/** The Y band a placed feature can land in, from its height range steps, or null. */
export function placedBand(placed: PlacedFeature): { low: number; high: number } | null {
    const range = placed.steps.find((s) => s.kind === "height_range");
    if (range === undefined || range.kind !== "height_range") return null;
    return { low: Math.min(range.low, range.high), high: Math.max(range.low, range.high) };
}

/* -------------------------------------------------------------------------- */
/* Patches on single fields                                                    */
/* -------------------------------------------------------------------------- */

/** Reads the value at a dotted path, with numeric parts as array indexes. */
export function getAt(o: unknown, path: string): unknown {
    let at: unknown = o;
    for (const part of path.split(".")) {
        if (at === null || typeof at !== "object") return undefined;
        at = (at as Record<string, unknown>)[part];
    }
    return at;
}

/** Sets the value at a dotted path, creating objects on the way. Arrays must already exist. */
export function setAt(text: string, path: string, value: unknown): string {
    const root = parseObject(text) ?? {};
    const parts = path.split(".");
    let at: Record<string, unknown> = root;
    for (const part of parts.slice(0, -1)) {
        const next = at[part];
        if (next === null || typeof next !== "object") at[part] = {};
        at = at[part] as Record<string, unknown>;
    }
    at[parts.at(-1)!] = value;
    return writeJson(root);
}

/* -------------------------------------------------------------------------- */
/* Structure sets                                                              */
/* -------------------------------------------------------------------------- */

/** A random_spread placement's spacing and separation, or null for any other placement. */
export function readSpread(text: string): { spacing: number; separation: number } | null {
    const o = parseObject(text);
    const p = obj(o?.["placement"]);
    if (p === null || short(p["type"]) !== "random_spread") return null;
    const spacing = p["spacing"];
    const separation = p["separation"];
    if (typeof spacing !== "number" || typeof separation !== "number") return null;
    return { spacing, separation };
}

/** The game refuses a spread whose separation is not smaller than its spacing. */
export const spreadProblem = (s: { spacing: number; separation: number }): string | null =>
    s.separation >= s.spacing ? "Separation has to be smaller than spacing." : null;

/* -------------------------------------------------------------------------- */
/* Jigsaw pools                                                                */
/* -------------------------------------------------------------------------- */

export interface PoolPiece {
    weight: number;
    location: string;
    projection: "rigid" | "terrain_matching";
    /** The element object as it was, so fields with no control here are kept. */
    raw: Json;
    /** False for an element kind other than a single or legacy single piece. */
    editable: boolean;
}

export function readPool(text: string): PoolPiece[] | null {
    const o = parseObject(text);
    if (o === null || !Array.isArray(o["elements"])) return null;
    const out: PoolPiece[] = [];
    for (const entry of o["elements"] as unknown[]) {
        const e = obj(entry);
        if (e === null) return null;
        const el = obj(e["element"]) ?? {};
        const kind = short(el["element_type"]);
        const editable = (kind === "single_pool_element" || kind === "legacy_single_pool_element") && typeof el["location"] === "string";
        out.push({
            weight: typeof e["weight"] === "number" ? e["weight"] : 1,
            location: typeof el["location"] === "string" ? el["location"] : "",
            projection: el["projection"] === "terrain_matching" ? "terrain_matching" : "rigid",
            raw: el,
            editable,
        });
    }
    return out;
}

export function writePool(text: string, pieces: readonly PoolPiece[]): string {
    const o = parseObject(text) ?? {};
    return writeJson({
        ...o,
        elements: pieces.map((p) => ({
            weight: p.weight,
            element: p.editable ? { ...p.raw, location: p.location, projection: p.projection } : p.raw,
        })),
    });
}

export function newPoolPiece(namespace: string): PoolPiece {
    return {
        weight: 1,
        location: `${namespace}:new_piece`,
        projection: "rigid",
        raw: { element_type: "minecraft:single_pool_element", location: `${namespace}:new_piece`, processors: "minecraft:empty", projection: "rigid" },
        editable: true,
    };
}

/* -------------------------------------------------------------------------- */
/* Processor lists                                                             */
/* -------------------------------------------------------------------------- */

export type Processor =
    | { kind: "block_rot"; integrity: number; raw: Json }
    | { kind: "gravity"; heightmap: string; offset: number; raw: Json }
    | { kind: "block_ignore"; blocks: string[]; raw: Json }
    | { kind: "other"; name: string; raw: Json };

export const NEW_PROCESSOR_KINDS = ["block_rot", "gravity", "block_ignore"] as const;

export function readProcessors(text: string): Processor[] | null {
    const o = parseObject(text);
    if (o === null || !Array.isArray(o["processors"])) return null;
    return (o["processors"] as unknown[]).map((entry): Processor => {
        const raw = obj(entry) ?? {};
        const name = short(raw["processor_type"]);
        if (name === "block_rot" && typeof raw["integrity"] === "number")
            return { kind: "block_rot", integrity: raw["integrity"], raw };
        if (name === "gravity")
            return {
                kind: "gravity",
                heightmap: typeof raw["heightmap"] === "string" ? raw["heightmap"] : "WORLD_SURFACE_WG",
                offset: typeof raw["offset"] === "number" ? raw["offset"] : 0,
                raw,
            };
        if (name === "block_ignore" && Array.isArray(raw["blocks"]) && (raw["blocks"] as unknown[]).every((b) => typeof obj(b)?.["Name"] === "string"))
            return { kind: "block_ignore", blocks: (raw["blocks"] as Json[]).map((b) => b["Name"] as string), raw };
        return { kind: "other", name: name || "(no type)", raw };
    });
}

export function writeProcessor(p: Processor): Json {
    switch (p.kind) {
        case "block_rot":
            return { ...p.raw, processor_type: "minecraft:block_rot", integrity: p.integrity };
        case "gravity":
            return { ...p.raw, processor_type: "minecraft:gravity", heightmap: p.heightmap, offset: p.offset };
        case "block_ignore":
            return { ...p.raw, processor_type: "minecraft:block_ignore", blocks: p.blocks.map((Name) => ({ Name })) };
        default:
            return p.raw;
    }
}

export function writeProcessors(text: string, list: readonly Processor[]): string {
    const o = parseObject(text) ?? {};
    return writeJson({ ...o, processors: list.map(writeProcessor) });
}

export function newProcessor(kind: (typeof NEW_PROCESSOR_KINDS)[number]): Processor {
    switch (kind) {
        case "block_rot":
            return { kind, integrity: 0.8, raw: {} };
        case "gravity":
            return { kind, heightmap: "WORLD_SURFACE_WG", offset: 0, raw: {} };
        default:
            return { kind, blocks: ["minecraft:structure_block"], raw: {} };
    }
}

/* -------------------------------------------------------------------------- */
/* Rule processor rules                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One rule of a rule processor, in the shapes people write: a block or a block tag (with a
 * chance, or every time) becomes another block, anywhere or only where the block it replaces
 * sits on a given block or tag. A tag is written as `#name`. Any other rule (a position
 * predicate, block state matches, output with properties) is kept as written (`editable` false).
 */
export interface SwapRule {
    /** `minecraft:stone` or `#minecraft:base_stone_overworld`. */
    from: string;
    /** 1 means every match; below 1 is the random match's probability. */
    chance: number;
    to: string;
    /** Empty for anywhere; otherwise the block or `#tag` that must be at the location. */
    where: string;
    /**
     * A fade along one axis from the structure's start (`axis_aligned_linear_pos`): the
     * chance goes from `minChance` at `minDist` blocks to `maxChance` at `maxDist`. Null for none.
     */
    position: { axis: "x" | "y" | "z"; minChance: number; maxChance: number; minDist: number; maxDist: number } | null;
    raw: Json;
    editable: boolean;
}

/** Reads a block_match / tag_match family predicate as `id` or `#tag`, with its chance. */
function matchOf(p: Json | null): { what: string; chance: number } | null {
    if (p === null) return null;
    const kind = short(p["predicate_type"]);
    const extra = Object.keys(p).filter((k) => !["predicate_type", "block", "tag", "probability"].includes(k));
    if (extra.length > 0) return null;
    const chance = typeof p["probability"] === "number" ? p["probability"] : 1;
    if ((kind === "block_match" || kind === "random_block_match") && typeof p["block"] === "string")
        return { what: p["block"], chance: kind === "random_block_match" ? chance : 1 };
    if ((kind === "tag_match" || kind === "random_tag_match") && typeof p["tag"] === "string")
        return { what: `#${p["tag"]}`, chance: kind === "random_tag_match" ? chance : 1 };
    return null;
}

function writeMatch(what: string, chance: number): Json {
    const tag = what.startsWith("#");
    const id = tag ? what.slice(1) : what;
    if (chance >= 1) return tag ? { predicate_type: "minecraft:tag_match", tag: id } : { predicate_type: "minecraft:block_match", block: id };
    return tag
        ? { predicate_type: "minecraft:random_tag_match", tag: id, probability: chance }
        : { predicate_type: "minecraft:random_block_match", block: id, probability: chance };
}

/** undefined when the predicate is there but not one this editor draws; null for none. */
function readPosition(value: unknown): SwapRule["position"] | undefined {
    if (value === undefined) return null;
    const p = obj(value);
    if (p === null) return undefined;
    const kind = short(p["predicate_type"]);
    if (kind === "always_true") return null;
    if (kind !== "axis_aligned_linear_pos") return undefined;
    const axis = p["axis"] ?? "y";
    const num = (k: string, d: number): number | null => (p[k] === undefined ? d : typeof p[k] === "number" ? (p[k] as number) : null);
    const minChance = num("min_chance", 0);
    const maxChance = num("max_chance", 0);
    const minDist = num("min_dist", 0);
    const maxDist = num("max_dist", 0);
    if ((axis !== "x" && axis !== "y" && axis !== "z") || minChance === null || maxChance === null || minDist === null || maxDist === null)
        return undefined;
    return { axis, minChance, maxChance, minDist, maxDist };
}

export function readRules(processor: Json): SwapRule[] | null {
    if (short(processor["processor_type"]) !== "rule" || !Array.isArray(processor["rules"])) return null;
    return (processor["rules"] as unknown[]).map((entry): SwapRule => {
        const raw = obj(entry) ?? {};
        const input = matchOf(obj(raw["input_predicate"]));
        const locationRaw = obj(raw["location_predicate"]);
        const location =
            locationRaw === null || short(locationRaw["predicate_type"]) === "always_true"
                ? { what: "", chance: 1 }
                : matchOf(locationRaw);
        const output = obj(raw["output_state"]);
        const position = readPosition(raw["position_predicate"]);
        const fine =
            input !== null &&
            location !== null &&
            location.chance === 1 &&
            position !== undefined &&
            raw["block_entity_modifier"] === undefined &&
            output !== null &&
            typeof output["Name"] === "string" &&
            Object.keys(output).length === 1;
        return {
            from: fine ? input!.what : "",
            chance: fine ? input!.chance : 1,
            to: fine ? (output!["Name"] as string) : "",
            where: fine ? location!.what : "",
            position: fine ? (position ?? null) : null,
            raw,
            editable: fine,
        };
    });
}

export function writeRule(rule: SwapRule): Json {
    if (!rule.editable) return rule.raw;
    const { position_predicate: _old, ...rest } = rule.raw;
    return {
        ...rest,
        input_predicate: writeMatch(rule.from, rule.chance),
        location_predicate: rule.where === "" ? { predicate_type: "minecraft:always_true" } : writeMatch(rule.where, 1),
        output_state: { Name: rule.to },
        ...(rule.position === null
            ? {}
            : {
                  position_predicate: {
                      predicate_type: "minecraft:axis_aligned_linear_pos",
                      axis: rule.position.axis,
                      min_chance: rule.position.minChance,
                      max_chance: rule.position.maxChance,
                      min_dist: rule.position.minDist,
                      max_dist: rule.position.maxDist,
                  },
              }),
    };
}

export const newRule = (): SwapRule => ({
    from: "minecraft:cobblestone",
    chance: 0.3,
    to: "minecraft:mossy_cobblestone",
    where: "",
    position: null,
    raw: {},
    editable: true,
});

/* -------------------------------------------------------------------------- */
/* Enchantment effects                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One value effect of an enchantment in its common shape: an `add` or `multiply` by a number
 * that grows with the level (`linear`) or stays the same (a plain number). Effects of any
 * other shape, and requirements on them, are kept as written.
 */
export interface LevelValueEffect {
    component: string;
    /** Set for a `minecraft:attributes` entry: which attribute, how, and its modifier id. */
    attribute?: {
        id: string;
        attribute: string;
        operation: "add_value" | "add_multiplied_base" | "add_multiplied_total";
    };
    /**
     * Set for an "after an attack" action instead of a value: who carries the enchantment
     * (`attacker` or `victim`), who it acts on, and what it does. `base`/`perLevel` are then
     * the fire duration in seconds; for a mob effect they are its length in seconds.
     */
    action?: {
        enchanted: "attacker" | "victim";
        affected: "attacker" | "victim";
        kind: "ignite" | "apply_mob_effect" | "summon_entity" | "explode" | "run_function" | "play_sound";
        /** run_function: the function id. play_sound: the sound id. */
        target?: string;
        mobEffect: string;
        amplifier: number;
        /** summon_entity: the entity summoned. */
        entity?: string;
        /** explode: whether it sets fire, and what it does to blocks. */
        createFire?: boolean;
        blockInteraction?: "none" | "block" | "mob" | "tnt" | "trigger";
        /** A `random_chance` requirement, 0 to 1; undefined for none. */
        chance?: number | undefined;
    };
    operation: "add" | "multiply";
    base: number;
    perLevel: number;
    raw: Json;
    editable: boolean;
}

/** Value effect components the editor offers for a new effect. */
export const VALUE_EFFECT_COMPONENTS = [
    "minecraft:damage",
    "minecraft:armor_effectiveness",
    "minecraft:knockback",
    "minecraft:damage_protection",
    "minecraft:item_damage",
    "minecraft:ammo_use",
    "minecraft:projectile_piercing",
    "minecraft:projectile_count",
    "minecraft:projectile_spread",
    "minecraft:crossbow_charge_time",
    "minecraft:trident_spin_attack_strength",
    "minecraft:fishing_time_reduction",
    "minecraft:fishing_luck_bonus",
    "minecraft:block_experience",
    "minecraft:mob_experience",
    "minecraft:repair_with_xp",
    "minecraft:equipment_drops",
] as const;

function levelNumber(v: unknown): { base: number; perLevel: number } | null {
    if (typeof v === "number") return { base: v, perLevel: 0 };
    const o = obj(v);
    if (o !== null && short(o["type"]) === "linear" && typeof o["base"] === "number" && typeof o["per_level_above_first"] === "number")
        return { base: o["base"], perLevel: o["per_level_above_first"] };
    return null;
}

export function readEffects(enchantment: Json): LevelValueEffect[] {
    const effects = obj(enchantment["effects"]);
    if (effects === null) return [];
    const out: LevelValueEffect[] = [];
    for (const [component, list] of Object.entries(effects)) {
        if (!Array.isArray(list)) {
            out.push({ component, operation: "add", base: 0, perLevel: 0, raw: { __whole: list }, editable: false });
            continue;
        }
        for (const entry of list as unknown[]) {
            const raw = obj(entry) ?? {};
            const effect = obj(raw["effect"]);
            if (component === "minecraft:attributes") {
                const amount = levelNumber(raw["amount"]);
                const op = raw["operation"];
                const fine =
                    typeof raw["id"] === "string" &&
                    typeof raw["attribute"] === "string" &&
                    amount !== null &&
                    (op === "add_value" || op === "add_multiplied_base" || op === "add_multiplied_total") &&
                    Object.keys(raw).length === 4;
                out.push(
                    fine
                        ? { component, operation: "add", base: amount!.base, perLevel: amount!.perLevel, raw, editable: true, attribute: { id: raw["id"] as string, attribute: raw["attribute"] as string, operation: op } }
                        : { component, operation: "add", base: 0, perLevel: 0, raw, editable: false },
                );
                continue;
            }
            if (component === "minecraft:post_attack") {
                out.push(readAction(component, raw));
                continue;
            }
            const op = short(effect?.["type"]);
            const value = levelNumber(effect?.["value"] ?? effect?.["factor"]);
            const fine =
                effect !== null &&
                (op === "add" || op === "multiply") &&
                value !== null &&
                Object.keys(raw).every((k) => k === "effect") &&
                Object.keys(effect).length === 2;
            out.push({
                component,
                operation: op === "multiply" ? "multiply" : "add",
                base: value?.base ?? 0,
                perLevel: value?.perLevel ?? 0,
                raw,
                editable: fine,
            });
        }
    }
    return out;
}

const PARTY = (v: unknown): "attacker" | "victim" | null =>
    v === "attacker" || v === "victim" ? v : null;

/** An "after an attack" entry: set something on fire, or give it a mob effect. */
function readAction(component: string, raw: Json): LevelValueEffect {
    const kept: LevelValueEffect = { component, operation: "add", base: 0, perLevel: 0, raw, editable: false };
    const effect = obj(raw["effect"]);
    const enchanted = PARTY(raw["enchanted"]);
    const affected = PARTY(raw["affected"]);
    if (effect === null || enchanted === null || affected === null) return kept;
    if (Object.keys(raw).some((k) => !["effect", "enchanted", "affected", "requirements"].includes(k))) return kept;
    let chance: number | undefined;
    if (raw["requirements"] !== undefined) {
        const req = obj(raw["requirements"]);
        if (req === null || short(req["condition"]) !== "random_chance" || typeof req["chance"] !== "number" || Object.keys(req).length !== 2)
            return kept;
        chance = req["chance"];
    }
    const withChance = <T extends object>(a: T): T => (chance === undefined ? a : { ...a, chance });
    const type = short(effect["type"]);
    if (type === "run_function" && typeof effect["function"] === "string" && Object.keys(effect).length === 2)
        return { ...kept, editable: true, action: withChance({ enchanted, affected, kind: "run_function" as const, mobEffect: "", amplifier: 0, target: effect["function"] as string }) };
    if (type === "play_sound" && typeof effect["sound"] === "string" && Object.keys(effect).every((k) => ["type", "sound", "volume", "pitch"].includes(k)))
        return { ...kept, editable: true, action: withChance({ enchanted, affected, kind: "play_sound" as const, mobEffect: "", amplifier: 0, target: effect["sound"] as string }) };
    if (type === "summon_entity" && typeof effect["entity"] === "string" && Object.keys(effect).every((k) => ["type", "entity", "join_team"].includes(k))) {
        return { ...kept, editable: true, action: withChance({ enchanted, affected, kind: "summon_entity" as const, mobEffect: "", amplifier: 0, entity: effect["entity"] as string }) };
    }
    if (type === "explode") {
        const radius = levelNumber(effect["radius"]);
        const bi = effect["block_interaction"];
        const allowed = ["type", "radius", "create_fire", "block_interaction", "attribute_to_user", "small_particle", "large_particle", "sound"];
        if (radius !== null && (bi === "none" || bi === "block" || bi === "mob" || bi === "tnt" || bi === "trigger") && Object.keys(effect).every((k) => allowed.includes(k)))
            return {
                ...kept,
                raw,
                base: radius.base,
                perLevel: radius.perLevel,
                editable: true,
                action: withChance({ enchanted, affected, kind: "explode" as const, mobEffect: "", amplifier: 0, createFire: effect["create_fire"] === true, blockInteraction: bi }),
            };
    }
    if (type === "ignite" && Object.keys(effect).length === 2) {
        const d = levelNumber(effect["duration"]);
        if (d === null) return kept;
        return { ...kept, base: d.base, perLevel: d.perLevel, editable: true, action: withChance({ enchanted, affected, kind: "ignite" as const, mobEffect: "", amplifier: 0 }) };
    }
    if (type === "apply_mob_effect") {
        const toApply = effect["to_apply"];
        const min = levelNumber(effect["min_duration"]);
        const max = levelNumber(effect["max_duration"]);
        const amp = levelNumber(effect["min_amplifier"]);
        const ampMax = levelNumber(effect["max_amplifier"]);
        const same = (a: { base: number; perLevel: number } | null, b: { base: number; perLevel: number } | null) =>
            a !== null && b !== null && a.base === b.base && a.perLevel === b.perLevel;
        if (typeof toApply !== "string" || !same(min, max) || !same(amp, ampMax) || amp!.perLevel !== 0) return kept;
        if (Object.keys(effect).length !== 6) return kept;
        return {
            ...kept,
            base: min!.base,
            perLevel: min!.perLevel,
            editable: true,
            action: withChance({ enchanted, affected, kind: "apply_mob_effect" as const, mobEffect: toApply, amplifier: amp!.base }),
        };
    }
    return kept;
}

function writeEffect(e: LevelValueEffect): unknown {
    if (!e.editable) return e.raw;
    if (e.attribute !== undefined) {
        const amount = e.perLevel === 0 ? e.base : { type: "minecraft:linear", base: e.base, per_level_above_first: e.perLevel };
        return { id: e.attribute.id, attribute: e.attribute.attribute, amount, operation: e.attribute.operation };
    }
    if (e.action !== undefined) {
        const seconds =
            e.perLevel === 0 ? e.base : { type: "minecraft:linear", base: e.base, per_level_above_first: e.perLevel };
        const a = e.action;
        const oldEffect = obj(e.raw["effect"]) ?? {};
        const effect =
            a.kind === "run_function"
                ? { type: "minecraft:run_function", function: a.target ?? "" }
                : a.kind === "play_sound"
                  ? { volume: 1, pitch: 1, ...oldEffect, type: "minecraft:play_sound", sound: a.target ?? "minecraft:entity.generic.explode" }
                  : a.kind === "summon_entity"
                ? { ...oldEffect, type: "minecraft:summon_entity", entity: a.entity ?? "minecraft:lightning_bolt" }
                : a.kind === "explode"
                  ? {
                        sound: "minecraft:entity.generic.explode",
                        small_particle: { type: "minecraft:explosion" },
                        large_particle: { type: "minecraft:explosion_emitter" },
                        ...oldEffect,
                        type: "minecraft:explode",
                        radius: seconds,
                        create_fire: a.createFire === true,
                        block_interaction: a.blockInteraction ?? "none",
                    }
                  : null;
        if (effect !== null)
            return {
                ...(a.chance === undefined ? {} : { requirements: { condition: "minecraft:random_chance", chance: a.chance } }),
                enchanted: a.enchanted,
                affected: a.affected,
                effect,
            };
        return {
            ...(a.chance === undefined ? {} : { requirements: { condition: "minecraft:random_chance", chance: a.chance } }),
            enchanted: e.action.enchanted,
            affected: e.action.affected,
            effect:
                e.action.kind === "ignite"
                    ? { type: "minecraft:ignite", duration: seconds }
                    : {
                          type: "minecraft:apply_mob_effect",
                          to_apply: e.action.mobEffect,
                          min_duration: seconds,
                          max_duration: seconds,
                          min_amplifier: e.action.amplifier,
                          max_amplifier: e.action.amplifier,
                      },
        };
    }
    const value =
        e.perLevel === 0 ? e.base : { type: "minecraft:linear", base: e.base, per_level_above_first: e.perLevel };
    return {
        effect:
            e.operation === "add"
                ? { type: "minecraft:add", value }
                : { type: "minecraft:multiply", factor: value },
    };
}

/** Writes the effects back, grouped by component in first-seen order, keeping other fields. */
export function writeEffects(text: string, effects: readonly LevelValueEffect[]): string {
    const o = parseObject(text) ?? {};
    const grouped: Record<string, unknown> = {};
    for (const e of effects) {
        if (!e.editable && "__whole" in e.raw) {
            grouped[e.component] = e.raw["__whole"];
            continue;
        }
        const list = (grouped[e.component] as unknown[] | undefined) ?? [];
        list.push(writeEffect(e));
        grouped[e.component] = list;
    }
    return writeJson({ ...o, effects: grouped });
}

export const newAction = (kind: "ignite" | "apply_mob_effect" | "summon_entity" | "explode" | "run_function" | "play_sound"): LevelValueEffect => ({
    component: "minecraft:post_attack",
    operation: "add",
    base: kind === "ignite" ? 4 : kind === "explode" ? 2 : 3,
    perLevel: kind === "ignite" ? 4 : kind === "explode" ? 0.5 : 1,
    raw: {},
    editable: true,
    action: {
        enchanted: "attacker",
        affected: "victim",
        kind,
        mobEffect: "minecraft:slowness",
        amplifier: 0,
        ...(kind === "summon_entity" ? { entity: "minecraft:lightning_bolt", chance: 0.2 } : {}),
        ...(kind === "explode" ? { createFire: false, blockInteraction: "none" as const, chance: 0.1 } : {}),
        ...(kind === "run_function" ? { target: "my_pack:on_hit" } : {}),
        ...(kind === "play_sound" ? { target: "minecraft:entity.experience_orb.pickup" } : {}),
    },
});

export const newAttribute = (namespace: string): LevelValueEffect => ({
    component: "minecraft:attributes",
    operation: "add",
    base: 0.1,
    perLevel: 0.05,
    raw: {},
    editable: true,
    attribute: { id: `${namespace}:enchantment_bonus`, attribute: "minecraft:movement_speed", operation: "add_multiplied_base" },
});

export const newEffect = (component: string): LevelValueEffect => ({
    component,
    operation: "add",
    base: 1,
    perLevel: 0.5,
    raw: {},
    editable: true,
});
