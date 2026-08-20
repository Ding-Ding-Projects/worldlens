// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { i18nModule } from "../../i18n.js";
import {
    resetSchoolModeRecordAdapter,
    setSchoolModeRecordAdapter,
    type SchoolModeRecordAdapter,
    type SchoolModeSnapshot,
} from "./schoolMode.js";
import SetupWelcomeStep from "./SetupWelcomeStep.vue";

const vuetify = createVuetify({ components, directives });
const enabled: SchoolModeSnapshot = {
    version: 1,
    enabled: true,
    name: "Study time",
    credentialConfigured: true,
};

function adapter(state: SchoolModeSnapshot): SchoolModeRecordAdapter {
    return {
        source: "shared",
        read: async () => ({ ok: true, state }),
        enable: async () => ({ ok: true, state }),
        rename: async () => ({ ok: true, state }),
        verify: async () => ({ ok: true, state }),
        disable: async () => ({ ok: true, state }),
        reset: async () => ({ ok: true, state }),
    };
}

afterEach(async () => {
    await resetSchoolModeRecordAdapter();
    document.body.innerHTML = "";
});

describe("first-run School-mode suppression", () => {
    it("omits language and funny controls while keeping the rest of Welcome", async () => {
        await setSchoolModeRecordAdapter(adapter(enabled));
        const wrapper = mount(SetupWelcomeStep, {
            global: { plugins: [vuetify, i18nModule] },
            attachTo: document.body,
        });

        expect(wrapper.find(".mb-setup-language").exists()).toBe(false);
        expect(wrapper.find(".mb-setup-step").exists()).toBe(true);
        wrapper.unmount();
    });
});
