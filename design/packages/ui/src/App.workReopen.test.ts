// @vitest-environment jsdom
/**
 * Work after the app opens again.
 *
 * These cases mount the whole shell, as `App.test.ts` does, but live in their own file because
 * each one mounts it twice. `App.test.ts` already runs close to the worker's memory ceiling (see
 * the pool comment in `vitest.config.ts`), and a file of its own gets its own isolated fork.
 *
 * The defect they guard: the shell's tab-workspace migration used to run in `onMounted`, after
 * Work's tab strip had already read storage. The strip kept the old workspace in memory and its
 * next change wrote that stale copy over the migrated one. A saved workspace with no strip at
 * all then made every tab action a no-op, so Work stayed empty and "Make a map" opened nothing.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import App from "./App.vue";
import { HomeDashboard } from "./components/home/index.js";
import { FRESH_WORKSPACE_JOB_IDS } from "./components/shell/jobRegistry.js";
import { markMigrationRan } from "./components/shell/tabWorkspaceMigration.js";
import { TOOL_HUBS } from "./components/shell/toolHubs.js";
import { DEFAULT_TAB_STORAGE_KEY } from "./components/tabs/tabStorage.js";

vi.setConfig({ testTimeout: 60_000 });

const cells = new Map<string, string>();

beforeAll(() => {
    // jsdom lacks these; see the same block in `App.test.ts` for why each one is needed.
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

/** The adult shell is what Work lives in; Kid Mode is forced off as in `App.test.ts`. */
const KID_MODE_ENABLED_KEY = "bluemap-kid-mode";

let wrapper: VueWrapper | null = null;

function shell(): VueWrapper {
    wrapper = mount(App, { global: { plugins: [vuetify, i18n()] }, attachTo: document.body });
    return wrapper;
}

function remount(): void {
    wrapper?.unmount();
    document.body.innerHTML = "";
    shell();
}

async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

async function goTo(destination: "Home" | "Map" | "Work"): Promise<void> {
    const item = [...document.querySelectorAll<HTMLElement>(".wl-rail-item")].find(
        (node) => node.querySelector(".wl-rail-label")?.textContent?.trim() === destination,
    );
    if (item === undefined) throw new Error(`the rail renders no ${destination} item`);
    item.click();
    await settle();
}

function tabLabels(): (string | null)[] {
    return [...document.querySelectorAll<HTMLElement>('.wl-work [role="tab"]')].map((node) =>
        node.getAttribute("aria-label"),
    );
}

/** The page ids in the persisted Work workspace, which is what the next launch restores. */
function storedPageIds(): string[] {
    const raw = cells.get(DEFAULT_TAB_STORAGE_KEY);
    if (raw === undefined) return [];
    const parsed = JSON.parse(raw) as { strips: { tabs: { pageId: string }[] }[] };
    return parsed.strips.flatMap((strip) => strip.tabs.map((tab) => tab.pageId));
}

/** Presses the Home dashboard's new-map action: the same reveal path "Make a map" uses. */
async function pressNewMap(): Promise<void> {
    await goTo("Home");
    wrapper?.findComponent(HomeDashboard).vm.$emit("new-map");
    await settle();
}

/** The key and ids `WorkPane.vue` records once it has offered new pages to a workspace. */
const OFFERED_KEY = "worldlens-work-offered-pages";

function markPagesOffered(): void {
    cells.set(OFFERED_KEY, JSON.stringify([...FRESH_WORKSPACE_JOB_IDS, ...TOOL_HUBS.map((hub) => hub.id)]));
}

function emptyStrip(): Record<string, unknown> {
    return {
        id: "strip-main",
        label: "Main",
        windowId: "window-main",
        windowLabel: "",
        placement: "top",
        tabs: [],
        groups: [],
        pinnedOrder: [],
        slots: [],
        activeTabId: null,
    };
}

beforeEach(() => {
    cells.clear();
    cells.set(KID_MODE_ENABLED_KEY, "false");
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

describe("Work after the app opens again", () => {
    it("keeps the tools tab it opened on the first launch", async () => {
        shell();
        await settle();
        remount();
        await settle();
        await goTo("Work");
        expect(tabLabels()).toEqual(["Make a map, pinned", "Universal features"]);
    });

    it("opens a tab when a returning user's saved strip has no tabs left", async () => {
        // A regression guard rather than the defect itself: a saved strip with no tabs, after
        // the migration and the one-time page offer, must still let a reveal open a tab.
        cells.set(DEFAULT_TAB_STORAGE_KEY, JSON.stringify({ version: 2, strips: [emptyStrip()] }));
        markMigrationRan();
        markPagesOffered();
        shell();
        await settle();

        await pressNewMap();

        expect(tabLabels()).toContain("Projects");
        expect(storedPageIds()).toContain("projects");
    });

    it("never opens Work blank on a saved strip the old build emptied", async () => {
        // The exact shape an installed profile was left in by the stale-strip defect: no tabs,
        // the four seeded groups still present as empty slots, the migration recorded as done
        // and the one-time page offer already used.
        const groups = ["seed-worlds", "seed-rendering", "seed-finished", "seed-copies"];
        cells.set(
            DEFAULT_TAB_STORAGE_KEY,
            JSON.stringify({
                version: 2,
                strips: [
                    {
                        ...emptyStrip(),
                        groups: groups.map((id) => ({
                            id,
                            name: id,
                            color: "info",
                            collapsed: false,
                            tabIds: [],
                            appearance: null,
                        })),
                        slots: groups.map((groupId) => ({ kind: "group", groupId })),
                    },
                ],
            }),
        );
        markMigrationRan();
        markPagesOffered();
        shell();
        await settle();
        await goTo("Work");

        // A strip in that shape is not accepted as a saved layout, so Work opens on its own
        // fresh layout instead of on nothing.
        expect(tabLabels()).toContain("Make a map, pinned");
    });

    it("does not let the first launch's stale strip overwrite the migrated workspace", async () => {
        // A workspace from before the shell moved to jobs, with Home and Map as tabs.
        cells.set(
            DEFAULT_TAB_STORAGE_KEY,
            JSON.stringify({
                version: 2,
                strips: [
                    {
                        id: "strip-main",
                        label: "Main",
                        windowId: "window-main",
                        windowLabel: "",
                        placement: "top",
                        tabs: [
                            { id: "t1", pageId: "home", label: "Home", icon: "", appearance: null },
                            { id: "t2", pageId: "map", label: "Map", icon: "", appearance: null },
                        ],
                        groups: [],
                        pinnedOrder: [],
                        slots: [],
                        activeTabId: "t1",
                    },
                ],
            }),
        );
        // A returning user: the one-time offer of new pages already ran on an earlier build, so
        // nothing re-adds the landing job if the migrated workspace is lost.
        markPagesOffered();
        shell();
        await settle();

        // The first launch itself already shows the migrated workspace. The stale strip used
        // to stay in memory here with the old rail pages pruned out, so Work was blank.
        await goTo("Work");
        expect(tabLabels()).toContain("Make a map, pinned");

        // Opening another job keeps the migrated workspace rather than writing the stale strip
        // back over it.
        await pressNewMap();
        expect(tabLabels()).toContain("Projects");
        expect(storedPageIds()).not.toContain("home");
        expect(storedPageIds()).not.toContain("map");
        expect(storedPageIds()).toEqual(expect.arrayContaining(["world", "projects"]));

        remount();
        await settle();
        await goTo("Work");
        expect(tabLabels()).toEqual(expect.arrayContaining(["Make a map, pinned", "Projects"]));
    });
});
