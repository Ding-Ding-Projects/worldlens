// @vitest-environment jsdom

/**
 * The guard that stops the tour rotting as the rest of the UI changes.
 *
 * Every other test in this folder proves the tour's own logic - stepping, persistence,
 * placement arithmetic - against fakes. None of that says whether `TUTORIAL_STEPS` in
 * `tutorialSteps.ts` still points at something real. This file is the one place that mounts
 * the actual application shell, the actual rail, the actual tab strip and the actual owning
 * surfaces, and for every declared step: switches to its real page the same way a user's click
 * would, then asks the real DOM for `document.querySelector(step.anchor)`.
 *
 * A step whose control was renamed, removed, or moved behind a disclosure that is not open by
 * default fails here, by name, rather than shipping a tour that highlights nothing.
 *
 * ## "The same way a user's click would" is now two different clicks
 *
 * The shell rewrite split the twelve-page strip in two, and this file navigates both halves
 * rather than pretending they are still one:
 *
 *  - **Home and Map are rail destinations**, not tabs. There is no `tab-map` for a step to
 *    point at any more and there never will be again, so the two map steps are reached by
 *    pressing the rail button that owns that destination - `data-tutorial-anchor="rail-map"`
 *    on `AppRail.vue`, the rail's counterpart of the tab attribute below.
 *  - **Everything else is a job**, and Work now holds the jobs somebody actually opened rather
 *    than every destination the application has. A fresh workspace opens exactly one - the
 *    pinned wizard - so a step whose page is Docs or Publish to Pages has no tab until the job
 *    is opened. It is opened here through the strip's own new-tab picker, which is the real
 *    control a person uses for this, and only then is the resulting
 *    `data-tutorial-anchor="tab-<pageId>"` button clicked.
 *
 * The tour itself navigates through `App.vue`'s `revealPage`, which does both of those things
 * for it - selects the rail destination, or opens the job and switches to Work. Driving the
 * controls instead keeps this file making the stronger claim it has always made: the thing a
 * step lands on is something a person can actually press, not merely a page id the shell
 * happens to accept.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import App from "../../App.vue";
import { findJob, isRailPageId } from "../shell/jobRegistry.js";
import { profilesStore, removeProfile } from "../../stores/profiles.js";
import { TUTORIAL_STEPS } from "./tutorialSteps.js";

beforeAll(() => {
    // The same layout-engine stand-ins `App.test.ts` installs: jsdom draws nothing, and
    // Vuetify's overlays, the theme bridge and the settings surface all reach for one of
    // these during a mount.
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

/**
 * The exact `localStorage` key `kidMode.ts`'s own `persisted(KEY_ENABLED, true)` reads and
 * writes for the kid-mode flag. `KEY_ENABLED` is a module-private constant there, so this is a
 * literal copy rather than an import - the same way `cells` below stands in for `localStorage`
 * itself without importing anything from the modules that read it.
 *
 * Every step this file walks is a step through the adult rail-and-tab-strip shell: `goToRail`,
 * `openJob` and `goToPage` below all click `.wl-rail-item` and `[data-tutorial-anchor="tab-*"]`
 * nodes, and neither exists in `KidShell`'s own markup - it has its own rail (`.wl-kid-rail`) and
 * its own job strip. Kid Mode ships on by default (`kidMode.ts`'s own "Kid Mode ships on" doc
 * comment), and `App.vue` mounts `KidShell` instead of this adult tree whenever it is - see the
 * `<KidShell v-if="kid.enabled.value"> / v-else` branch there.
 *
 * There is no second walk to add for Kid Mode's own tree here: nothing under `kid/` mentions
 * "tutorial" at all today, so Kid Mode has no tour of its own for this file to hold anchors for.
 * `beforeEach` below just makes sure every mount in this file lands on the shell the steps above
 * actually describe, the same declaration `App.test.ts` makes for the same reason.
 */
const KID_MODE_ENABLED_KEY = "bluemap-kid-mode";

let wrapper: VueWrapper | null = null;

/**
 * With no bridge and no stored layout, the shell seeds a Work workspace holding the one pinned
 * wizard tab and lands on Home - see `freshWorkStrip` in `tabWorkspaceMigration.ts`. Every other
 * job is opened from here, by the helpers below, exactly as a person would open it.
 */
function shell(): VueWrapper {
    wrapper = mount(App, { global: { plugins: [vuetify, i18n()] }, attachTo: document.body });
    return wrapper;
}

/** Several ticks: switching pages, mounting a slot, and settling any surface it opens. */
async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

/**
 * Presses a rail destination button, which is how Home and Map are reached now.
 *
 * The rail is outside the strip and outside every page, so it is on screen whatever the person
 * is looking at - which is exactly why the two map steps can point at it.
 */
async function goToRail(destination: string): Promise<void> {
    const button = document.querySelector<HTMLElement>(
        `.wl-rail-item[data-destination="${destination}"]`,
    );
    expect(button, `no rail destination "${destination}"`).not.toBeNull();
    button?.click();
    await settle();
}

/**
 * Opens every collapsed group in the strip.
 *
 * The seeded groups start expanded, so on a fresh workspace this does nothing at all. It stays
 * because a group is a control a person can collapse and a job filed into a collapsed one has
 * no visible tab, and a test that silently depended on the seed being expanded would start
 * failing for a reason nobody could read off the failure.
 */
async function expandGroups(): Promise<void> {
    for (const head of document.querySelectorAll<HTMLElement>(
        '.mb-tabs-strip__group-head[aria-expanded="false"]',
    )) {
        head.click();
    }
    await settle();
}

/**
 * Opens a job through the strip's own new-tab picker, unless its tab is already there.
 *
 * Work holds the jobs somebody opened rather than every destination the application has, so
 * this is the real route from "that job is not open" to "that job has a tab". Rows are matched
 * on the label out of `jobRegistry.ts` rather than on a hand-written string, because that
 * registry is the same source the picker itself renders from - a renamed job moves both at
 * once instead of leaving this file asserting a label nothing draws. The fallback is what the
 * picker actually renders here because this file's i18n instance carries no messages at all, so
 * every `t(key, fallback)` resolves to its fallback.
 */
async function openJob(jobId: string): Promise<void> {
    if (document.querySelector(`[data-tutorial-anchor="tab-${jobId}"]`) !== null) return;

    const job = findJob(jobId);
    expect(job, `"${jobId}" is not a job this build declares`).not.toBeNull();

    const newTab = document.querySelector<HTMLElement>('button[aria-label="Open a new tab"]');
    expect(newTab, "the strip has no new-tab button").not.toBeNull();
    newTab?.click();
    await settle();

    const row = [...document.querySelectorAll<HTMLElement>(".v-list-item")].find(
        (item) => item.textContent?.trim() === job?.labelFallback,
    );
    expect(row, `the new-tab picker does not offer "${jobId}"`).not.toBeUndefined();
    row?.click();
    await settle();
}

/**
 * Navigates to `pageId` by pressing the control that actually goes there: the rail button for a
 * rail destination, or - for a job - Work, the job's own tab, opening it first if the workspace
 * has not got one yet.
 */
async function goToPage(pageId: string): Promise<void> {
    if (isRailPageId(pageId)) {
        await goToRail(pageId);
        return;
    }

    await goToRail("work");
    await openJob(pageId);
    await expandGroups();

    const tab = document.querySelector<HTMLElement>(`[data-tutorial-anchor="tab-${pageId}"]`);
    expect(tab, `no tab button for job "${pageId}"`).not.toBeNull();
    tab?.click();
    await settle();
}

beforeEach(() => {
    cells.clear();
    // See `KID_MODE_ENABLED_KEY`'s own doc comment above: this whole file is a walk through the
    // adult shell's rail and tab strip, and Kid Mode ships on by default, so every mount has to
    // say so first or every step below finds nothing to click.
    cells.set(KID_MODE_ENABLED_KEY, "false");
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    for (const profile of [...profilesStore.profiles]) removeProfile(profile.id);
    profilesStore.activeId = null;
});

describe("every tour step's anchor resolves to a real element", () => {
    it.each(TUTORIAL_STEPS.map((step) => [step.id, step] as const))(
        '"%s" (page "%s") finds its control after the real navigation',
        async (_id, step) => {
            shell();
            await settle();

            await goToPage(step.pageId);

            const anchor = document.querySelector(step.anchor);
            expect(
                anchor,
                `step "${step.id}" points at "${step.anchor}" on page "${step.pageId}", ` +
                    "which the real shell does not render there any more",
            ).not.toBeNull();
        },
    );

    it("every step's own destination is itself a real, clickable control", async () => {
        shell();
        await settle();

        // Two kinds of destination, so two kinds of control - and the point of the assertion is
        // unchanged either way: whatever the step's page is, there is something on screen a
        // person could press to get there. A rail destination is there from the first frame; a
        // job has to be opened, which is itself a click through a real control (see `openJob`).
        await goToRail("work");
        for (const step of TUTORIAL_STEPS) {
            if (isRailPageId(step.pageId)) continue;
            await openJob(step.pageId);
        }
        await expandGroups();

        for (const step of TUTORIAL_STEPS) {
            const selector = isRailPageId(step.pageId)
                ? `.wl-rail-item[data-destination="${step.pageId}"]`
                : `[data-tutorial-anchor="tab-${step.pageId}"]`;
            expect(document.querySelector(selector), step.pageId).not.toBeNull();
        }
    });
});
