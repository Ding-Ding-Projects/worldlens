import { describe, expect, it, vi } from "vitest";
import { readExternalRule } from "./schedule.js";
import type { ScheduledRule } from "./model.js";

const externalRule = (source: ScheduledRule["source"]): ScheduledRule => ({
    id: "external",
    label: "External",
    enabled: true,
    priority: 1,
    weekdays: [],
    startDate: null,
    endDate: null,
    startTime: "00:00",
    endTime: "23:59",
    setting: "theme",
    value: "dark",
    source,
    sourceConfig:
        source === "homeAssistant"
            ? {
                  url: "https://ha.example.test/api",
                  entityId: "input_boolean.night",
                  credentialRef: "ha-token",
              }
            : { url: "https://settings.example.test/config" },
});

describe("external schedule sources", () => {
    it("rejects insecure non-loopback URLs before making a request", async () => {
        const fetcher = vi.fn();
        const result = await readExternalRule(
            { ...externalRule("https"), sourceConfig: { url: "http://example.test" } },
            fetcher,
        );
        expect(result.ok).toBe(false);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("bounds and validates an HTTPS response", async () => {
        const result = await readExternalRule(
            externalRule("https"),
            async () => new Response(JSON.stringify({ theme: "dark" }), { status: 200 }),
        );
        expect(result).toEqual({
            ok: true,
            value: { theme: "dark" },
            message: "The external settings response was validated.",
        });
    });

    it("requires the Home Assistant state to be on and never accepts a token value", async () => {
        const off = await readExternalRule(
            externalRule("homeAssistant"),
            async () =>
                new Response(JSON.stringify({ state: "off", attributes: { theme: "dark" } }), {
                    status: 200,
                }),
        );
        expect(off.ok).toBe(true);
        expect(off.value).toEqual({});
        const on = await readExternalRule(
            externalRule("homeAssistant"),
            async () =>
                new Response(
                    JSON.stringify({ state: "on", attributes: { theme: "dark", token: "secret" } }),
                    { status: 200 },
                ),
        );
        expect(on.ok).toBe(false);
    });
});
