import { describe, expect, it } from "vitest";
import { registerRuntimeSettingsHandlers } from "./ipc.js";

function ipcHarness() {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    return {
        handlers,
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
        removeHandler: (channel: string) => handlers.delete(channel),
    } as unknown as Parameters<typeof registerRuntimeSettingsHandlers>[0] & { handlers: Map<string, (...args: unknown[]) => unknown> };
}

describe("runtime settings IPC boundaries", () => {
    it("rejects caller-supplied Home Assistant URL and entity fields", async () => {
        const ipc = ipcHarness();
        const service = {
            refresh: async () => ({ ok: true, message: "unused" }),
            status: () => ({ registered: false, deliveryAvailable: false, source: "local-main-process" as const, message: "unconfigured", registration: "unrun" as const, evidence: "unrun" as const, replies: "unrun" as const, confirmation: "unrun" as const }),
            statusHubRegister: async () => ({ ok: false, message: "unused" }),
            statusHubSubmitEvidence: async () => ({ ok: false, message: "unused" }),
            statusHubPollReplies: async () => ({ ok: false, message: "unused" }),
            statusHubConfirmReply: async () => ({ ok: false, message: "unused" }),
            dispose: () => undefined,
        };
        registerRuntimeSettingsHandlers(ipc, service);
        const handler = ipc.handlers.get("runtimeSettings:refreshExternal")!;
        await expect(handler({}, { id: "night", source: "homeAssistant", url: "https://attacker.invalid", entityId: "input_boolean.fake" })).resolves.toMatchObject({ ok: false });
        await expect(handler({}, { id: "night", source: "homeAssistant", unexpected: true })).resolves.toMatchObject({ ok: false });
    });
});
