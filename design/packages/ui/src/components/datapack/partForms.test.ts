// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import PartForm from "./PartForm.vue";
import { NEW_PART_KINDS, newPart } from "./datapackParts.js";
import { PART_FORMS, hasForm } from "./partForms.js";
import { getAt } from "./worldgenParts.js";

globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
} as unknown as typeof ResizeObserver;

describe("registry part forms", () => {
    it("covers every new part kind that has no editor of its own", () => {
        const own = new Set(["item_modifier", "placed_feature", "configured_feature", "structure_set", "noise_settings", "processor_list", "template_pool"]);
        for (const k of NEW_PART_KINDS) if (!own.has(k.id)) expect(hasForm(k.id), k.id).toBe(true);
    });

    it("keeps every number field's template value inside the slider's range", () => {
        for (const [kind, fields] of Object.entries(PART_FORMS)) {
            const doc = JSON.parse(newPart(kind, "x", "p").text) as unknown;
            for (const f of fields) {
                const v = getAt(doc, f.path);
                if (f.kind === "number" && typeof v === "number") {
                    expect(v, `${kind} ${f.path}`).toBeGreaterThanOrEqual(f.min);
                    expect(v, `${kind} ${f.path}`).toBeLessThanOrEqual(f.max);
                }
                if (f.kind === "choice" && typeof v === "string") expect(f.options, `${kind} ${f.path}`).toContain(v);
            }
        }
    });

    it("patches one field and keeps the rest", async () => {
        const text = newPart("dimension_type", "x", "p").text;
        const w = mount(PartForm, {
            props: { kind: "dimension_type", text },
            global: { plugins: [createVuetify({ components, directives }), createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false })] },
        });
        await w.findAll("input[type='checkbox']")[0]!.setValue(false);
        const out = JSON.parse((w.emitted("update:text")!.at(-1) as [string])[0]) as Record<string, unknown>;
        expect(out["has_skylight"]).toBe(false);
        expect(out["infiniburn"]).toBe("#minecraft:infiniburn_overworld");
    });
});
