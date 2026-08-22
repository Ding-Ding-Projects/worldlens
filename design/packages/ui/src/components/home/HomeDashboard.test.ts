// @vitest-environment jsdom

/**
 * The dashboard, mounted. `homeDashboardModel.test.ts` already proves the pure decisions; what
 * only a mounted component can answer is whether the template actually branches on them - a
 * fresh install really gets the welcome copy and not an empty grid, a saved profile really
 * renders a clickable row, a running render really shows a progress bar, and every action really
 * emits rather than silently doing nothing.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import HomeDashboard from "./HomeDashboard.vue";
import { addLocalMap, addProfile, profilesStore, removeProfile } from "../../stores/profiles.js";
import type { ActiveRenderRow } from "../renders/activeRenders.js";

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

const cells = new Map<string, string>();

beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => void cells.set(key, value),
            removeItem: (key: string) => void cells.delete(key),
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
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

let wrapper: VueWrapper | null = null;

function row(overrides: Partial<ActiveRenderRow> = {}): ActiveRenderRow {
    return {
        key: "local:1",
        renderId: "1",
        route: "local",
        routeDetail: "this computer",
        worldLabel: "My World",
        projectLabel: "My Project",
        state: "running",
        facts: {} as ActiveRenderRow["facts"],
        percent: 42,
        errorText: null,
        startedAtMs: null,
        canCancel: true,
        canOpenConsole: true,
        needsReattach: false,
        reattachMessage: null,
        busy: false,
        ...overrides,
    };
}

function render(props: Record<string, unknown> = {}): VueWrapper {
    wrapper = mount(HomeDashboard, {
        props,
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
    return wrapper;
}

beforeEach(() => {
    cells.clear();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    for (const profile of [...profilesStore.profiles]) removeProfile(profile.id);
    profilesStore.activeId = null;
});

describe("HomeDashboard, fresh install", () => {
    it("shows the welcome copy and no content sections when there is nothing saved", () => {
        const wrapper = render();
        expect(wrapper.find(".wl-dash__welcome").exists()).toBe(true);
        expect(wrapper.find(".wl-dash__content").exists()).toBe(false);
        expect(wrapper.findAll(".wl-panel")).toHaveLength(0);
    });

    it("still offers the three primary actions", () => {
        const wrapper = render();
        expect(wrapper.findAll(".wl-action")).toHaveLength(3);
    });

    it("still offers the catalogue strip so every feature stays reachable", () => {
        const wrapper = render();
        expect(wrapper.findAll(".wl-strip-chip").length).toBeGreaterThan(0);
    });
});

describe("HomeDashboard, returning install", () => {
    it("renders a saved profile as a clickable row and emits openMap with its id", async () => {
        const profile = addProfile({ name: "Home server", url: "https://example.test", trustCustomizations: false });
        const wrapper = render();
        expect(wrapper.find(".wl-dash__welcome").exists()).toBe(false);
        const rowEl = wrapper.find(".wl-profile-row");
        expect(rowEl.exists()).toBe(true);
        expect(rowEl.text()).toContain("Home server");
        await rowEl.trigger("click");
        expect(wrapper.emitted("openMap")).toEqual([[profile.id]]);
    });

    it("labels a locally rendered map differently from a remote server", () => {
        addLocalMap("/local/abc", "My local map");
        const wrapper = render();
        expect(wrapper.find(".wl-profile-row__meta").text()).toContain("this computer");
    });

    it("renders a running render with a progress bar and emits openRender with its key", async () => {
        const wrapper = render({ renderRows: [row({ key: "local:9", percent: 61 })] });
        const bar = wrapper.find('[role="progressbar"]');
        expect(bar.exists()).toBe(true);
        expect(bar.attributes("aria-valuenow")).toBe("61");
        await wrapper.find(".wl-render-row").trigger("click");
        expect(wrapper.emitted("openRender")).toEqual([["local:9"]]);
    });

    it("excludes finished, failed and cancelled renders from the in-progress panel", () => {
        const wrapper = render({
            renderRows: [
                row({ key: "a", state: "finished" }),
                row({ key: "b", state: "failed" }),
                row({ key: "c", state: "cancelled" }),
            ],
        });
        expect(wrapper.findAll(".wl-render-row")).toHaveLength(0);
        // No profiles and no in-progress renders and no project drafts: still the fresh view.
        expect(wrapper.find(".wl-dash__welcome").exists()).toBe(true);
    });

    it("falls back to the drafts panel when only project drafts exist", () => {
        const wrapper = render({ metaSources: { projectCount: 3 } });
        expect(wrapper.find(".wl-dash__welcome").exists()).toBe(false);
        expect(wrapper.text()).toContain("3");
    });
});

describe("HomeDashboard, actions", () => {
    it("emits newMap, walkMeThrough and openPalette from their own buttons without cross-firing", async () => {
        const wrapper = render();
        const actions = wrapper.findAll(".wl-action");
        await actions[0]!.trigger("click");
        await actions[1]!.trigger("click");
        await actions[2]!.trigger("click");
        expect(wrapper.emitted("newMap")).toHaveLength(1);
        expect(wrapper.emitted("walkMeThrough")).toHaveLength(1);
        expect(wrapper.emitted("openPalette")).toHaveLength(1);
    });

    it("emits openCatalogue with the clicked catalogue's id", async () => {
        const wrapper = render();
        const chip = wrapper.find(".wl-strip-chip");
        await chip.trigger("click");
        const emitted = wrapper.emitted("openCatalogue") ?? [];
        expect(emitted).toHaveLength(1);
        const [id] = emitted[0] as [string];
        expect(typeof id).toBe("string");
        expect(id.length).toBeGreaterThan(0);
    });
});
