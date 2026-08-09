// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import { descriptorFor, type PlainValue } from "@worldlens/config";
import ConfigMaskField from "./ConfigMaskField.vue";
import RenderMaskEditorCard from "./RenderMaskEditorCard.vue";
import RenderMaskFieldLauncher from "./RenderMaskFieldLauncher.vue";
import { openConfigFile } from "./configModel.js";
import { UNKNOWN_WORLD } from "./maskCanvas.js";

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
});

const vuetify = createVuetify();

function i18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        missingWarn: false,
        fallbackWarn: false,
        messages: {},
    });
}

const MAP_DESCRIPTOR = descriptorFor("map");
const RENDER_MASK_FIELD = MAP_DESCRIPTOR.fields.find((field) => field.path === "render-mask");

if (RENDER_MASK_FIELD === undefined) {
    throw new Error("Expected the map descriptor to provide render-mask FieldMeta.");
}

const SHARED_MASK: PlainValue[] = [{ type: "bluemap:box", "min-x": 0, "max-x": 32 }];

const SharedMaskRoute = defineComponent({
    setup: () => {
        const card = ref<{ openAndFocus: () => Promise<void> } | null>(null);
        const file = openConfigFile(MAP_DESCRIPTOR, "maps/world.conf", "render-mask: []\n");
        return () =>
            h(VApp, () => [
                h(RenderMaskEditorCard, {
                    ref: card,
                    modelValue: SHARED_MASK,
                    dimension: "minecraft:overworld",
                    world: UNKNOWN_WORLD,
                    "onUpdate:modelValue": () => {},
                }),
                h(RenderMaskFieldLauncher, {
                    field: RENDER_MASK_FIELD,
                    file,
                    onOpen: () => {
                        void card.value?.openAndFocus();
                    },
                }),
            ]);
    },
});

function button(root: ReturnType<typeof mount>, text: string) {
    return root.findAll("button").find((candidate) => candidate.text().includes(text));
}

describe("RenderMaskEditorCard", () => {
    it("routes the FieldMeta launcher to the map card's one ConfigMaskField instance", async () => {
        const wrapper = mount(SharedMaskRoute, { global: { plugins: [vuetify, i18n()] } });

        expect(wrapper.findAllComponents(ConfigMaskField)).toHaveLength(0);
        const launcher = button(wrapper, "Open the shared Render mask card");
        expect(launcher).toBeDefined();

        await launcher!.trigger("click");
        await flushPromises();
        expect(wrapper.findAllComponents(ConfigMaskField)).toHaveLength(1);

        // Reopening from the map card only changes disclosure; it never mounts a second draft.
        await button(wrapper, "Hide editor")!.trigger("click");
        await button(wrapper, "Edit mask")!.trigger("click");
        expect(wrapper.findAllComponents(ConfigMaskField)).toHaveLength(1);
    });

    it("removes the whole explicit field when the map card reset is chosen", async () => {
        const wrapper = mount(RenderMaskEditorCard, {
            props: {
                modelValue: SHARED_MASK,
                dimension: "minecraft:overworld",
                world: UNKNOWN_WORLD,
                explicit: true,
            },
            global: { plugins: [vuetify, i18n()] },
        });

        const reset = button(wrapper, "Revert entire mask to inherited default");
        expect(reset).toBeDefined();
        await reset!.trigger("click");

        expect(wrapper.emitted("clear")).toHaveLength(1);
    });
});
