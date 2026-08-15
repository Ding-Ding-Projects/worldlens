// @vitest-environment jsdom

/**
 * The seam: `ensureJob`/`revealJob` reading `jobStrip.value` synchronously, in the same call that
 * flips `view.value` to `"work"`.
 *
 * `KidJobStrip` sits behind `v-else-if="view === 'work'"` in `KidShell.vue`'s own template, so the
 * very first time a caller enters Work from any other view, Vue has not yet run the render/patch
 * that mounts it - a reactive update from a `ref` assignment is always batched onto the microtask
 * queue, never applied synchronously inside the function that made it. Before the fix this file
 * guards, `jobStrip.value` was still `null` at the exact point `ensureJob`/`revealJob` read it, so
 * the very first request for any non-pinned job (Backups, GitHub runners, Pages, ...) was silently
 * dropped: no error, no console warning, nothing. A second tap on the same row worked, because by
 * then the first tap's own `view.value = "work"` had already mounted the strip - which is what made
 * this read, to a real child, as "the app randomly ignores my first tap" rather than "this job is
 * broken". `kidStickerWiring.test.ts`'s own `revealKidJob()` helper carries a doc comment recording
 * the exact same race and works around it with a deliberate double call; this file exists to prove
 * the underlying defect directly, on a single call, and to prove the fix removes the need to work
 * around it at all.
 *
 * This mounts the real `KidShell`, in a state where the job strip has never mounted (starting on
 * Home, never having visited Work), and drives it through the same exposed `ensureJob`/`revealJob`
 * `App.vue`'s own host callbacks call - never by reaching into `KidJobStrip` or `WorkPane`
 * directly, which would prove nothing about the seam that actually broke.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import KidShell from "./KidShell.vue";

/** See `App.test.ts`'s own doc comment on this exact set of polyfills and why each is needed -
 * `KidShell` mounts the real `WorkPane`/`TabbedNavigation` tree once Work is reached, exactly as
 * the adult shell does, and that tree reaches for all of these. */
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

    Element.prototype.scrollIntoView = () => {};
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

/** Stands in for `localStorage`, exactly as `App.test.ts`'s own `cells` does - `useKidMode()`,
 * `useKidProgress()` and the tab strip's own workspace persistence all read/write through it. */
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

let wrapper: VueWrapper | null = null;

/** Mounts the real `KidShell`, starting on Home - the job strip has never mounted, exactly the
 * state a real child is in the first time they press a job row. Real slot content stands in for
 * three job screens, all non-pinned (`jobRegistry.ts`'s `pinnedOnFreshWorkspace: false` for every
 * one of `backups`, `pages` and `cirender`) so nothing here is seeded open for free by the fresh-
 * workspace pinned tab the way `world` would be. */
function shell(): VueWrapper {
    wrapper = mount(KidShell, {
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
        props: {
            destination: "home",
            catalogues: [],
            openJobs: [],
            problems: [],
            notices: [],
            renderRows: [],
            renderPercent: null,
        },
        slots: {
            backups: `<div class="test-backups-marker">Backups job content</div>`,
            pages: `<div class="test-pages-marker">Pages job content</div>`,
        },
    });
    return wrapper;
}

/** The tab is open in the strip - present, whether or not it is the focused/active one. Reading
 * this directly (rather than revealing the job and checking its slot content) is what lets
 * `ensureJob` be tested honestly: revealing a job a second time would succeed regardless of
 * whether the call under test actually opened anything, once the strip has already mounted from
 * an earlier call in the same test. */
function tabIsOpen(pageId: string): boolean {
    return wrapper!.find(`[data-tutorial-anchor="tab-${pageId}"]`).exists();
}

async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

beforeEach(() => {
    cells.clear();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

function revealJobApi(): (pageId: string) => void {
    const api = wrapper?.vm as unknown as { revealJob: (id: string) => void };
    return (pageId: string) => api.revealJob(pageId);
}

function ensureJobApi(): (pageId: string) => void {
    const api = wrapper?.vm as unknown as { ensureJob: (id: string) => void };
    return (pageId: string) => api.ensureJob(pageId);
}

describe("the first ever revealJob/ensureJob call, before the job strip has mounted", () => {
    it("still switches to the Work view - the ref race only ever dropped the job request, never the navigation", async () => {
        shell();
        await settle();

        revealJobApi()("backups");
        await settle();

        // `view.value = "work"` happens unconditionally and synchronously, so the strip itself
        // exists once things settle - regardless of whether the fix below is present. If this
        // assertion ever fails, the defect has moved somewhere upstream of what this file guards.
        expect(wrapper!.find(".wl-kid-jobs").exists(), "the Work view itself never mounted").toBe(true);
    });

    it("reveals the requested non-pinned job on the very first call - not just the second", async () => {
        shell();
        await settle();

        // A single call, exactly as `App.vue`'s own host callback makes it - never the two-call
        // workaround `kidStickerWiring.test.ts`'s own `revealKidJob()` carries for this same race.
        revealJobApi()("backups");
        await settle();

        expect(
            wrapper!.find(".test-backups-marker").exists(),
            "the first tap on a non-pinned job must open it, not silently do nothing",
        ).toBe(true);
    });

    it("ensures (without focusing) the requested job on the very first call too", async () => {
        shell();
        await settle();

        ensureJobApi()("backups");
        await settle();

        // Checked directly in the strip, not by revealing the job afterwards: a follow-up reveal
        // would succeed regardless of whether this ensureJob call did anything, because by then the
        // strip has already mounted (from this same call's own `view.value = "work"`) and a *second*
        // ref read always worked even on the broken code - that is exactly the shape of the bug.
        expect(
            tabIsOpen("backups"),
            "ensureJob's first call must open the tab even though nothing has focused it yet",
        ).toBe(true);
    });

    it("keeps an earlier queued request instead of losing it to a second one that arrives first", async () => {
        shell();
        await settle();

        // Two different non-pinned jobs requested back-to-back, synchronously, before the strip has
        // ever mounted - a queue that only remembered the last write would lose "backups" here.
        ensureJobApi()("backups");
        revealJobApi()("pages");
        await settle();

        // "pages" is focused, as the second (reveal) call asked for.
        expect(wrapper!.find(".test-pages-marker").exists(), "the second, focusing request must win the focus").toBe(true);
        // "backups" must still have been opened by the first call, not dropped for arriving before
        // the strip existed - checked directly in the strip, never by revealing it now, which would
        // succeed regardless of whether the earlier queued call did anything (see the test above).
        expect(
            tabIsOpen("backups"),
            "the earlier queued ensureJob request must not have been lost",
        ).toBe(true);
    });
});
