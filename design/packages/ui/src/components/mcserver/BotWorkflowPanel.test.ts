// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import Panel from "./BotWorkflowPanel.vue";
vi.mock("./workflowText.js", () => ({ workflowText: (en: string) => en }));
vi.mock("../../stores/profiles.js", () => ({ profilesStore: { profiles: [], activeId: null } }));
vi.mock("../../stores/bluemap.js", () => ({ acquireSpatialPicker: undefined }));
const status = {
    id: "bot-one",
    attempt: "attempt-one",
    engine: "mineflayer",
    state: "connected",
    message: "Connected",
    position: null,
};
beforeEach(() => {
    vi.clearAllMocks();
});
describe("independent bot workflow", () => {
    it("uses the registered object DTOs and separates navigation cancellation from stop", async () => {
        const api = {
            profiles: vi.fn(async () => [
                {
                    engine: "mineflayer",
                    serverVersion: "1.21.4",
                    available: true,
                    reason: null,
                    runtimeVerified: false,
                },
                {
                    engine: "baritone",
                    serverVersion: "1.21.4",
                    available: true,
                    reason: null,
                    runtimeVerified: false,
                },
            ]),
            accounts: vi.fn(async () => ({
                ok: true,
                value: [{ accountRef: "account-one", label: "Account" }],
            })),
            deploy: vi.fn(async () => status),
            status: vi.fn(async () => status),
            cancel: vi.fn(async () => status),
            stop: vi.fn(async () => ({ ...status, state: "stopped" })),
            navigate: vi.fn(async () => ({ ...status, state: "navigating" })),
        };
        vi.stubGlobal("worldlens", { mcserver: { bots: api } });
        const wrapper = shallowMount(Panel, {
            props: { serverId: "server-one" },
            global: { renderStubDefaultSlot: true },
        });
        await flushPromises();
        wrapper
            .findAllComponents({ name: "VSelect" })
            .find((field) => field.props("label") === "Protected account")!
            .vm.$emit("update:modelValue", "account-one");
        await flushPromises();
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Deploy selected profile")!
            .trigger("click");
        await flushPromises();
        expect(api.profiles).toHaveBeenCalledWith({ serverId: "server-one" });
        expect(api.deploy).toHaveBeenCalledWith({
            serverId: "server-one",
            engine: "mineflayer",
            accountRef: "account-one",
            navigation: true,
        });
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Cancel navigation (keep connected)")!
            .trigger("click");
        await flushPromises();
        expect(api.cancel).toHaveBeenCalledWith({ botId: "bot-one" });
        expect(api.stop).not.toHaveBeenCalled();
        wrapper
            .findAllComponents({ name: "VSelect" })
            .find((field) => field.props("label") === "Bot engine")!
            .vm.$emit("update:modelValue", "baritone");
        await flushPromises();
        expect(
            wrapper
                .findAllComponents({ name: "VBtn" })
                .find((btn) => btn.text() === "Stop")!
                .props("disabled"),
        ).toBe(true);
        wrapper.unmount();
    });
    it("does not offer deployment when exact compatibility is unavailable", async () => {
        vi.stubGlobal("worldlens", {
            mcserver: {
                bots: {
                    profiles: async () => [
                        {
                            engine: "mineflayer",
                            serverVersion: "26.3",
                            available: false,
                            reason: "Unsupported exact version",
                            runtimeVerified: false,
                        },
                    ],
                    deploy: vi.fn(),
                },
            },
        });
        const wrapper = shallowMount(Panel, {
            props: { serverId: "server-one" },
            global: { renderStubDefaultSlot: true },
        });
        await flushPromises();
        expect(wrapper.text()).toContain("Unsupported exact version");
        expect(
            wrapper
                .findAllComponents({ name: "VBtn" })
                .find((btn) => btn.text() === "Deploy selected profile")!
                .props("disabled"),
        ).toBe(true);
        wrapper.unmount();
    });
    it("adopts the reconnect UUID before polling or stopping and rejects an old pending observation", async () => {
        vi.useFakeTimers();
        let resolveOld!: (value: typeof status) => void;
        const old = new Promise<typeof status>((resolve) => {
            resolveOld = resolve;
        });
        const api = {
            profiles: async () => [
                {
                    engine: "mineflayer",
                    serverVersion: "1.21.4",
                    available: true,
                    reason: null,
                    runtimeVerified: false,
                },
            ],
            accounts: async () => ({
                ok: true,
                value: [{ accountRef: "account-one", label: "Account" }],
            }),
            deploy: async () => status,
            status: vi.fn(() => old),
            reconnect: vi.fn(async () => ({ ...status, id: "bot-two", attempt: "attempt-two" })),
            stop: vi.fn(async () => ({ ...status, id: "bot-two", state: "stopped" })),
        };
        vi.stubGlobal("worldlens", { mcserver: { bots: api } });
        const wrapper = shallowMount(Panel, {
            props: { serverId: "server-one" },
            global: { renderStubDefaultSlot: true },
        });
        await flushPromises();
        wrapper
            .findAllComponents({ name: "VSelect" })
            .find((field) => field.props("label") === "Protected account")!
            .vm.$emit("update:modelValue", "account-one");
        await flushPromises();
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Deploy selected profile")!
            .trigger("click");
        await flushPromises();
        await vi.advanceTimersByTimeAsync(2500);
        expect(api.status).toHaveBeenCalledWith({ botId: "bot-one" });
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Reconnect")!
            .trigger("click");
        await flushPromises();
        resolveOld({ ...status, message: "obsolete attempt" });
        await flushPromises();
        expect(wrapper.text()).not.toContain("obsolete attempt");
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Stop")!
            .trigger("click");
        await flushPromises();
        expect(api.stop).toHaveBeenCalledWith({ botId: "bot-two" });
        wrapper.unmount();
        vi.useRealTimers();
    });
});
