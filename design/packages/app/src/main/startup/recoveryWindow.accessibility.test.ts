import { describe, expect, it } from "vitest";
import { RECOVERY_WINDOW_ACCESSIBLE_LABELS } from "./recoveryLabels.js";

describe("startup recovery accessibility labels", () => {
    it("names every window and recovery action in both supported copy tracks", () => {
        for (const label of Object.values(RECOVERY_WINDOW_ACCESSIBLE_LABELS)) {
            expect(label).toMatch(/[A-Za-z]/u);
            expect(label).toMatch(/[\u3400-\u9fff]/u);
        }
    });
});
