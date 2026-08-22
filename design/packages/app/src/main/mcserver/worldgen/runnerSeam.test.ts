import { describe, expect, it } from "vitest";
import { RUNNER_SEAMS, describeRunnerSeam } from "./runnerSeam.js";

describe("RUNNER_SEAMS", () => {
    it("has exactly one entry per runner kind", () => {
        const kinds = RUNNER_SEAMS.map((s) => s.runnerKind);
        expect(kinds.sort()).toEqual(["github-actions", "local"]);
    });

    it("points the local runner at the existing mcserver transport, not a new one", () => {
        const seam = describeRunnerSeam("local");
        expect(seam.seamDirectory).toBe("mcserver/transport/");
        expect(seam.reusedModules).toContain("mcserver/transport/localProcess.ts");
        expect(seam.reusedModules).toContain("mcserver/create.ts");
    });

    it("points the github-actions runner at the existing cirender seam, not a new one", () => {
        const seam = describeRunnerSeam("github-actions");
        expect(seam.seamDirectory).toBe("cirender/");
        expect(seam.reusedModules).toContain("cirender/gh.ts");
        expect(seam.reusedModules).toContain("cirender/schedule.ts");
        expect(seam.reusedModules).toContain("cirender/state.ts");
    });

    it("throws for an unrecorded runner kind", () => {
        // @ts-expect-error - deliberately invalid input, proving the lookup fails closed
        expect(() => describeRunnerSeam("aws-ssh")).toThrow();
    });
});
