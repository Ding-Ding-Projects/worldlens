// @vitest-environment jsdom

/**
 * The repair offer on the Renders page: shown only for a render failure that is really on
 * record, diagnosed before anything is proposed, applied only on the button, and collapsible
 * to a one-line note that can bring the offer back.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import RepairOffer from "./RepairOffer.vue";
import type { FailureSummary, RepairBridge } from "./repairBridge.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

const RENDER_FAILURE: FailureSummary = {
    id: "failure-1",
    subject: "render",
    mode: "local",
    exitCode: 1,
    at: "2026-08-05T00:00:00.000Z",
};

function fakeBridge(failures: readonly FailureSummary[]): RepairBridge {
    return {
        agentAvailability: vi.fn(async () => ({
            available: false,
            command: "opencode",
            version: null,
            message: "not installed",
        })),
        failures: vi.fn(async () => failures),
        diagnose: vi.fn(async () => ({
            ok: true as const,
            diagnoses: [
                {
                    code: "heap",
                    message: "java.lang.OutOfMemoryError: Java heap space",
                    because: "the heap was too small",
                    remedy: {
                        kind: "settings" as const,
                        summary: "raise render memory to 6144 MiB",
                        settings: null,
                        retry: null,
                    },
                },
            ],
        })),
        run: vi.fn(async () => ({
            ok: true as const,
            result: {
                explained: true,
                diagnoses: [],
                agent: {
                    consulted: false,
                    available: false,
                    message: "not consulted",
                    cause: null,
                    notes: null,
                    refused: [],
                },
                applied: [],
                history: null,
                summary: "Applied the memory change.",
                at: "2026-08-05T00:00:00.000Z",
            },
        })),
    };
}

function render(bridge: RepairBridge | null) {
    return mount(RepairOffer, { props: { bridge }, global: { plugins: [vuetify, i18n()] } });
}

function button(wrapper: ReturnType<typeof render>, text: string) {
    return wrapper.findAll("button").find((candidate) => candidate.text().includes(text));
}

describe("RepairOffer", () => {
    it("draws nothing with no bridge, and nothing for a web-server failure", async () => {
        const none = render(null);
        await flushPromises();
        expect(none.find('[data-test="repair-offer"]').exists()).toBe(false);
        none.unmount();

        const webServer = render(fakeBridge([{ ...RENDER_FAILURE, subject: "web-server" }]));
        await flushPromises();
        expect(webServer.find('[data-test="repair-offer"]').exists()).toBe(false);
        webServer.unmount();
    });

    it("shows what the diagnosis read and what it proposes before anything is applied", async () => {
        const bridge = fakeBridge([RENDER_FAILURE]);
        const wrapper = render(bridge);
        await flushPromises();

        expect(wrapper.find('[data-test="repair-offer"]').exists()).toBe(true);
        expect(bridge.diagnose).toHaveBeenCalledWith("failure-1");
        expect(wrapper.text()).toContain("java.lang.OutOfMemoryError");
        expect(wrapper.text()).toContain("Proposed: raise render memory to 6144 MiB");
        expect(bridge.run).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it("applies only on the button, then collapses to the result with a way back", async () => {
        const bridge = fakeBridge([RENDER_FAILURE]);
        const wrapper = render(bridge);
        await flushPromises();

        await button(wrapper, "Apply the repair")?.trigger("click");
        await flushPromises();
        expect(bridge.run).toHaveBeenCalledWith("failure-1");
        expect(wrapper.find('[data-test="repair-offer"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="repair-offer-done"]').text()).toContain(
            "Applied the memory change.",
        );

        await button(wrapper, "Show it again")?.trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="repair-offer"]').exists()).toBe(true);
        wrapper.unmount();
    });

    it("leaves everything as it was on Not now", async () => {
        const bridge = fakeBridge([RENDER_FAILURE]);
        const wrapper = render(bridge);
        await flushPromises();

        await button(wrapper, "Not now")?.trigger("click");
        await flushPromises();
        expect(bridge.run).not.toHaveBeenCalled();
        expect(wrapper.find('[data-test="repair-offer-done"]').text()).toContain("Left as it was");
        wrapper.unmount();
    });
});
