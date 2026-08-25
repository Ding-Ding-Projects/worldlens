// @vitest-environment jsdom

/**
 * The hosted folder picker, mounted.
 *
 * The states worth pinning are the ones that look alike on screen and mean different things.
 * "This folder is empty", "that folder could not be read" and "nothing matches your search"
 * would all be a blank panel if nobody insisted otherwise, and only the first of them means
 * there is nothing there. A person who cannot tell those apart concludes the software is
 * broken, which is the specific failure this component exists to avoid.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import MountRootBrowser from "./MountRootBrowser.vue";
import type { MountBrowserBridge, MountListingSummary } from "./mountBrowserHost.js";

const vuetify = createVuetify({ components, directives });
const i18n = createI18n({ legacy: false, locale: "en", messages: { en: {} } });

beforeAll(() => {
    // `v-dialog` runs Vuetify's real overlay machinery, which reads these unguarded. jsdom
    // implements none of them, so without the stubs every test here fails on the environment
    // rather than on anything the component did. Same block as `ChangelogViewer.test.ts`,
    // which opens a real anchored overlay for the same reason.
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
    document.elementsFromPoint = (): Element[] => [];
    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        onresize: null,
        onscroll: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as VisualViewport;
});

const ROOTS = [
    { id: "worlds", label: "Worlds", writable: false },
    { id: "out", label: "Renders", writable: true },
];

function listing(over: Partial<MountListingSummary> = {}): MountListingSummary {
    return {
        rootId: "worlds",
        rootLabel: "Worlds",
        writable: false,
        path: "/data/worlds",
        parent: null,
        entries: [
            { name: "overworld", kind: "folder", path: "/data/worlds/overworld" },
            { name: "level.dat", kind: "file", path: "/data/worlds/level.dat" },
        ],
        truncated: false,
        ...over,
    };
}

function stubBridge(over: Partial<MountBrowserBridge> = {}): MountBrowserBridge {
    return {
        list: async () => await Promise.resolve(ROOTS),
        browse: async () => await Promise.resolve({ ok: true as const, listing: listing() }),
        ...over,
    };
}

/**
 * Torn down between tests, because `v-dialog` teleports its content to `document.body` and
 * leaves it there. Without this, every test reads its predecessors' markup as well as its
 * own, and an assertion that something is *absent* passes or fails on whichever test ran
 * before it. That is the worst kind of failure: order-dependent, and green on a rerun.
 */
let current: ReturnType<typeof mount> | null = null;

afterEach(() => {
    current?.unmount();
    current = null;
    document.body.innerHTML = "";
});

async function open(props: Record<string, unknown> = {}) {
    const wrapper = mount(MountRootBrowser, {
        props: { modelValue: true, title: "Choose a folder", bridge: stubBridge(), ...props },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    });
    current = wrapper as unknown as ReturnType<typeof mount>;
    await flushPromises();
    return wrapper;
}

/**
 * The dialog teleports, so everything here reads and clicks the document rather than the
 * wrapper's own subtree. `wrapper.findAll` returns nothing at all for teleported content,
 * which is worse than it sounds: a click on nothing is silent, so the assertion that follows
 * fails describing the wrong thing entirely.
 */
const text = () => document.body.textContent ?? "";

async function clickListItem(index: number): Promise<void> {
    const items = [...document.querySelectorAll(".v-list-item")] as HTMLElement[];
    expect(items.length).toBeGreaterThan(index);
    items[index]?.click();
    await flushPromises();
}

async function clickButtonSaying(label: string): Promise<void> {
    const buttons = [...document.querySelectorAll(".v-btn")] as HTMLElement[];
    const target = buttons.find((button) => (button.textContent ?? "").includes(label));
    expect(target, `no button reading "${label}"`).toBeTruthy();
    target?.click();
    await flushPromises();
}

describe("choosing a folder in a deployment with no desktop", () => {
    it("offers the mounted folders as the starting point", async () => {
        await open();

        expect(text()).toContain("Worlds");
        expect(text()).toContain("Renders");
    });

    it("says plainly when nothing is mounted, rather than showing an empty list", async () => {
        await open({ bridge: stubBridge({ list: async () => await Promise.resolve([]) }) });

        expect(text()).toContain("no folders mounted");
    });

    it("offers only writable folders when the caller needs to write", async () => {
        await open({ writableOnly: true });

        expect(text()).toContain("Renders");
        expect(text()).not.toContain("Worlds");
    });

    it("tells an unreadable folder apart from an empty one", async () => {
        await open({
            bridge: stubBridge({
                browse: async () =>
                    await Promise.resolve({ ok: false as const, reason: "That folder could not be read." }),
            }),
        });
        await clickListItem(0);

        expect(text()).toContain("could not be read");
        expect(text()).not.toContain("This folder is empty");
    });

    it("says a folder is empty when it really is", async () => {
        await open({
            bridge: stubBridge({
                browse: async () =>
                    await Promise.resolve({ ok: true as const, listing: listing({ entries: [] }) }),
            }),
        });
        await clickListItem(0);

        expect(text()).toContain("This folder is empty");
    });

    it("does not offer a file as the answer when a folder was asked for", async () => {
        await open({ mode: "folder" });
        await clickListItem(0);

        expect(text()).toContain("overworld");
        expect(text()).not.toContain("level.dat");
    });

    it("offers only matching files when an extension was asked for", async () => {
        await open({ mode: "file", extensions: ["dat"] });
        await clickListItem(0);

        expect(text()).toContain("level.dat");
    });

    it("returns the folder being viewed, not the root it started from", async () => {
        const wrapper = await open({
            bridge: stubBridge({
                browse: async () =>
                    await Promise.resolve({
                        ok: true as const,
                        listing: listing({ path: "/data/worlds/overworld", parent: "/data/worlds" }),
                    }),
            }),
        });
        await clickListItem(0);

        await clickButtonSaying("Use this folder");

        expect(wrapper.emitted("choose")?.[0]).toEqual(["/data/worlds/overworld"]);
    });

    it("says when a folder held more than it will list, rather than stopping quietly", async () => {
        const wrapper = await open({
            bridge: stubBridge({
                browse: async () =>
                    await Promise.resolve({ ok: true as const, listing: listing({ truncated: true }) }),
            }),
        });
        await clickListItem(0);

        expect(text()).toContain("more than can be listed");
    });

    it("says so when this build cannot list mounted folders at all", async () => {
        // The all-or-nothing rule: a desktop build has no mounts bridge, and the honest
        // answer is to say so rather than render an empty picker that never fills in.
        await open({ bridge: null });

        expect(text()).toContain("cannot list mounted folders");
    });
});
