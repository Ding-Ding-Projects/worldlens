import { describe, expect, it } from "vitest";
import { validateMaskRouteInput } from "./maskFidelity.js";

describe("validateMaskRouteInput", () => {
    it("distinguishes an intentional whole-world render from a schema-valid mask", () => {
        expect(validateMaskRouteInput([])).toEqual({
            valid: true,
            effect: "whole-world-no-mask",
            reason: null,
        });

        expect(
            validateMaskRouteInput([
                {
                    type: "bluemap:circle",
                    subtract: false,
                    "center-x": 12,
                    "center-z": -4,
                    radius: 32,
                    "min-y": -64,
                    "max-y": 320,
                },
            ]),
        ).toEqual({
            valid: true,
            effect: "schema-valid",
            reason: null,
        });
    });

    it("rejects an invalid mask instead of claiming an exact render", () => {
        const result = validateMaskRouteInput([{ type: "bluemap:not-a-real-mask" }]);

        expect(result.valid).toBe(false);
        expect(result.effect).toBe("invalid-mask");
        expect(result.reason).toContain("Invalid input");
    });
});
