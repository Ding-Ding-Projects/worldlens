// @vitest-environment jsdom

/**
 * Pressing "More" opens the overflow menu, and pressing it again closes it.
 *
 * Regression, reported by the owner against the packaged v1.0.2026 build: clicking "More" at the
 * bottom of the rail visibly did nothing. Driving that exact build through the cheap headless
 * route found the cause, and it is the same one this component's own bell button already carries
 * a comment about. The menu was given the button as its `activator`, so the overlay bound *its
 * own* click listener to a button that already had one. A real pointer press ran both: the
 * button's handler opened the menu and the overlay's handler toggled it straight back. The
 * instrumented sequence recorded on the button's `aria-expanded` attribute during one press was
 * `true, true, false, false`, and no menu was ever mounted afterwards.
 *
 * ### What this file can and cannot prove
 *
 * The real failure needed a real pointer press. A DOM-dispatched `click` in `jsdom` happened to
 * survive the double binding, which is exactly why the defect shipped past a green suite - so
 * this file does not pretend to reproduce it by mounting. What it does instead is assert the two
 * halves that are provable here: that the overlay is anchored by `target` (geometry, no events)
 * rather than by `activator` (geometry *and* events), which is the fix itself; and that the
 * button is a real toggle, which the old handler could not be because it only ever assigned
 * `true` and relied on the overlay's second listener to undo it. The packaged-build proof lives
 * in the report and the captures beside it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { beforeAll, describe, expect, it } from "vitest";

import AppRail from "./AppRail.vue";

// `import.meta.url` is not a file URL under this runner, so the component is read relative to
// the workspace root the suite is started from.
const SOURCE = readFileSync(
    resolve(process.cwd(), "packages/ui/src/components/shell/AppRail.vue"),
    "utf8",
);

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
    // Vuetify's location strategy reads this; jsdom does not implement it.
    (globalThis as unknown as { visualViewport: unknown }).visualViewport = {
        width: 1280,
        height: 800,
        offsetLeft: 0,
        offsetTop: 0,
        scale: 1,
        addEventListener: () => {},
        removeEventListener: () => {},
    };
});

const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    locale: "none",
    fallbackLocale: "none",
    messages: {},
});
const vuetify = createVuetify();

const SHORTCUTS = Array.from({ length: 7 }, (_, index) => ({
    id: `job${index}`,
    icon: "mdi-test-icon",
    label: `Job number ${index}`,
    shortLabel: `Job ${index}`,
}));

/** Heights that force an overflow, so the "More" button renders at all. jsdom measures nothing
 *  on its own, so the rail's own three measurements are supplied here instead. */
function stubLayout(): void {
    HTMLElement.prototype.getBoundingClientRect = function stubbed(this: HTMLElement) {
        if (this.classList.contains("wl-rail")) {
            return { top: 0, bottom: 400, height: 400 } as DOMRect;
        }
        if (this.classList.contains("wl-rail__footer")) {
            return { top: 350, bottom: 400, height: 50 } as DOMRect;
        }
        if (this.classList.contains("wl-rail__items")) {
            return { top: 0, bottom: 100, height: 100 } as DOMRect;
        }
        return { top: 0, bottom: 0, height: 0 } as DOMRect;
    };
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
        configurable: true,
        get(this: HTMLElement) {
            return this.classList.contains("wl-rail") ? 400 : 0;
        },
    });
}

function mountRail() {
    return mount(AppRail, {
        props: {
            destination: "home",
            openJobCount: 0,
            unreadCount: 0,
            productName: "Worldlens",
            jobShortcuts: SHORTCUTS,
        },
        global: { plugins: [i18n, vuetify] },
        attachTo: document.body,
    });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

describe("the rail's More button owns its own menu", () => {
    it("anchors the menu by target, never by activator", () => {
        // `activator` is the double binding: the overlay attaches a second click listener to the
        // very button that already opens it, and one press then opens and closes the menu.
        expect(SOURCE).not.toMatch(/:activator="moreButtonRef/);
        expect(SOURCE).toMatch(/:target="moreButtonRef \?\? undefined"/);
    });

    it("opens on click and closes on the next click", async () => {
        stubLayout();
        const rail = mountRail();
        await rail.vm.$nextTick();

        const more = rail.find("[data-rail-more]");
        expect(more.exists(), "the More button should be rendered when shortcuts overflow").toBe(
            true,
        );
        expect(more.attributes("aria-expanded")).toBe("false");

        await more.trigger("click");
        await settle();
        expect(more.attributes("aria-expanded")).toBe("true");
        const menu = document.querySelector(".wl-rail-more-menu");
        expect(menu, "the overflow menu should be mounted").not.toBeNull();
        // The overflowed shortcuts, and the menu's own search field, are what it is for.
        expect(menu?.querySelectorAll("[data-job-shortcut]").length).toBeGreaterThan(0);
        expect(menu?.querySelector("input"), "the menu ships its own filter field").not.toBeNull();

        await more.trigger("click");
        await settle();
        expect(
            more.attributes("aria-expanded"),
            "a second press on the same button closes it again",
        ).toBe("false");

        rail.unmount();
    });

    it("opens from the keyboard too", async () => {
        stubLayout();
        const rail = mountRail();
        await rail.vm.$nextTick();

        const more = rail.find("[data-rail-more]");
        // A native button turns Enter and Space into a click; asserting on that click is what
        // keeps this honest rather than inventing a key handler the button does not have.
        expect(more.element.tagName).toBe("BUTTON");
        (more.element as HTMLButtonElement).focus();
        (more.element as HTMLButtonElement).click();
        await settle();
        expect(more.attributes("aria-expanded")).toBe("true");
        expect(document.querySelector(".wl-rail-more-menu")).not.toBeNull();

        rail.unmount();
    });
});
