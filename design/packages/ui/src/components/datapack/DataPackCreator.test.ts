// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import DataPackCreator from "./DataPackCreator.vue";

function make() {
    return mount(DataPackCreator, {
        global: {
            plugins: [
                createVuetify({ components, directives }),
                createI18n({
                    legacy: false,
                    locale: "en",
                    missingWarn: false,
                    fallbackWarn: false,
                }),
            ],
            stubs: { CommandBuilder: true },
        },
    });
}

globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
} as unknown as typeof ResizeObserver;

describe("DataPackCreator", () => {
    beforeEach(() => localStorage.clear());

    it("adds a recipe, paints the grid and reports what is missing", async () => {
        const w = make();
        await w
            .findAll("button")
            .find((b) => b.text() === "Add")!
            .trigger("click");
        expect(w.text()).toContain("Put at least one item in the grid.");
        const slot = w.find('[aria-label="Slot 5: empty"]');
        await slot.trigger("click");
        expect(w.find('[aria-label="Slot 5: diamond"]').exists()).toBe(true);
        expect(w.text()).not.toContain("Put at least one item in the grid.");
        expect(w.text()).toContain("Choose what it makes.");
        const save = w.findAll("button").find((b) => b.text() === "Save as .zip")!;
        expect(save.attributes("disabled")).toBeDefined();
    });

    it("keeps the draft between visits", async () => {
        const w = make();
        await w
            .findAll("button")
            .find((b) => b.text() === "Add")!
            .trigger("click");
        await flushPromises();
        w.unmount();
        const again = make();
        expect(again.text()).toContain("new_recipe");
        expect(again.text()).toMatch(/Recipes\s*1/);
    });

    it("switches to functions and adds one", async () => {
        const w = make();
        await w
            .findAll('[role="option"]')
            .find((b) => b.text().startsWith("Functions"))!
            .trigger("click");
        await w
            .findAll("button")
            .find((b) => b.text() === "Add")!
            .trigger("click");
        expect(w.text()).toContain("Run every tick");
        expect(w.text()).toContain("No problems found");
    });
});
