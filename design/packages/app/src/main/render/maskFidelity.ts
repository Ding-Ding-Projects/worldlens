/**
 * Input validation for a render-mask that is about to cross a render boundary.
 *
 * This module intentionally does not report that a cloud or local renderer applied a mask
 * exactly. That statement needs both real routes and belongs to the cross-route integration
 * test. The only fact available at this package boundary is whether the ordered value is a
 * BlueMap `CombinedMask` value that either route can accept.
 */
import { combinedMaskSchema } from "@worldlens/config";

export type MaskRouteInputEffect =
    /** No shapes intentionally asks either renderer for the whole world. */
    | "whole-world-no-mask"
    /** The schema accepts the value; route equivalence is tested elsewhere. */
    | "schema-valid"
    /** The schema rejected the value before a renderer could receive it. */
    | "invalid-mask";

export interface MaskRouteInputValidation {
    readonly valid: boolean;
    readonly effect: MaskRouteInputEffect;
    /** A concrete schema reason only when the value cannot be sent to a renderer. */
    readonly reason: string | null;
}

/**
 * Validates the exact ordered list that local and Actions routes receive. This is deliberately
 * a validation result, not an exact-render assertion; see the CLI route-equivalence test for
 * that end-to-end proof.
 */
export function validateMaskRouteInput(value: unknown): MaskRouteInputValidation {
    const result = combinedMaskSchema.safeParse(value);
    if (!result.success) {
        return {
            valid: false,
            effect: "invalid-mask",
            reason: result.error.issues[0]?.message ?? "The render-mask value is invalid.",
        };
    }

    return {
        valid: true,
        effect: result.data.length === 0 ? "whole-world-no-mask" : "schema-valid",
        reason: null,
    };
}
