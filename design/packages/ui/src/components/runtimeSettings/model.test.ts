import { describe, expect, it } from "vitest";
import {
    DEFAULT_RUNTIME_SETTINGS,
    parseRuntimeSettingsState,
    resolveScheduledValues,
    scheduledRuleMatches,
    validateExternalSettingsPayload,
    type ScheduledRule,
} from "./model.js";

const rule = (overrides: Partial<ScheduledRule> = {}): ScheduledRule => ({
    id: "night",
    label: "Night mode",
    enabled: true,
    priority: 1,
    weekdays: [],
    startDate: null,
    endDate: null,
    startTime: "22:00",
    endTime: "06:00",
    setting: "theme",
    value: "dark",
    source: "local",
    sourceConfig: {},
    ...overrides,
});

describe("runtime settings contract", () => {
    it("starts with narrator and every accommodation disabled", () => {
        expect(DEFAULT_RUNTIME_SETTINGS.values.narrator.enabled).toBe(false);
        expect(
            Object.values(DEFAULT_RUNTIME_SETTINGS.values.accommodations).every(
                (value) => value === false,
            ),
        ).toBe(true);
    });

    it("fails closed on unknown fields, invalid colors and unbounded schedules", () => {
        expect(
            parseRuntimeSettingsState({
                ...DEFAULT_RUNTIME_SETTINGS,
                values: { ...DEFAULT_RUNTIME_SETTINGS.values, extra: true },
            }),
        ).toBeNull();
        expect(
            parseRuntimeSettingsState({
                ...DEFAULT_RUNTIME_SETTINGS,
                values: { ...DEFAULT_RUNTIME_SETTINGS.values, accent: "red" },
            }),
        ).toBeNull();
        expect(
            parseRuntimeSettingsState({
                ...DEFAULT_RUNTIME_SETTINGS,
                schedules: Array.from({ length: 129 }, (_, index) => rule({ id: `r-${index}` })),
            }),
        ).toBeNull();
    });

    it("matches cross-midnight windows against the start day", () => {
        expect(scheduledRuleMatches(rule(), new Date(2026, 7, 24, 23, 0))).toBe(true);
        expect(scheduledRuleMatches(rule(), new Date(2026, 7, 25, 5, 59))).toBe(true);
        expect(scheduledRuleMatches(rule(), new Date(2026, 7, 25, 6, 0))).toBe(false);
    });

    it("uses priority and stable id ordering when rules overlap", () => {
        const base = DEFAULT_RUNTIME_SETTINGS.values;
        const resolved = resolveScheduledValues(
            base,
            [
                rule({ id: "z", priority: 2, setting: "theme", value: "dark" }),
                rule({ id: "a", priority: 2, setting: "theme", value: "light" }),
            ],
            new Date(2026, 7, 24, 23, 0),
        );
        expect(resolved.theme).toBe("dark");
    });

    it("accepts only bounded known external fields", () => {
        expect(validateExternalSettingsPayload({ theme: "dark", fontSize: 1.25 })).toEqual({
            theme: "dark",
            fontSize: 1.25,
        });
        expect(validateExternalSettingsPayload({ command: "rm -rf" })).toBeNull();
        expect(validateExternalSettingsPayload({ fontSize: 99 })).toBeNull();
    });
});
