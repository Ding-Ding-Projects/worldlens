// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import WorldgenPartEditor from "./WorldgenPartEditor.vue";
import { newPart } from "./datapackParts.js";

globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
} as unknown as typeof ResizeObserver;

function make(kind: string, text = newPart(kind, "x", "p").text) {
    return mount(WorldgenPartEditor, {
        props: { kind, text },
        global: {
            plugins: [
                createVuetify({ components, directives }),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
        },
    });
}
const last = (w: ReturnType<typeof make>): Record<string, unknown> =>
    JSON.parse((w.emitted("update:text")!.at(-1) as [string])[0]) as Record<string, unknown>;

describe("WorldgenPartEditor", () => {
    it("shows placement steps with a depth gauge, and adds a step", async () => {
        const w = make("placed_feature");
        expect(w.findAll(".wl-wg__step")).toHaveLength(4);
        expect(w.find("svg.wl-wg__gauge").attributes("aria-label")).toBe("Lands between Y -64 and Y 16");
        await w.findAll("button").find((b) => b.text() === "Add step")!.trigger("click");
        const placement = last(w)["placement"] as { type: string }[];
        expect(placement.at(-1)!.type).toBe("minecraft:rarity_filter");
    });

    it("draws the structure grid and warns when separation is not smaller", () => {
        const ok = make("structure_set");
        expect(ok.findAll(".wl-wg__dot")).toHaveLength(16);
        const bad = make("structure_set", JSON.stringify({ structures: [], placement: { type: "minecraft:random_spread", spacing: 8, separation: 8, salt: 1 } }));
        expect(bad.text()).toContain("Separation has to be smaller than spacing");
    });

    it("edits noise settings switches without losing other fields", async () => {
        const w = make("noise_settings");
        const swAquifer = w.findAll("input[type='checkbox']")[0]!;
        await swAquifer.setValue(false);
        const out = last(w);
        expect(out["aquifers_enabled"]).toBe(false);
        expect((out["noise"] as { height: number }).height).toBe(384);
    });

    it("says when the JSON cannot be edited here", () => {
        expect(make("noise_settings", "{").text()).toContain("Fix the JSON below");
        expect(make("configured_feature", '{"type":"minecraft:tree","config":{}}').find(".wl-wg__row").exists()).toBe(false);
    });
});

describe("WorldgenPartEditor pools and processors", () => {
    it("shows each jigsaw piece's share of the picks and adds a piece", async () => {
        const w = make("template_pool");
        expect(w.text()).toContain("Weight (100% of picks)");
        await w.findAll("button").find((b) => b.text() === "Add a piece")!.trigger("click");
        const elements = last(w)["elements"] as unknown[];
        expect(elements).toHaveLength(2);
    });

    it("draws the rot processor and adds another step", async () => {
        const w = make("processor_list");
        expect(w.text()).toContain("Rot (lose some blocks)");
        await w.findAll("button").find((b) => b.text() === "Add step")!.trigger("click");
        const procs = last(w)["processors"] as { processor_type: string }[];
        expect(procs.at(-1)!.processor_type).toBe("minecraft:block_rot");
    });
});

describe("rule swaps and enchantment effects", async () => {
    const { default: EnchantmentEffects } = await import("./EnchantmentEffects.vue");
    it("adds a swap rule inside a rule processor", async () => {
        const w = make("processor_list", JSON.stringify({ processors: [{ processor_type: "minecraft:rule", rules: [] }] }));
        await w.findAll("button").find((b) => b.text() === "Add a rule")!.trigger("click");
        const rules = (last(w)["processors"] as { rules: { output_state: { Name: string } }[] }[])[0]!.rules;
        expect(rules[0]!.output_state.Name).toBe("minecraft:mossy_cobblestone");
    });

    it("adds an effect to an enchantment and keeps its other fields", async () => {
        const text = newPart("enchantment", "zap", "p").text;
        const w = mount(EnchantmentEffects, {
            props: { text },
            global: { plugins: [createVuetify({ components, directives }), createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false })] },
        });
        expect(w.text()).toContain("No effects yet");
        await w.findAll("button").find((b) => b.text() === "Add effect")!.trigger("click");
        const out = JSON.parse((w.emitted("update:text")!.at(-1) as [string])[0]) as { effects: Record<string, unknown>; max_level: number };
        expect(Object.keys(out.effects)).toEqual(["minecraft:damage"]);
        expect(out.max_level).toBe(3);
    });
});
