import { describe, expect, it } from "vitest";
import { newPart } from "./datapackParts.js";
import {
    NEW_PLACEMENT_KINDS,
    getAt,
    newPlacement,
    placedBand,
    readPlaced,
    readSpread,
    setAt,
    spreadProblem,
    writePlaced,
} from "./worldgenParts.js";

describe("placed features", () => {
    it("reads the template into typed steps and writes the same file back", () => {
        const text = newPart("placed_feature", "deep", "my_pack").text;
        const placed = readPlaced(text)!;
        expect(placed.steps.map((s) => s.kind)).toEqual(["count", "in_square", "height_range", "biome"]);
        expect(placedBand(placed)).toEqual({ low: -64, high: 16 });
        expect(JSON.parse(writePlaced(text, placed))).toEqual(JSON.parse(text));
    });

    it("keeps an unknown step and any extra field, and starts every new step valid", () => {
        const text = JSON.stringify({
            feature: "a:b",
            placement: [{ type: "minecraft:surface_water_depth_filter", max_water_depth: 0 }],
            note: "mine",
        });
        const placed = readPlaced(text)!;
        expect(placed.steps[0]).toMatchObject({ kind: "other", name: "surface_water_depth_filter" });
        placed.steps.push(...NEW_PLACEMENT_KINDS.map(newPlacement));
        const back = JSON.parse(writePlaced(text, placed)) as { placement: { type: string }[]; note: string };
        expect(back.note).toBe("mine");
        expect(back.placement.map((p) => p.type)).toEqual([
            "minecraft:surface_water_depth_filter",
            "minecraft:count",
            "minecraft:rarity_filter",
            "minecraft:in_square",
            "minecraft:height_range",
            "minecraft:biome",
        ]);
        expect(readPlaced("[]")).toBeNull();
    });
});

describe("field patches", () => {
    it("changes one field and keeps the rest", () => {
        const text = newPart("noise_settings", "n", "p").text;
        const next = setAt(text, "sea_level", 40);
        expect(getAt(JSON.parse(next), "sea_level")).toBe(40);
        expect(getAt(JSON.parse(next), "noise.height")).toBe(384);
        const ore = setAt(newPart("configured_feature", "o", "p").text, "config.targets.0.state.Name", "minecraft:emerald_ore");
        expect(getAt(JSON.parse(ore), "config.targets.0.state.Name")).toBe("minecraft:emerald_ore");
        expect(getAt(JSON.parse(ore), "config.targets.0.target.tag")).toBe("minecraft:stone_ore_replaceables");
    });
});

describe("structure spacing", () => {
    it("reads a random spread and flags a separation that is not smaller", () => {
        const text = newPart("structure_set", "s", "p").text;
        expect(readSpread(text)).toEqual({ spacing: 32, separation: 8 });
        expect(spreadProblem({ spacing: 8, separation: 8 })).not.toBeNull();
        expect(readSpread('{"placement":{"type":"minecraft:concentric_rings"}}')).toBeNull();
    });
});

describe("jigsaw pools and processors", async () => {
    const m = await import("./worldgenParts.js");
    it("edits pieces and keeps an element kind it cannot draw", () => {
        const text = JSON.stringify({
            fallback: "minecraft:empty",
            elements: [
                { weight: 2, element: { element_type: "minecraft:single_pool_element", location: "a:b", processors: "a:p", projection: "rigid" } },
                { weight: 1, element: { element_type: "minecraft:feature_pool_element", feature: "a:tree", projection: "rigid" } },
            ],
        });
        const pieces = m.readPool(text)!;
        expect(pieces.map((p) => p.editable)).toEqual([true, false]);
        pieces[0]!.weight = 5;
        pieces[0]!.projection = "terrain_matching";
        pieces.push(m.newPoolPiece("ns"));
        const back = JSON.parse(m.writePool(text, pieces)) as { fallback: string; elements: { weight: number; element: Record<string, unknown> }[] };
        expect(back.fallback).toBe("minecraft:empty");
        expect(back.elements[0]).toEqual({ weight: 5, element: { element_type: "minecraft:single_pool_element", location: "a:b", processors: "a:p", projection: "terrain_matching" } });
        expect(back.elements[1]!.element).toEqual({ element_type: "minecraft:feature_pool_element", feature: "a:tree", projection: "rigid" });
        expect(back.elements[2]!.element["location"]).toBe("ns:new_piece");
    });

    it("reads rot, gravity and ignore processors, and keeps a rule processor as written", () => {
        const rule = { processor_type: "minecraft:rule", rules: [{ output_state: { Name: "minecraft:air" } }] };
        const text = JSON.stringify({ processors: [{ processor_type: "minecraft:block_rot", integrity: 0.5, rottable_blocks: "#x" }, rule] });
        const list = m.readProcessors(text)!;
        expect(list.map((p) => p.kind)).toEqual(["block_rot", "other"]);
        list.push(...m.NEW_PROCESSOR_KINDS.map(m.newProcessor));
        const back = JSON.parse(m.writeProcessors(text, list)) as { processors: Record<string, unknown>[] };
        expect(back.processors[0]).toEqual({ processor_type: "minecraft:block_rot", integrity: 0.5, rottable_blocks: "#x" });
        expect(back.processors[1]).toEqual(rule);
        expect(back.processors.slice(2).map((p) => p["processor_type"])).toEqual(["minecraft:block_rot", "minecraft:gravity", "minecraft:block_ignore"]);
    });
});

describe("rule processor rules and enchantment effects", async () => {
    const m = await import("./worldgenParts.js");
    it("reads swap rules, writes a chance as random_block_match, and keeps an unusual rule", () => {
        const odd = { input_predicate: { predicate_type: "minecraft:block_match", block: "minecraft:stone" }, location_predicate: { predicate_type: "minecraft:always_true" }, position_predicate: { predicate_type: "minecraft:linear_pos", min_chance: 0, max_chance: 1 }, output_state: { Name: "minecraft:air" } };
        const rules = m.readRules({ processor_type: "minecraft:rule", rules: [{ input_predicate: { predicate_type: "minecraft:block_match", block: "minecraft:stone" }, location_predicate: { predicate_type: "minecraft:always_true" }, output_state: { Name: "minecraft:andesite" } }, odd] })!;
        expect(rules.map((r) => r.editable)).toEqual([true, false]);
        rules[0]!.chance = 0.25;
        expect(m.writeRule(rules[0]!)).toMatchObject({ input_predicate: { predicate_type: "minecraft:random_block_match", block: "minecraft:stone", probability: 0.25 } });
        expect(m.writeRule(rules[1]!)).toEqual(odd);
        expect(m.readRules({ processor_type: "minecraft:block_rot" })).toBeNull();
    });

    it("reads and writes tags and a where-condition on swap rules", () => {
        const rule = {
            input_predicate: { predicate_type: "minecraft:random_tag_match", tag: "minecraft:logs", probability: 0.5 },
            location_predicate: { predicate_type: "minecraft:tag_match", tag: "minecraft:dirt" },
            output_state: { Name: "minecraft:stripped_oak_log" },
        };
        const [read] = m.readRules({ processor_type: "minecraft:rule", rules: [rule] })!;
        expect(read).toMatchObject({ from: "#minecraft:logs", chance: 0.5, where: "#minecraft:dirt", editable: true });
        expect(m.writeRule(read!)).toEqual(rule);
        expect(m.writeRule({ ...read!, from: "minecraft:stone", chance: 1, where: "" })).toEqual({
            input_predicate: { predicate_type: "minecraft:block_match", block: "minecraft:stone" },
            location_predicate: { predicate_type: "minecraft:always_true" },
            output_state: { Name: "minecraft:stripped_oak_log" },
        });
    });

    it("reads level-scaled value effects and keeps everything else", () => {
        const text = JSON.stringify({
            max_level: 3,
            effects: {
                "minecraft:damage": [{ effect: { type: "minecraft:add", value: { type: "minecraft:linear", base: 1, per_level_above_first: 0.5 } } }],
                "minecraft:post_attack": [{ enchanted: "attacker", affected: "victim", effect: { type: "minecraft:ignite", duration: 4 } }],
                "minecraft:prevent_equipment_drop": {},
            },
        });
        const effects = m.readEffects(JSON.parse(text) as Record<string, unknown>);
        expect(effects.map((e) => `${e.component}:${e.editable}`)).toEqual(["minecraft:damage:true", "minecraft:post_attack:true", "minecraft:prevent_equipment_drop:false"]);
        expect(effects[1]!.action).toMatchObject({ enchanted: "attacker", affected: "victim", kind: "ignite" });
        effects[0]!.perLevel = 0;
        effects.push(m.newEffect("minecraft:knockback"));
        const back = JSON.parse(m.writeEffects(text, effects)) as { max_level: number; effects: Record<string, unknown> };
        expect(back.max_level).toBe(3);
        expect(back.effects["minecraft:damage"]).toEqual([{ effect: { type: "minecraft:add", value: 1 } }]);
        expect(back.effects["minecraft:post_attack"]).toEqual(JSON.parse(text).effects["minecraft:post_attack"]);
        expect(back.effects["minecraft:prevent_equipment_drop"]).toEqual({});
        expect(back.effects["minecraft:knockback"]).toEqual([{ effect: { type: "minecraft:add", value: { type: "minecraft:linear", base: 1, per_level_above_first: 0.5 } } }]);
    });

    it("writes a mob effect action and keeps one with requirements", async () => {
        const withReq = { requirements: { condition: "minecraft:all_of", terms: [] }, enchanted: "attacker", affected: "victim", effect: { type: "minecraft:ignite", duration: 4 } };
        const text = JSON.stringify({ effects: { "minecraft:post_attack": [withReq] } });
        const effects = m.readEffects(JSON.parse(text) as Record<string, unknown>);
        expect(effects[0]!.editable).toBe(false);
        effects.push(m.newAction("apply_mob_effect"));
        const back = JSON.parse(m.writeEffects(text, effects)) as { effects: Record<string, unknown[]> };
        expect(back.effects["minecraft:post_attack"]![0]).toEqual(withReq);
        expect(back.effects["minecraft:post_attack"]![1]).toEqual({
            enchanted: "attacker",
            affected: "victim",
            effect: { type: "minecraft:apply_mob_effect", to_apply: "minecraft:slowness", min_duration: { type: "minecraft:linear", base: 3, per_level_above_first: 1 }, max_duration: { type: "minecraft:linear", base: 3, per_level_above_first: 1 }, min_amplifier: 0, max_amplifier: 0 },
        });
        const reread = m.readEffects(back as unknown as Record<string, unknown>);
        expect(reread[1]!.editable).toBe(true);
    });
});

describe("summon, explode, chance requirements and position fades", async () => {
    const m = await import("./worldgenParts.js");
    it("reads and writes summon and explode actions with a random chance requirement", () => {
        const summon = { requirements: { condition: "minecraft:random_chance", chance: 0.2 }, enchanted: "attacker", affected: "victim", effect: { type: "minecraft:summon_entity", entity: "minecraft:lightning_bolt", join_team: false } };
        const boom = { enchanted: "attacker", affected: "victim", effect: { type: "minecraft:explode", radius: { type: "minecraft:linear", base: 2, per_level_above_first: 0.5 }, create_fire: true, block_interaction: "none", sound: "minecraft:entity.generic.explode", small_particle: { type: "minecraft:explosion" }, large_particle: { type: "minecraft:explosion_emitter" } } };
        const text = JSON.stringify({ effects: { "minecraft:post_attack": [summon, boom] } });
        const effects = m.readEffects(JSON.parse(text) as Record<string, unknown>);
        expect(effects.map((e) => [e.editable, e.action?.kind, e.action?.chance])).toEqual([[true, "summon_entity", 0.2], [true, "explode", undefined]]);
        expect(JSON.parse(m.writeEffects(text, effects))).toEqual(JSON.parse(text));
        const added = [...effects, m.newAction("explode"), m.newAction("summon_entity")];
        const back = JSON.parse(m.writeEffects(text, added)) as { effects: Record<string, Record<string, unknown>[]> };
        expect(back.effects["minecraft:post_attack"]![2]).toMatchObject({ requirements: { chance: 0.1 }, effect: { type: "minecraft:explode", block_interaction: "none" } });
        expect(back.effects["minecraft:post_attack"]![3]).toMatchObject({ effect: { type: "minecraft:summon_entity", entity: "minecraft:lightning_bolt" } });
    });

    it("reads a position fade on a swap rule and can remove it", () => {
        const rule = {
            input_predicate: { predicate_type: "minecraft:block_match", block: "minecraft:stone" },
            location_predicate: { predicate_type: "minecraft:always_true" },
            position_predicate: { predicate_type: "minecraft:axis_aligned_linear_pos", axis: "y", min_chance: 1, max_chance: 0, min_dist: 0, max_dist: 10 },
            output_state: { Name: "minecraft:andesite" },
        };
        const [r] = m.readRules({ processor_type: "minecraft:rule", rules: [rule] })!;
        expect(r).toMatchObject({ editable: true, position: { axis: "y", minChance: 1, maxChance: 0, minDist: 0, maxDist: 10 } });
        expect(m.writeRule(r!)).toEqual(rule);
        expect(m.writeRule({ ...r!, position: null })).not.toHaveProperty("position_predicate");
    });
});

describe("function and sound actions", async () => {
    const m = await import("./worldgenParts.js");
    it("reads, keeps and adds run_function and play_sound actions", () => {
        const fn = { enchanted: "attacker", affected: "victim", effect: { type: "minecraft:run_function", function: "p:hit" } };
        const snd = { enchanted: "attacker", affected: "attacker", effect: { type: "minecraft:play_sound", sound: "minecraft:block.bell.use", volume: 1, pitch: 1.5 } };
        const text = JSON.stringify({ effects: { "minecraft:post_attack": [fn, snd] } });
        const effects = m.readEffects(JSON.parse(text) as Record<string, unknown>);
        expect(effects.map((e) => [e.editable, e.action?.kind, e.action?.target])).toEqual([[true, "run_function", "p:hit"], [true, "play_sound", "minecraft:block.bell.use"]]);
        expect(JSON.parse(m.writeEffects(text, effects))).toEqual(JSON.parse(text));
        const back = JSON.parse(m.writeEffects(text, [...effects, m.newAction("run_function")])) as { effects: Record<string, Record<string, unknown>[]> };
        expect(back.effects["minecraft:post_attack"]![2]).toMatchObject({ effect: { type: "minecraft:run_function", function: "my_pack:on_hit" } });
    });
});

describe("attribute effects", async () => {
    const m = await import("./worldgenParts.js");
    it("reads, keeps and adds attribute modifiers", () => {
        const attr = { id: "p:speed", attribute: "minecraft:movement_speed", amount: { type: "minecraft:linear", base: 0.1, per_level_above_first: 0.05 }, operation: "add_multiplied_base" };
        const text = JSON.stringify({ effects: { "minecraft:attributes": [attr] } });
        const effects = m.readEffects(JSON.parse(text) as Record<string, unknown>);
        expect(effects[0]).toMatchObject({ editable: true, base: 0.1, perLevel: 0.05, attribute: { attribute: "minecraft:movement_speed" } });
        expect(JSON.parse(m.writeEffects(text, effects))).toEqual(JSON.parse(text));
        const back = JSON.parse(m.writeEffects(text, [...effects, m.newAttribute("ns")])) as { effects: Record<string, unknown[]> };
        expect(back.effects["minecraft:attributes"]).toHaveLength(2);
    });
});

describe("particles and item wear", async () => {
    const m = await import("./worldgenParts.js");
    it("reads particles keeping their positions, and writes item wear", () => {
        const fx = { enchanted: "attacker", affected: "victim", effect: { type: "minecraft:spawn_particles", particle: { type: "minecraft:flame" }, horizontal_position: { type: "entity_position", offset: 0 }, vertical_position: { type: "in_bounding_box" }, horizontal_velocity: { base: 0.1 }, vertical_velocity: {} } };
        const text = JSON.stringify({ effects: { "minecraft:post_attack": [fx] } });
        const effects = m.readEffects(JSON.parse(text) as Record<string, unknown>);
        expect(effects[0]).toMatchObject({ editable: true, action: { kind: "spawn_particles", target: "minecraft:flame" } });
        effects[0]!.action!.target = "minecraft:heart";
        const back = JSON.parse(m.writeEffects(text, [...effects, m.newAction("damage_item")])) as { effects: Record<string, Record<string, Record<string, unknown>>[]> };
        expect(back.effects["minecraft:post_attack"]![0]!.effect).toMatchObject({ particle: { type: "minecraft:heart" }, horizontal_position: { type: "entity_position", offset: 0 }, horizontal_velocity: { base: 0.1 } });
        expect(back.effects["minecraft:post_attack"]![1]!.effect).toEqual({ type: "minecraft:damage_item", amount: 1 });
    });
});

describe("block placing and flag requirements", async () => {
    const m = await import("./worldgenParts.js");
    it("reads a sneaking requirement and a placed block, and writes them back", () => {
        const web = { requirements: { condition: "minecraft:entity_properties", entity: "this", predicate: { flags: { is_sneaking: true } } }, enchanted: "attacker", affected: "victim", effect: { type: "minecraft:replace_block", block_state: { type: "minecraft:simple_state_provider", state: { Name: "minecraft:cobweb" } } } };
        const text = JSON.stringify({ effects: { "minecraft:post_attack": [web] } });
        const effects = m.readEffects(JSON.parse(text) as Record<string, unknown>);
        expect(effects[0]).toMatchObject({ editable: true, action: { kind: "replace_block", target: "minecraft:cobweb", flag: "is_sneaking" } });
        expect(JSON.parse(m.writeEffects(text, effects))).toEqual(JSON.parse(text));
    });
});

describe("biome requirements", async () => {
    const m = await import("./worldgenParts.js");
    it("reads and writes a biome location check", () => {
        const a = { requirements: { condition: "minecraft:location_check", predicate: { biomes: "#minecraft:is_ocean" } }, enchanted: "attacker", affected: "victim", effect: { type: "minecraft:ignite", duration: 4 } };
        const text = JSON.stringify({ effects: { "minecraft:post_attack": [a] } });
        const effects = m.readEffects(JSON.parse(text) as Record<string, unknown>);
        expect(effects[0]!.action).toMatchObject({ biome: "#minecraft:is_ocean" });
        expect(JSON.parse(m.writeEffects(text, effects))).toEqual(JSON.parse(text));
    });
});
