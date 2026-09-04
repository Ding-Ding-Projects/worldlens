// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import CreativeStudio from "./CreativeStudio.vue";

const i18n = createI18n({ legacy: false, locale: "en", messages: { en: { appearance: { creative: { eyebrow: "Creative appearance studio", subhead: "Compose layers locally." } } } } });
// Vuetify because the two searches are ConfigSearchField now rather than bare inputs, and
// it brings the anchored regex builder with it. Without the plugin every mount throws
// "Could not find defaults instance" before a single assertion runs.
const vuetify = createVuetify();
const mountStudio = (props = {}) =>
    mount(CreativeStudio, { props, global: { plugins: [i18n, vuetify] } });

describe("CreativeStudio", () => {
    it("mounts the layer controls and changes the live preview from an inline result control", async () => {
        const wrapper = mountStudio({ targetLabel: "Logo" });
        const textButton = wrapper.findAll("button").find((button) => button.text() === "Add text");
        expect(textButton).toBeDefined();
        await textButton!.trigger("click");
        expect(wrapper.text()).toContain("Text");
        const opacity = wrapper.get('input[type="range"]');
        await opacity.setValue("0.25");
        await opacity.trigger("input");
        expect(wrapper.html()).toContain('opacity="0.25"');
    });

    it("keeps the regex builder beside layer search and reports empty matches honestly", async () => {
        const wrapper = mountStudio();
        // The shared field's own affordance, not the hand-rolled toggle this used to have:
        // that one opened a token row and a paste-your-own-sample textarea, and asserting it
        // is what kept a bespoke builder alive beside the real one.
        const builder = wrapper.find('button[aria-label="Open the regex builder"]');
        expect(builder.exists()).toBe(true);
        await builder.trigger("click");
        // v-text-field renders a plain text input carrying a floating <label>, not an
        // aria-label, so neither input[type="search"] nor an aria-label selector finds it.
        // Scoped to the layer search's own container so it cannot pick up the preset one.
        await wrapper.get(".mb-creative-studio__search input").setValue("does-not-exist");
        expect(wrapper.text()).toContain("No layer matches this search.");
        // The summary is the honest count, and it comes from the same list the empty state
        // reads, so the two cannot disagree.
        expect(wrapper.text()).toContain("0 of");
    });

    it("keeps failed import state visible and does not replace the previous preview", async () => {
        const wrapper = mountStudio();
        const input = wrapper.find('input[aria-label="Import creative document"]');
        const invalid = new File(["not json"], "broken.json", { type: "application/json" });
        Object.defineProperty(input.element, "files", { value: [invalid] });
        await input.trigger("change");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(wrapper.text()).toContain("not valid JSON");
        expect(wrapper.text()).toContain("Live SVG preview");
    });

});
