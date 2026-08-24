// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import AppearanceChoiceField from "./AppearanceChoiceField.vue";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    globalThis.matchMedia = (() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
    document.elementsFromPoint = (): Element[] => [];
    Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener() {},
            removeEventListener() {},
        },
    });
});

const vuetify = createVuetify();
const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    messages: { en: {} },
});

describe("appearance choice field", () => {
    it("opens its own searchable list and filters without changing the model", async () => {
        const view = mount(AppearanceChoiceField, {
            global: { plugins: [vuetify, i18n] },
            props: {
                modelValue: "pill",
                label: "Shape",
                items: [
                    { title: "Square", value: "square" },
                    { title: "Pill", value: "pill" },
                    { title: "Rounded", value: "rounded" },
                ],
            },
        });

        await view.find("button").trigger("click");
        await nextTick();
        const search = document.querySelector<HTMLInputElement>(".mb-config-search input");
        expect(search).not.toBeNull();
        if (search === null) return;
        search.value = "round";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await nextTick();
        expect(document.querySelectorAll(".mb-appearance-choice__item")).toHaveLength(1);
        expect(document.body.textContent).toContain("Rounded");
        expect(document.body.textContent).not.toContain("No choice matches");
    });
});
