// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ConsentSettingsRow from "./ConsentSettingsRow.vue";

beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

afterEach(() => {
    vi.useRealTimers();
});

describe("consent-row highlight lifecycle", () => {
    it("cancels a highlight timer when the row unmounts", () => {
        vi.useFakeTimers();
        const view = mount(ConsentSettingsRow, {
            global: {
                plugins: [
                    createVuetify(),
                    createI18n({
                        legacy: false,
                        locale: "en",
                        fallbackLocale: "en",
                        messages: { en: {} },
                    }),
                ],
                stubs: { EulaViewer: true },
            },
        });

        view.vm.highlight();
        expect(vi.getTimerCount()).toBe(1);

        view.unmount();

        expect(vi.getTimerCount()).toBe(0);
    });
});
