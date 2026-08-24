// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import PaletteChoiceField from "./PaletteChoiceField.vue";

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
});

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});
const vuetify = createVuetify();
let wrapper: VueWrapper | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

describe("PaletteChoiceField", () => {
    it("uses a local searchable menu and emits the selected real option", async () => {
        wrapper = mount(PaletteChoiceField, {
            props: {
                modelValue: "one",
                label: "Render quality",
                options: [
                    { id: "one", label: "One" },
                    { id: "two", label: "Two" },
                ],
            },
            global: { plugins: [i18n, vuetify] },
            attachTo: document.body,
        });

        await wrapper.get(".mb-palette-choice").trigger("click");
        await nextTick();
        const search = wrapper.find(".mb-menu-search input");
        const searchElement = search.exists()
            ? search
            : {
                  setValue: async (value: string) => {
                      const input = document.querySelector<HTMLInputElement>(".mb-menu-search input");
                      if (input === null) throw new Error("choice search field is missing");
                      input.value = value;
                      input.dispatchEvent(new Event("input", { bubbles: true }));
                      await nextTick();
                  },
              };
        expect(document.querySelector(".mb-menu-search input")).not.toBeNull();
        expect(
            [...document.querySelectorAll<HTMLElement>("[aria-label]")].map((element) => element.getAttribute("aria-label")),
        ).toContain("Render quality options");
        expect(
            [...document.querySelectorAll<HTMLElement>(".mb-menu-search .v-label")].map((label) => label.textContent),
        ).toContain("Search Render quality options");
        await searchElement.setValue("two");
        await nextTick();
        const visibleItems = [...document.querySelectorAll<HTMLElement>(".v-list-item")].map((item) => item.textContent ?? "");
        expect(visibleItems).toEqual([expect.stringContaining("Two")]);
        document
            .querySelector<HTMLElement>(".v-list-item")
            ?.click();
        expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["two"]);
    });
});
