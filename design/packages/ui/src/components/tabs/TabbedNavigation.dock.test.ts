// @vitest-environment jsdom

/**
 * The Work workspace's docking layer, driven through the real component.
 *
 * jsdom computes no layout, so nothing here asserts a position or a size; what it proves is
 * the model underneath the pixels: which tabs each pane holds, what is persisted, what a
 * damaged saved layout falls back to, and that every drag has a command that does the same
 * thing. Sizes are not mocked because nothing asserted depends on one.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import TabbedNavigation from "./TabbedNavigation.vue";
import { writeTabWorkspace, readTabWorkspace } from "./tabStorage.js";
import { dockStorageKey, namedLayoutsStorageKey } from "./dockLayoutStorage.js";
import {
    normalizeStrip,
    type TabPage,
    type TabRecord,
    type TabStripState,
    type TabWorkspaceState,
} from "./tabModel.js";

const cells = new Map<string, string>();
const KEY = "dock-test-tabs";

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
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
    Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as VisualViewport,
    });
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

const PAGES: readonly TabPage[] = [
    { id: "map", label: "Map", icon: null },
    { id: "world", label: "Make a map", icon: null },
    { id: "servers", label: "Servers", icon: null },
    { id: "tools", label: "Tools", icon: null },
];

function tab(id: string, pageId: string): TabRecord {
    const label = PAGES.find((page) => page.id === pageId)?.label ?? pageId;
    return { id, pageId, label, icon: null, dirty: false, appearance: null };
}

function seedWorkspace(): TabWorkspaceState {
    const strip: TabStripState = normalizeStrip({
        id: "strip-main",
        label: "Main",
        windowId: "window-main",
        windowLabel: "This window",
        placement: "top",
        tabs: [tab("tab-1", "map"), tab("tab-2", "world"), tab("tab-3", "servers"), tab("tab-4", "tools")],
        groups: [
            { id: "group-1", name: "Build", color: "primary", collapsed: false, tabIds: ["tab-3", "tab-4"], appearance: null },
        ],
        pinnedOrder: ["tab-1"],
        slots: [
            { kind: "tab", tabId: "tab-2" },
            { kind: "group", groupId: "group-1" },
        ],
        activeTabId: "tab-2",
    });
    return { strips: [strip] };
}

const Host = defineComponent({
    setup(_, { expose }) {
        const nav = { value: null as InstanceType<typeof TabbedNavigation> | null };
        expose({ nav });
        return () =>
            h(VApp, null, {
                default: () => [
                    h(
                        TabbedNavigation,
                        {
                            ref: (instance: unknown) => {
                                nav.value = instance as InstanceType<typeof TabbedNavigation> | null;
                            },
                            pages: PAGES,
                            storageKey: KEY,
                            dock: true,
                            appearance: "jobs",
                        },
                        {
                            map: () => h("p", { class: "page-map" }, "the map"),
                            world: () => h("p", { class: "page-world" }, "the wizard"),
                            servers: () => h("p", { class: "page-servers" }, "the servers"),
                            tools: () => h("p", { class: "page-tools" }, "the tools"),
                        },
                    ),
                ],
            });
    },
});

type Mounted = VueWrapper<InstanceType<typeof Host>>;
let mounted: Mounted | null = null;

async function settle(): Promise<void> {
    for (let n = 0; n < 6; n++) await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let n = 0; n < 4; n++) await nextTick();
}

async function open(): Promise<Mounted> {
    mounted = mount(Host, { global: { plugins: [vuetify, i18n] }, attachTo: document.body });
    await settle();
    return mounted;
}

function nav(view: Mounted): InstanceType<typeof TabbedNavigation> {
    const instance = (view.vm as unknown as { nav: { value: InstanceType<typeof TabbedNavigation> | null } }).nav.value;
    if (instance === null) throw new Error("the workspace did not mount");
    return instance;
}

const tabLabels = (view: Mounted): string[] =>
    view.findAll('[role="tab"]').map((node) => node.attributes("title") ?? "");

const panes = (view: Mounted): number => view.findAll(".mb-tabs").length;

function storedStrips(): { id: string; tabs: { id: string; pageId: string }[] }[] {
    const raw = cells.get(KEY);
    return raw === undefined ? [] : (JSON.parse(raw) as { strips: never[] }).strips;
}

beforeEach(() => {
    cells.clear();
});

afterEach(() => {
    mounted?.unmount();
    mounted = null;
    document.body.innerHTML = "";
});

describe("a returning person's saved workspace", () => {
    it("keeps every tab, pin, group and the order when there is no saved arrangement", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        const before = cells.get(KEY);
        const view = await open();

        // Pinned first, then the lone tab, then the group's members: the strip's own order.
        expect(tabLabels(view).slice(0, 4)).toEqual(["Map", "Make a map", "Servers", "Tools"]);
        expect(panes(view)).toBe(1);
        // One strip means one tablist and one tabpanel: dockview's own roles are not exposed.
        expect(view.findAll('[role="tablist"]')).toHaveLength(1);
        expect(view.findAll('[role="tab"]')).toHaveLength(4);
        expect(view.findAll('[role="tabpanel"]')).toHaveLength(1);
        expect(view.find(".page-world").exists()).toBe(true);

        const after = readTabWorkspace(undefined, KEY);
        expect(after?.strips).toHaveLength(1);
        const only = after?.strips[0];
        expect(only?.pinnedOrder).toEqual(["tab-1"]);
        expect(only?.groups[0]?.name).toBe("Build");
        expect(only?.groups[0]?.tabIds).toEqual(["tab-3", "tab-4"]);
        expect(only?.activeTabId).toBe("tab-2");
        // The tab workspace under its own key is the shape it always was.
        expect(JSON.parse(after === null ? "{}" : (cells.get(KEY) ?? "{}")).version).toBe(JSON.parse(before ?? "{}").version);
    });

    it("opens on a fresh install with the one seeded pane", async () => {
        const view = await open();
        expect(panes(view)).toBe(1);
        expect(view.findAll('[role="tab"]').length).toBeGreaterThan(0);
        expect(view.findAll(".mb-tabs__panel, .mb-tabs__empty").length).toBe(1);
    });
});

describe("a damaged saved layout never empties the workspace", () => {
    const expectWorking = (view: Mounted): void => {
        expect(panes(view)).toBe(1);
        expect(tabLabels(view)).toContain("Map");
        expect(view.findAll(".mb-tabs__panel")).toHaveLength(1);
        expect(view.find(".page-world").exists()).toBe(true);
    };

    it("ignores unparseable JSON", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        cells.set(dockStorageKey(KEY), "{this is not json");
        expectWorking(await open());
    });

    it("ignores a layout that describes different panes than the tabs have", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        cells.set(
            dockStorageKey(KEY),
            JSON.stringify({
                version: 1,
                activeStripId: "ghost",
                layout: { grid: { root: { type: "branch", data: [] } }, panels: { ghost: { id: "ghost" } } },
            }),
        );
        expectWorking(await open());
    });

    it("recovers from a layout that names the right panes but that dockview cannot load", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        cells.set(
            dockStorageKey(KEY),
            JSON.stringify({
                version: 1,
                activeStripId: "strip-main",
                layout: {
                    grid: { root: { type: "branch", data: "nonsense" }, width: -4, height: "x", orientation: 9 },
                    panels: { "strip-main": { id: "strip-main", contentComponent: "strip" } },
                },
            }),
        );
        expectWorking(await open());
    });

    it("still shows every strip when a stored layout lists fewer panes than there are strips", async () => {
        const workspace = seedWorkspace();
        const second: TabStripState = normalizeStrip({
            ...workspace.strips[0]!,
            id: "strip-2",
            label: "Pane 2",
            tabs: [tab("tab-7", "tools")],
            groups: [],
            pinnedOrder: [],
            slots: [{ kind: "tab", tabId: "tab-7" }],
            activeTabId: "tab-7",
        });
        const first = normalizeStrip({
            ...workspace.strips[0]!,
            tabs: workspace.strips[0]!.tabs.filter((t) => t.id !== "tab-4"),
            groups: [{ ...workspace.strips[0]!.groups[0]!, tabIds: ["tab-3"] }],
        });
        writeTabWorkspace({ strips: [first, second] }, undefined, KEY);
        cells.set(
            dockStorageKey(KEY),
            JSON.stringify({
                version: 1,
                activeStripId: null,
                layout: { grid: { root: { type: "branch", data: [] } }, panels: { "strip-main": { id: "strip-main" } } },
            }),
        );
        const view = await open();
        expect(panes(view)).toBe(2);
        expect(view.findAll(".mb-tabs__panel")).toHaveLength(2);
    });
});

describe("splitting and moving by command", () => {
    it("splits the active tab into a new pane and persists both strips", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        const view = await open();
        nav(view).layoutCommand("split-right");
        await settle();

        expect(panes(view)).toBe(2);
        expect(view.findAll(".mb-tabs__panel")).toHaveLength(2);
        const strips = storedStrips();
        expect(strips).toHaveLength(2);
        expect(strips.flatMap((s) => s.tabs.map((t) => t.pageId)).sort()).toEqual(["map", "servers", "tools", "world"]);
        // Everything that was open is still open, in exactly one pane each.
        expect(new Set(strips.flatMap((s) => s.tabs.map((t) => t.pageId))).size).toBe(4);
    });

    it("keeps a pinned tab pinned and protected when it is split into a new pane", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        const view = await open();
        const pinned = view.findAll('[role="tab"]').find((node) => node.attributes("aria-label") === "Map, pinned");
        expect(pinned).toBeDefined();
        await pinned?.trigger("click");
        await settle();
        nav(view).layoutCommand("split-right");
        await settle();

        expect(panes(view)).toBe(2);
        expect(view.findAll('[role="tablist"]')).toHaveLength(2);
        const names = view.findAll('[role="tab"]').map((node) => node.attributes("aria-label"));
        expect(names).toContain("Map, pinned");
        expect(names).not.toContain("Map");
        const strips = storedStrips() as unknown as { pinnedOrder: string[]; tabs: { id: string; pageId: string }[] }[];
        const holder = strips.find((strip) => strip.tabs.some((tab) => tab.pageId === "map"));
        const mapId = holder?.tabs.find((tab) => tab.pageId === "map")?.id ?? "";
        expect(holder?.pinnedOrder).toContain(mapId);
    });

    it("moves the focused tab to the next pane and removes a pane it empties", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        const view = await open();
        nav(view).layoutCommand("split-below");
        await settle();
        expect(panes(view)).toBe(2);

        // The new pane holds one tab and has focus; moving it back empties that pane.
        nav(view).layoutCommand("next-pane");
        await settle();
        expect(panes(view)).toBe(1);
        expect(storedStrips()).toHaveLength(1);
        expect(storedStrips()[0]?.tabs).toHaveLength(4);
    });

    it("says why a lone tab cannot be split instead of doing nothing silently", async () => {
        const lone: TabWorkspaceState = {
            strips: [normalizeStrip({ ...seedWorkspace().strips[0]!, tabs: [tab("tab-1", "map")], groups: [], pinnedOrder: [], slots: [{ kind: "tab", tabId: "tab-1" }], activeTabId: "tab-1" })],
        };
        writeTabWorkspace(lone, undefined, KEY);
        const view = await open();
        nav(view).layoutCommand("split-right");
        await settle();
        expect(panes(view)).toBe(1);
        expect(view.find(".mb-dock__live").text()).toContain("cannot be split");
    });

    it("keeps tab ids unique across panes so search results never collide", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        const view = await open();
        nav(view).layoutCommand("split-left");
        await settle();
        nav(view).layoutCommand("split-above");
        await settle();
        const ids = storedStrips().flatMap((s) => s.tabs.map((t) => t.id));
        expect(new Set(ids).size).toBe(ids.length);
        const entries = nav(view).discoveryEntries.map((entry) => entry.id);
        expect(new Set(entries).size).toBe(entries.length);
    });

    it("restores the split after a remount, from the strips and the saved arrangement", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        let view = await open();
        nav(view).layoutCommand("split-right");
        await settle();
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(cells.has(dockStorageKey(KEY))).toBe(true);
        view.unmount();
        mounted = null;

        view = await open();
        expect(panes(view)).toBe(2);
        expect(view.findAll(".mb-tabs__panel")).toHaveLength(2);
    });

    it("splits through the tab context menu, not only the command", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        const view = await open();
        const target = view.findAll('[role="tab"]').find((node) => node.attributes("title") === "Make a map");
        expect(target).toBeDefined();
        await target?.trigger("contextmenu");
        await settle();
        const row = [...document.body.querySelectorAll<HTMLElement>("[role='menuitem'], .v-list-item, button")].find(
            (node) => (node.textContent ?? "").trim() === "Split this tab to the right",
        );
        expect(row).toBeDefined();
        row?.click();
        await settle();
        expect(panes(view)).toBe(2);
    });
});

describe("the pointer drag has a drop zone for every command", () => {
    it("raises five zones on each pane during a tab drag, and a right-edge drop splits", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        const view = await open();
        const tabNode = view.findAll('[role="tab"]')[1];
        expect(tabNode).toBeDefined();
        tabNode?.element.dispatchEvent(new Event("dragstart", { bubbles: true }));
        await settle();
        const zones = [...document.body.querySelectorAll<HTMLElement>("[data-dock-zone]")];
        expect(zones.map((zone) => zone.dataset["dockZone"]).sort()).toEqual(["above", "below", "centre", "left", "right"]);
        zones.find((zone) => zone.dataset["dockZone"] === "right")?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
        await settle();
        expect(panes(view)).toBe(2);
        expect(document.body.querySelectorAll("[data-dock-zone]")).toHaveLength(0);
    });
});

describe("named layouts", () => {
    it("saves, applies, renames and deletes, and keeps them across a remount", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        let view = await open();
        nav(view).layoutCommand("split-right");
        await settle();
        expect(nav(view).saveLayout("Side by side")).toBe("saved");
        expect(JSON.parse(cells.get(namedLayoutsStorageKey(KEY)) ?? "{}").layouts).toHaveLength(1);

        // Back to one pane, then apply the saved arrangement.
        nav(view).resetLayout();
        await settle();
        expect(panes(view)).toBe(1);
        const id = nav(view).namedLayouts[0]?.id ?? "";
        expect(nav(view).applyLayout(id)).toBe(true);
        await settle();
        expect(panes(view)).toBe(2);
        expect(new Set(storedStrips().flatMap((s) => s.tabs.map((t) => t.pageId))).size).toBe(4);

        view.unmount();
        mounted = null;
        view = await open();
        expect(nav(view).namedLayouts.map((layout) => layout.name)).toEqual(["Side by side"]);
    });

    it("refuses an empty name and says nothing was saved", async () => {
        const view = await open();
        expect(nav(view).saveLayout("   ")).toBe("empty-name");
        expect(cells.has(namedLayoutsStorageKey(KEY))).toBe(false);
    });

    it("reset folds every pane back into one without closing a tab", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        const view = await open();
        nav(view).layoutCommand("split-right");
        await settle();
        nav(view).layoutCommand("split-below");
        await settle();
        expect(panes(view)).toBeGreaterThan(1);
        nav(view).resetLayout();
        await settle();
        expect(panes(view)).toBe(1);
        const only = storedStrips();
        expect(only).toHaveLength(1);
        expect(only[0]?.tabs).toHaveLength(4);
    });
});

describe("floating and maximising", () => {
    it("floats a pane, docks it back and maximises it, announcing each", async () => {
        writeTabWorkspace(seedWorkspace(), undefined, KEY);
        const view = await open();
        nav(view).layoutCommand("split-right");
        await settle();
        const live = (): string => view.find(".mb-dock__live").text();

        nav(view).layoutCommand("float");
        await settle();
        expect(live()).toContain("floating");

        nav(view).layoutCommand("dock");
        await settle();
        expect(live()).toContain("docked");

        nav(view).layoutCommand("maximize");
        await settle();
        expect(live()).toContain("fills");
        nav(view).layoutCommand("maximize");
        await settle();
        expect(live()).toContain("restored");
        // Through all of it every tab is still reachable.
        expect(new Set(storedStrips().flatMap((s) => s.tabs.map((t) => t.pageId))).size).toBe(4);
    });
});

describe("docking off", () => {
    it("draws the one pane directly with no layout engine, as every other strip does", async () => {
        const view = mount(
            defineComponent({
                setup: () => () =>
                    h(VApp, null, {
                        default: () => [
                            h(TabbedNavigation, { pages: PAGES, storageKey: "plain-tabs" }, { map: () => h("p", "map") }),
                        ],
                    }),
            }),
            { global: { plugins: [vuetify, i18n] }, attachTo: document.body },
        );
        await settle();
        expect(view.find(".mb-dock").exists()).toBe(false);
        expect(view.find(".dv-shell").exists()).toBe(false);
        expect(view.findAll(".mb-tabs")).toHaveLength(1);
        expect(view.find("[data-strip-id]").exists()).toBe(false);
        view.unmount();
    });
});
