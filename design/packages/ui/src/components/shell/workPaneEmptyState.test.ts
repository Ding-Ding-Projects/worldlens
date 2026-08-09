// @vitest-environment jsdom

/**
 * Work draws exactly one empty state, and never over its own tab strip.
 *
 * `WorkPane` used to lay its own "No job is open" panel over the whole pane - absolutely
 * positioned against `.wl-work`, whose box starts at the top of the tab strip - while
 * `TabbedNavigation` was already drawing an honest empty state inside the panel. So closing
 * the last job produced two empty states, one covering the other, and the covering one also
 * hid the strip and its new-tab button: the only controls that could open a job.
 *
 * The assertion is behavioural rather than a reading of the stylesheet, because the thing
 * that went wrong is *which components render* when nothing is open, and that is something
 * a mount can answer truthfully even though jsdom computes no layout. Reaching the state the
 * honest way matters too: the last tab is closed through the strip's own <kbd>Delete</kbd>
 * binding rather than by planting an empty workspace in storage, which `tabStorage.ts`
 * rejects on read anyway (`tabs.length === 0` returns null and the workspace re-seeds).
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import WorkPane from "./WorkPane.vue";

const cells = new Map<string, string>();

beforeAll(() => {
    // The same jsdom gaps the tab suite fills, for the same reasons: Vuetify's overlays
    // observe their own size, and this jsdom has no storage at all.
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

    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
    document.elementsFromPoint = (): Element[] => [];

    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => {
                cells.set(key, value);
            },
            removeItem: (key: string) => {
                cells.delete(key);
            },
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
});

const vuetify = createVuetify();

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

const Host = defineComponent({
    setup() {
        return () => h(VApp, null, { default: () => [h(WorkPane)] });
    },
});

let wrapper: VueWrapper<InstanceType<typeof Host>> | null = null;

beforeEach(() => {
    cells.clear();
    wrapper = mount(Host, { global: { plugins: [vuetify, i18n] }, attachTo: document.body });
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

/** Closes every job through the strip's own Delete binding, as a person would. */
async function closeEveryJob(host: VueWrapper<InstanceType<typeof Host>>): Promise<void> {
    for (let guard = 0; guard < 20; guard++) {
        const tabs = host.findAll('[role="tab"]');
        const first = tabs[0];
        if (first === undefined) return;
        await first.trigger("keydown", { key: "Delete" });
        await nextTick();
        await nextTick();
    }
    throw new Error("the strip still had tabs after twenty closes");
}

describe("Work with no job open", () => {
    it("seeds at least one job, so the close loop below is closing something real", () => {
        const host = wrapper;
        expect(host).not.toBeNull();
        expect(host?.findAll('[role="tab"]').length ?? 0).toBeGreaterThan(0);
    });

    it("draws exactly one empty state, the panel's own", async () => {
        const host = wrapper;
        expect(host).not.toBeNull();
        if (host === null) return;

        await closeEveryJob(host);

        expect(host.findAll('[role="tab"]')).toHaveLength(0);
        // The panel's own, which lists every job as a button that opens it in place.
        expect(host.findAll(".mb-tabs__empty")).toHaveLength(1);
        expect(host.findAll(".mb-tabs__empty-actions button").length).toBeGreaterThan(0);
        // And no second one over the top of it. This is the whole regression: an overlay
        // here is absolutely positioned against a box that starts above the strip, so it
        // takes the strip and its new-tab button down with it.
        expect(host.findAll(".wl-work__empty")).toHaveLength(0);
    });

    /**
     * A companion to the assertion above rather than a second proof of it. jsdom computes no
     * layout, so this cannot see an element being *covered* - it passed unchanged while the
     * overlay was still there, which is exactly the limit worth stating rather than leaving
     * for somebody to discover. What it does catch is the other way of ending up with one
     * empty state: deleting the strip instead of the overlay.
     */
    it("still renders the tab strip and its new-tab button", async () => {
        const host = wrapper;
        expect(host).not.toBeNull();
        if (host === null) return;

        await closeEveryJob(host);

        expect(host.findAll(".mb-tabs-strip-row")).toHaveLength(1);
        const newTab = host
            .findAll(".mb-tabs-strip__controls button")
            .filter((button) =>
                (button.attributes("aria-label") ?? "").toLowerCase().includes("new tab"),
            );
        expect(newTab).toHaveLength(1);
    });
});
