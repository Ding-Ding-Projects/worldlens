// @vitest-environment jsdom

/**
 * One catalogue page, mounted: the approved anatomy (back link, icon tile, title, search field
 * with its count and regex builder, primary section heads with a rule and a count, list rows) and
 * the behaviour behind it - every row activates its own feature, search filters and highlights
 * with text nodes, and a Home chip lands the page on its group.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import CataloguePage from "./CataloguePage.vue";
import { CATALOGUES } from "./catalogues.js";
import { featureAvailable } from "./catalogueSearch.js";
import { requestCatalogueGroup } from "../home/catalogueTone.js";

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

function render(catalogueId = "make"): VueWrapper {
    wrapper = mount(CataloguePage, {
        props: { catalogueId: catalogueId as never },
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
    return wrapper;
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

const make = CATALOGUES.find((catalogue) => catalogue.id === "make")!;
const visible = make.features.filter(featureAvailable);

describe("CataloguePage, the approved anatomy", () => {
    it("leads with an All catalogues back link that emits back", async () => {
        const page = render();
        const back = page.find(".wl-back");
        expect(back.text()).toBe("All catalogues");
        await back.trigger("click");
        expect(page.emitted("back")).toHaveLength(1);
    });

    it("shows the icon tile, title and description", () => {
        const page = render();
        expect(page.find(".wl-catalogue__avatar--primary").exists()).toBe(true);
        expect(page.find(".wl-catalogue__title").text()).toBe(make.titleFallback);
        expect(page.find(".wl-catalogue__blurb").text()).toBe(make.blurbFallback);
    });

    it("puts the feature count and the regex builder inside the search field", () => {
        const page = render();
        const search = page.find(".wl-catalogue__search");
        expect(search.find(".wl-catalogue__search-meta").text()).toBe(`${visible.length} features`);
        expect(search.find('[aria-label="Open the regex builder"]').exists()).toBe(true);
    });

    it("heads each group with its name, a rule and its count, in manifest order", () => {
        const page = render();
        const heads = page.findAll(".wl-group__head");
        const expected = [...new Set(visible.map((feature) => feature.groupFallback))];
        expect(heads.map((head) => head.find(".wl-group__name").text())).toEqual(expected);
        for (const head of heads) {
            expect(head.find(".wl-group__rule").exists()).toBe(true);
            expect(head.find(".wl-group__count").text()).toMatch(/^\d+ features?$/);
        }
    });

    it("draws one row per feature with an icon tile, a name, a description and a chevron", () => {
        const page = render();
        const rows = page.findAll(".wl-row");
        expect(rows).toHaveLength(visible.length);
        const first = rows[0]!;
        expect(first.find(".wl-row__icon").exists()).toBe(true);
        expect(first.find(".wl-row__label").text()).toBe(visible[0]!.nameFallback);
        expect(first.find(".wl-row__blurb").text()).toBe(visible[0]!.blurbFallback);
        expect(first.find(".wl-row__chevron").exists()).toBe(true);
    });
});

describe("CataloguePage, behaviour", () => {
    it("activates exactly the feature whose row was pressed", async () => {
        const page = render();
        await page.findAll(".wl-row")[3]!.trigger("click");
        expect(page.emitted("activateFeature")).toEqual([[visible[3]]]);
    });

    it("filters and highlights with text nodes, and says when nothing matches", async () => {
        const page = render();
        await page.find(".wl-catalogue__search input").setValue("mask");
        const rows = page.findAll(".wl-row");
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length).toBeLessThan(visible.length);
        expect(page.find(".wl-row__hit").text().toLowerCase()).toBe("mask");
        await page.find(".wl-catalogue__search input").setValue("zzzz-nothing-zzzz");
        expect(page.find(".wl-catalogue__empty").text()).toContain("zzzz-nothing-zzzz");
    });

    it("lands on the group a Home chip asked for, once", async () => {
        const target = [...new Set(visible.map((feature) => feature.groupKey))][2]!;
        requestCatalogueGroup("make", target);
        const page = render();
        await nextTick();
        await nextTick();
        const heading = page.findAll(".wl-group__name")[2]!.element as HTMLElement;
        expect(document.activeElement).toBe(heading);
    });
});
