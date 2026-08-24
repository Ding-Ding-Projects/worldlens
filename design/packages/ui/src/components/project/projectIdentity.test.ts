import { describe, expect, it } from "vitest";
import { canonicalWorldIdentity } from "./projectIdentity.js";

describe("canonicalWorldIdentity", () => {
    it("treats case and slash style as the same Deen No path", () => {
        expect(canonicalWorldIdentity("c:/Saves/World\\")).toBe(canonicalWorldIdentity("C:\\saves\\world"));
    });

    it("keeps a changed world path distinct", () => {
        expect(canonicalWorldIdentity("C:/saves/A")).not.toBe(canonicalWorldIdentity("C:/saves/B"));
    });
});
