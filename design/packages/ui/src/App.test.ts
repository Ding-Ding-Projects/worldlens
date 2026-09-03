// @vitest-environment jsdom

/**
 * The shell, mounted, from the outside.
 *
 * Every claim here is about a door rather than about a room. The tab system, the appearance
 * editor, the options editor, the rail notification history and the surfaces behind them are all
 * tested on their own next door; what none of those tests can see is whether anything in the
 * running application ever reaches them. This project's recurring defect is a finished feature
 * nobody can open, so these assertions start where a user starts - at a tab or a button in the
 * corner - and go through the rendered DOM rather than through the component's internals.
 *
 * Three things are checked that only a mounted shell can answer: that Escape gives the focus
 * back to the button that opened the surface, that a raised notice waits at the rail bell rather
 * than covering content, and that a feature reachable from two places does not end up with two competing ways
 * in. All three are invisible to a test that pokes at state.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import App from "./App.vue";
import { KidShell } from "./kid/index.js";
import { HomeDashboard } from "./components/home/index.js";
import DashboardScreen from "./components/DashboardScreen.vue";
import { BackupScreen } from "./components/backup/index.js";
import PagesScreen from "./components/pages/PagesScreen.vue";
import WorldRepoScreen from "./components/worldrepo/WorldRepoScreen.vue";
import PreviewScreen from "./components/preview/PreviewScreen.vue";
import { CiRenderScreen } from "./components/cirender/index.js";
import { RunLocationCard } from "./components/remote/index.js";
import { ConfigScreen } from "./components/config/index.js";
import { dismissAll, markReviewed } from "./components/config/notifications.js";
import { CommandPalette } from "./components/palette/index.js";
import { capabilityAvailable } from "./components/shell/capabilities.js";
import { JOB_DEFINITIONS } from "./components/shell/jobRegistry.js";
import { WorldScreen } from "./components/world/index.js";
import { ProjectsScreen } from "./components/project/index.js";
import { AppSettings } from "./components/settings/index.js";
import { EulaSurface } from "./components/eula/index.js";
import { FirstRunSetup, WelcomeSurface } from "./components/setup/index.js";
import { appearanceTargets } from "./components/appearance/index.js";
import { unknownUpdateState } from "./components/update/updateModel.js";
import { addLocalMap, profilesStore, removeProfile } from "./stores/profiles.js";
import { notices, raiseNotice } from "./stores/notices.js";
import { createProject, withMapAdded } from "./components/project/projectModel.js";

/**
 * Every case in this file mounts the whole shell, and the whole shell is the single most
 * expensive thing this workspace's jsdom suite mounts - a title bar, eleven tab pages'
 * worth of wiring, the appearance system, the command palette, first-run setup and the
 * notification corner, all real components rather than stand-ins. The workspace default of
 * 30s (see `vitest.config.ts`) is nowhere near that on a developer machine - every test here
 * runs in under a second and a half in isolation - but it was measured too close on the
 * self-hosted CI runner this project moved onto, and measurement rather than a doubled
 * guess is what earns this file its own number:
 *
 *   - CI run 31074156612 (commit be82630) failed exactly two of this file's 34 tests, both
 *     with `Error: Test timed out in 30000ms`: "the notification corner > is mounted once
 *     by the shell..." (`App.test.ts:717`) at 43561ms elapsed, and "...shows a message
 *     raised while nothing is open" (`App.test.ts:730`) at 36517ms - the process itself
 *     did not even notice the 30s mark until well past it, which is contention delaying
 *     the timeout's own report, not a test quietly doing 43 seconds of real work.
 *   - The whole file is the tell: that same run logged
 *     `App.test.ts (34 tests | 2 failed) 146739ms` - about 3.3x a clean local run of this
 *     exact file alone (44.37s wall, 24.58s of that in tests). Every other test here mounts
 *     the identical shell and stayed under 30s only by margin, not because it is cheaper.
 *   - It is not this file, or App.vue, getting slower to start: `ProjectEditor.test.ts`, a
 *     comparably heavy jsdom-mount file elsewhere in this package, took 119199ms in that
 *     same CI run against 27.99s run alone locally - roughly the same ~4x factor - while
 *     running concurrently with this file in the other of `vitest.config.ts`'s then-two
 *     pinned forks. A `TabGroupPicker.typecheck.test.ts` in the same run spent 53941ms
 *     shelling out to `vue-tsc` in that same historical two-fork pool. Profiling
 *     `App.vue`'s own mount path
 *     found nothing eager to blame either: `renderIndicator.reconcile()`, wired in
 *     `onMounted`, resolves near-instantly the moment `window.worldlens` is
 *     undefined (true for every test in this file), and `HomeScreen` - the page the shell
 *     opens on by default - has no eager work of its own. Measured here: 952ms and 563ms
 *     mounting alone, 972ms and 606ms mounting early inside that full, two-fork-pinned run
 *     of this workspace's then-9,329-test suite. The shell was not the regression; the
 *     runner's shared two-process pool was oversubscribed by other files' real work.
 *
 * 60s (this codebase's own convention for known-slow, real-world work - see the several
 * `{ timeout: 60_000 }` "on a real disk" describes in `packages/app`) leaves comfortable
 * room above the worst measured 43.5s without pretending a genuine hang would go unnoticed.
 */
vi.setConfig({ testTimeout: 60_000 });

beforeAll(() => {
    // jsdom has no layout engine, so none of these exist: Vuetify's overlays observe their
    // own size, `matchMedia` backs the theme bridge's prefers-color-scheme check, and
    // `scrollIntoView` is called by the settings surface. Without them the mount throws
    // before any assertion runs.
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

    // Vuetify's reposition scroll strategy asks the document what is under a point, which
    // jsdom does not implement at all. Without this the anchored appearance editor throws
    // asynchronously, after the assertion that opened it has already passed, and the failure
    // surfaces as an unhandled rejection attributed to whichever test ran next.
    document.elementsFromPoint = (): Element[] => [];

    // Focus lands back on a tooltip activator, which opens the tooltip, which positions
    // itself against `visualViewport` - implemented by every browser this ships in and by
    // no version of jsdom.
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

/** Registered as `vuetify.ts` registers them; `createVuetify()` alone registers nothing. */
const vuetify = createVuetify({ components, directives });

/** The options `i18n.ts` ships: no messages, so every key falls back to its English string. */
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

/**
 * The storage this jsdom does not ship with.
 *
 * The tab layout, the appearance state and the profile list all persist, and this environment
 * starts without `localStorage` at all - which every one of them survives, and which would
 * make the layout assertions here meaningless because a tab strip that cannot remember
 * anything cannot be shown to have started fresh. A map rather than the real thing so one case
 * cannot leak a layout into the next.
 */
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
 * literal copy rather than an import - the same way `cells` above stands in for `localStorage`
 * itself without importing anything from the modules that read it.
 *
 * Kid Mode ships on (`kidMode.ts`'s own "Kid Mode ships on" doc comment: `enabled` defaults to
 * `false`), and `App.vue` mounts `KidShell` instead of the adult rail-and-tab-strip tree whenever
 * it is on - see the `<KidShell v-if="kid.enabled.value"> / v-else` branch there. Every case
 * below this point except the "which shell mounts" pair right after `shell()` is about that
 * adult tree specifically: the rail, the tab strip, the appearance target that wraps it, the
 * notification bell, the settings/config editor host. None of it exists in `KidShell`'s own
 * markup, which has its own rail (`.wl-kid-rail`) and its own job strip. `beforeEach` below
 * forces the flag off before every mount in this file for exactly that reason - this file's
 * business is Adult Mode, and it says so, rather than leaving three dozen assertions to fail
 * against a shell they were never written to describe.
 */
const KID_MODE_ENABLED_KEY = "bluemap-kid-mode";

let wrapper: VueWrapper | null = null;
const originalBridge = (globalThis as { worldlens?: unknown }).worldlens;

/**
 * With no profile active and no stored tab layout, the shell seeds one tab per page and opens
 * on the first of them. No bridge is installed, so nothing here can touch a disk.
 */
/**
 * Every job the Work workspace can hold, so a case that navigates to one has a tab to click.
 *
 * A fresh Work workspace seeds exactly one pinned tab - the guide - because Work holds the jobs
 * somebody actually started, and that is the whole point of the rewrite. A test that wants to
 * assert what the Backups screen renders would otherwise have to walk Home, the catalogue and the
 * row first, in every one of twenty-odd cases, which tests the catalogue over and over and the
 * screen once.
 *
 * So {@link shell} opens all of them through the component's own `ensurePage`, which is the exact
 * call the catalogue makes. The cases that genuinely test *discovery* - that Home offers five
 * catalogues, that a row opens its job - drive the real path and are marked as doing so.
 */
const WORK_JOB_IDS = JOB_DEFINITIONS.filter((job) => capabilityAvailable(job.availability)).map(
    (job) => job.id,
);

function shell(): VueWrapper {
    wrapper = mount(App, { global: { plugins: [vuetify, i18n()] }, attachTo: document.body });
    return wrapper;
}

/**
 * Which destination the rail says is showing.
 *
 * Every layer stays mounted - that is the contract that keeps the WebGL scene alive across
 * navigation - so `findComponent(...).exists()` answers "was it built", not "is it in front".
 * The rail's own `aria-current` is the shell's public answer to the second question, and it is
 * the same string a screen reader is told.
 */
function currentDestination(): string | null {
    const active = [...document.querySelectorAll<HTMLElement>(".wl-rail-item")].find(
        (node) => node.getAttribute("aria-current") === "page",
    );
    return active?.querySelector(".wl-rail-label")?.textContent?.trim() ?? null;
}
/** Switches to a rail destination the way a person does: by pressing it. */
async function goTo(destination: "Home" | "Map" | "Work"): Promise<void> {
    // Matched on the label element rather than on the button's whole text: the Work item carries
    // an open-job badge inside it, so the button reads "3Work" and an exact comparison against
    // "Work" quietly finds nothing.
    const item = [...document.querySelectorAll<HTMLElement>(".wl-rail-item")].find(
        (node) => node.querySelector(".wl-rail-label")?.textContent?.trim() === destination,
    );
    if (item === undefined) throw new Error(`the rail renders no ${destination} item`);
    item.click();
    await settle();
}

/**
 * Opens every job in Work and lands there, so the cases below can click a job tab.
 *
 * Reaches through the exposed `ensurePage` rather than through the catalogue for the reason in
 * {@link WORK_JOB_IDS}: this is setup, not the thing under test.
 */
async function openAllJobs(): Promise<void> {
    const pane = wrapper?.findComponent({ name: "WorkPane" });
    const api = pane?.vm as unknown as { ensurePage: (id: string) => void } | undefined;
    for (const id of WORK_JOB_IDS) api?.ensurePage(id);
    await settle();
    await goTo("Work");
}

/** Several ticks: opening the surface focuses it on the next one, and it mounts on another. */
async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

/**
 * Opens the options editor the way the product now does.
 *
 * There is no configuration button any more. The editor is a row in the Set up & help catalogue
 * and a command in the palette, and both go through the shell's own overlay path - so this drives
 * the palette, which is the shorter of the two real routes and the one that does not depend on the
 * catalogue copy staying worded exactly as it is today.
 */
async function openOptionsEditor(): Promise<void> {
    wrapper?.findComponent(CommandPalette).vm.$emit("open-config", null);
    await settle();
}
/** The full-bleed host, identified the way a screen reader finds it. */
function configHost(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
        '[role="region"][aria-label="Server configuration"]',
    );
}

/** Confirms the explicit discard route after Escape meets an unsaved configuration. */
async function discardConfigChanges(): Promise<void> {
    const discard = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === "Discard and close",
    );
    expect(discard, "the unsaved-configuration confirmation has no discard action").toBeDefined();
    discard?.click();
    await settle();
}

/** The rail owns the one notification route in the redesigned shell. */
function notificationBell(): HTMLButtonElement {
    const bell = [...document.querySelectorAll<HTMLButtonElement>(".wl-rail-action")].find(
        (button) => button.getAttribute("aria-label")?.startsWith("Notifications"),
    );
    if (bell === undefined) throw new Error("the shell renders no notification bell");
    return bell;
}

/** Vuetify teleports the explicitly opened rail history outside the mounted app wrapper. */
function activeNotificationHistory(): HTMLElement | null {
    return document.querySelector<HTMLElement>(".v-overlay--active .wl-notifications");
}

/**
 * A tab, found by the name it is announced under.
 *
 * An unpinned tab with no unsaved work announces exactly its visible label, so this is also
 * the string on screen; the assertions read better for saying it once.
 */
/**
 * The shell's own strip, not every tablist in the document.
 *
 * Scoped deliberately. A page is free to contain tabs of its own - the project editor has
 * seven, and other surfaces have their own - so an unscoped `[role="tab"]` query answers a
 * different question from the one these assertions ask, and starts failing the day an
 * unrelated surface grows a tab strip. What is being asserted here is the shell's pages.
 */
function shellTabs(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.wl-work [role="tab"]')];
}

function tabButton(label: string): HTMLElement {
    // Tolerant of the pinned suffix: the guide is pinned on a fresh Work workspace, so its tab
    // announces "Make a map, pinned" while every case here names the destination rather than its
    // pin state - which is the thing they are actually about.
    const node = shellTabs().find((tab) => {
        const announced = tab.getAttribute("aria-label") ?? "";
        return announced === label || announced === `${label}, pinned`;
    });
    if (node === undefined) throw new Error(`the shell renders no tab labelled ${label}`);
    return node;
}

/** The seeded groups' own headers, in strip order. */
function shellGroupHeads(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(".wl-work .mb-tabs-strip__group-head")];
}

/**
 * Opens every collapsed group in the shell's strip.
 *
 * A fresh workspace is seeded into three collapsed groups (see `App.vue`'s `initialGroups`
 * and the reasoning above it), and a collapsed group's members are deliberately not drawn -
 * they are still in the strip, still searched and still counted, but a test that clicks a tab
 * has to open the group first, exactly as a person does. That is the whole difference between
 * a destination being one disclosure away and being gone, so the cases below call this rather
 * than reaching past the strip's own state.
 */
async function expandShellGroups(): Promise<void> {
    // Work seeds one pinned tab now, so "open every group" starts by opening every job - see
    // `WORK_JOB_IDS`. The name is kept because what the cases below are actually saying is
    // "make every destination clickable", and that is still exactly what this does.
    await openAllJobs();
    for (const head of shellGroupHeads()) {
        if (head.getAttribute("aria-expanded") === "false") head.click();
    }
    await settle();
}

function tabLabels(): (string | null)[] {
    return shellTabs().map((node) => node.getAttribute("aria-label"));
}

beforeEach(() => {
    dismissAll(notices);
    notices.history.length = 0;
    // The tab layout and the appearance state both persist, and jsdom keeps one storage for
    // the whole file. Cleared so each case starts on the seeded layout rather than on
    // whichever page the case before it navigated to.
    cells.clear();
    // See `KID_MODE_ENABLED_KEY`'s own doc comment above: this file is about the adult shell,
    // and Kid Mode ships on, so every case has to say so before it mounts anything. Set after
    // `clear()` rather than before it, and set as the string `"false"` rather than the boolean
    // `false`, because that is exactly what `kidMode.ts`'s own `persisted()` reads back out of
    // `localStorage.getItem()` and compares against the literal string `"true"`.
    cells.set(KID_MODE_ENABLED_KEY, "false");
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    for (const profile of [...profilesStore.profiles]) removeProfile(profile.id);
    profilesStore.activeId = null;
    (globalThis as { worldlens?: unknown }).worldlens = originalBridge;
});

describe("which shell mounts", () => {
    /*
     * This is the seam `KID_MODE_ENABLED_KEY` forces shut for the rest of the file, and until
     * now nothing proved the seam itself works - only that each side, once forced, behaves the
     * way its own describe block already expected. A flipped `v-if`/`v-else` in `App.vue`, or a
     * changed default in `kidMode.ts`'s `persisted(KEY_ENABLED, false)`, would pass every other
     * case below and go completely unnoticed here: this is the only pair of cases in the file
     * that lets the flag decide which tree mounts rather than pinning it first.
     */

    it("mounts the adult shell on a fresh install, because kidMode.ts ships enabled: false", () => {
        // Undoes this file's own `beforeEach` declaration. Every other case forces Adult Mode
        // explicitly; this one is about what a genuinely fresh install sees with nothing
        // overriding the shipped default - no stored value at all, which is what `persisted()`
        // falls back to `false` for.
        //
        // Inverted on 2026-08-21, when Adult Mode became the default. This is precisely the
        // case that would have caught that change silently, so it is worth saying here that
        // the flip was deliberate rather than a regression somebody waved through.
        cells.delete(KID_MODE_ENABLED_KEY);

        const app = shell();

        expect(app.findComponent(KidShell).exists()).toBe(false);
        expect(document.querySelector(".wl-kid")).toBeNull();
        // The rail is the adult tree's own chrome, and `KidShell` renders none of it - it has
        // its own rail (`.wl-kid-rail`) and its own job strip. Its PRESENCE is what proves the
        // adult tree really mounted, rather than nothing at all having rendered.
        expect(document.querySelectorAll(".wl-rail-item").length).toBeGreaterThan(0);
    });

    it("mounts Kid Mode's own shell once a grown-up turns it on", () => {
        // The other half of the seam. Kid Mode is now chosen rather than shipped, so this is
        // the case that proves choosing it still works.
        cells.set(KID_MODE_ENABLED_KEY, "true");

        const app = shell();

        expect(app.findComponent(KidShell).exists()).toBe(true);
        expect(document.querySelector(".wl-kid")).not.toBeNull();
        // Total absence of the adult chrome proves the adult tree never mounted at all, not
        // merely that something is covering it.
        expect(document.querySelectorAll(".wl-rail-item")).toHaveLength(0);
        expect(shellTabs()).toHaveLength(0);
    });

    it("mounts the adult rail-and-tab-strip shell once Kid Mode is turned off", () => {
        // Restates what `beforeEach` above already set. This is the case that makes it true
        // rather than merely convenient for the rest of this file.
        cells.set(KID_MODE_ENABLED_KEY, "false");

        const app = shell();

        expect(app.findComponent(KidShell).exists()).toBe(false);
        expect(document.querySelector(".wl-kid")).toBeNull();
        expect(document.querySelectorAll(".wl-rail-item").length).toBeGreaterThan(0);
    });
});

describe("the tab strip", () => {
    it("opens a fresh Work workspace as one pinned job, not twelve flat tabs", () => {
        shell();

        // The rewrite in one assertion. Work holds the jobs somebody actually started, and on a
        // fresh install that is exactly one: the guide, pinned so it cannot be swept up by a bulk
        // close. The other destinations did not disappear - they moved to Home's catalogues,
        // which is what makes it safe for this strip to be short.
        expect(tabLabels()).toEqual(["Make a map, pinned"]);
    });

    /*
     * Seeded groups still exist, and a group with no member open still renders no heading. Both
     * halves matter: the group definitions are what file Projects under "Rendering" the moment it
     * is opened, and a heading standing over nothing is a control that does nothing when pressed.
     */
    it("renders no group heading until a group has a member open", async () => {
        shell();
        await settle();

        expect(shellGroupHeads()).toHaveLength(0);

        await expandShellGroups();

        expect(shellGroupHeads().map((head) => head.getAttribute("aria-label"))).toEqual([
            "Rendering, 3 tabs",
            "Finished maps, 6 tabs",
            "Keeping a copy, 2 tabs",
        ]);
    });

    it("keeps every available registered job reachable from the shell", async () => {
        shell();
        await expandShellGroups();

        // Home and Map are rail destinations. Work contains every available registered job,
        // and this expectation follows the same availability source as production so a new
        // registered job cannot silently remain outside the shell test.
        const expectedLabels = JOB_DEFINITIONS.filter((job) =>
            capabilityAvailable(job.availability),
        )
            .map((job) =>
                job.pinnedOnFreshWorkspace ? `${job.labelFallback}, pinned` : job.labelFallback,
            )
            .sort();
        expect([...tabLabels()].sort()).toEqual(expectedLabels);
    });

    it("reaches Home from the rail, where no bulk close can ever touch it", async () => {
        const app = shell();

        await goTo("Home");

        expect(app.findComponent(HomeDashboard).exists()).toBe(true);
    });

    it("reaches the docs browser through its own job", async () => {
        shell();
        await expandShellGroups();

        tabButton("Docs").click();
        await settle();

        expect(document.querySelector(".mb-docs")).not.toBeNull();
    });

    it("seeds a brand-new, unmounted workspace open on Home rather than an unexplained tab of eight strangers", () => {
        // What this proves, narrowly: `TabbedNavigation`'s own `seedStrip()` picks the first
        // declared page as the starting tab, and Home is first in `pages`. It says nothing
        // about first-run setup, which has its own test right below - a bare `shell()` mount
        // never drives `FirstRunSetup`'s `finished` event at all, so this alone cannot tell
        // the two apart.
        const app = shell();

        expect(currentDestination()).toBe("Home");
        expect(app.findComponent(HomeDashboard).exists()).toBe(true);
        // The map layer is mounted at all times on purpose: unmounting it would throw away the
        // WebGL scene every time somebody looked at Home. Not showing means inert.
        expect(document.querySelector(".mb-shell-layer--map")?.hasAttribute("inert")).toBe(true);
    });

    it("opens on Home for a fresh install, the moment first-run setup genuinely completes", async () => {
        // The seed test above passing is not proof that a real first-time user ever reaches
        // Home: it never drives first-run setup at all, so it would keep passing unchanged
        // even while `App.vue`'s `onFirstRunFinished` was calling `revealPage(PAGE_WORLD)`
        // directly - which is exactly what shipped, landing every fresh install straight on
        // the wizard and skipping Home every single time. This exercises the actual
        // completion path instead: the same `finished` event `FirstRunSetup` emits on a real
        // "Finish setup" success (proven to fire only on that success by
        // `FirstRunSetup.test.ts`), rather than a workspace pre-seeded in isolation.
        const app = shell();
        expect(app.findComponent(HomeDashboard).exists()).toBe(true);

        await app.findComponent(FirstRunSetup).vm.$emit("finished");
        await settle();

        expect(currentDestination()).toBe("Home");
        expect(app.findComponent(HomeDashboard).exists()).toBe(true);
        // The map layer is mounted at all times on purpose: unmounting it would throw away the
        // WebGL scene every time somebody looked at Home. Not showing means inert.
        expect(document.querySelector(".mb-shell-layer--map")?.hasAttribute("inert")).toBe(true);
        // The guide is the pinned, active job, so it is built from the first frame. What a fresh
        // install has not done is *shown* it - Home is the destination in front.
        expect(currentDestination()).toBe("Home");
        expect(
            [...document.querySelectorAll<HTMLElement>(".wl-rail-item")]
                .find(
                    (node) => node.querySelector(".wl-rail-label")?.textContent?.trim() === "Home",
                )
                ?.getAttribute("aria-current"),
        ).toBe("page");
    });

    it("returns a user with a saved workspace to their last active tab, not forced back to Home", async () => {
        // The regression the Home fix above could plausibly introduce: a persisted
        // workspace, from a build old enough to have Home but a person who was last looking
        // at "Make a map", must not be yanked back to Home just because the shell mounted.
        // `onFirstRunFinished` only ever fires once, for a genuine first-time completion, so
        // it plays no part in an ordinary returning-user mount - this proves the mount path
        // itself stays exactly as untouched as the task asked.
        cells.set(
            "worldlens-tabs",
            JSON.stringify({
                version: 1,
                strips: [
                    {
                        id: "strip-main",
                        label: "Main",
                        windowId: "window-main",
                        windowLabel: "Worldlens",
                        tabs: [
                            { id: "t-home", pageId: "home", label: "Home" },
                            { id: "t-map", pageId: "map", label: "Map" },
                            { id: "t-world", pageId: "world", label: "Make a map" },
                        ],
                        groups: [],
                        pinnedOrder: ["t-home"],
                        slots: [],
                        activeTabId: "t-world",
                    },
                ],
            }),
        );

        const app = shell();
        // Awaited, unlike the cases above it: the migration off the twelve-page model runs in
        // `onMounted` and decides the landing destination from whichever page was last active, so
        // a synchronous assertion here reads the frame before that decision rather than after it.
        await settle();

        expect(app.findComponent(WorldScreen).exists()).toBe(true);
        // Work, because the page they left off on was a job. Home and Map are the only two the
        // migration lifts out of the workspace, and `world` is neither.
        expect(currentDestination()).toBe("Work");
        expect(tabButton("Make a map").getAttribute("aria-selected")).toBe("true");
    });

    it("shows the map-state message once the Map tab is chosen", async () => {
        shell();

        await goTo("Map");
        await settle();

        expect(document.querySelector(".mb-map-page")).not.toBeNull();
        expect(document.querySelector(".mb-map-state")?.textContent).toContain("No map loaded.");
    });

    it("reaches the wizard through its job rather than through having no profile", async () => {
        // The wizard used to appear only because `profilesStore.activeId` was null, which made it
        // unreachable the moment a map was open. A job is a door that is always there.
        const app = shell();
        // A fresh install lands on Home. The guide is built - every layer stays mounted so
        // navigation never costs a WebGL scene - but it is not the destination in front.
        expect(currentDestination()).toBe("Home");

        await goTo("Work");
        tabButton("Make a map").click();
        await settle();

        expect(currentDestination()).toBe("Work");
        expect(app.findComponent(WorldScreen).exists()).toBe(true);
        // The map layer is mounted at all times on purpose: unmounting it would throw away the
        // WebGL scene every time somebody looked at Home. Not showing means inert.
        expect(document.querySelector(".mb-shell-layer--map")?.hasAttribute("inert")).toBe(true);
    });

    it("reaches the maps-and-servers list through its tab, and offers no second door to it", async () => {
        const app = shell();

        // The floating button that used to open this as an overlay is gone: a tab and a FAB
        // reaching the same surface are two navigation models arguing on one screen.
        expect(document.querySelector('button[aria-label="Servers"]')).toBeNull();

        await expandShellGroups();
        tabButton("Maps and servers").click();
        await settle();

        expect(app.findComponent(DashboardScreen).exists()).toBe(true);
    });

    it("reaches the projects surface through its tab, rather than only existing in the bundle", async () => {
        // The whole feature is "configure every map setting before rendering starts", and a
        // configuration surface nobody can open configures nothing. This project has shipped
        // five features that were built, tested and unreachable; a tab test is cheap.
        const app = shell();
        expect(app.findComponent(ProjectsScreen).exists()).toBe(false);

        await expandShellGroups();
        tabButton("Projects").click();
        await settle();

        expect(app.findComponent(ProjectsScreen).exists()).toBe(true);
    });

    it("keeps a project editor's nested tab panel interactive while the shell panel passes map clicks through", async () => {
        const world = "C:/saves/Survival";
        const project = withMapAdded(
            createProject("Survival", {
                now: "2026-08-06T12:00:00Z",
                id: "project-1",
                appVersion: null,
            }),
            { id: "overworld", name: "Overworld", dimension: "minecraft:overworld", world },
        );
        (globalThis as { worldlens?: unknown }).worldlens = {
            project: {
                listProjects: async () => ({
                    projects: [
                        {
                            world,
                            file: `${world}/worldlens.project.json`,
                            id: project.id,
                            name: project.name,
                            maps: project.maps.length,
                            createdAt: project.createdAt,
                            updatedAt: project.updatedAt,
                            fromWizard: project.fromWizard,
                            worldName: "Survival",
                            problem: null,
                        },
                    ],
                    scanned: 1,
                    problems: [],
                }),
                readProject: async () => ({
                    ok: true,
                    project,
                    file: `${world}/worldlens.project.json`,
                }),
                writeProject: async () => ({ ok: true, file: `${world}/worldlens.project.json` }),
            },
        };

        const app = shell();
        await expandShellGroups();
        tabButton("Projects").click();
        await settle();
        const row = app.findComponent(ProjectsScreen).find('[role="option"]');
        expect(row.exists()).toBe(true);
        await row.trigger("click");
        await settle();

        // The outer panel no longer passes pointer events through, and that is the rewrite rather
        // than a regression: the map used to sit behind every page, so the shell's own tab panel
        // had to be click-through or the map became undraggable everywhere except the gaps
        // between the floating controls. Work is an opaque destination layer now and the map has
        // a destination of its own, so there is nothing behind Work to click through *to*.
        const nestedPanel = document.querySelector<HTMLElement>(
            ".mb-project-editor__tabs .mb-tabs__panel",
        );
        expect(document.querySelector(".mb-tabs__panel--pointer-passthrough")).toBeNull();
        expect(nestedPanel).not.toBeNull();
        expect(getComputedStyle(nestedPanel!).pointerEvents).not.toBe("none");

        const core = [
            ...document.querySelectorAll<HTMLElement>('.mb-project-editor__tabs [role="tab"]'),
        ].find((tab) => (tab.textContent ?? "").includes("Core"));
        core?.click();
        await settle();
        expect(core?.getAttribute("aria-selected")).toBe("true");

        const maps = [
            ...document.querySelectorAll<HTMLElement>('.mb-project-editor__tabs [role="tab"]'),
        ].find((tab) => (tab.textContent ?? "").includes("Maps"));
        maps?.click();
        await settle();
        const addMap = [
            ...document.querySelectorAll<HTMLButtonElement>(".mb-project-editor button"),
        ].find((button) => (button.textContent ?? "").includes("Add a map"));
        expect(addMap).toBeDefined();
        addMap?.click();
        await settle();
        expect(document.querySelector(".mb-project-maps__create")).not.toBeNull();
    });

    it("takes the wizard's finished project to that same page", async () => {
        // The guide writes a project file and offers to open it. Without this the offer
        // would be a button that changes nothing, which is the dead end the project format
        // exists to remove.
        const app = shell();
        tabButton("Make a map").click();
        await settle();

        app.findComponent(WorldScreen).vm.$emit("open-project", "C:/saves/Survival");
        await settle();

        expect(app.findComponent(ProjectsScreen).exists()).toBe(true);
        expect(app.findComponent(ProjectsScreen).props("openWorld")).toBe("C:/saves/Survival");
    });

    it("reaches the backup screen through its tab, rather than only existing in the bundle", async () => {
        // This project has shipped five features that were built, tested and unreachable.
        // A tab test is cheap; discovering a whole subsystem has no door is not.
        const app = shell();
        expect(app.findComponent(BackupScreen).exists()).toBe(false);

        await expandShellGroups();
        tabButton("Backups").click();
        await settle();

        expect(app.findComponent(BackupScreen).exists()).toBe(true);
    });

    it("reaches the GitHub-runners surface through its tab, rather than only existing in the bundle", async () => {
        // The seventh feature this project built, tested and left with no door. The whole
        // path works - the main process registers it and the preload exposes all six
        // channels - so what was missing was one tab.
        const app = shell();
        expect(app.findComponent(CiRenderScreen).exists()).toBe(false);

        await expandShellGroups();
        tabButton("GitHub runners").click();
        await settle();

        expect(app.findComponent(CiRenderScreen).exists()).toBe(true);
    });

    it("takes the CI-render screen's sign-in button to the GitHub row, not to Settings left blind", async () => {
        // `openSettings()` used to be called with no anchor at all for this button, which
        // opened the sheet on whichever tab it last remembered - anywhere but the GitHub
        // sign-in row the button claims to open. A click that looks like it worked and
        // leaves the person exactly where they started is worse than no button.
        const app = shell();
        await expandShellGroups();
        tabButton("GitHub runners").click();
        await settle();

        app.findComponent(CiRenderScreen).vm.$emit("signIn");
        await settle();

        const settings = app.findComponent(AppSettings);
        expect(settings.props("open")).toBe(true);
        expect(settings.props("anchor")).toBe("github-account");
    });

    it("reaches the Pages-hosting surface through its tab, rather than leaving it in the bundle", async () => {
        const app = shell();
        expect(app.findComponent(PagesScreen).exists()).toBe(false);

        await expandShellGroups();
        tabButton("Publish to Pages").click();
        await settle();

        expect(app.findComponent(PagesScreen).exists()).toBe(true);
    });

    it("reaches the world-repository surface through its tab, rather than leaving it in the bundle", async () => {
        // The eighth feature this project built - a full sync-and-adopt engine and eleven
        // working IPC channels - and left with no door at all.
        const app = shell();
        expect(app.findComponent(WorldRepoScreen).exists()).toBe(false);

        await expandShellGroups();
        tabButton("World repository").click();
        await settle();

        expect(app.findComponent(WorldRepoScreen).exists()).toBe(true);
    });

    it("takes an adopted repository's project to the Projects page, open at that world", async () => {
        const app = shell();
        await expandShellGroups();
        tabButton("World repository").click();
        await settle();

        app.findComponent(WorldRepoScreen).vm.$emit("adopted", "/worlds/andyville");
        await settle();

        expect(tabLabels().some((label) => label !== null && label.startsWith("Projects"))).toBe(
            true,
        );
        const projects = app.findComponent(ProjectsScreen);
        expect(projects.exists()).toBe(true);
        expect(projects.props("openWorld")).toBe("/worlds/andyville");
    });

    it("routes the world-repository screen's Settings request to the dependency anchor it names", async () => {
        const app = shell();
        await expandShellGroups();
        tabButton("World repository").click();
        await settle();

        app.findComponent(WorldRepoScreen).vm.$emit("open-settings", "java-runtime");
        await settle();

        const settings = app.findComponent(AppSettings);
        expect(settings.props("open")).toBe(true);
        expect(settings.props("anchor")).toBe("java-runtime");
    });

    it("reaches the live-preview surface through its tab, rather than leaving it in the bundle", async () => {
        const app = shell();
        expect(app.findComponent(PreviewScreen).exists()).toBe(false);

        await expandShellGroups();
        tabButton("Watch it live").click();
        await settle();

        expect(app.findComponent(PreviewScreen).exists()).toBe(true);
    });

    it("puts the choice of where a render runs on the page where a render is started", async () => {
        // Three of the four places a render can go were reachable only from the bundle:
        // the local-versus-container choice and the whole SSH path had no control anywhere
        // in the application. This is that door.
        const app = shell();
        expect(currentDestination()).toBe("Home");

        tabButton("Make a map").click();
        await settle();

        const card = app.findComponent(RunLocationCard);
        expect(card.exists()).toBe(true);
        // All four answers named in one place, rather than three screens to find separately.
        expect(card.text()).toContain("On this computer");
        expect(card.text()).toContain("In a container on this computer");
        expect(card.text()).toContain("On another machine, over SSH");
        expect(card.text()).toContain("GitHub");
    });

    it("takes the guide's fourth choice to the GitHub-runners page", async () => {
        // The card names four places and can only start three of them; the fourth is a
        // workflow with a page of its own, and this is the link between them.
        const app = shell();
        tabButton("Make a map").click();
        await settle();

        app.findComponent(WorldScreen).vm.$emit("open-ci-render");
        await settle();

        expect(app.findComponent(CiRenderScreen).exists()).toBe(true);
    });

    it("sends the palette's server destination to that same page", async () => {
        const app = shell();

        app.findComponent(CommandPalette).vm.$emit("open-profiles");
        await settle();

        expect(app.findComponent(DashboardScreen).exists()).toBe(true);
    });

    it("takes the user to the map when a map is chosen from another page", async () => {
        // Choosing a map on the server list, or finishing a render in the wizard, would
        // otherwise load the map correctly and invisibly behind the page still on screen.
        const app = shell();
        await expandShellGroups();
        tabButton("Maps and servers").click();
        await settle();
        expect(app.findComponent(DashboardScreen).exists()).toBe(true);

        profilesStore.activeId = addLocalMap("/renders/overworld", "overworld").id;
        await settle();

        expect(document.querySelector(".mb-map-page")).not.toBeNull();
        // The rail says Map, which is the claim: choosing a map takes you to it. The server list
        // is still built behind the Work layer - unmounting a destination on every navigation
        // would throw away whatever somebody had part-filled on it - so "you left it" is a
        // destination change rather than a component disappearing.
        expect(currentDestination()).toBe("Map");
        expect(app.findComponent(DashboardScreen).exists()).toBe(true);
    });
});

describe("the settings surface closing", () => {
    it("tells the pages underneath, so a setting changed in it is not read once and forgotten", async () => {
        // The shell is the only thing that sees this happen: Settings is an in-app dialog,
        // not another window, so nothing underneath it gets a focus or visibility event.
        // Mojang download consent is changed in there, and the wizard used to sample it once
        // at mount - which made the review step's own "Open the setting" remedy a dead end.
        const app = shell();
        tabButton("Make a map").click();
        await settle();

        const before = app.findComponent(WorldScreen).props("settingsEpoch");

        const settings = document.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
        expect(settings).not.toBeNull();
        settings?.click();
        await settle();

        app.findComponent(AppSettings).vm.$emit("update:open", false);
        await settle();

        expect(app.findComponent(WorldScreen).props("settingsEpoch")).not.toBe(before);
    });
});

describe("the licence viewer", () => {
    it("reaches the docked EULA panel through the command palette, with no permanent FAB of its own", async () => {
        // EulaSurface's own doc comment claims a standalone route ("mount one in the shell
        // and open it from anywhere"), and for a while the "anywhere" was a third floating
        // button in the corner stack. That button is gone - four permanent buttons on every
        // screen was the clutter, and two of them opened panels most people read once - so
        // the standalone route is now the palette row wired to `eulaOpen` (plus the licence
        // card on Home, which HomeScreen.test.ts covers from its own side). This drives the
        // palette's emit exactly as choosing the row does, and proves the panel the shell
        // mounts actually opens.
        const app = shell();
        expect(app.findComponent(EulaSurface).exists()).toBe(true);
        expect(app.findComponent(EulaSurface).props("open")).toBe(false);

        // The corner stack holds the two workbench controls and nothing else.
        expect(document.querySelector('button[aria-label="The Minecraft licence"]')).toBeNull();
        // There is no corner stack at all any more. The two workbench controls that survived
        // the first cull moved into the rail footer and the Set up and help catalogue, so the
        // honest assertion is not "two remain" but "none of them float".
        expect(document.querySelectorAll(".mb-shell-fab")).toHaveLength(0);

        const panel = document.querySelector<HTMLElement>('[role="dialog"].mb-eula-surface');
        expect(panel).not.toBeNull();
        expect(panel?.style.display).toBe("none");

        app.findComponent(CommandPalette).vm.$emit("open-eula");
        await settle();

        expect(app.findComponent(EulaSurface).props("open")).toBe(true);
        expect(panel?.style.display).not.toBe("none");
        expect(panel?.textContent).toContain("The Minecraft licence");
    });
});

describe('"what is this?"', () => {
    it("reaches the docked welcome panel through the command palette, and stays reachable after first run", async () => {
        // Same "built, tested, unreachable" regression the EULA test above guards against,
        // for `WelcomeSurface`'s own claim to be a standalone route rather than only
        // existing inside the welcome step's bundle. Like the licence panel it no longer
        // has a permanent FAB - its routes are Home's introduction card and the palette
        // row driven here.
        const app = shell();
        expect(app.findComponent(WelcomeSurface).exists()).toBe(true);
        expect(app.findComponent(WelcomeSurface).props("open")).toBe(false);

        expect(document.querySelector('button[aria-label="What is this?"]')).toBeNull();

        const panel = document.querySelector<HTMLElement>('[role="dialog"].mb-welcome-surface');
        expect(panel).not.toBeNull();
        expect(panel?.style.display).toBe("none");

        app.findComponent(CommandPalette).vm.$emit("open-welcome");
        await settle();

        expect(app.findComponent(WelcomeSurface).props("open")).toBe(true);
        expect(panel?.style.display).not.toBe("none");
        expect(panel?.textContent).toContain("What is this?");
        expect(panel?.textContent).toContain("BlueMap turns a Minecraft world into a 3D map");
    });

    it('switches to "Make a map" and closes itself when "Start here" is pressed', async () => {
        const app = shell();
        app.findComponent(CommandPalette).vm.$emit("open-welcome");
        await settle();

        const start = [
            ...document.querySelectorAll<HTMLButtonElement>(".mb-welcome-surface button"),
        ].find((candidate) => (candidate.textContent ?? "").trim() === "Start here");
        expect(start, "no 'Start here' button in the panel").not.toBeUndefined();

        start?.click();
        await settle();

        expect(tabButton("Make a map").getAttribute("aria-selected")).toBe("true");
        expect(app.findComponent(WelcomeSurface).props("open")).toBe(false);
    });

    it('lands on Home - not straight on "Make a map" - the moment first-run setup genuinely completes', async () => {
        // Deliberately a different destination from the test right above. Pressing "Start
        // here" inside the panel is an explicit, in-the-moment choice by someone already
        // reading the panel's own description of the wizard, and `onWelcomeStart` still
        // sends that click straight to "Make a map" unchanged. Finishing setup without ever
        // opening the panel is not that choice - it is a first-time user's very first
        // moment in the app - and `App.vue`'s `onFirstRunFinished` used to treat the two as
        // the same thing, landing on the wizard directly and skipping Home, the screen built
        // for exactly this moment, every time. `FirstRunSetup` decides for itself whether to
        // show anything with no bridge installed, so its own `finished` event is exercised
        // directly here rather than by driving all four of its steps again -
        // `FirstRunSetup.test.ts` already proves the event fires only on a real success.
        const app = shell();
        await app.findComponent(FirstRunSetup).vm.$emit("finished");
        await settle();

        expect(
            [...document.querySelectorAll<HTMLElement>(".wl-rail-item")]
                .find(
                    (node) => node.querySelector(".wl-rail-label")?.textContent?.trim() === "Home",
                )
                ?.getAttribute("aria-current"),
        ).toBe("page");
        expect(app.findComponent(HomeDashboard).exists()).toBe(true);
    });
});

describe("the shell's appearance targets", () => {
    it("registers the title bar and the tab bar, so the editor can be pointed at them", () => {
        shell();

        const ids = appearanceTargets().value.map((entry) => entry.id);
        expect(ids).toContain("app.titleBar");
        expect(ids).toContain("app.tabBar");
    });

    it("opens the anchored editor straight from a Shift+right-click on the rail", async () => {
        shell();

        // The target that wrapped the tab bar wraps the application rail now: same registered id,
        // new home, because the rail is the chrome that is on screen no matter what.
        const target = document.querySelector<HTMLElement>(".mb-shell-body .mb-appearance-target");
        expect(target).not.toBeNull();

        target?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }));
        await settle();

        expect(document.body.textContent).toContain("Appearance of The application rail");
    });
});

describe("the options editor", () => {
    it("is closed until something opens it, and has no button of its own", () => {
        shell();

        expect(configHost()).toBeNull();
    });

    it("opens the editor into a full-bleed host rather than a floating card", async () => {
        const app = shell();

        await openOptionsEditor();

        const host = configHost();
        expect(host).not.toBeNull();
        expect(host?.classList.contains("mb-world-host")).toBe(true);
        expect(app.findComponent(ConfigScreen).exists()).toBe(true);
    });

    /*
     * Restart protection, proved through the real editor rather than through the updater's own
     * unit tests. `useUpdates.test.ts` already proves that a controller told it has unsaved work
     * refuses to restart; what it cannot prove is that anything in the shipping shell ever tells
     * it so. These two cases are the wiring: an editor that reports itself dirty, an `App.vue`
     * that collects both flags, and a banner whose Restart button is genuinely unpressable while
     * either of them is set.
     *
     * They are two cases rather than one because the two editors reach the flag by different
     * routes and each has its own way of going stale - the configuration editor clears on
     * unmount, the project editor clears on save - so a single case would leave whichever route
     * it did not take completely unguarded.
     */
    it("holds an update restart while the real config workspace is unsaved", async () => {
        let restartCalls = 0;
        const ready = {
            ...unknownUpdateState("0.1.0"),
            status: "ready" as const,
            readyVersion: "0.2.0",
        };
        (globalThis as { worldlens?: unknown }).worldlens = {
            updateState: async () => ready,
            checkForUpdates: async () => ready,
            restartToInstallUpdate: async () => {
                restartCalls += 1;
                return { ok: true as const, version: "0.2.0" };
            },
            onUpdateEvent: () => () => {},
        };
        const app = shell();
        await settle();

        expect(app.find(".mb-update-banner__restart").attributes("disabled")).toBeUndefined();

        await openOptionsEditor();

        const restart = app.find(".mb-update-banner__restart");
        expect(app.findComponent(ConfigScreen).text()).toContain("Unsaved changes");
        expect(restart.attributes("disabled")).toBeDefined();
        expect(app.find(".mb-update-banner").text().toLowerCase()).toContain("unsaved");
        await restart.trigger("click");
        expect(restartCalls).toBe(0);

        // Closed through the editor's own Escape route rather than by re-pressing a button,
        // because the button this used to toggle no longer exists - and closing this way also
        // exercises the unmount path that is what actually clears the flag.
        await app.find('[role="region"][aria-label="Server configuration"]').trigger("keydown", {
            key: "Escape",
        });
        await settle();
        expect(document.body.textContent).toContain("Discard unsaved configuration changes?");
        await discardConfigChanges();
        expect(app.find(".mb-update-banner__restart").attributes("disabled")).toBeUndefined();
    });

    it("holds an update restart when the project editor reports a visible unsaved edit", async () => {
        let restartCalls = 0;
        const ready = {
            ...unknownUpdateState("0.1.0"),
            status: "ready" as const,
            readyVersion: "0.2.0",
        };
        (globalThis as { worldlens?: unknown }).worldlens = {
            updateState: async () => ready,
            acknowledgeUpdateInstallOutcome: async () => undefined,
            checkForUpdates: async () => ready,
            restartToInstallUpdate: async () => {
                restartCalls += 1;
                return { ok: true as const, version: "0.2.0" };
            },
            onUpdateEvent: () => () => {},
        };
        const app = shell();
        // Projects is a Work job now rather than a tab that exists from the first frame, so it
        // has to be opened before it can be clicked - see `expandShellGroups`.
        await expandShellGroups();
        tabButton("Projects").click();
        await settle();

        const projects = app.findComponent(ProjectsScreen);
        expect(projects.exists()).toBe(true);
        projects.vm.$emit("dirty-change", true);
        await settle();

        const restart = app.find(".mb-update-banner__restart");
        expect(restart.attributes("disabled")).toBeDefined();
        expect(app.find(".mb-update-banner").text().toLowerCase()).toContain("unsaved");
        await restart.trigger("click");
        expect(restartCalls).toBe(0);
    });

    it("carries an exact palette target through to the render-mask field", async () => {
        const app = shell();

        app.findComponent(CommandPalette).vm.$emit("open-config", {
            screen: "maps",
            fieldPath: "render-mask",
        });
        await settle();

        const config = app.findComponent(ConfigScreen);
        expect(config.props("initialScreen")).toBe("maps");
        expect(config.props("initialFieldPath")).toBe("render-mask");
    });

    it("leaves the page behind it mounted but inert, so four steps of work survive a look at the config", async () => {
        const app = shell();
        tabButton("Make a map").click();
        await settle();
        expect(app.findComponent(WorldScreen).exists()).toBe(true);

        await openOptionsEditor();

        // The content goes inert, not the whole shell row. A page nobody can see is a page
        // nobody should reach with Tab - but the rail is beside the editor rather than behind
        // it, and marking the row inert took out the only navigation in the application at
        // the same moment the editor covered it, leaving Escape as the sole way back.
        expect(app.findComponent(WorldScreen).exists()).toBe(true);
        expect(document.querySelector(".mb-shell-content")?.hasAttribute("inert")).toBe(true);
        expect(document.querySelector(".mb-shell-body")?.hasAttribute("inert")).toBe(false);
    });

    it("keeps the rail outside the inert subtree while the options editor is open", async () => {
        const app = shell();
        await openOptionsEditor();
        expect(app.findComponent(ConfigScreen).exists()).toBe(true);

        // Walked rather than asserted on one element: `inert` applies to a whole subtree, so
        // the rail is only genuinely operable if nothing from it up to the shell row carries
        // the attribute. jsdom does not enforce `inert` behaviourally, so this checks the
        // markup contract; the rendered result is verified against a real browser.
        const rail = app.find(".wl-rail").element;
        for (let node: Element | null = rail; node !== null; node = node.parentElement) {
            expect(node.hasAttribute("inert")).toBe(false);
            if (node.classList.contains("mb-shell-body")) break;
        }
    });

    it("asks before Escape discards unsaved configuration, then closes explicitly", async () => {
        const app = shell();

        await openOptionsEditor();

        const host = configHost();
        expect(document.activeElement).toBe(host);

        await app.find('[role="region"][aria-label="Server configuration"]').trigger("keydown", {
            key: "Escape",
        });
        await settle();

        expect(document.body.textContent).toContain("Discard unsaved configuration changes?");
        await discardConfigChanges();
        expect(configHost()).toBeNull();
    });
});

describe("the rail notification history", () => {
    it("keeps raised notices out of a fixed overlay until the bell is explicitly opened", async () => {
        shell();
        // The first-run tutorial may legitimately record its own history entry when the full
        // shell mounts. It is already present before this interaction, so mark that baseline
        // read and assert the new event rather than making this overlay contract depend on
        // unrelated onboarding timing.
        await settle();
        markReviewed(notices);
        const historyBefore = notices.history.length;

        expect(document.querySelectorAll(".mb-config-notices")).toHaveLength(0);
        expect(activeNotificationHistory()).toBeNull();

        raiseNotice("warning", "The render engine is not installed.");
        await settle();

        const bell = notificationBell();
        expect(bell.getAttribute("aria-expanded")).toBe("false");
        expect(bell.getAttribute("aria-label")).toBe("Notifications, 1 unread");
        expect(notices.live).toEqual([]);
        expect(notices.history).toHaveLength(historyBefore + 1);
        expect(notices.history[0]?.message).toBe("The render engine is not installed.");
        expect(document.querySelectorAll(".mb-config-notices")).toHaveLength(0);
        expect(activeNotificationHistory()).toBeNull();

        bell.click();
        await settle();

        const history = activeNotificationHistory();
        expect(bell.getAttribute("aria-expanded")).toBe("true");
        expect(history).not.toBeNull();
        expect(history?.getAttribute("aria-label")).toBe("Notifications");
        expect(history?.querySelector('[role="region"]')?.getAttribute("aria-label")).toBe(
            "Notification centre",
        );
        expect(history?.textContent).toContain("The render engine is not installed.");
        // A history-only entry has no fixed toast to restore, so the panel cannot claim one is
        // already showing or offer a control that only mutates invisible queue state.
        expect(history?.textContent).not.toContain("Showing now");
        expect(history?.textContent).not.toContain("Show again");
    });
});

describe("a saved config folder", () => {
    it("closes the surface and names the folder that was written", async () => {
        const app = shell();

        await openOptionsEditor();

        app.findComponent(ConfigScreen).vm.$emit("saved", "/srv/bluemap/config");
        await settle();

        expect(configHost()).toBeNull();
        expect(document.querySelectorAll(".mb-config-notices")).toHaveLength(0);
        notificationBell().click();
        await settle();
        expect(activeNotificationHistory()?.textContent).toContain(
            "Saved the BlueMap configuration in /srv/bluemap/config.",
        );
    });
});

describe("Minecraft server detail navigation", () => {
    it("opens, changes detail tab, returns to the list, retains the record, and restores focus", async () => {
        const server = {
            id: "srv-focus",
            name: "Focus Server",
            flavour: "paper",
            minecraftVersion: "1.21",
            ref: { kind: "local-process", serverDir: "/srv/focus" },
            origin: "created",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            hasRconSecret: false,
            rconPort: null,
            writeScope: [],
        };
        const answer = <T>(value: T) => ({ ok: true as const, value });
        const bridge = {
            mcserver: {
                list: async () => answer([server]),
                get: async () => answer(server),
                save: async () => answer(server),
                forget: async () => answer(undefined),
                probe: async () =>
                    answer({
                        reachable: true,
                        runtimeVersion: "1.21",
                        message: "",
                        checkedAt: "now",
                        capabilities: {
                            canCreate: true,
                            canLifecycle: true,
                            canWriteFiles: true,
                            canDestroy: true,
                            console: "stdin",
                        },
                    }),
                status: async () =>
                    answer({
                        state: "running",
                        running: true,
                        startedAt: null,
                        exitCode: null,
                        checkedAt: "now",
                    }),
                start: async () => answer(undefined),
                stop: async () => answer(undefined),
                logTail: async () => answer([]),
                files: {
                    list: async () => answer([]),
                    read: async () =>
                        answer({ bytes: new Uint8Array(), hash: "", size: 0, truncated: false }),
                    write: async () =>
                        answer({ hash: "", size: 0, writtenAt: "now", backupPath: null }),
                },
                consoleOpen: async () => ({ sessionId: "s" }),
                consoleSend: async () => answer(undefined),
                consoleClose: async () => answer(undefined),
                onConsoleLine: () => () => undefined,
                webConsole: {
                    status: async () =>
                        answer({
                            running: false,
                            host: "127.0.0.1",
                            port: null,
                            loopbackOnly: true,
                            hasPassword: false,
                        }),
                    start: async () => answer(undefined),
                    stop: async () => answer(undefined),
                    setPassword: async () => answer(undefined),
                    bind: async () => answer(undefined),
                },
            },
        };
        (globalThis as { worldlens?: unknown }).worldlens = bridge;

        const app = shell();
        const workPane = app.findComponent({ name: "WorkPane" });
        const workApi = workPane.vm as unknown as {
            ensurePage: (id: string) => void;
            revealPage: (id: string) => void;
        };
        workApi.ensurePage("mcservers");
        workApi.revealPage("mcservers");
        await settle();
        await goTo("Work");
        await settle();

        expect(app.findComponent({ name: "ServerListScreen" }).text()).toContain("Focus Server");
        const controls = [
            ...document.querySelectorAll<HTMLElement>('[data-server-control="srv-focus"]'),
        ];
        expect(controls.length).toBeGreaterThanOrEqual(2);
        const origin = controls[controls.length - 1]!;
        origin.focus();
        origin.click();
        await settle();

        const panel = app.findComponent({ name: "WebConsolePanel" });
        expect(panel.exists()).toBe(true);
        const webTab = panel
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("Web console"));
        expect(webTab).toBeDefined();
        await webTab?.trigger("click");
        await settle();

        const appApi = app.vm as unknown as {
            shell: { select: (destination: "host" | "work") => void };
            kid: { enabled: { value: boolean } };
        };
        appApi.shell.select("host");
        await settle();
        expect(app.findAllComponents({ name: "WebConsolePanel" })).toHaveLength(1);
        appApi.shell.select("work");
        await settle();
        expect(app.findAllComponents({ name: "WebConsolePanel" })).toHaveLength(1);

        appApi.kid.enabled.value = true;
        await settle();
        const kidShell = app.findComponent(KidShell);
        expect(kidShell.exists()).toBe(true);
        (kidShell.vm as unknown as { revealJob: (id: string) => void }).revealJob("mcservers");
        await settle();
        expect(app.findAllComponents({ name: "WebConsolePanel" })).toHaveLength(1);
        appApi.kid.enabled.value = false;
        await settle();

        await app.find('[data-test="back-to-minecraft-servers"]').trigger("click");
        await settle();

        const list = app.findComponent({ name: "ServerListScreen" });
        expect(list.exists()).toBe(true);
        expect(list.text()).toContain("Focus Server");
        expect(document.activeElement?.getAttribute("data-server-control")).toBe("srv-focus");
    });
});
