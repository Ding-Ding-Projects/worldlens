import { describe, expect, it } from "vitest";
import { shouldShowDimSum, type DimSumEligibilityContext } from "./dimSumSurprise.js";

const eligible: DimSumEligibilityContext = {
    firstRun: false,
    updateFlowActive: false,
    errorActive: false,
    restrictedModeActive: false,
    alreadyShownThisLaunch: false,
};

describe("the School-mode dim-sum boundary", () => {
    it("suppresses even a winning draw while restricted mode is active", () => {
        expect(shouldShowDimSum(0, eligible)).toBe(true);
        expect(shouldShowDimSum(0, { ...eligible, restrictedModeActive: true })).toBe(false);
    });
});
