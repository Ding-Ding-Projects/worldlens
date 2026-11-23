// @vitest-environment jsdom

/**
 * The share cards on a finished render: three real buttons, one per route, each
 * emitting exactly its own route, and none of them clickable while the render has
 * no output folder to share.
 */

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ShareRoutes from "./ShareRoutes.vue";

function mountRoutes(disabled = false) {
    return mount(ShareRoutes, {
        props: { disabled },
        global: {
            plugins: [createVuetify(), createI18n({ legacy: false, locale: "en", messages: { en: {} } })],
        },
    });
}

describe("ShareRoutes", () => {
    it("offers the three share routes as buttons", () => {
        const wrapper = mountRoutes();
        const buttons = wrapper.findAll("button.mb-share__card");
        expect(buttons.map((b) => b.attributes("data-route"))).toEqual(["host", "appliance", "live"]);
        expect(wrapper.text()).toContain("Host the map");
        expect(wrapper.text()).toContain("Build an appliance");
        expect(wrapper.text()).toContain("Live viewer and bot");
    });

    it("emits the route that was clicked", async () => {
        const wrapper = mountRoutes();
        await wrapper.find('[data-route="appliance"]').trigger("click");
        await wrapper.find('[data-route="live"]').trigger("click");
        expect(wrapper.emitted("share")).toEqual([["appliance"], ["live"]]);
    });

    it("disables every route when there is nothing to share", async () => {
        const wrapper = mountRoutes(true);
        for (const button of wrapper.findAll("button.mb-share__card")) {
            expect(button.attributes("disabled")).toBeDefined();
        }
        await wrapper.find('[data-route="host"]').trigger("click");
        expect(wrapper.emitted("share")).toBeUndefined();
    });
});
