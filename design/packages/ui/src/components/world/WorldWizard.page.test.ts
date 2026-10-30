// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { JOB_OPENER_FOR_TESTS } from "../shell/jobOpener.js";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import WorldWizard from "./WorldWizard.vue";
import type { MapWizard } from "./wizardModel.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = () => {};
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof matchMedia;
    if (globalThis.CSS === undefined) Object.defineProperty(globalThis, "CSS", { value: {} });
    if (CSS.escape === undefined) CSS.escape = (value: string) => value;
});

const vuetify = createVuetify({ components, directives });
const revealField = vi.fn(async (_path: string) => true);
const MapOptionsStepStub = defineComponent({
    name: "MapOptionsStep",
    setup(_props, { expose }) {
        expose({ revealField });
        return () => h("div", "Options step");
    },
});

beforeEach(() => revealField.mockClear());

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

function mountWizard() {
    return mount(WorldWizard, {
        attachTo: document.body,
        props: { canInspect: false, canRender: false },
        global: {
            plugins: [vuetify, i18n()],
            stubs: { MapOptionsStep: MapOptionsStepStub },
        },
    });
}

function wizardOf(wrapper: ReturnType<typeof mountWizard>): MapWizard {
    return (wrapper.vm as unknown as { wizard: MapWizard }).wizard;
}

const INSPECTION = {
    folder: "C:/saves/heapandyville",
    ok: true,
    unchecked: false,
    hasLevelDat: true,
    problems: [],
    dimensions: [
        {
            key: "minecraft:overworld",
            dimensionType: "minecraft:overworld",
            label: "Overworld",
            regionDirectory: "region",
            regionFiles: 784,
            custom: false,
        },
        {
            key: "minecraft:the_nether",
            dimensionType: "minecraft:the_nether",
            label: "The Nether",
            regionDirectory: "DIM-1/region",
            regionFiles: 132,
            custom: false,
        },
        {
            key: "minecraft:the_end",
            dimensionType: "minecraft:the_end",
            label: "The End",
            regionDirectory: "DIM1/region",
            regionFiles: 45,
            custom: false,
        },
    ],
} as const;

function mountInWork(opened: string[], search?: { query: string; regex: boolean; flags: string }) {
    return mount(WorldWizard, {
        attachTo: document.body,
        props: { canInspect: false, canRender: false, ...(search ? { search } : {}) },
        global: {
            plugins: [vuetify, i18n()],
            stubs: { MapOptionsStep: MapOptionsStepStub },
            provide: { [JOB_OPENER_FOR_TESTS as symbol]: (pageId: string) => opened.push(pageId) },
        },
    });
}

describe("the guide's page, as the approved design draws it", () => {
    it("says which step this is, and that nothing has been written", async () => {
        const wrapper = mountWizard();
        await flushPromises();
        expect(wrapper.find(".mb-world-wizard__status").text()).toBe(
            "Step 1 of 5 · nothing written yet",
        );
        wrapper.unmount();
    });

    it("draws the step header as a stepper whose current step is announced", async () => {
        const wrapper = mountWizard();
        await flushPromises();
        const items = wrapper.findAll(".v-stepper-item");
        expect(items.map((item) => item.find(".v-stepper-item__title").text())).toEqual([
            "Choose a world",
            "Name and dimension",
            "Options",
            "Where it goes",
            "Review",
        ]);
        expect(items[0]?.attributes("aria-current")).toBe("step");
        // Nobody can skip past an unanswered world.
        expect(items[1]?.attributes("disabled")).toBeDefined();
        wrapper.unmount();
    });

    it("moves to an answered step from the header", async () => {
        const wrapper = mountWizard();
        const wizard = wizardOf(wrapper);
        wizard.setWorld("C:/saves/heapandyville", INSPECTION);
        await flushPromises();
        await wrapper.findAll(".v-stepper-item")[1]?.trigger("click");
        await flushPromises();
        expect(wizard.step.value).toBe("identity");
        wrapper.unmount();
    });

    it("offers the world's own dimensions as cards, driving the same model", async () => {
        const wrapper = mountWizard();
        const wizard = wizardOf(wrapper);
        wizard.setWorld("C:/saves/heapandyville", INSPECTION);
        await flushPromises();
        const cards = wrapper.findAll(".mb-world-step__dimension");
        expect(cards.map((card) => card.attributes("aria-checked"))).toEqual([
            "true",
            "false",
            "false",
        ]);
        await cards[1]?.trigger("click");
        await flushPromises();
        expect(wizard.dimensionKey.value).toBe("minecraft:the_nether");
        wrapper.unmount();
    });

    it("opens the Projects job from Open the full editor instead, inside Work", async () => {
        const opened: string[] = [];
        const wrapper = mountInWork(opened);
        await flushPromises();
        const button = wrapper
            .findAll("button")
            .find((b) => b.text().includes("Open the full editor instead"));
        expect(button).toBeDefined();
        await button?.trigger("click");
        expect(opened).toEqual(["projects"]);
        wrapper.unmount();
    });

    it("draws no editor button outside Work, and says the easy-mode sentence instead", async () => {
        const wrapper = mountWizard();
        await flushPromises();
        expect(wrapper.text()).not.toContain("Open the full editor instead");
        expect(wrapper.text()).toContain("Easy mode.");
        wrapper.unmount();
    });

    it("marks the steps a search matches and dims the rest, hiding none", async () => {
        const wrapper = mountInWork([], { query: "where it goes", regex: false, flags: "i" });
        await flushPromises();
        const items = wrapper.findAll(".v-stepper-item");
        expect(items).toHaveLength(5);
        expect(items[3]?.text()).toContain("Matches the search");
        expect(items[0]?.classes()).toContain("mb-world-wizard__step--unmatched");
        wrapper.unmount();
    });
});
