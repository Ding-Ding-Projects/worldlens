// @vitest-environment jsdom

/**
 * The rail bell and its anchored notification history, exercised together.
 *
 * The old test inspected `AppRail.vue` for the absence of a click handler. That was a useful
 * guard against one historical double-toggle, but it also let the opposite failure ship: a real
 * fresh-profile press could leave the bell at `aria-expanded="false"` with no panel at all. This
 * test deliberately mounts the same three links as the application -- rail event, shell-owned
 * state, and the real `v-menu` panel -- then presses the real button. It does not pretend jsdom
 * proves the menu's final pixel geometry; the app capture does that. It does prove the part the
 * static test could not: the user event reaches the state, the state reaches the real overlay,
 * and the palette's existing reveal request reaches that same controlled panel.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { VApp } from "vuetify/components";
import { createNoticeState } from "../config/notifications.js";
import AppRail from "./AppRail.vue";
import NotificationPanel from "./NotificationPanel.vue";
import { requestReveal, resetRevealRequests } from "./revealRequests.js";

beforeAll(() => {
    // Vuetify's real overlay is part of this test. jsdom has no layout observers or visual
    // viewport, so provide only the browser APIs its menu lifecycle reaches.
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
    Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        },
    });
});

const vuetify = createVuetify({ components, directives });
const activatorId = "rail-notifications-test-activator";

function i18n() {
    return createI18n({
        legacy: false,
        locale: "en",
        fallbackLocale: "en",
        messages: { en: {} },
        missingWarn: false,
        fallbackWarn: false,
    });
}

/**
 * A deliberately small version of the real App.vue seam.
 *
 * It does not stand in for either child: the real rail emits the press and the real notification
 * panel renders the anchored Vuetify menu. The only local code is the same single state transition
 * App.vue owns, so this test stays focused on the wiring that failed in the packaged application.
 */
const NotificationRailHost = defineComponent({
    setup() {
        const notificationsOpen = ref(false);
        const notices = createNoticeState();

        return () =>
            h(VApp, null, {
                default: () => [
                    h(AppRail, {
                        destination: "home",
                        openJobCount: 0,
                        unreadCount: 0,
                        productName: "Worldlens",
                        notificationsActivatorId: activatorId,
                        notificationsOpen: notificationsOpen.value,
                        onToggleNotifications: () => {
                            notificationsOpen.value = !notificationsOpen.value;
                        },
                    }),
                    h(NotificationPanel, {
                        state: notices,
                        activator: `#${activatorId}`,
                        open: notificationsOpen.value,
                        "onUpdate:open": (value: boolean) => {
                            notificationsOpen.value = value;
                        },
                    }),
                ],
            });
    },
});

let wrapper: VueWrapper<InstanceType<typeof NotificationRailHost>> | null = null;

beforeEach(() => {
    resetRevealRequests();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    resetRevealRequests();
    // Vuetify teleports overlays into this container, outside the wrapper that test-utils owns.
    // Removing it prevents a closed menu from one case looking like the opened menu in the next.
    document.querySelectorAll(".v-overlay-container").forEach((node) => node.remove());
});

function render(): VueWrapper<InstanceType<typeof NotificationRailHost>> {
    wrapper = mount(NotificationRailHost, {
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    }) as VueWrapper<InstanceType<typeof NotificationRailHost>>;
    return wrapper;
}

async function settle(): Promise<void> {
    // The controlled prop, the menu transition and its Teleport each get a tick in the real
    // component tree. Repeat rather than sleeping so a slow CI worker cannot turn this into a
    // timing guess.
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

function bell(view: VueWrapper<InstanceType<typeof NotificationRailHost>>) {
    return view.find(`#${activatorId}`);
}

function activePanel(): HTMLElement | null {
    // Vuetify keeps an overlay's card mounted until its leave transition has finished. The DOM
    // node alone is therefore not a visibility signal after a close; the overlay's active class
    // is the state its own transition and assistive-technology handling use.
    return document.querySelector<HTMLElement>(".v-overlay--active .wl-notifications");
}

describe("the rail notification bell", () => {
    it("opens the real anchored panel from one user press and closes through the same state", async () => {
        const view = render();
        const control = bell(view);

        expect(control.exists()).toBe(true);
        expect(control.attributes("aria-expanded")).toBe("false");
        expect(activePanel()).toBeNull();

        await control.trigger("click");
        await settle();

        expect(control.attributes("aria-expanded")).toBe("true");
        expect(activePanel()).not.toBeNull();

        // The menu's automatic activator click is disabled. A second press therefore performs the
        // one explicit transition back to false instead of racing a hidden second handler.
        await control.trigger("click");
        await settle();

        expect(control.attributes("aria-expanded")).toBe("false");
        expect(activePanel()).toBeNull();
    });

    it("uses the palette reveal request to open that same controlled anchored panel", async () => {
        const view = render();
        const control = bell(view);

        requestReveal("noticeCentre");
        await settle();

        expect(control.attributes("aria-expanded")).toBe("true");
        expect(activePanel()).not.toBeNull();
    });
});
