import { describe, expect, it } from "vitest";
import { canonicalWorldIdentity } from "./projectIdentity.js";

describe("canonicalWorldIdentity", () => {
    it("treats case and slash style as the same Deen No path", () => {
        expect(canonicalWorldIdentity("c:/Saves/World\\")).toBe(canonicalWorldIdentity("C:\\saves\\world"));
    });

    it("keeps a changed world path distinct", () => {
        expect(canonicalWorldIdentity("C:/saves/A")).not.toBe(canonicalWorldIdentity("C:/saves/B"));
    });

    it("preserves UNC, rooted, drive-relative, relative and dot-segment distinctions", () => {
        expect(canonicalWorldIdentity("\\\\Server\\Share\\World")).toBe("\\\\SERVER\\SHARE\\WORLD");
        expect(canonicalWorldIdentity("\\World")).not.toBe(canonicalWorldIdentity("World"));
        expect(canonicalWorldIdentity("C:World")).not.toBe(canonicalWorldIdentity("C:\\World"));
        expect(canonicalWorldIdentity("./World")).not.toBe(canonicalWorldIdentity("World"));
        expect(canonicalWorldIdentity("C:\\World\\..\\Other")).not.toBe(canonicalWorldIdentity("C:\\Other"));
    });
});
