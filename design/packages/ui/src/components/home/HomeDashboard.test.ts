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
import { CATALOGUES } from "../shell/catalogues.js";
import { featureAvailable } from "../shell/catalogueSearch.js";
import type { CatalogueFeatureDefinition } from "../shell/featureTargets.js";
import { generationDialogOpen } from "../mcserver/generationWorkflow.js";

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

    it("asks the headline question with one supporting line", () => {
        const wrapper = render();
        expect(wrapper.find("h1.wl-dash__title").text()).toBe("What are you here to do?");
        expect(wrapper.findAll(".wl-dash__lede")).toHaveLength(1);
    });

    it("offers exactly one filled primary and one text action in the hero", () => {
        const wrapper = render();
        const hero = wrapper.find(".wl-hero");
        expect(hero.findAll(".wl-action")).toHaveLength(2);
        expect(hero.findAll(".wl-action--primary")).toHaveLength(1);
        expect(hero.find(".wl-action--primary").text()).toContain("New map");
        expect(hero.find(".wl-action--text").text()).toContain("Walk me through it");
    });

    it("draws all six catalogues as cards so every feature stays reachable", () => {
        const wrapper = render();
        expect(wrapper.findAll(".wl-card")).toHaveLength(CATALOGUES.length);
        expect(CATALOGUES).toHaveLength(6);
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
        await wrapper.find(".wl-action--primary").trigger("click");
        await wrapper.find(".wl-action--text").trigger("click");
        await wrapper.find(".wl-dash__palette").trigger("click");
        expect(wrapper.emitted("newMap")).toHaveLength(1);
        expect(wrapper.emitted("walkMeThrough")).toHaveLength(1);
        expect(wrapper.emitted("openPalette")).toHaveLength(1);
        expect(wrapper.emitted("openCatalogue")).toBeUndefined();
        expect(wrapper.emitted("activateFeature")).toBeUndefined();
    });

    it("keeps Generate and start project reachable on the Make a map card and opens its dialog", async () => {
        generationDialogOpen.value = false;
        const wrapper = render();
        const generate = wrapper.find('.wl-card[data-catalogue="make"] .wl-card__generate');
        expect(generate.exists()).toBe(true);
        expect(generate.text()).toContain("Generate and start project");
        await generate.trigger("click");
        expect(generationDialogOpen.value).toBe(true);
        expect(wrapper.emitted("openCatalogue")).toBeUndefined();
        generationDialogOpen.value = false;
    });

    it("keeps the regex builder beside the search field", () => {
        const wrapper = render();
        const search = wrapper.find(".wl-dash__search");
        expect(search.find('[role="searchbox"], input').exists()).toBe(true);
        expect(search.find('[aria-label="Open the regex builder"]').exists()).toBe(true);
    });
});

describe("HomeDashboard, catalogue cards", () => {
    for (const catalogue of CATALOGUES) {
        it(`${catalogue.id}: title, count, description, first features and an All link`, () => {
            const wrapper = render();
            const card = wrapper.find(`.wl-card[data-catalogue="${catalogue.id}"]`);
            expect(card.exists()).toBe(true);
            expect(card.find(".wl-card__title").text()).toBe(catalogue.titleFallback);
            expect(card.find(".wl-card__blurb").text()).toBe(catalogue.blurbFallback);
            const available = catalogue.features.filter((feature) => featureAvailable(feature));
            expect(card.find(".wl-card__count").text()).toBe(`${available.length} features`);
            const links = card.findAll(".wl-card__link");
            expect(links.length).toBe(Math.min(4, available.length));
            // Never an empty card: every catalogue offers at least one direct link.
            expect(links.length).toBeGreaterThan(0);
            expect(links.map((link) => link.attributes("data-feature"))).toEqual(
                available.slice(0, 4).map((feature) => feature.key),
            );
            expect(card.find(".wl-card__all").text()).toBe(`All ${available.length} features`);
        });

        it(`${catalogue.id}: each feature link activates exactly its own feature`, async () => {
            const wrapper = render();
            const links = wrapper.findAll(
                `.wl-card[data-catalogue="${catalogue.id}"] .wl-card__link`,
            );
            for (const link of links) await link.trigger("click");
            const emitted = (wrapper.emitted("activateFeature") ?? []) as [
                CatalogueFeatureDefinition,
            ][];
            expect(emitted.map(([feature]) => feature.key)).toEqual(
                links.map((link) => link.attributes("data-feature")),
            );
            // The emitted row is the manifest row itself, which is what the shell's one
            // activation function (`ShellNavigation.activateFeature`) takes.
            for (const [feature] of emitted) {
                expect(catalogue.features).toContain(feature);
            }
            expect(wrapper.emitted("openCatalogue")).toBeUndefined();
        });

        it(`${catalogue.id}: the All link opens that catalogue's page`, async () => {
            const wrapper = render();
            await wrapper
                .find(`.wl-card[data-catalogue="${catalogue.id}"] .wl-card__all`)
                .trigger("click");
            expect(wrapper.emitted("openCatalogue")).toEqual([[catalogue.id]]);
            expect(wrapper.emitted("activateFeature")).toBeUndefined();
        });
    }

    it("filters every card in place as the search query changes, keeping all six", async () => {
        const wrapper = render();
        const input = wrapper.find(".wl-dash__search input");
        await input.setValue("zzzz-no-feature-matches-this");
        expect(wrapper.findAll(".wl-card")).toHaveLength(6);
        expect(wrapper.findAll(".wl-card__link")).toHaveLength(0);
        expect(wrapper.find(".wl-dash__empty").exists()).toBe(true);
        await input.setValue("");
        expect(wrapper.findAll(".wl-card__link").length).toBeGreaterThan(0);
        expect(wrapper.find(".wl-dash__empty").exists()).toBe(false);
    });
});
