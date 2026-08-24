import { describe, expect, it } from "vitest";
import { assertHarnessCompleteness, validateHarnessProfile } from "./harness.js";
import { assertCatalogCompleteness } from "./catalog.js";

describe("converter and Ollama universal negative regressions", () => {
    it("turns red when rollback disappears", () => {
        expect(() => assertHarnessCompleteness(["allowlisted-executable", "semantic-pickers", "preflight-preview", "snapshot", "secret-redaction"])).toThrow(/rollback/);
        expect(() => assertHarnessCompleteness()).not.toThrow();
    });
    it("turns red when a catalog becomes curated", () => {
        expect(() => assertCatalogCompleteness(["variant-level-records", "installed-tags-merged", "revision-and-timestamp", "stale-and-offline-state"])).toThrow(/all-pages-followed/);
        expect(() => assertCatalogCompleteness()).not.toThrow();
    });
    it("keeps capability checks explicit for harness launch", () => {
        const profile = { id: "safe", name: "Safe local harness", executable: "ollama", arguments: ["serve"], workingDirectory: "C:/Worldlens", environmentKeys: [], allowed: false } as const;
        expect(validateHarnessProfile(profile).blockers).toContain("The executable is not in the allowlisted harness registry.");
    });
});
