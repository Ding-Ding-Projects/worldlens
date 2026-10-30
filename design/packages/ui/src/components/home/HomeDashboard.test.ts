// @vitest-environment jsdom

/**
 * Home, mounted. `homeDashboardModel.test.ts` already proves the pure decisions; what
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
import { CATALOGUES } from "../shell/catalogues.js";
import { takeCatalogueGroup } from "./catalogueTone.js";

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

describe("HomeDashboard, the approved layout", () => {
    it("asks the prototype's question under the product overline, with the live feature count", () => {
        const wrapper = render();
        expect(wrapper.find(".wl-dash__overline").text().length).toBeGreaterThan(0);
        expect(wrapper.find(".wl-dash__title").text()).toBe("What are you here to do?");
        const total = CATALOGUES.reduce((n, c) => n + c.features.length, 0);
        // Capability-gated rows may be absent, so the lede carries a number no larger than the manifest.
        const count = Number(/All (\d+) things/.exec(wrapper.find(".wl-dash__lede").text())?.[1]);
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(total);
    });

    it("puts the feature, setting and article counts and the regex builder inside the search field", () => {
        const wrapper = render();
        const field = wrapper.find(".wl-dash__search");
        expect(field.find(".wl-dash__search-meta").text()).toMatch(
            /^\d+ features · \d+ settings · \d+ articles$/,
        );
        expect(field.find('[aria-label="Open the regex builder"]').exists()).toBe(true);
    });

    it("draws Make a map as the hero with one chip per group and the two actions", () => {
        const wrapper = render();
        expect(wrapper.find(".wl-hero").exists()).toBe(true);
        const make = CATALOGUES.find((c) => c.id === "make")!;
        const groups = new Set(make.features.map((f) => f.groupKey));
        expect(wrapper.findAll(".wl-hero__chip")).toHaveLength(groups.size);
        expect(wrapper.find(".wl-hero__chip").text()).toMatch(/· \d+$/);
        expect(wrapper.find(".wl-action--primary").text()).toBe("New map");
        expect(wrapper.find(".wl-action--secondary").text()).toBe("Or walk me through it");
    });

    it("draws the other five catalogues as cards with a count and up to four features", () => {
        const wrapper = render();
        const cards = wrapper.findAll(".wl-card");
        expect(cards).toHaveLength(CATALOGUES.length - 1);
        for (const card of cards) {
            expect(card.find(".wl-card__count").text()).toMatch(/\d+ features/);
            const features = card.findAll(".wl-card__feature");
            expect(features.length).toBeGreaterThan(0);
            expect(features.length).toBeLessThanOrEqual(4);
        }
    });

    it("keeps Generate and start project and the command palette reachable under On this machine", () => {
        const wrapper = render();
        const machine = wrapper.find(".wl-machine");
        expect(machine.text()).toContain("Generate and start project");
        expect(machine.text()).toContain("Open the command palette");
    });
});

describe("HomeDashboard, every name is a real control", () => {
    it("opens a catalogue from its card header and from the card body", async () => {
        const wrapper = render();
        await wrapper.find(".wl-card__head").trigger("click");
        await wrapper.findAll(".wl-card")[1]!.trigger("click");
        const emitted = (wrapper.emitted("openCatalogue") ?? []).map(([id]) => id);
        expect(emitted).toEqual(["maps", "share"]);
    });

    it("opens Make a map from the hero header without also firing an action", async () => {
        const wrapper = render();
        await wrapper.find(".wl-hero__head").trigger("click");
        expect(wrapper.emitted("openCatalogue")).toEqual([["make"]]);
        expect(wrapper.emitted("newMap")).toBeUndefined();
    });

    it("activates the named feature from a card row, not the card", async () => {
        const wrapper = render();
        const firstCard = wrapper.findAll(".wl-card")[0]!;
        const name = firstCard.find(".wl-card__feature").text();
        await firstCard.find(".wl-card__feature").trigger("click");
        const emitted = wrapper.emitted("activateFeature") ?? [];
        expect(emitted).toHaveLength(1);
        const [feature] = emitted[0] as [{ nameFallback: string; key: string }];
        expect(feature.nameFallback).toBe(name);
        expect(wrapper.emitted("openCatalogue")).toBeUndefined();
    });

    it("opens Make a map at the chip's group", async () => {
        const wrapper = render();
        await wrapper.findAll(".wl-hero__chip")[2]!.trigger("click");
        expect(wrapper.emitted("openCatalogue")).toEqual([["make"]]);
        const make = CATALOGUES.find((c) => c.id === "make")!;
        const third = [...new Set(make.features.map((f) => f.groupKey))][2];
        expect(takeCatalogueGroup("make")).toBe(third);
        // Read once: a later plain visit opens at the top.
        expect(takeCatalogueGroup("make")).toBeNull();
    });

    it("emits newMap, walkMeThrough and openPalette from their own buttons without cross-firing", async () => {
        const wrapper = render();
        await wrapper.find(".wl-action--primary").trigger("click");
        await wrapper.find(".wl-action--secondary").trigger("click");
        const palette = wrapper
            .findAll(".wl-machine .v-btn")
            .find((button) => button.text() === "Open the command palette")!;
        await palette.trigger("click");
        expect(wrapper.emitted("newMap")).toHaveLength(1);
        expect(wrapper.emitted("walkMeThrough")).toHaveLength(1);
        expect(wrapper.emitted("openPalette")).toHaveLength(1);
        expect(wrapper.emitted("openCatalogue")).toBeUndefined();
    });
});

describe("HomeDashboard, search", () => {
    async function search(wrapper: VueWrapper, text: string): Promise<void> {
        await wrapper.find(".wl-dash__search input").setValue(text);
    }

    it("replaces the cards with feature, setting and article results that each activate", async () => {
        const wrapper = render();
        await search(wrapper, "mask");
        expect(wrapper.find(".wl-dash__grid").exists()).toBe(false);
        const groups = wrapper.findAll(".wl-results__group");
        expect(groups.length).toBe(3);

        await groups[0]!.find(".wl-result").trigger("click");
        expect(wrapper.emitted("activateFeature")).toHaveLength(1);

        await groups[1]!.find(".wl-result").trigger("click");
        await groups[2]!.find(".wl-result").trigger("click");
        const targets = (wrapper.emitted("activateTarget") ?? []).map(([target]) => target);
        expect(targets[0]).toMatchObject({ kind: "overlay", overlay: "config" });
        expect(targets[1]).toMatchObject({ kind: "docs" });
    });

    it("highlights with text nodes and says so honestly when nothing matches", async () => {
        const wrapper = render();
        await search(wrapper, "mask");
        expect(wrapper.find(".wl-hit").text().toLowerCase()).toBe("mask");
        await search(wrapper, "zzzz-nothing-zzzz");
        expect(wrapper.find(".wl-results__empty").text()).toContain("zzzz-nothing-zzzz");
    });
});

describe("HomeDashboard, fresh install", () => {
    it("shows no machine panels when there is nothing saved", () => {
        const wrapper = render();
        expect(wrapper.find(".wl-dash__content").exists()).toBe(false);
        expect(wrapper.findAll(".wl-panel")).toHaveLength(0);
    });
});

describe("HomeDashboard, returning install", () => {
    it("renders a saved profile as a clickable row and emits openMap with its id", async () => {
        const profile = addProfile({
            name: "Home server",
            url: "https://example.test",
            trustCustomizations: false,
        });
        const wrapper = render();
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

    it("counts saved maps on the Your maps card, as the prototype does", () => {
        addLocalMap("/local/abc", "My local map");
        const wrapper = render({ metaSources: { profileCount: 1 } });
        const maps = wrapper.findAll(".wl-card").find((card) => card.text().includes("Your maps"))!;
        expect(maps.find(".wl-card__count").text()).toMatch(/features · 1 maps$/);
    });

    it("renders a running render with a progress bar and emits openRender with its key", async () => {
        const wrapper = render({ renderRows: [row({ key: "local:9", percent: 61 })] });
        const bar = wrapper.find('.wl-render-row [role="progressbar"]');
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
        expect(wrapper.find(".wl-dash__content").exists()).toBe(false);
    });

    it("falls back to the drafts panel when only project drafts exist, and it opens projects", async () => {
        const wrapper = render({ metaSources: { projectCount: 3 } });
        const panel = wrapper.find(".wl-panel");
        expect(panel.text()).toContain("3");
        await panel.find(".wl-drafts-open").trigger("click");
        expect(wrapper.emitted("newMap")).toHaveLength(1);
    });
});
