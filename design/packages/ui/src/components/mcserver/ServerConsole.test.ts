// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import Console from "./ServerConsole.vue";
import { useServerStore } from "./useServers.js";
const mocks = vi.hoisted(() => ({
    open: vi.fn(),
    close: vi.fn(async () => ({ ok: true })),
    send: vi.fn(async () => ({ ok: true })),
    listener: null as
        null | ((id: string, event: { text: string; at: string; stream: string }) => void),
}));
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: unknown) => (typeof fallback === "string" ? fallback : ""),
    }),
}));
vi.mock("./CommandBuilder.vue", () => ({ default: { template: "<div />" } }));
vi.mock("./useServers.js", async () => {
    const { reactive } = await import("vue");
    const store = reactive({
        statuses: {} as Record<string, unknown>,
        logTail: async () => ({ ok: true, value: [] }),
    });
    return { useServerStore: () => store };
});
vi.mock("./mcserverBridge.js", () => ({
    consoleOpen: mocks.open,
    consoleClose: mocks.close,
    consoleSend: mocks.send,
    rconTest: async () => ({ ok: false, failure: { message: "Unavailable" } }),
    onConsoleLine: (listener: typeof mocks.listener) => {
        mocks.listener = listener;
        return () => {};
    },
}));
describe("server console attempt ownership", () => {
    it("reopens for a new attempt, ignores unrelated streams and allows stdin without RCON", async () => {
        let sequence = 0;
        mocks.open.mockImplementation(async () => ({
            ok: true,
            value: { sessionId: `session-${++sequence}` },
        }));
        const wrapper = shallowMount(Console, {
            props: { serverId: "server-one" },
            global: { renderStubDefaultSlot: true },
        });
        await flushPromises();
        mocks.listener!("unrelated", { text: "must not appear", at: "now", stream: "stdout" });
        mocks.listener!("session-1", { text: "owned transcript", at: "now", stream: "stdout" });
        await flushPromises();
        expect(wrapper.text()).toContain("owned transcript");
        expect(wrapper.text()).not.toContain("must not appear");
        const input = wrapper
            .findAllComponents({ name: "VTextField" })
            .find((field) => field.props("modelValue") === "")!;
        expect(input.props("disabled")).toBe(false);
        const store = useServerStore();
        (store.statuses as Record<string, unknown>)["server-one"] = reactive({
            running: true,
            startedAt: "second-attempt",
            attemptId: "attempt-2",
        });
        await flushPromises();
        expect(mocks.close).toHaveBeenCalledWith("server-one", "session-1");
        expect(mocks.open).toHaveBeenCalledTimes(2);
        wrapper.unmount();
    });
});
