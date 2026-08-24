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
});
