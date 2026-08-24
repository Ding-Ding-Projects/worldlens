import { describe, expect, it } from "vitest";
import { RUNTIME_STRINGS, runtimeBilingualString, runtimeString } from "./runtimeStrings.js";

describe("runtime settings locale inventory", () => {
    it("provides five levels in both languages for every key", () => {
        for (const entry of Object.values(RUNTIME_STRINGS)) {
            expect(entry.en).toHaveLength(5);
            expect(entry.yue).toHaveLength(5);
            expect(entry.en.every(Boolean)).toBe(true);
            expect(entry.yue.every(Boolean)).toBe(true);
        }
    });
    it("renders bilingual output without dropping either language", () => {
        expect(runtimeString("monday", "en", 1)).toBe("Monday");
        expect(runtimeString("monday", "yue", 5)).toContain("星期一");
        for (const entry of Object.values(RUNTIME_STRINGS)) {
            expect(new Set(entry.en).size).toBe(5);
            expect(new Set(entry.yue).size).toBe(5);
        }
        expect(runtimeBilingualString("statusTitle")).toContain("\n");
    });
});
