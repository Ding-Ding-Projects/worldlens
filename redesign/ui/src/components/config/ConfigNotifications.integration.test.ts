// @vitest-environment jsdom

/**
 * The standalone, browser-shaped notification route.
 *
 * The redesigned desktop shell does not mount this fixed corner: its shared `raiseNotice()`
 * helper records at the rail bell instead. This test preserves the other supported consumer of
 * the component - a browser-shaped host that deliberately supplies ordinary toast-delivery
 * entries - so removing the desktop overlay does not silently turn the reusable component into
 * a decorative shell.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { VApp } from "vuetify/components";
import ConfigNotifications from "./ConfigNotifications.vue";
import { createNoticeState, dismissAll, notify, type NoticeState } from "./notifications.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;

    document.elementsFromPoint = (): Element[] => [];

    Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as VisualViewport,
    });
});

const vuetify = createVuetify({ components, directives });

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

let state: NoticeState;

const BrowserHost = defineComponent({
    setup() {
        return () => h(VApp, null, { default: () => [h(ConfigNotifications, { state })] });
    },
});

let wrapper: VueWrapper | null = null;

beforeEach(() => {
    state = createNoticeState();
});

afterEach(() => {
    dismissAll(state);
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

async function awaitVisibleToast(view: VueWrapper): Promise<void> {
    for (let turn = 0; turn < 12; turn += 1) {
        await nextTick();
        const toast = view.find(".mb-config-notices__toast");
        if (toast.exists() && toast.isVisible()) return;
    }
    throw new Error("The standalone notification host raised no visible toast.");
}

describe("ConfigNotifications as a standalone/browser consumer", () => {
    it("renders an ordinary toast-delivery event, announces it, and retains it in history after dismissal", async () => {
        wrapper = mount(BrowserHost, {
            global: { plugins: [vuetify, i18n] },
            attachTo: document.body,
        });

        expect(wrapper.find(".mb-config-notices__toast").exists()).toBe(false);

        notify(state, "info", "Showing BlueMap's own defaults for a browser-shaped host.");
        await awaitVisibleToast(wrapper);

        const toast = wrapper.find(".mb-config-notices__toast");
        expect(toast.attributes("role")).toBe("status");
        expect(toast.text()).toContain("Showing BlueMap's own defaults");
        expect(state.live).toHaveLength(1);
        expect(state.history).toHaveLength(1);

        const dismiss = toast.find(".mb-config-notices__dismiss");
        expect(dismiss.attributes("aria-label")).toBe("Dismiss this notification");
        await dismiss.trigger("click");
        await nextTick();

        expect(wrapper.find(".mb-config-notices__toast").exists()).toBe(false);
        expect(state.live).toHaveLength(0);
        expect(state.history).toHaveLength(1);
    });
});
