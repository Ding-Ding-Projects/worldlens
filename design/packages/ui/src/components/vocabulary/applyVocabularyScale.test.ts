import { afterEach, describe, expect, it } from "vitest";
import { applyVocabulary } from "./applyVocabulary.js";
import { vocabularyStore } from "./vocabularyStore.js";

afterEach(() => {
    vocabularyStore.entries = {};
});

describe("a large personal vocabulary", () => {
    it("matches a lower-case key against a sentence-case label", () => {
        vocabularyStore.entries = { "universal features": "Toolbox of everything" };
        expect(applyVocabulary("Universal features")).toBe("Toolbox of everything");
        expect(applyVocabulary("the universal features tab")).toBe("the Toolbox of everything tab");
        expect(applyVocabulary("UNIVERSAL features")).toBe("UNIVERSAL features");
    });

    it("never rewrites a replacement with a later key", () => {
        vocabularyStore.entries = { repository: "repo place", repo: "R" };
        expect(applyVocabulary("repository and repo")).toBe("repo place and R");
    });

    it("stays fast enough to run on every row while somebody types", () => {
        const entries: Record<string, string> = {};
        for (let index = 0; index < 400; index += 1) entries[`phrase number ${index}`] = `P${index}`;
        vocabularyStore.entries = entries;
        const started = performance.now();
        for (let index = 0; index < 5000; index += 1) {
            applyVocabulary(`Row ${index % 300} of the palette, phrase number ${index % 400}`);
        }
        expect(performance.now() - started).toBeLessThan(2000);
        expect(applyVocabulary("phrase number 7")).toBe("P7");
    });
});
