/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import type { SshProcessPreflightReport } from "@worldlens/shared";
import SshProcessReadinessPanel from "./SshProcessReadinessPanel.vue";
import { createServerStore, type Answer, type McServerHost } from "./serverStore.js";
import { SERVER_STORE } from "./useServers.js";
import { MCSERVER_FIXED } from "../../copy/surfaces/mcserver.js";

globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
} as unknown as typeof ResizeObserver;
const mounted: ReturnType<typeof mount>[] = [];
afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});
const report: SshProcessPreflightReport = {
    kind: "ssh-process",
    hostId: "fixture",
    profileUpdatedAt: "saved",
    checkedAt: "2026-10-15T10:00:00Z",
    catalogueFetchedAt: "2026-10-15T00:00:00Z",
    ready: true,
    canCreate: false,
    checks: [{ stage: "ssh", state: "passed", code: "ready" }],
    requiredJavaFeature: 21,
    javaFeature: null,
    javaPath: null,
    serverParent: null,
    availableMemoryMb: null,
    freeBytes: null,
    minimumFreeBytes: 1073741824,
};
const ok = <T>(value: T): Answer<T> => ({ ok: true, value });
function host(
    preflight?: NonNullable<McServerHost["creation"]>["sshProcessPreflight"],
): McServerHost {
    return {
        name: "fixture",
        list: async () => ok([]),
        get: async () => ({ ok: false }),
        save: async () => ({ ok: false }),
        forget: async () => ok(undefined),
        probe: async () => ({ ok: false }),
        status: async () => ({ ok: false }),
        start: async () => ({ ok: false }),
        stop: async () => ({ ok: false }),
        logTail: async () => ok([]),
        files: {
            list: async () => ok([]),
            read: async () => ({ ok: false }),
            write: async () => ({ ok: false }),
        },
        ...(preflight === undefined ? {} : { creation: { sshProcessPreflight: preflight } }),
    };
}
function panel(
    preflight?: NonNullable<McServerHost["creation"]>["sshProcessPreflight"],
    locale = "en",
) {
    const messages = Object.fromEntries(
        ["en", "yue"].map((language) => [
            language,
            Object.fromEntries(
                Object.entries(MCSERVER_FIXED).map(([key, value]) => [
                    key,
                    value[language as "en" | "yue"],
                ]),
            ),
        ]),
    );
    const wrapper = mount(SshProcessReadinessPanel, {
        props: { hostId: "fixture", minecraftVersion: "1.21.4" },
        global: {
            plugins: [
                createI18n({ legacy: false, locale, flatJson: true, messages }),
                createVuetify(),
            ],
            provide: { [SERVER_STORE as symbol]: createServerStore({ host: host(preflight) }) },
        },
    });
    mounted.push(wrapper);
    return wrapper;
}
describe("guided SSH-process readiness", () => {
    it("forwards exact inputs and explains that a passed observation never installs", async () => {
        const preflight = vi.fn(async () => ok(report));
        const wrapper = panel(preflight);
        await wrapper.get('[data-test="ssh-readiness-check"]').trigger("click");
        await flushPromises();
        expect(preflight).toHaveBeenCalledExactlyOnceWith({
            hostId: "fixture",
            minecraftVersion: "1.21.4",
            memoryMb: 2048,
            port: 25565,
        });
        expect(wrapper.get('[data-test="ssh-readiness-report"]').text()).toContain(
            "Installation is still unavailable",
        );
        expect(wrapper.text()).toContain("not reserved resources");
        expect(wrapper.findAll("button").some((button) => button.text() === "Create")).toBe(false);
    });
    it("disables the action on an older bridge with a visible recovery reason", () => {
        const wrapper = panel();
        expect(
            wrapper.get('[data-test="ssh-readiness-check"]').attributes("disabled"),
        ).toBeDefined();
        expect(wrapper.text()).toContain("Update the desktop shell");
    });
    it("validates memory, port and saved-host selection before dispatch", async () => {
        const preflight = vi.fn(async () => ok(report));
        const wrapper = panel(preflight);
        await wrapper.get('[data-test="ssh-readiness-port"] input').setValue("80");
        expect(
            wrapper.get('[data-test="ssh-readiness-check"]').attributes("disabled"),
        ).toBeDefined();
        await wrapper.get('[data-test="ssh-readiness-port"] input').setValue("25565");
        await wrapper.get('[data-test="ssh-readiness-memory"] input').setValue("512.5");
        expect(
            wrapper.get('[data-test="ssh-readiness-check"]').attributes("disabled"),
        ).toBeDefined();
        await wrapper.setProps({ hostId: "" });
        await wrapper.get('[data-test="ssh-readiness-check"]').trigger("click");
        expect(preflight).not.toHaveBeenCalled();
    });
    it("ignores a late result after the selected host changes, keeping only one observation in flight", async () => {
        let finish!: (value: Answer<SshProcessPreflightReport>) => void;
        const preflight = vi.fn(
            () =>
                new Promise<Answer<SshProcessPreflightReport>>((resolve) => {
                    finish = resolve;
                }),
        );
        const wrapper = panel(preflight);
        await wrapper.get('[data-test="ssh-readiness-check"]').trigger("click");
        await wrapper.setProps({ hostId: "different-host" });
        expect(
            wrapper.get('[data-test="ssh-readiness-check"]').attributes("disabled"),
        ).toBeDefined();
        finish(ok(report));
        await flushPromises();
        expect(wrapper.find('[data-test="ssh-readiness-report"]').exists()).toBe(false);
        expect(preflight).toHaveBeenCalledTimes(1);
    });
    it("shows a localized failure with in-app next actions and no raw diagnostics", async () => {
        const wrapper = panel(async () => {
            throw new Error("sensitive host diagnostic");
        }, "yue");
        await wrapper.get('[data-test="ssh-readiness-check"]').trigger("click");
        await flushPromises();
        expect(wrapper.get('[data-test="ssh-readiness-failed"]').text()).toContain("未能確認");
        expect(wrapper.text()).not.toContain("sensitive host diagnostic");
        expect(wrapper.text()).not.toContain("mcserver.sshReadiness.");
    });
    it("clears a dated report as soon as the proposed port changes", async () => {
        const wrapper = panel(async () => ok(report));
        await wrapper.get('[data-test="ssh-readiness-check"]').trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="ssh-readiness-report"]').exists()).toBe(true);
        await wrapper.get('[data-test="ssh-readiness-port"] input').setValue("25566");
        expect(wrapper.find('[data-test="ssh-readiness-report"]').exists()).toBe(false);
    });
});
