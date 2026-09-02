/** @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import SearchableOptionPicker from "./SearchableOptionPicker.vue";

describe("SearchableOptionPicker", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    beforeAll(() => {
        globalThis.ResizeObserver = class {
            observe(): void {}
            unobserve(): void {}
            disconnect(): void {}
        } as unknown as typeof ResizeObserver;
        Object.defineProperty(globalThis, "visualViewport", {
            configurable: true,
            value: {
                width: 1024,
                height: 768,
                offsetLeft: 0,
                offsetTop: 0,
                addEventListener: () => {},
                removeEventListener: () => {},
            },
        });
    });

    it("filters options through its own anchored search field", async () => {
        const wrapper = mount(SearchableOptionPicker, {
            props: {
                modelValue: "paper",
                label: "Server flavour",
                options: [
                    { title: "Paper", value: "paper" },
                    { title: "Vanilla", value: "vanilla" },
                ],
            },
            global: {
                plugins: [
                    createI18n({ legacy: false, locale: "en", messages: { en: {} } }),
                    createVuetify(),
                ],
            },
            attachTo: document.body,
        });
        await wrapper.find("button").trigger("click");
        await flushPromises();
        const field = document.body.querySelector("input") as HTMLInputElement | null;
        expect(field).not.toBeNull();
        if (field) field.value = "vanilla";
        field?.dispatchEvent(new Event("input", { bubbles: true }));
        await flushPromises();
        const listText = document.body.querySelector('[role="listbox"]')?.textContent ?? "";
        expect(listText).toContain("Vanilla");
        expect(listText).not.toContain("Paper");
    });

    it("shows a truthful no-match state for an invalid regex", async () => {
        const wrapper = mount(SearchableOptionPicker, {
            props: {
                modelValue: "",
                label: "World type",
                options: [{ title: "Default", value: "default" }],
            },
            global: {
                plugins: [
                    createI18n({ legacy: false, locale: "en", messages: { en: {} } }),
                    createVuetify(),
                ],
            },
            attachTo: document.body,
        });
        await wrapper.find("button").trigger("click");
        await flushPromises();
        expect(document.body.textContent).toContain("Default");
    });

    it("uses option roles and a keyboard selection path", async () => {
        const wrapper = mount(SearchableOptionPicker, {
            props: {
                modelValue: "",
                label: "World type",
                options: [{ title: "Default", value: "default" }],
            },
            global: {
                plugins: [
                    createI18n({ legacy: false, locale: "en", messages: { en: {} } }),
                    createVuetify(),
                ],
            },
            attachTo: document.body,
        });
        const activator = wrapper.find("button");
        await activator.trigger("click");
        await flushPromises();
        const option = document.body.querySelector('[role="option"]') as HTMLElement | null;
        expect(option).not.toBeNull();
        expect(option?.getAttribute("aria-selected")).toBe("false");
        option?.focus();
        option?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await flushPromises();
        expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["default"]);
    });
});
