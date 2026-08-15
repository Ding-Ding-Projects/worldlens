// @vitest-environment jsdom

/**
 * The level badge read "1 Level 1" in a real packaged-app screenshot
 * (`docs/screenshots/kid-home.png`, kid-mode home-screen audit) - the level number once bare, in
 * an unstyled span with no CSS rule of its own, and once again inside `t("kid.status.level", ...)`'s
 * own "Level {n}" sentence. One number belongs in one sentence.
 *
 * See `KidShell.paneColor.test.ts` (a separate, non-jsdom file) for the second defect that same
 * screenshot caught in this component - the ambient white text colour bug - and why it is checked
 * from source rather than from a mounted, jsdom-computed style.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import KidShell from "./KidShell.vue";

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

function shell() {
    return mount(KidShell, {
        global: { plugins: [vuetify, i18n()] },
        props: {
            destination: "home",
            catalogues: [],
            openJobs: [],
            problems: [],
            notices: [],
            renderRows: [],
            renderPercent: null,
        },
    });
}

describe("the status header's level badge", () => {
    it("says the level once, not twice", () => {
        const wrapper = shell();
        const level = wrapper.find(".wl-kid__level");

        expect(level.text()).toBe("Level 1");
        // The specific shape of the old defect: the bare number immediately before the sentence
        // that already contains it.
        expect(level.text()).not.toMatch(/^1\s*Level 1/);
    });

    it("carries no leftover, unstyled numeral badge element", () => {
        const wrapper = shell();
        // `.wl-kid__level-badge` was never given a style rule of its own (grepped this file's whole
        // `<style scoped>` block) - a real leftover, not a deliberately unstyled decoration.
        expect(wrapper.find(".wl-kid__level-badge").exists()).toBe(false);
    });
});
