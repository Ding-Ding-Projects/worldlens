import { describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_SETTINGS } from "./model.js";
import { createRuntimeSettingsCoordinator } from "./coordinator.js";

describe("runtime coordinator", () => {
    it("refreshes every enabled external rule and ignores stale generations", async () => {
        const calls: string[] = [];
        const pending: Array<
            (value: { ok: true; values: { theme: string }; message: string }) => void
        > = [];
        const state = {
            ...DEFAULT_RUNTIME_SETTINGS,
            schedules: [
                {
                    id: "one",
                    label: "One",
                    enabled: true,
                    priority: 1,
                    weekdays: [],
                    startDate: null,
                    endDate: null,
                    startTime: "00:00",
                    endTime: "23:59",
                    setting: "theme" as const,
                    value: "dark",
                    source: "https" as const,
                    sourceConfig: { url: "https://example.com/one" },
                },
                {
                    id: "two",
                    label: "Two",
                    enabled: true,
                    priority: 1,
                    weekdays: [],
                    startDate: null,
                    endDate: null,
                    startTime: "00:00",
                    endTime: "23:59",
                    setting: "density" as const,
                    value: "compact",
                    source: "https" as const,
                    sourceConfig: { url: "https://example.com/two" },
                },
            ],
        };
        const applied: Record<string, string | number>[] = [];
        const coordinator = createRuntimeSettingsCoordinator({
            readState: () => state,
            applyTemporary: (values) => applied.push({ ...values }),
            bridge: {
                refreshExternal: async (request) => {
                    calls.push(request.id);
                    if (request.id === "one")
                        return await new Promise((resolve) => {
                            pending.push(resolve);
                        });
                    return { ok: true, values: { density: "compact" }, message: "ok" };
                },
            },
        });
        const first = coordinator.refreshNow();
        const second = coordinator.refreshNow();
        pending.forEach((resolve) =>
            resolve({ ok: true, values: { theme: "dark" }, message: "ok" }),
        );
        await Promise.all([first, second]);
        expect(calls).toEqual(["one", "two", "one", "two"]);
        expect(applied).toEqual([{ theme: "dark" }, { density: "compact" }]);
        coordinator.stop();
    });
});
