/**
 * @vitest-environment jsdom
 *
 * The studio, driven the way a person drives it.
 *
 * The model next door proves the rules; this proves somebody can reach them. The defect that
 * started all of this was not a wrong rule - it was a panel that said "This marker set has
 * nothing in it" with no control underneath it - so the first assertion here is simply that
 * a button exists and pressing it produces a marker.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VSlider, VSwitch } from "vuetify/components";

import MarkerStudio from "./MarkerStudio.vue";
import { markerStudioStore, setMarkerPersistence } from "./markerStudioStore.js";

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

    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        addEventListener: () => {},
        removeEventListener: () => {},
    } as unknown as typeof globalThis.visualViewport;

    document.elementsFromPoint = () => [];
});

beforeEach(() => {
    setMarkerPersistence(false);
    markerStudioStore.markers.splice(0, markerStudioStore.markers.length);
    markerStudioStore.failure = null;
});

function mountStudio(props: Record<string, unknown> = {}) {
    return mount(MarkerStudio, {
        props: { mapId: "overworld", ...props } as never,
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
        },
    });
}

/** Fills the form the way a person does and presses the button. */
async function fill(
    wrapper: ReturnType<typeof mountStudio>,
    values: { label?: string; x?: string; y?: string; z?: string; colour?: string } = {},
): Promise<void> {
    if (values.label !== undefined) {
        await wrapper.find('[data-test="marker-label"] input').setValue(values.label);
    }
    for (const axis of ["x", "y", "z"] as const) {
        const value = values[axis];
        if (value !== undefined) {
            await wrapper.find(`[data-test="marker-${axis}"] input`).setValue(value);
        }
    }
    if (values.colour !== undefined) {
        await wrapper.find('[data-test="marker-colour"] input').setValue(values.colour);
    }
    await flushPromises();
}

describe("the empty studio offers a way out of being empty", () => {
    it("has an add button and an empty state that is not a dead end", async () => {
        const wrapper = mountStudio();
        await flushPromises();

        // The defect, stated as an assertion: an empty marker panel with no control.
        expect(wrapper.find('[data-test="marker-new"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="marker-studio-empty"]').text()).toContain("Add one");
        wrapper.unmount();
    });

    it("makes a marker end to end", async () => {
        const wrapper = mountStudio();
        await flushPromises();

        await wrapper.find('[data-test="marker-new"]').trigger("click");
        await flushPromises();
        await fill(wrapper, { label: "Base", x: "100", y: "64", z: "-200" });
        await wrapper.find('[data-test="marker-save"]').trigger("click");
        await flushPromises();

        expect(markerStudioStore.markers).toHaveLength(1);
        expect(markerStudioStore.markers[0]!.label).toBe("Base");
        expect(wrapper.find('[data-test="marker-row"]').text()).toContain("Base");
        wrapper.unmount();
    });
});

describe("the form starts where the camera is", () => {
    it("prefills the coordinates rather than asking somebody to read them off elsewhere", async () => {
        const wrapper = mountStudio({ cameraPosition: { x: 512.4, y: 71.9, z: -33.2 } });
        await flushPromises();
        await wrapper.find('[data-test="marker-new"]').trigger("click");
        await flushPromises();

        expect(
            (wrapper.find('[data-test="marker-x"] input').element as HTMLInputElement).value,
        ).toBe("512");
        expect(
            (wrapper.find('[data-test="marker-y"] input').element as HTMLInputElement).value,
        ).toBe("72");
        wrapper.unmount();
    });
});

describe("refusing a marker without losing what was typed", () => {
    it("names the field and keeps the form open", async () => {
        const wrapper = mountStudio();
        await flushPromises();
        await wrapper.find('[data-test="marker-new"]').trigger("click");
        await flushPromises();
        await fill(wrapper, { label: "", colour: "not a colour" });
        await wrapper.find('[data-test="marker-save"]').trigger("click");
        await flushPromises();

        expect(markerStudioStore.markers).toHaveLength(0);
        // Still open, so nothing typed is lost to a refusal.
        expect(wrapper.find('[data-test="marker-form"]').exists()).toBe(true);
        expect(wrapper.text()).toContain("hexadecimal");
        wrapper.unmount();
    });

    it("says which height is wrong rather than that something is", async () => {
        const wrapper = mountStudio();
        await flushPromises();
        await wrapper.find('[data-test="marker-new"]').trigger("click");
        await flushPromises();
        await fill(wrapper, { label: "Too high", y: "99999" });
        await wrapper.find('[data-test="marker-save"]').trigger("click");
        await flushPromises();

        expect(wrapper.find('[data-test="marker-position-problem"]').text()).toContain("99999");
        wrapper.unmount();
    });
});

describe("editing one", () => {
    it("loads the marker into the form and saves over it rather than making a second", async () => {
        const wrapper = mountStudio();
        await flushPromises();
        await wrapper.find('[data-test="marker-new"]').trigger("click");
        await flushPromises();
        await fill(wrapper, { label: "Base", x: "1", y: "64", z: "2" });
        await wrapper.find('[data-test="marker-save"]').trigger("click");
        await flushPromises();

        await wrapper.find('[data-test="marker-edit"]').trigger("click");
        await flushPromises();
        expect(
            (wrapper.find('[data-test="marker-label"] input').element as HTMLInputElement).value,
        ).toBe("Base");

        await fill(wrapper, { label: "Renamed" });
        await wrapper.find('[data-test="marker-save"]').trigger("click");
        await flushPromises();

        expect(markerStudioStore.markers).toHaveLength(1);
        expect(markerStudioStore.markers[0]!.label).toBe("Renamed");
        wrapper.unmount();
    });
});

describe("only this map's markers", () => {
    it("leaves another dimension's markers out entirely", async () => {
        markerStudioStore.markers.push(
            {
                id: "a",
                mapId: "overworld",
                label: "Overworld base",
                detail: "",
                position: { x: 0, y: 64, z: 0 },
                colour: "#4f8cff",
                visible: true,
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
            },
            {
                id: "b",
                mapId: "nether",
                label: "Nether fortress",
                detail: "",
                position: { x: 0, y: 64, z: 0 },
                colour: "#4f8cff",
                visible: true,
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
            },
        );

        const wrapper = mountStudio();
        await flushPromises();
        expect(wrapper.text()).toContain("Overworld base");
        expect(wrapper.text()).not.toContain("Nether fortress");
        wrapper.unmount();
    });
});

describe("a store that could not be read", () => {
    it("says the studio is unknown rather than empty, and says nothing was overwritten", async () => {
        markerStudioStore.failure = "the saved markers are unreadable";
        const wrapper = mountStudio();
        await flushPromises();

        const text = wrapper.find('[data-test="marker-studio-failure"]').text();
        expect(text).toContain("not an empty studio");
        // The reassurance that matters: an unreadable store must not invite somebody to
        // make them all again on top of the ones still sitting there.
        expect(text).toContain("nothing has been written over");
        wrapper.unmount();
    });
});

describe("bulk deletion acts on exactly what it previewed", () => {
    it("deletes the selected markers and reports how many really went", async () => {
        const wrapper = mountStudio();
        await flushPromises();
        for (const label of ["One", "Two"]) {
            await wrapper.find('[data-test="marker-new"]').trigger("click");
            await flushPromises();
            await fill(wrapper, { label, x: "0", y: "64", z: "0" });
            await wrapper.find('[data-test="marker-save"]').trigger("click");
            await flushPromises();
        }
        expect(markerStudioStore.markers).toHaveLength(2);

        await wrapper.find('[data-test="marker-select-listed"]').trigger("click");
        await flushPromises();

        // Open the gate, then drive it the way the contract requires: two independent keys
        // and a slider all the way across. A plain confirm button here would mean the gate
        // was declared and never actually wired.
        await wrapper.find('[data-test="marker-remove-selected"]').trigger("click");
        await flushPromises();

        const switches = wrapper.findAllComponents(VSwitch);
        expect(switches.length).toBeGreaterThanOrEqual(2);
        await switches[0]!.setValue(true);
        await switches[1]!.setValue(true);
        await flushPromises();

        const slider = wrapper.findComponent(VSlider);
        slider.vm.$emit("update:modelValue", 100);
        await flushPromises();

        expect(markerStudioStore.markers).toHaveLength(0);
        expect(wrapper.find('[data-test="marker-removed"]').text()).toContain("2");
        wrapper.unmount();
    });
});
