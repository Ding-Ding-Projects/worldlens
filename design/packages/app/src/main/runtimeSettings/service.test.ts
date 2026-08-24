import { describe, expect, it } from "vitest";
import { createRuntimeSettingsService, validateRuntimeExternalUrl } from "./service.js";

describe("main-process runtime settings service", () => {
    it("rejects URL credentials, loopback HTTPS, private hosts and non-HTTP schemes", () => {
        expect(validateRuntimeExternalUrl("https://user:pass@example.com").ok).toBe(false);
        expect(validateRuntimeExternalUrl("https://127.0.0.1/config").ok).toBe(false);
        expect(validateRuntimeExternalUrl("http://127.0.0.1/config").ok).toBe(false);
        expect(validateRuntimeExternalUrl("http://127.0.0.1/config", true).ok).toBe(true);
        expect(validateRuntimeExternalUrl("file:///tmp/settings").ok).toBe(false);
        expect(validateRuntimeExternalUrl("https://192.168.1.20/config").ok).toBe(false);
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
});
