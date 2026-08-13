// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import SettingsSection from "./SettingsSection.vue";

beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
    globalThis.matchMedia = (() => ({ matches: false })) as unknown as typeof globalThis.matchMedia;
});

afterEach(() => {
    vi.useRealTimers();
});

describe("settings section reveal lifecycle", () => {
    it("clears its flash timer when the section unmounts", () => {
        vi.useFakeTimers();
        const view = mount(SettingsSection, {
            props: { anchor: "diagnostics", title: "Diagnostics", description: "How to inspect the app." },
        });

        view.vm.reveal();
        expect(vi.getTimerCount()).toBe(1);

        view.unmount();

        expect(vi.getTimerCount()).toBe(0);
    });
});
