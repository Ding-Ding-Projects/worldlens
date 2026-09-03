import { describe, expect, it } from "vitest";
import { CONVERTER_FACTS, CONVERTER_VOICED } from "./converter.js";

describe("converter copy", () => {
    it("keeps every voiced English and Cantonese tuple at all five funny levels", () => {
        for (const [key, tuple] of Object.entries(CONVERTER_VOICED)) {
            expect(tuple.en, `${key} English levels`).toHaveLength(5);
            expect(tuple.yue, `${key} Cantonese levels`).toHaveLength(5);
            expect(tuple.en.every((value) => value.trim().length > 0)).toBe(true);
            expect(tuple.yue.every((value) => value.trim().length > 0)).toBe(true);
        }
    });

    it("keeps factual converter copy available in both locales", () => {
        for (const [key, tuple] of Object.entries(CONVERTER_FACTS)) {
            expect(tuple.en, `${key} English facts`).not.toHaveLength(0);
            expect(tuple.yue, `${key} Cantonese facts`).not.toHaveLength(0);
        }
    });
});
