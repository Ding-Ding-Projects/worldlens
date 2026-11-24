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
