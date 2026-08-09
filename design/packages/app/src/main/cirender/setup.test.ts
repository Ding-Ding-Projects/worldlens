import { describe, expect, it } from "vitest";
import {
    CI_REPOSITORY_NAME_FALLBACK,
    MAX_CI_REPOSITORY_NAME_LENGTH,
    suggestCiRepositoryName,
} from "./setup.js";

describe("suggestCiRepositoryName", () => {
    it.each([
        ["My Minecraft Map", "My-Minecraft-Map"],
        ["Café overworld", "Cafe-overworld"],
        ["a/b\\c", "a-b-c"],
        ["...map...", "map"],
        ["repo.git", "repo"],
        [".", CI_REPOSITORY_NAME_FALLBACK],
        ["..", CI_REPOSITORY_NAME_FALLBACK],
        ["世界", CI_REPOSITORY_NAME_FALLBACK],
    ])("turns %j into %j", (source, expected) => {
        expect(suggestCiRepositoryName(source)).toBe(expected);
    });

    it("bounds suggestions to GitHub's repository-name limit", () => {
        const result = suggestCiRepositoryName(`map-${"x".repeat(200)}`);
        expect(result).toHaveLength(MAX_CI_REPOSITORY_NAME_LENGTH);
    });

    it("does not expose a trailing .git suffix after truncation", () => {
        const result = suggestCiRepositoryName(`${"a".repeat(96)}.git-rest`);
        expect(result).toHaveLength(MAX_CI_REPOSITORY_NAME_LENGTH - 4);
        expect(result.endsWith(".git")).toBe(false);
    });
});
