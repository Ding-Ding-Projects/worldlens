// @vitest-environment jsdom

/**
 * The notification corner's real configuration-editor route.
 *
 * Unit tests cover each queue rule and the corner's individual controls. This test deliberately
 * crosses the ownership boundary that a unit test cannot see: the options editor opens, raises
 * its generated-defaults event on the shared `stores/notices.ts` state, and the one corner that
 * the shell mounts renders that event. The screenshot capture relies on this exact path, so a
 * private notice state or a corner mounted in the wrong subtree has to fail here before it turns
 * into an empty rectangle during a long capture run.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { VApp } from "vuetify/components";
import ConfigNotifications from "./ConfigNotifications.vue";
import ConfigScreen from "./ConfigScreen.vue";
import { dismissAll } from "./notifications.js";
import type { ConfigHost } from "./configHost.js";
import { notices } from "../../stores/notices.js";

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

    Element.prototype.scrollIntoView = (): void => {};
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

// ConfigScreen owns a broad settings surface, including its own icon-only tab controls. Register
// the same Vuetify catalogue the shipping bootstrap uses so an unresolved custom element cannot
// make this route pass as a hollow test-only DOM node.
const vuetify = createVuetify({ components, directives });

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

/**
 * A complete desktop-shaped host whose first-run lookup is empty. That is the actual event
 * route the capture profile takes: ConfigScreen immediately makes a draft workspace and reports
 * that it has shown defaults, then the host confirms there is no existing folder to replace it.
 */
const freshDesktopHost: ConfigHost = {
    name: "integration desktop",
    separator: "/",
    readFolder: async () => ({ folder: "/config", files: [] }),
    writeFiles: async () => {},
    deleteFiles: async () => {},
    pickDirectory: async () => null,
    pickFile: async () => null,
    testSqlConnection: async () => ({ ok: true, message: "connected" }),
    suggestConfigFolder: async () => "",
};

const Shell = defineComponent({
    setup() {
        const configOpen = ref(false);
        return { configOpen };
    },
    render() {
        return h(VApp, null, {
            default: () => [
                h(ConfigNotifications, { state: notices, railOwnsBell: true }),
                this.configOpen ? h(ConfigScreen, { host: freshDesktopHost }) : null,
            ],
        });
    },
});

let wrapper: VueWrapper | null = null;

function resetSharedNotices(): void {
    dismissAll(notices);
    notices.history.length = 0;
    notices.nextId = 1;
    notices.reviewedId = 0;
    notices.cooldowns.clear();
}

beforeEach(() => {
    resetSharedNotices();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    resetSharedNotices();
    document.body.innerHTML = "";
});

async function awaitVisibleToast(view: VueWrapper): Promise<void> {
    for (let turn = 0; turn < 12; turn += 1) {
        await nextTick();
        const toast = view.find(".mb-config-notices__toast");
        if (toast.exists() && toast.isVisible()) return;
    }
    throw new Error("ConfigScreen raised no visible shared notification toast.");
}

describe("ConfigScreen's shared notification route", () => {
    it("renders its real generated-defaults event in the shell corner, announces it, and closes it", async () => {
        wrapper = mount(Shell, {
            global: { plugins: [vuetify, i18n] },
            attachTo: document.body,
        });

        expect(wrapper.find(".mb-config-notices__toast").exists()).toBe(false);

        // Vue Test Utils cannot infer a setup-return value through an unparameterised wrapper,
        // though the component's public proxy deliberately exposes this test-only open switch.
        (wrapper.vm as unknown as { configOpen: boolean }).configOpen = true;
        await awaitVisibleToast(wrapper);

        const toast = wrapper.find(".mb-config-notices__toast");
        expect(toast.attributes("role")).toBe("status");
        expect(toast.text()).toContain("Showing BlueMap's own defaults");
        expect(notices.live).toHaveLength(1);
        expect(notices.history).toHaveLength(1);

        const dismiss = toast.find(".mb-config-notices__dismiss");
        expect(dismiss.attributes("aria-label")).toBe("Dismiss this notification");
        await dismiss.trigger("click");
        await nextTick();

        expect(wrapper.find(".mb-config-notices__toast").exists()).toBe(false);
        expect(notices.live).toHaveLength(0);
        expect(notices.history).toHaveLength(1);
    });
});
