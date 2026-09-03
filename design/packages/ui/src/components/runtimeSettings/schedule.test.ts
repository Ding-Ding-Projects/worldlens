import { describe, expect, it } from "vitest";
import { applyTemporaryExternalValues, sourceRequest } from "./schedule.js";
import { DEFAULT_RUNTIME_SETTINGS } from "./model.js";
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
    it("rejects insecure URLs before the main-process bridge is called", () => {
        const result = sourceRequest({
            ...externalRule("https"),
            sourceConfig: { url: "http://example.test" },
        });
        expect(result).toEqual({ error: expect.stringContaining("HTTPS") });
    });

    it("applies only validated temporary values and leaves the base recoverable", () => {
        const next = applyTemporaryExternalValues(DEFAULT_RUNTIME_SETTINGS, { theme: "dark" });
        expect(next.values.theme).toBe("dark");
        expect(DEFAULT_RUNTIME_SETTINGS.values.theme).toBe("system");
        expect(
            applyTemporaryExternalValues(DEFAULT_RUNTIME_SETTINGS, { token: "secret" }).values
                .theme,
        ).toBe("system");
    });

    it("keeps Home Assistant request metadata free of bearer values", () => {
        const request = sourceRequest(externalRule("homeAssistant"));
        expect(request).toEqual({
            url: "https://ha.example.test/api",
            headers: { Accept: "application/json" },
        });
        expect(JSON.stringify(request)).not.toContain("ha-token");
    });
});
