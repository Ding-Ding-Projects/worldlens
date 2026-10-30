import { describe, expect, it } from "vitest";
import { searchSteps, stepSearchText } from "./wizardSearch.js";

const t = (_key: string, fallback: string): string => fallback;

describe("Search all five steps", () => {
    it("searches nothing, and marks nothing, while the query is empty", () => {
        expect(searchSteps("", false, "i", t)).toEqual({ matched: null, error: null });
    });

    it("finds a step by its own title, as plain text by default", () => {
        const result = searchSteps("where it goes", false, "i", t);
        expect([...(result.matched ?? [])]).toEqual(["storage"]);
    });

    it("finds the options step by a map setting it owns, read from the schema", () => {
        expect(stepSearchText("options", t)).toContain("ambient-light");
        const result = searchSteps("ambient-light", false, "i", t);
        expect(result.matched?.has("options")).toBe(true);
        expect(result.matched?.has("world")).toBe(false);
    });

    it("treats regex characters literally until regex mode is on", () => {
        expect(searchSteps("^Review", false, "i", t).matched?.size).toBe(0);
        expect([...(searchSteps("^Review", true, "im", t).matched ?? [])]).toEqual(["review"]);
    });

    it("reports an invalid pattern and matches nothing rather than everything", () => {
        const result = searchSteps("(", true, "i", t);
        expect(result.matched?.size).toBe(0);
        expect(result.error).not.toBeNull();
    });
});
