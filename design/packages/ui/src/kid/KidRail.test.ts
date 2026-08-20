// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import KidRail from "./KidRail.vue";

const vuetify = createVuetify({ components, directives });
const i18n = createI18n({ legacy: false, locale: "en", messages: { en: {} } });

describe("KidRail state and notification anchor", () => {
    it("keeps Home current while a catalogue detail is open", () => {
        const wrapper = mount(KidRail, {
            props: { view: "catalogue", jobCount: 0, unread: 0 },
            global: { plugins: [vuetify, i18n] },
        });
        expect(wrapper.findAll(".wl-kid-rail__big")[0]?.attributes("aria-current")).toBe("page");
    });

    it("gives Messages the real panel anchor and expanded state", () => {
        const wrapper = mount(KidRail, {
            props: {
                view: "catalogues",
                jobCount: 0,
                unread: 2,
                notificationsActivatorId: "kid-notice-button",
                notificationsPanelId: "notice-panel",
                notificationsOpen: true,
            },
            global: { plugins: [vuetify, i18n] },
        });
        const messages = wrapper.get("#kid-notice-button");
        expect(messages.attributes("aria-controls")).toBe("notice-panel");
        expect(messages.attributes("aria-expanded")).toBe("true");
        expect(messages.attributes("aria-haspopup")).toBe("dialog");
        expect(messages.attributes("aria-label")).toContain("2 unread");
    });
});
