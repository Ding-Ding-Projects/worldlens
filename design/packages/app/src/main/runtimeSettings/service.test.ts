import { describe, expect, it } from "vitest";
import {
    createRuntimeSettingsService,
    isBlockedRuntimeAddress,
    validateRuntimeExternalUrl,
} from "./service.js";

describe("main-process runtime settings service", () => {
    it("rejects URL credentials, loopback HTTPS, private hosts and non-HTTP schemes", () => {
        expect(validateRuntimeExternalUrl("https://user:pass@example.com").ok).toBe(false);
        expect(validateRuntimeExternalUrl("https://127.0.0.1/config").ok).toBe(false);
        expect(validateRuntimeExternalUrl("http://127.0.0.1/config").ok).toBe(false);
        expect(validateRuntimeExternalUrl("http://127.0.0.1/config", true).ok).toBe(true);
        expect(validateRuntimeExternalUrl("file:///tmp/settings").ok).toBe(false);
        expect(validateRuntimeExternalUrl("https://192.168.1.20/config").ok).toBe(false);
        expect(isBlockedRuntimeAddress("::ffff:192.168.1.20")).toBe(true);
        expect(isBlockedRuntimeAddress("::ffff:8.8.8.8")).toBe(false);
    });

    it("never hands Home Assistant credentials to the renderer and reports vault absence", async () => {
        const service = createRuntimeSettingsService({
            readCredential: async () => null,
            fetcher: async () => new Response("{}"),
        });
        const result = await service.refresh({
            id: "ha",
            source: "homeAssistant",
            url: "https://example.com/api",
            entityId: "input_boolean.night",
        });
        expect(result.ok).toBe(false);
        expect(result.authRequired).toBe(true);
        expect(JSON.stringify(result)).not.toContain("Bearer");
        service.dispose();
    });

    it("validates a bounded response in the privileged service", async () => {
        const service = createRuntimeSettingsService({
            fetcher: async () => new Response(JSON.stringify({ theme: "dark" }), { status: 200 }),
        });
        const result = await service.refresh({
            id: "api",
            source: "https",
            url: "https://example.com/config",
        });
        expect(result).toMatchObject({ ok: true, values: { theme: "dark" } });
        service.dispose();
    });

    it("uses the authenticated Status Hub bridge for registration, evidence, replies and confirmation", async () => {
        const calls: { method: string; url: string; body?: string }[] = [];
        const service = createRuntimeSettingsService({
            statusHub: { baseUrl: "http://127.0.0.1:8099", projectId: "project", sessionId: "session", credentialRef: "status-hub" },
            readStatusHubCredential: async () => "vault-only-token",
            fetcher: async (input, init) => {
                calls.push({ method: init?.method ?? "GET", url: String(input), ...(typeof init?.body === "string" ? { body: init.body } : {}) });
                return new Response(JSON.stringify({ projectId: "project", sessionId: "session", cursor: "next", replies: [{ id: "reply-1", at: new Date().toISOString(), kind: "question", text: "Ready?" }] }), { status: 200 });
            },
        });
        expect(service.status()).toMatchObject({ registered: false, deliveryAvailable: true });
        expect(service.status().registration).toBe("unrun");
        expect((await service.statusHubRegister()).ok).toBe(true);
        expect(service.status().registration).toBe("confirmed");
        expect((await service.statusHubSubmitEvidence({ sessionSeconds: 12, stateVersion: 1, scheduleCount: 0, narratorVoices: 1, at: new Date().toISOString() })).ok).toBe(true);
        expect((await service.statusHubPollReplies()).replies?.[0]?.id).toBe("reply-1");
        expect((await service.statusHubConfirmReply("reply-1")).ok).toBe(true);
        expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "GET", "POST"]);
        expect(calls.every((call) => call.body === undefined || !call.body.includes("vault-only-token"))).toBe(true);
        service.dispose();
    });

    it("rejects unbounded or unknown evidence before any Status Hub request", async () => {
        let called = false;
        const service = createRuntimeSettingsService({
            statusHub: { baseUrl: "http://127.0.0.1:8099", projectId: "project", sessionId: "session", credentialRef: "status-hub" },
            readStatusHubCredential: async () => "vault-only-token",
            fetcher: async () => { called = true; return new Response("{}"); },
        });
        const result = await service.statusHubSubmitEvidence({ token: "do-not-send", huge: "x".repeat(20_000) });
        expect(result.ok).toBe(false);
        expect(called).toBe(false);
        service.dispose();
    });
});
