// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import FrontBuildProvenance from "./FrontBuildProvenance.vue";
import AppTitleBar from "./AppTitleBar.vue";
import { createVuetify } from "vuetify";

afterEach(() => vi.unstubAllGlobals());

function render(answer?: unknown, reject = false) {
    vi.stubGlobal(
        "worldlens",
        answer === undefined
            ? undefined
            : {
                  getBuildProvenance: reject
                      ? () => Promise.reject(new Error("Unavailable"))
                      : () => Promise.resolve(answer),
              },
    );
    return mount(FrontBuildProvenance, {
        global: {
            plugins: [
                createI18n({
                    legacy: false,
                    locale: "en",
                    missingWarn: false,
                    fallbackWarn: false,
                    messages: {},
                }),
            ],
        },
    });
}

describe("front-screen build provenance", () => {
    it("mounts visible provenance in the initial desktop caption", async () => {
        vi.stubGlobal("worldlens", {
            getBuildProvenance: () =>
                Promise.resolve({
                    version: "1.0.42",
                    updatedAt: "2026-10-11T12:20:41.000Z",
                    timestampOrigin: "build",
                }),
        });
        const wrapper = mount(AppTitleBar, {
            props: {
                bridge: {
                    minimizeWindow: async () => {},
                    toggleMaximizeWindow: async () => false,
                    closeWindow: async () => {},
                    isWindowMaximized: async () => false,
                    onWindowMaximizedChanged: () => () => {},
                },
            },
            global: {
                plugins: [
                    createVuetify(),
                    createI18n({
                        legacy: false,
                        locale: "en",
                        messages: {},
                        missingWarn: false,
                        fallbackWarn: false,
                    }),
                ],
            },
        });
        await flushPromises();
        expect(
            wrapper.get('header[role="banner"] [data-testid="front-build-version"]').text(),
        ).toBe("Version 1.0.42");
        expect(wrapper.get('header[role="banner"] time').attributes("datetime")).toBe(
            "2026-10-11T12:20:41.000Z",
        );
        wrapper.unmount();
    });
    it.each([
        { version: "1.0.42", builtAt: "2026-10-11T12:20:41.000Z" },
        { version: "1.0.42", updatedAt: "2026-10-11T12:20:41.000Z", timestampOrigin: "source" },
        { version: "1.0.42", updatedAt: "2026-10-11T12:20:41.000Z" },
    ])("never relabels source or unclassified timestamps as a build update", async (answer) => {
        const wrapper = render(answer);
        await flushPromises();
        expect(wrapper.get('[data-testid="front-build-version"]').text()).toBe("Version 1.0.42");
        expect(wrapper.find("time").exists()).toBe(false);
        expect(wrapper.text()).toContain("Updated time unavailable");
        wrapper.unmount();
    });

    it("shows recorded metadata with seconds and a timezone before navigation", async () => {
        const builtAt = "2026-10-11T12:20:41.000Z";
        const wrapper = render({ version: "1.0.42", updatedAt: builtAt, timestampOrigin: "build" });
        await flushPromises();
        expect(wrapper.get('[data-testid="front-build-version"]').text()).toBe("Version 1.0.42");
        expect(wrapper.get("time").attributes("datetime")).toBe(builtAt);
        const expected = new Intl.DateTimeFormat("en", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "short",
        }).format(new Date(builtAt));
        expect(wrapper.get('[data-testid="front-build-updated"]').text()).toBe(
            `Updated ${expected}`,
        );
        wrapper.unmount();
    });

    it.each([
        undefined,
        null,
        [],
        { version: "", builtAt: null },
        { version: "bad\nversion", builtAt: "2026-02-30T12:00:00.000Z" },
    ])("keeps unavailable provenance visible without inventing launch time: %j", async (answer) => {
        const wrapper = render(answer);
        await flushPromises();
        expect(wrapper.get('[data-testid="front-build-version"]').text()).toBe(
            "Version unavailable",
        );
        expect(wrapper.get('[data-testid="front-build-updated"]').text()).toBe(
            "Updated time unavailable",
        );
        expect(wrapper.find("time").exists()).toBe(false);
        wrapper.unmount();
    });

    it("retains a valid version when the recorded timestamp is absent", async () => {
        const wrapper = render({ version: "1.0.42", builtAt: null });
        await flushPromises();
        expect(wrapper.text()).toContain("Version 1.0.42");
        expect(wrapper.find("time").exists()).toBe(false);
        expect(wrapper.text()).toContain("Updated time unavailable");
        wrapper.unmount();
    });

    it("handles a rejected metadata channel without exposing transport details", async () => {
        const wrapper = render({}, true);
        await flushPromises();
        expect(wrapper.text()).toContain("Version unavailable");
        expect(wrapper.text()).toContain("Updated time unavailable");
        expect(wrapper.text()).not.toContain("Error");
        wrapper.unmount();
    });
});
