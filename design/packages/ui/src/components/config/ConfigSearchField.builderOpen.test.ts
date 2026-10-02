// @vitest-environment jsdom

/**
 * Regression for GitHub issue #175: clicking the regex-builder affordance on the
 * options editor's search field crashed the renderer in a packaged build, at
 * `.mb-config-screen__search [aria-label="Open the regex builder"]`.
 *
 * `ConfigSearchField.vue` opens `ConfigRegexBuilder.vue` inside a `<v-menu>`
 * anchored to that button (`activator="parent"`, `location="bottom end"`). The
 * button that opens it sits *inside* the same `<v-menu>`'s activator slot as a
 * `<v-tooltip>` also targeting `activator="parent"` — two overlays anchored to
 * the same element. jsdom has no real layout engine, so Vuetify's `VOverlay`
 * measures the activator's `getBoundingClientRect()` as an all-zero rect; if the
 * positioning code ever divides by, or loops on, a zero-sized rect without a
 * termination guard, that shows up here as the mount hanging or throwing rather
 * than settling — which is the jsdom-visible shadow of a native renderer hang.
 *
 * This mounts the field standalone (mirroring `ConfigRegexBuilder.test.ts`'s own
 * pattern), clicks the button that opens the builder, and asserts the builder's
 * own card actually renders within the tick budget. A hang here fails the test
 * by timeout rather than by assertion, which is the right shape for a defect
 * whose real-world symptom is "the window stops responding."
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import ConfigSearchField from "./ConfigSearchField.vue";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's inputs/overlays observe their own size.
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    // jsdom has no `visualViewport`; Vuetify's connected location strategy (the
    // code path this popover actually opens through) listens for its
    // resize/scroll events and would otherwise throw before the menu settles.
    if (typeof globalThis.visualViewport === "undefined") {
        globalThis.visualViewport = {
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as VisualViewport;
    }
});

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

function render() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    return mount(ConfigSearchField, {
        props: {
            modelValue: "",
            regex: false,
            flags: "i",
            label: "Search every setting",
            sample: "renderThreads\nstorage",
        },
        global: { plugins: [vuetify, i18n()] },
        attachTo: container,
    });
}

describe("opening the anchored regex builder from a settings search field (issue #175)", () => {
    it("opens the builder card on click without hanging or throwing", async () => {
        const wrapper = render();

        for (let tick = 0; tick < 5; tick++) await wrapper.vm.$nextTick();

        const button = wrapper.find('[aria-label="Open the regex builder"]');
        expect(button.exists()).toBe(true);

        button.element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await wrapper.vm.$nextTick();
        // Vuetify's VMenu/VOverlay teleports and settles across a couple of
        // microtask/animation-frame turns; give it room without pretending a
        // real hang would ever resolve inside a bounded number of ticks.
        for (let tick = 0; tick < 5; tick++) await wrapper.vm.$nextTick();

        const builder = document.body.querySelector('[aria-label="Regex builder"]');
        expect(builder).not.toBeNull();

        wrapper.unmount();
    });
});
