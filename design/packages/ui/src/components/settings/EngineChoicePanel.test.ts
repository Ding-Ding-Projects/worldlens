// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { describe, expect, it } from "vitest";
import EngineChoicePanel from "./EngineChoicePanel.vue";

const vuetify = createVuetify();
const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    messages: {},
    missingWarn: false,
    fallbackWarn: false,
});

describe("EngineChoicePanel", () => {
    it("does not claim BlueMap is selected when Java exists but the verified artifact does not", () => {
        const wrapper = mount(EngineChoicePanel, {
            props: {
                javaAvailable: true,
                javaVersion: "25.0.4.1",
                renderEngineAvailable: false,
                renderEngineReason: "The packaged BlueMap jar is missing or malformed.",
            },
            global: { plugins: [vuetify, i18n] },
        });

        expect(wrapper.text()).toContain("Worldlens app engine");
        expect(wrapper.text()).toContain("The packaged BlueMap jar is missing or malformed.");
        expect(wrapper.text()).not.toContain(
            "Automatic currently selects the BlueMap original engine",
        );
        wrapper.unmount();
    });

    /*
     * Releases 1.0.2490 to 1.0.2502 offered this engine while none of the packages it imports
     * were installed. The picker now takes its answer from what is on disk.
     */
    it("does not offer the Worldlens engine when it cannot start, and says why", () => {
        const reason =
            "The engine inside the app is incomplete (missing the package @worldlens/nbt). It cannot be reinstalled from this installation; update or reinstall Worldlens.";
        const wrapper = mount(EngineChoicePanel, {
            props: {
                javaAvailable: true,
                renderEngineAvailable: true,
                typescriptEngineAvailable: false,
                typescriptEngineReason: reason,
            },
            global: { plugins: [vuetify, i18n] },
        });

        const button = wrapper.find('button[value="typescript"]');
        expect(button.exists()).toBe(true);
        expect(button.attributes("disabled")).toBeDefined();
        const state = wrapper.find('[data-testid="engine-choice-worldlens-state"]');
        expect(state.attributes("role")).toBe("alert");
        expect(state.text()).toContain(reason);
        wrapper.unmount();
    });

    it("keeps the Worldlens engine selectable and explains a pending reinstall", () => {
        const wrapper = mount(EngineChoicePanel, {
            props: {
                javaAvailable: true,
                renderEngineAvailable: true,
                typescriptEngineAvailable: true,
                typescriptEngineReason:
                    "The engine inside the app is incomplete (missing the package pngjs). It is reinstalled automatically when the next render starts.",
            },
            global: { plugins: [vuetify, i18n] },
        });

        expect(wrapper.find('button[value="typescript"]').attributes("disabled")).toBeUndefined();
        const state = wrapper.find('[data-testid="engine-choice-worldlens-state"]');
        expect(state.attributes("role")).toBe("status");
        expect(state.text()).toContain("reinstalled automatically");
        wrapper.unmount();
    });

    it("shows no engine notice when the Worldlens engine is complete", () => {
        const wrapper = mount(EngineChoicePanel, {
            props: { javaAvailable: true, renderEngineAvailable: true, typescriptEngineAvailable: true },
            global: { plugins: [vuetify, i18n] },
        });

        expect(wrapper.find('[data-testid="engine-choice-worldlens-state"]').exists()).toBe(false);
        wrapper.unmount();
    });
});
