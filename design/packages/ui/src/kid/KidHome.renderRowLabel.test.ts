// @vitest-environment jsdom

/**
 * A real packaged-app screenshot (`docs/screenshots/kid-home.png`, kid-mode home-screen audit)
 * caught the "What is being drawn" row showing `world-0a974df3a729` verbatim - a render's own raw
 * id, meaningless to a pre-reading child - because the row's `label` had not resolved to a real
 * world/project name yet (`activeRenders.ts`'s `worldLabelOf`/`ciToRow` return the id itself as
 * their own fallback while nothing better is known). This suite is the negative-regression side of
 * the fix: `KidHome.vue`'s `rowLabel()` never shows the raw id, and never fabricates a name either
 * - it shows the honest "still finding out" line for exactly as long as `label` and `renderId` are
 * the same string, and the real label the instant they differ.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import KidHome from "./KidHome.vue";

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

function home(props: Partial<InstanceType<typeof KidHome>["$props"]> = {}) {
    return mount(KidHome, {
        global: { plugins: [vuetify, i18n()] },
        props: {
            catalogues: [],
            renderRows: [],
            ...props,
        },
    });
}

describe("KidHome's render row label, id versus real name", () => {
    it("shows the honest placeholder, never the raw id, while label equals renderId", () => {
        const wrapper = home({
            renderRows: [{ state: "running", percent: 40, label: "world-0a974df3a729", renderId: "world-0a974df3a729" }],
        });

        expect(wrapper.find(".wl-kid-home__row em").text()).toBe("Finding its name");
        expect(wrapper.text()).not.toContain("world-0a974df3a729");
    });

    it("shows the real resolved label as soon as it differs from renderId", () => {
        const wrapper = home({
            renderRows: [{ state: "running", percent: 40, label: "Bayville", renderId: "world-0a974df3a729" }],
        });

        expect(wrapper.find(".wl-kid-home__row em").text()).toBe("Bayville");
        // The raw id itself never leaks into the row even once a real name is showing.
        expect(wrapper.text()).not.toContain("world-0a974df3a729");
    });

    it("never invents a name: the placeholder text names no world, only that one is being found", () => {
        const wrapper = home({
            renderRows: [{ state: "running", percent: null, label: "ci-run-9f2b1c8a4d3e", renderId: "ci-run-9f2b1c8a4d3e" }],
        });

        const rowText = wrapper.find(".wl-kid-home__row").text();
        expect(rowText).toContain("Finding its name");
        expect(rowText).not.toContain("ci-run-9f2b1c8a4d3e");
    });

    it("keys each row on its stable renderId, not on a label two rows could share", () => {
        const wrapper = home({
            renderRows: [
                { state: "running", percent: 10, label: "world", renderId: "world-aaaaaaaaaaaa" },
                { state: "running", percent: 20, label: "world", renderId: "world-bbbbbbbbbbbb" },
            ],
        });

        expect(wrapper.findAll(".wl-kid-home__row")).toHaveLength(2);
    });
});
