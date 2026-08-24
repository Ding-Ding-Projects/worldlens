import { describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_SETTINGS, parseRuntimeSettingsState } from "./model.js";
import {
    loadRuntimeSettings,
    readRuntimeHistory,
    setAccommodation,
    updateRuntimeValues,
    type RuntimeStorage,
} from "./store.js";

function memoryStorage(): RuntimeStorage {
    const data = new Map<string, string>();
    return {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, value),
    };
}

describe("runtime settings persistence", () => {
    it("persists values and records field-level history without secrets", () => {
        const storage = memoryStorage();
        const next = updateRuntimeValues(
            DEFAULT_RUNTIME_SETTINGS,
            { theme: "dark", displayName: "My maps" },
            storage,
        );
        expect(loadRuntimeSettings(storage).values.theme).toBe("dark");
        expect(loadRuntimeSettings(storage).values.displayName).toBe("My maps");
        expect(readRuntimeHistory(storage)[0]?.fields).toEqual(["theme", "displayName"]);
        expect(JSON.stringify(readRuntimeHistory(storage))).not.toContain("secret");
        expect(parseRuntimeSettingsState(next)).not.toBeNull();
    });

    it("keeps each accommodation independent and defaults all of them off", () => {
        const storage = memoryStorage();
        const next = setAccommodation(DEFAULT_RUNTIME_SETTINGS, "focus", true, storage);
        expect(next.values.accommodations.focus).toBe(true);
        expect(next.values.accommodations.lowStimulation).toBe(false);
    });
});
