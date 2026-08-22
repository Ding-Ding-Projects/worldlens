/**
 * @vitest-environment jsdom
 *
 * WorldGeneratorDialog.vue mounted for real, against a real Vuetify + i18n instance -
 * not just its pure helper functions in worldgen/*.test.ts. Catches the kind of defect
 * pure-function tests cannot: a typo'd component name, a missing prop, a template that
 * throws on render.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import WorldGeneratorDialog from "./WorldGeneratorDialog.vue";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
});

function mountDialog(open = true) {
    const i18n = createI18n({ legacy: false, locale: "en", messages: { en: {} } });
    const vuetify = createVuetify();
    return mount(WorldGeneratorDialog, {
        props: {
            modelValue: open,
            versions: [
                { version: "1.21.4", stability: "release", javaFeature: 21, downloadUrl: null, sha256: null, releasedAt: null },
                { version: "1.20.4", stability: "release", javaFeature: 17, downloadUrl: null, sha256: null, releasedAt: null },
            ],
        },
        global: { plugins: [i18n, vuetify] },
        attachTo: document.body,
    });
}

describe("WorldGeneratorDialog", () => {
    it("mounts without throwing when open", () => {
        expect(() => mountDialog(true)).not.toThrow();
    });

    it("shows the honest not-wired boundary banner", () => {
        const wrapper = mountDialog(true);
        expect(wrapper.text()).toContain("not wired up yet");
    });

    it("emits update:modelValue false when the close button is used", async () => {
        const wrapper = mountDialog(true);
        const closeButton = wrapper.find('button[aria-label="Cancel"]');
        expect(closeButton.exists()).toBe(true);
        await closeButton.trigger("click");
        expect(wrapper.emitted("update:modelValue")).toBeTruthy();
        expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
    });

    it("shows the superflat layer editor only for a flat world type", async () => {
        const wrapper = mountDialog(true);
        expect(wrapper.text()).not.toContain("Superflat layers");
        const flatRadio = wrapper.findAll('input[type="radio"][value="flat"]').at(0);
        expect(flatRadio).toBeDefined();
        await flatRadio?.setValue();
        expect(wrapper.text()).toContain("Superflat layers");
    });

    it("disables the preview-plan button while the version is unchosen", () => {
        const wrapper = mountDialog(true);
        const previewButton = wrapper.findAll("button").find((b) => b.text().includes("Preview plan"));
        expect(previewButton).toBeDefined();
        expect(previewButton?.attributes("disabled")).toBeDefined();
    });
});
