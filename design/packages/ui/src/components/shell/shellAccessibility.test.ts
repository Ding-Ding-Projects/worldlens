// @vitest-environment jsdom

/**
 * The new shell surfaces, judged on behaviour rather than on snapshots.
 *
 * A snapshot proves the markup did not change. It cannot prove a button is reachable, that a
 * screen reader is told what it does, or that the only thing distinguishing two states is not a
 * colour - and every accessibility defect this project has actually shipped was one of those
 * three. So these assert roles, names, keyboard operation and the presence of a non-colour
 * signal, on mounted components, the way an assistive technology would find them.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import AppRail from "./AppRail.vue";
import ProblemsPanel from "./ProblemsPanel.vue";
import StatusStrip from "./StatusStrip.vue";
import type { Problem } from "./problemsAdapter.js";

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
        locale: "en",
        fallbackLocale: "en",
        messages: { en: {} },
        missingWarn: false,
        fallbackWarn: false,
    });
}

function mountRail(props: Record<string, unknown> = {}) {
    return mount(AppRail, {
        props: {
            destination: "home",
            openJobCount: 0,
            unreadCount: 0,
            productName: "Worldlens",
            ...props,
        },
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
}

describe("the application rail", () => {
    it("is a labelled landmark naming the product, so it can be jumped to", () => {
        const rail = mountRail();
        const nav = rail.find("nav");

        expect(nav.exists()).toBe(true);
        // Named with the product rather than "Navigation": somebody running two of these
        // applications side by side hears which one they are in.
        expect(nav.attributes("aria-label")).toContain("Worldlens");
    });

    it("makes every destination a real button with a visible label", () => {
        const rail = mountRail();
        const items = rail.findAll(".wl-rail-item");

        // Home, Map, Host Server, Work. The count is asserted rather than merely iterated so
        // that a destination quietly disappearing fails here instead of being noticed by
        // somebody who went looking for it and could not find it.
        expect(items).toHaveLength(4);
        expect(items.map((item) => item.find(".wl-rail-label").text())).toContain("Host Server");
        for (const item of items) {
            expect(item.element.tagName).toBe("BUTTON");
            // Visible text, not an icon alone. An icon-only rail is one people learn by trial and
            // error, and the 80 px column exists precisely so it does not have to be.
            expect(item.find(".wl-rail-label").text().length).toBeGreaterThan(0);
        }
    });

    it("gives every rail destination somewhere to actually go", async () => {
        // Adding a destination to the rail without a layer to render it does not produce
        // a blank screen. The map is always mounted underneath and merely covered, so an
        // unrouted destination shows the map - which is how Host Server came to say
        // "no map loaded" instead of listing servers.
        const { readFile } = await import("node:fs/promises");
        const { fileURLToPath } = await import("node:url");
        const read = async (relative: string): Promise<string> => {
            const text = await readFile(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
            return text.replace(/\r\n/g, "\n");
        };

        const app = await read("../../App.vue");
        const rail = await read("./AppRail.vue");

        const declared = [...rail.matchAll(/^\s*id: "(\w+)",$/gm)].map((match) => match[1]);
        expect(declared.length, "no rail destinations were found to check").toBeGreaterThan(0);

        for (const id of declared) {
            // The map is the always-mounted layer itself, so it has no v-show of its own.
            if (id === "map") continue;
            expect(app, `the rail offers "${id}" and App.vue renders nothing for it`).toContain(
                `destination === '${id}'`,
            );
        }
    });

    it("marks the active destination with aria-current, not only with a colour", () => {
        const rail = mountRail({ destination: "work" });
        const current = rail
            .findAll(".wl-rail-item")
            .filter((item) => item.attributes("aria-current") === "page");

        expect(current).toHaveLength(1);
        expect(current[0]?.find(".wl-rail-label").text()).toBe("Work");
    });

    it("states the full count in the accessible name where the badge is compact", () => {
        const rail = mountRail({ openJobCount: 128 });
        const work = rail
            .findAll(".wl-rail-item")
            .find((item) => item.find(".wl-rail-label").text() === "Work");

        // The badge itself reads "99+", which is not a count when it is read aloud.
        expect(work?.find(".wl-rail-badge").text()).toBe("99+");
        expect(work?.attributes("aria-label")).toContain("128");
    });

    it("hides the badge from assistive technology so the count is not announced twice", () => {
        const rail = mountRail({ openJobCount: 3 });
        expect(rail.find(".wl-rail-badge").attributes("aria-hidden")).toBe("true");
    });

    it("names the palette shortcut in the search action's own accessible name", () => {
        const rail = mountRail();
        const search = rail.findAll(".wl-rail-action")[0];

        // A tooltip is not a name: it never reaches somebody who is not pointing at the control.
        expect(search?.attributes("aria-label")).toContain("Ctrl+Shift+F");
    });

    it("emits the destination rather than acting on it", async () => {
        const rail = mountRail();
        await rail.findAll(".wl-rail-item")[1]?.trigger("click");

        expect(rail.emitted("select")?.[0]).toEqual(["map"]);
    });

    /*
     * Job shortcuts: a small, curated set of direct-open buttons beneath the four core
     * destinations, distinct from them - see `AppRail.vue`'s own doc comment for why growing
     * this list never widens `RailDestination`.
     */
    const SHORTCUTS = [
        { id: "cirender", icon: "mdi-test-icon", label: "GitHub Actions rendering", shortLabel: "GitHub Actions" },
        { id: "dockerHosting", icon: "mdi-test-icon", label: "Docker hosting", shortLabel: "Docker" },
        { id: "remoteHosting", icon: "mdi-test-icon", label: "Remote hosting", shortLabel: "Remote SSH" },
        { id: "chunker", icon: "mdi-test-icon", label: "Convert", shortLabel: "Chunker" },
        { id: "backups", icon: "mdi-test-icon", label: "Backups", shortLabel: "Backups" },
        { id: "mcservers", icon: "mdi-test-icon", label: "Minecraft servers", shortLabel: "MC servers" },
        { id: "worldDownloader", icon: "mdi-test-icon", label: "Get a world off a server", shortLabel: "World DL" },
    ];

    it("renders no shortcuts at all when none are given, rather than an empty divider", () => {
        const rail = mountRail();
        expect(rail.find(".wl-rail__shortcuts").exists()).toBe(false);
    });

    it("keeps all four destinations rendered and visible with every shortcut configured", () => {
        // The regression itself: v2-08-rail-7-jobs-1280x800-dark.png showed the rail scrolled
        // to a position where Home, Map, Host Server and Work were entirely out of view and
        // only the seven shortcuts were on screen. jsdom cannot measure real scroll position or
        // visibility, so this proves the half it can: the four destination buttons are still
        // real, present, undetached elements - not conditionally removed, not `display: none` -
        // once seven shortcuts are configured alongside them. The rest of the guarantee (that
        // they can never scroll away) is `railOverflow.test.ts`'s job, proven as arithmetic.
        const rail = mountRail({ jobShortcuts: SHORTCUTS });
        const destinations = rail.findAll(".wl-rail__items:not(.wl-rail__shortcuts) > li > .wl-rail-item");

        expect(destinations).toHaveLength(4);
        for (const destination of destinations) {
            expect(destination.isVisible()).toBe(true);
            expect(destination.attributes("style") ?? "").not.toContain("display: none");
        }
    });

    it("renders every given job shortcut as a real, visibly-labelled button", () => {
        const rail = mountRail({ jobShortcuts: SHORTCUTS });
        const shortcuts = rail.findAll("[data-job-shortcut]");

        expect(shortcuts).toHaveLength(SHORTCUTS.length);
        for (const [index, item] of shortcuts.entries()) {
            expect(item.element.tagName).toBe("BUTTON");
            expect(item.attributes("data-job-shortcut")).toBe(SHORTCUTS[index]?.id);
            expect(item.attributes("aria-label")).toBe(SHORTCUTS[index]?.label);
            // The full bilingual label is the accessible name and the tooltip - never the
            // on-screen text, which is the short, single-line form. This is the exact
            // regression from v2-08-rail-7-jobs-1280x800-dark.png: the full label rendered
            // visibly and wrapped five lines inside the 80px column.
            expect(item.find(".wl-rail-label").text()).toBe(SHORTCUTS[index]?.shortLabel);
        }
    });

    it("emits openJob with the exact job id, never select, when a shortcut is pressed", async () => {
        const rail = mountRail({ jobShortcuts: SHORTCUTS });
        const worldDownloaderButton = rail.find('[data-job-shortcut="worldDownloader"]');

        expect(worldDownloaderButton.exists()).toBe(true);
        await worldDownloaderButton.trigger("click");

        expect(rail.emitted("openJob")?.[0]).toEqual(["worldDownloader"]);
        expect(rail.emitted("select")).toBeUndefined();
    });

    it("keeps every shortcut keyboard-reachable, in the same order they render", () => {
        const rail = mountRail({ jobShortcuts: SHORTCUTS });
        const shortcuts = rail.findAll("[data-job-shortcut]");
        // A plain <button> in document order is keyboard-reachable by construction - no
        // tabindex, no role override, nothing that would pull it out of the tab sequence.
        for (const item of shortcuts) {
            expect(item.attributes("tabindex")).toBeUndefined();
            expect(item.attributes("type")).toBe("button");
        }
    });
});

describe("the status strip", () => {
    it("renders nothing at all when there is nothing to say", () => {
        const strip = mount(StatusStrip, {
            props: { runningRenderCount: 0, problemCount: 0 },
            global: { plugins: [vuetify, i18n()] },
        });

        // Not an empty bar holding height for a message that is not there.
        expect(strip.find(".wl-status").exists()).toBe(false);
    });

    it("announces politely, and without the progress percentage", () => {
        const strip = mount(StatusStrip, {
            props: { runningRenderCount: 2, renderProgress: 0.41, problemCount: 0 },
            global: { plugins: [vuetify, i18n()] },
        });
        const live = strip.find('[role="status"]');

        expect(live.attributes("aria-live")).toBe("polite");
        // A render emits progress several times a second. Announcing each one turns a status line
        // into a screen reader reading numbers continuously and drowning everything else.
        expect(live.text()).not.toContain("41");
        expect(live.text()).toContain("2");
    });

    it("offers at most one action, and a problem outranks a running render", () => {
        const strip = mount(StatusStrip, {
            props: { runningRenderCount: 2, problemCount: 1 },
            global: { plugins: [vuetify, i18n()] },
        });

        const actions = strip.findAll(".wl-status__action");
        expect(actions).toHaveLength(1);
        // A render is fine and simply takes time; a problem is a thing that is wrong.
        expect(actions[0]?.text()).toContain("problems");
    });
});

const PROBLEMS: readonly Problem[] = [
    {
        id: "config.invalid.core.data",
        severity: "error",
        source: "core.data",
        message: "That folder does not exist.",
        meaning: "This value will not be written until it is valid.",
        remedy: {
            label: "Open the setting",
            target: { kind: "overlay", overlay: "config", reveal: "core.data" },
        },
    },
    {
        id: "workspace.unknown-page.legacy",
        severity: "warning",
        source: "Saved workspace",
        message: "This build does not know about that tab.",
        meaning: "Nothing was deleted.",
        remedy: null,
    },
];

describe("the problems panel", () => {
    function mountPanel() {
        return mount(ProblemsPanel, {
            props: { problems: PROBLEMS, open: true },
            global: { plugins: [vuetify, i18n()] },
        });
    }

    it("names each severity in text, never in colour alone", () => {
        const panel = mountPanel();
        const words = panel.findAll(".wl-problem__severity-word").map((node) => node.text());

        expect(words).toEqual(["Error", "Warning"]);
    });

    it("shows a remedy only where a real destination exists", () => {
        const panel = mountPanel();
        const remedies = panel.findAll(".wl-problem__remedy");

        // A generic Fix that only dismissed the row would teach the reader that this panel's
        // actions do nothing, which is worse than no button.
        expect(remedies).toHaveLength(1);
        expect(remedies[0]?.text()).toContain("Open the setting");
    });

    it("emits the remedy's real target rather than handling it here", async () => {
        const panel = mountPanel();
        await panel.find(".wl-problem__remedy").trigger("click");

        expect(panel.emitted("remedy")?.[0]).toEqual([
            { kind: "overlay", overlay: "config", reveal: "core.data" },
        ]);
    });

    it("is a labelled region carrying its own count", () => {
        const panel = mountPanel();
        const section = panel.find("section");

        expect(section.attributes("aria-label")).toContain("2");
    });
});
