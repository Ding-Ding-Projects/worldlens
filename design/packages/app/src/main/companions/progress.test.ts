import { expect, it } from "vitest";
import { BuildPhaseReader } from "./progress.js";

it("does not turn arbitrary console labels into persistent phase metadata", () => {
    const reader = new BuildPhaseReader();
    expect(reader.push("[1/4] SYNTHETIC_PRIVATE_MARKER\n[3/4] Build the real workspace outputs extra-user-data\n")).toEqual([]);
    expect(reader.push("[1/4] Install and verify all build dependencies\n")).toEqual([
        { stage: 1, stages: 4, label: "Install and verify all build dependencies" },
    ]);
});

it("preserves split phase lines without inventing progress from arbitrary output", () => {
    const reader = new BuildPhaseReader();
    expect(reader.push("working\n[3/4] Build the real ")).toEqual([]);
    expect(reader.push("workspace outputs\r\n")).toEqual([{ stage: 3, stages: 4, label: "Build the real workspace outputs" }]);
    expect(reader.push("100% done\n[9/4] invalid\n")).toEqual([]);
    expect(reader.push("x".repeat(20_000))).toEqual([]);
    expect(reader.push("\n[9/9] Re-prove exact source commit and clean tree\n")).toHaveLength(1);
});
