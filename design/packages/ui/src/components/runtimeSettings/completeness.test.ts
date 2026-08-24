import { describe, expect, it } from "vitest";
import { RUNTIME_COVERAGE, validateRuntimeCoverage } from "./completeness.js";

describe("runtime settings hand-written completeness inventory", () => {
    it("has one row for each shipped runtime contract and no empty evidence fields", () => {
        expect(validateRuntimeCoverage()).toEqual([]);
        expect(RUNTIME_COVERAGE).toHaveLength(4);
    });

    it("turns red when a required row is removed, then returns green when restored", () => {
        const broken = RUNTIME_COVERAGE.filter((row) => row.id !== "spoken-narrator");
        expect(validateRuntimeCoverage(broken)).toContain("missing:spoken-narrator");
        expect(validateRuntimeCoverage(RUNTIME_COVERAGE)).toEqual([]);
    });

    it("turns red when an implementation link is removed, then returns green when restored", () => {
        const broken = RUNTIME_COVERAGE.map((row) =>
            row.id === "status-hub" ? { ...row, implementation: [] } : row,
        );
        expect(validateRuntimeCoverage(broken)).toContain("status-hub:implementation");
        expect(validateRuntimeCoverage(RUNTIME_COVERAGE)).toEqual([]);
    });
});
