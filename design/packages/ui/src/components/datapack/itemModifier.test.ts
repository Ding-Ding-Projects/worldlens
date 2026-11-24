import { describe, expect, it } from "vitest";
import { newStep, readModifier, writeModifier, STEP_KINDS } from "./itemModifier.js";

describe("item modifier steps", () => {
    it("reads the common functions into typed steps and writes them back", () => {
        const text = JSON.stringify([
            { function: "minecraft:set_count", count: { type: "minecraft:uniform", min: 1, max: 3 } },
            { function: "minecraft:set_damage", damage: 0.5, add: true },
            { function: "minecraft:enchant_with_levels", levels: 30 },
            { function: "minecraft:set_name", name: { text: "Zap" } },
            { function: "minecraft:set_lore", lore: ["one", { text: "two" }], mode: "append" },
            { function: "minecraft:furnace_smelt", conditions: [{ condition: "minecraft:random_chance", chance: 0.5 }] },
        ]);
        const steps = readModifier(text)!;
        expect(steps.map((s) => s.kind)).toEqual([
            "set_count",
            "set_damage",
            "enchant_with_levels",
            "set_name",
            "set_lore",
            "furnace_smelt",
        ]);
        const back = JSON.parse(writeModifier(steps)) as Record<string, unknown>[];
        expect(back[0]).toEqual({ function: "minecraft:set_count", count: { type: "minecraft:uniform", min: 1, max: 3 } });
        expect(back[1]).toEqual({ function: "minecraft:set_damage", damage: 0.5, add: true });
        expect(back[2]).toEqual({ function: "minecraft:enchant_with_levels", levels: 30 });
        expect(back[4]).toEqual({ function: "minecraft:set_lore", lore: [{ text: "one" }, { text: "two" }], mode: "append" });
        expect(back[5]).toMatchObject({ conditions: [{ chance: 0.5 }] });
    });

    it("keeps a function it has no editor for exactly as it was", () => {
        const odd = { function: "minecraft:set_components", components: { "minecraft:rarity": "epic" } };
        const binomial = { function: "minecraft:set_count", count: { type: "minecraft:binomial", n: 3, p: 0.5 } };
        const steps = readModifier(JSON.stringify([odd, binomial]))!;
        expect(steps.map((s) => s.kind)).toEqual(["other", "other"]);
        expect(JSON.parse(writeModifier(steps))).toEqual([odd, binomial]);
    });

    it("accepts a single object, refuses what is not a modifier, and starts each kind valid", () => {
        expect(readModifier('{"function":"minecraft:explosion_decay"}')?.[0]?.kind).toBe("explosion_decay");
        expect(readModifier("[1, 2]")).toBeNull();
        expect(readModifier("{")).toBeNull();
        for (const kind of STEP_KINDS) {
            const written = JSON.parse(writeModifier([newStep(kind)])) as { function: string }[];
            expect(written[0]!.function).toBe(`minecraft:${kind}`);
        }
    });
});
