// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { mount, type VueWrapper } from "@vue/test-utils";
import PaletteRow from "./PaletteRow.vue";
import type { PaletteSetting } from "./paletteItems.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
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

function numberItem(set: (value: number) => void): PaletteSetting {
    return {
        kind: "setting",
        resultClass: "setting",
        id: "render.distance",
        group: "Render",
        title: "Render distance",
        description: "How far to render.",
        keywords: ["distance"],
        control: { kind: "number", value: 10, min: 4, max: 20, step: 2, unit: "blocks", set },
    };
}

describe("PaletteRow live number control", () => {
    it("uses the real setter for clamped/stepped values, rejects invalid input, and stays open", async () => {
        const set = vi.fn();
        wrapper = mount(PaletteRow, {
            props: { item: numberItem(set) },
            global: { plugins: [i18n, vuetify] },
            attachTo: document.body,
        });
        const input = wrapper.find('input[type="number"]');
        expect(input.exists()).toBe(true);

        await input.setValue("17");
        await input.trigger("blur");
        expect(set).toHaveBeenLastCalledWith(18);
        expect(wrapper.exists()).toBe(true);

        await input.setValue("999");
        await input.trigger("keydown.enter");
        expect(set).toHaveBeenLastCalledWith(20);

        const count = set.mock.calls.length;
        await input.setValue("not-a-number");
        await input.trigger("blur");
        expect(set.mock.calls.length).toBe(count);
    });
});
