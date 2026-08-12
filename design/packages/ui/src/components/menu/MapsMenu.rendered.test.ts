/**
 * @vitest-environment jsdom
 *
 * Renders this computer has made are reachable from the Maps page, always.
 *
 * Before this they were reachable from exactly one place: the "Open the map" button on the
 * render-result card, which is a transient surface. Once it had gone the tiles were still on
 * the disk and the profile was still in the store, and the Maps page said "No map loaded."
 * with nothing to press - so a world rendered yesterday had no route back short of rendering
 * it again. Reported from a real build, with a screenshot of exactly that empty state beside
 * a screenshot of the finished render it could not reach.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import MapsMenu from "./MapsMenu.vue";
import { profilesStore } from "../../stores/profiles.js";

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

    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        addEventListener: () => {},
        removeEventListener: () => {},
    } as unknown as typeof globalThis.visualViewport;

    document.elementsFromPoint = () => [];
});

beforeEach(() => {
    profilesStore.profiles.splice(0, profilesStore.profiles.length);
    profilesStore.activeId = null;
});

function mountMenu(bluemap: unknown = null) {
    return mount(MapsMenu, {
        props: { bluemap: bluemap as never },
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
        },
    });
}

/** A finished local render, exactly as `addLocalMap` writes one. */
function rendered(id: string, name: string): void {
    profilesStore.profiles.push({
        id,
        name,
        url: "",
        trustCustomizations: false,
        dataRoot: `/local/${id}`,
    });
}

describe("the Maps page with nothing loaded", () => {
    it("still says nothing is loaded when this computer really has rendered nothing", async () => {
        const wrapper = mountMenu();
        await flushPromises();
        expect(wrapper.text()).toContain("No map loaded.");
        wrapper.unmount();
    });

    it("lists a finished render instead of a dead end", async () => {
        rendered("bayville-world-v10-1-61865723ee99", "bayville-world-v10-1");
        const wrapper = mountMenu();
        await flushPromises();

        expect(wrapper.text()).toContain("bayville-world-v10-1");
        expect(wrapper.text()).toContain("Rendered on this computer");
        // The dead end itself must be gone, not merely pushed below something.
        expect(wrapper.text()).not.toContain("No map loaded.");
        wrapper.unmount();
    });

    it("names where the tiles are, so the row is checkable rather than a claim", async () => {
        rendered("abc123", "My world");
        const wrapper = mountMenu();
        await flushPromises();
        expect(wrapper.text()).toContain("/local/abc123");
        wrapper.unmount();
    });

    it("opens one by making its profile active, not by switching map inside another", async () => {
        // Calling `switchMap` for this is how a click appears to do nothing at all: that
        // moves between the dimensions of the map already open, and this moves between
        // renders.
        rendered("first", "First world");
        rendered("second", "Second world");
        const wrapper = mountMenu();
        await flushPromises();

        const rows = wrapper.findAll(".v-list-item");
        const second = rows.find((row) => row.text().includes("Second world"));
        expect(second).toBeDefined();
        await second!.trigger("click");
        await flushPromises();

        expect(profilesStore.activeId).toBe("second");
        wrapper.unmount();
    });

    it("leaves a remote server profile out, because it is not a render", async () => {
        // Only `dataRoot`-carrying profiles are renders this machine made. A remote BlueMap
        // server listed under "Rendered on this computer" would be a plain lie about where
        // those tiles came from.
        profilesStore.profiles.push({
            id: "remote",
            name: "Somebody else's server",
            url: "https://example.test",
            trustCustomizations: false,
        });
        const wrapper = mountMenu();
        await flushPromises();

        expect(wrapper.text()).toContain("No map loaded.");
        expect(wrapper.text()).not.toContain("Somebody else's server");
        wrapper.unmount();
    });

    it("searches the renders as well, rather than offering a search that ignores them", async () => {
        rendered("alpha", "Alpha world");
        rendered("beta", "Beta world");
        const wrapper = mountMenu();
        await flushPromises();

        // The bar starts collapsed by design - a three-map server should not spend a row
        // on a filter nobody asked for - so it is opened the way a person opens it.
        const toggle = wrapper.find("[aria-expanded]");
        expect(toggle.exists()).toBe(true);
        await toggle.trigger("click");
        await flushPromises();

        const field = wrapper.find("input");
        expect(field.exists()).toBe(true);
        await field.setValue("Beta");
        await flushPromises();

        expect(wrapper.text()).toContain("Beta world");
        expect(wrapper.text()).not.toContain("Alpha world");
        wrapper.unmount();
    });
});
