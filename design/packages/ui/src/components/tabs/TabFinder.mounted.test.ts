// @vitest-environment jsdom

/**
 * The finder as the design draws it: scope chips over one result list, a checkbox per row,
 * and a selection footer whose Close previews before anything goes.
 *
 * Mounted rather than read, because the claims are about behaviour: that each scope keeps
 * its own search, that ticking and inverting act on the rows on screen, and that the Close
 * button leads to the shared preview and gate rather than closing anything itself.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { VApp } from "vuetify/components";
import TabFinder from "./TabFinder.vue";
import { addTab, createGroup, pinTab, type TabStripState } from "./tabModel.js";

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

const EMPTY: TabStripState = {
    id: "strip-main",
    label: "Main",
    windowId: "window-1",
    windowLabel: "Worldlens",
    placement: "top",
    tabs: [],
    groups: [],
    pinnedOrder: [],
    slots: [],
    activeTabId: null,
};

function strip(): TabStripState {
    let built = ["Make a map", "Projects", "Renders", "Maps and servers"].reduce<TabStripState>(
        (state, label) => addTab(state, { id: label, pageId: "page", label }),
        EMPTY,
    );
    built = pinTab(built, "Make a map");
    built = createGroup(built, { id: "g-rendering", name: "Rendering" }, ["Projects", "Renders"]);
    return built;
}

let wrapper: VueWrapper | null = null;

async function settle(): Promise<void> {
    for (let index = 0; index < 4; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

function mountFinder(): VueWrapper {
    const state = strip();
    const Host = defineComponent({
        setup() {
            return () =>
                h(VApp, null, {
                    default: () => [h(TabFinder, { strip: state, workspace: { strips: [state] } })],
                });
        },
    });
    wrapper = mount(Host, { global: { plugins: [vuetify, i18n] }, attachTo: document.body });
    return wrapper;
}

function finder(view: VueWrapper) {
    return view.findComponent(TabFinder);
}

function checkboxes(view: VueWrapper) {
    return view.findAll('.mb-tabs-results input[type="checkbox"]');
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

describe("the tab finder card", () => {
    it("opens on this strip's tabs with one row per tab, each with a checkbox, its group and its state", async () => {
        const view = mountFinder();
        await settle();
        const rows = view.findAll(".mb-tabs-results__row");
        expect(rows.map((row) => row.find(".mb-tabs-results__label").text())).toEqual([
            "Make a map",
            "Projects",
            "Renders",
            "Maps and servers",
        ]);
        expect(checkboxes(view)).toHaveLength(4);
        expect(rows[0]?.text()).toContain("pinned");
        expect(rows[1]?.text()).toContain("Rendering");
        expect(rows[3]?.text()).toContain("open");
    });

    it("offers the four scopes as chips, each with its own search field", async () => {
        const view = mountFinder();
        await settle();
        const chips = view.findAll(".mb-tabs-finder__scope");
        expect(chips.map((chip) => chip.text())).toEqual(["Tabs", "Everywhere", "Groups", "Bulk close"]);

        await view.find('input[role="searchbox"]').setValue("render");
        await settle();
        expect(view.findAll(".mb-tabs-results__row")).toHaveLength(1);

        await chips[2]?.trigger("click");
        await settle();
        expect(view.text()).toContain("Rendering");
        expect(view.find('input[role="searchbox"]').element).toHaveProperty("value", "");

        await chips[3]?.trigger("click");
        await settle();
        expect(view.text()).toContain("Close many tabs at once");

        await chips[0]?.trigger("click");
        await settle();
        expect((view.find('input[role="searchbox"]').element as HTMLInputElement).value).toBe("render");
    });

    it("keeps Close disabled with nothing selected, and counts what is ticked", async () => {
        const view = mountFinder();
        await settle();
        const bulk = () => view.find(".mb-tabs-finder__bulk");
        expect(bulk().text()).toBe("Close nothing");
        expect(bulk().attributes("disabled")).toBeDefined();

        await checkboxes(view)[3]?.setValue(true);
        await settle();
        expect(bulk().text()).toBe("Close 1 tabs...");
        expect(bulk().attributes("disabled")).toBeUndefined();
        expect(view.find(".mb-tabs-finder__note").text()).toContain("1 selected");
    });

    it("inverts the selection over the rows on screen", async () => {
        const view = mountFinder();
        await settle();
        await checkboxes(view)[0]?.setValue(true);
        await settle();
        await view.find(".mb-tabs-finder__invert").trigger("click");
        await settle();
        expect(
            checkboxes(view).map((box) => (box.element as HTMLInputElement).checked),
        ).toEqual([false, true, true, true]);
    });

    it("previews before closing: Close opens the shared preview, and the pinned tab stays protected", async () => {
        const view = mountFinder();
        await settle();
        await checkboxes(view)[0]?.setValue(true);
        await checkboxes(view)[3]?.setValue(true);
        await settle();
        await view.find(".mb-tabs-finder__bulk").trigger("click");
        await settle();

        const review = view.find(".mb-tabs-finder__review");
        expect(review.exists()).toBe(true);
        expect(review.text()).toContain("1 of 3 tabs would close");
        expect(review.text()).toContain("Make a map");
        expect(finder(view).emitted("apply")).toBeUndefined();
    });
});
