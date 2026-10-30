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
import { EMPTY_FACTS } from "../progress/progressModel.js";

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
        const rail = mountRail({ serversJobId: "mcservers" });
        const items = rail.findAll(".wl-rail-item");

        // Home, Map, Work, Servers - exactly the four the approved design draws. The count is
        // asserted rather than merely iterated so a destination quietly disappearing (or a
        // fifth one quietly appearing) fails here.
        expect(items).toHaveLength(4);
        expect(items.map((item) => item.find(".wl-rail-label").text())).toEqual([
            "Home",
            "Map",
            "Work",
            "Servers",
        ]);
        for (const item of items) {
            expect(item.element.tagName).toBe("BUTTON");
            expect(item.classes()).toContain("v-btn");
            // Visible text, not an icon alone.
            expect(item.find(".wl-rail-label").text().length).toBeGreaterThan(0);
        }
    });

    it("carries no job shortcuts and no More menu below the destinations", () => {
        const rail = mountRail({ serversJobId: "mcservers" });
        expect(rail.find("[data-job-shortcut]").exists()).toBe(false);
        expect(rail.find("[data-rail-more]").exists()).toBe(false);
        expect(rail.find(".wl-rail__shortcuts").exists()).toBe(false);
    });

    it("draws no Servers destination when this build cannot host the job", () => {
        const rail = mountRail({ serversJobId: null });
        const labels = rail.findAll(".wl-rail-label").map((label) => label.text());
        expect(labels).toEqual(["Home", "Map", "Work"]);
    });

    it("gives every rail destination somewhere to actually go", async () => {
        // A destination with no layer does not produce a blank screen: the map is always
        // mounted underneath and merely covered, so an unrouted destination shows the map.
        // Home and Work have layers of their own; Map is the always-mounted layer itself; and
        // Servers is a job, which the shell opens through the same route the palette uses.
        const { readFile } = await import("node:fs/promises");
        const { fileURLToPath } = await import("node:url");
        const read = async (relative: string): Promise<string> => {
            const text = await readFile(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
            return text.replace(/\r\n/g, "\n");
        };

        const app = await read("../../App.vue");
        const rail = await read("./AppRail.vue");

        const declared = [...rail.matchAll(/^\s*id: "(\w+)",$/gm)].map((match) => match[1]);
        expect(declared).toEqual(["home", "map", "work", "servers"]);

        for (const id of declared) {
            if (id === "map" || id === "servers") continue;
            expect(app, `the rail offers "${id}" and App.vue renders nothing for it`).toContain(
                `destination === '${id}'`,
            );
        }
        expect(app).toContain(':servers-job-id="railServersJobId"');
        expect(app).toContain('@open-job="revealPage($event)"');
        expect(app).toMatch(/railServersJobId = computed[\s\S]*PAGE_MCSERVERS/);
    });

    it("marks the active destination with aria-current, not only with a colour", () => {
        const rail = mountRail({ destination: "work", serversJobId: "mcservers" });
        const current = rail
            .findAll(".wl-rail-item")
            .filter((item) => item.attributes("aria-current") === "page");

        expect(current).toHaveLength(1);
        expect(current[0]?.find(".wl-rail-label").text()).toBe("Work");
        expect(current[0]?.classes()).toContain("wl-rail-item--active");
    });

    it("moves the indicator to Servers while the servers job is on top of Work", () => {
        const rail = mountRail({
            destination: "work",
            serversJobId: "mcservers",
            activeJobId: "mcservers",
        });
        const current = rail
            .findAll(".wl-rail-item")
            .filter((item) => item.attributes("aria-current") === "page");

        expect(current).toHaveLength(1);
        expect(current[0]?.find(".wl-rail-label").text()).toBe("Servers");
    });

    it("states the full count in the accessible name where the badge is compact", () => {
        const rail = mountRail({ openJobCount: 128 });
        const work = rail
            .findAll(".wl-rail-item")
            .find((item) => item.find(".wl-rail-label").text() === "Work");

        // The badge itself reads "99+", which is not a count when it is read aloud.
        expect(work?.find(".v-badge__badge").text()).toBe("99+");
        expect(work?.attributes("aria-label")).toContain("128");
    });

    it("names running servers in the Servers button's accessible name", () => {
        const rail = mountRail({ serversJobId: "mcservers", runningServerCount: 2 });
        const servers = rail.find('[data-destination="servers"]');
        expect(servers.find(".v-badge__badge").text()).toBe("2");
        expect(servers.attributes("aria-label")).toBe("Servers, 2 running");
    });

    it("hides the badge from assistive technology so the count is not announced twice", () => {
        const rail = mountRail({ openJobCount: 3 });
        // The whole badge wrapper, including Vuetify's own polite status span inside it.
        const badge = rail.find('[data-destination="work"] .v-badge__badge');
        expect(badge.text()).toBe("3");
        expect(badge.element.closest('[aria-hidden="true"]')).not.toBeNull();
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

    it("opens the servers job through openJob, never through select", async () => {
        const rail = mountRail({ serversJobId: "mcservers" });
        await rail.find('[data-destination="servers"]').trigger("click");

        expect(rail.emitted("openJob")?.[0]).toEqual(["mcservers"]);
        expect(rail.emitted("select")).toBeUndefined();
    });

    it("keeps every destination keyboard-reachable, in the order they render", () => {
        const rail = mountRail({ serversJobId: "mcservers" });
        for (const item of rail.findAll(".wl-rail-item")) {
            // A plain <button> in document order is keyboard-reachable by construction.
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

    it("announces politely, and without the progress numbers", () => {
        const strip = mount(StatusStrip, {
            props: { runningRenderCount: 2, renderProgress: 41, problemCount: 0 },
            global: { plugins: [vuetify, i18n()] },
        });
        const live = strip.find('[role="status"]');

        expect(live.attributes("aria-live")).toBe("polite");
        // A render emits progress several times a second. Announcing each one turns a status line
        // into a screen reader reading numbers continuously and drowning everything else.
        expect(live.text()).not.toContain("41");
        expect(live.text()).toContain("2");
    });

    it("names the one running render, its count and its estimate", () => {
        const strip = mount(StatusStrip, {
            props: {
                runningRenderCount: 1,
                renderProgress: 41,
                renderSubject: "heapandyville · overworld",
                renderFacts: {
                    ...EMPTY_FACTS,
                    active: true,
                    levels: [
                        {
                            id: "overall",
                            label: { key: "x", fallback: "Overall", values: {} },
                            detail: null,
                            percent: 41,
                            count: { done: 394, total: 961, unit: "tiles" },
                        },
                    ],
                    estimate: { source: "engine", seconds: null, text: "6 min" },
                },
                consoleAvailable: true,
                problemCount: 1,
            },
            global: { plugins: [vuetify, i18n()] },
        });

        expect(strip.find(".wl-status__subject").text()).toBe("heapandyville · overworld");
        expect(strip.find(".wl-status__readout").text()).toBe("394 of 961 tiles · 6 min left");
        expect(strip.find(".v-progress-linear").exists()).toBe(true);
        expect(strip.find('[role="status"]').text()).toContain("Rendering heapandyville");
    });

    it("offers the problems chip and Open console, and emits each", async () => {
        const strip = mount(StatusStrip, {
            props: {
                runningRenderCount: 1,
                renderSubject: "heapandyville",
                consoleAvailable: true,
                problemCount: 1,
                problemsPanelId: "problems-panel",
            },
            global: { plugins: [vuetify, i18n()] },
        });

        const chip = strip.find(".wl-status__problems");
        expect(chip.classes()).toContain("v-chip");
        expect(chip.text()).toBe("1 problem");
        expect(chip.attributes("aria-expanded")).toBe("false");
        expect(chip.attributes("aria-controls")).toBe("problems-panel");
        await chip.trigger("click");
        expect(strip.emitted("toggleProblems")).toHaveLength(1);

        const console = strip.find(".wl-status__console");
        expect(console.text()).toBe("Open console");
        expect(console.classes()).toContain("v-btn--variant-outlined");
        await console.trigger("click");
        expect(strip.emitted("openConsole")).toHaveLength(1);
    });

    it("opens the Renders list when several renders run, because no one console is theirs", async () => {
        const strip = mount(StatusStrip, {
            props: { runningRenderCount: 3, renderSubject: "ignored", consoleAvailable: true },
            global: { plugins: [vuetify, i18n()] },
        });

        expect(strip.find(".wl-status__subject").exists()).toBe(false);
        expect(strip.find(".wl-status__console").exists()).toBe(false);
        await strip.find(".wl-status__renders").trigger("click");
        expect(strip.emitted("openRenders")).toHaveLength(1);
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
