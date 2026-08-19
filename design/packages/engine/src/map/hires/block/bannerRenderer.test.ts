import { describe, expect, it } from "vitest";
import { bannerLayerImage } from "./BlockStateModelRenderer.js";

describe("banner block-entity rendering", () => {
    it("emits visible colored pixels for ordered base and pattern layers", () => {
        const base = bannerLayerImage("minecraft:base", [0.976, 1, 0.996]);
        const stripe = bannerLayerImage("minecraft:stripe_bottom", [0.690, 0.180, 0.149]);
        const visible = (image: { data: Uint8Array | Buffer }) => {
            let count = 0;
            for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 0) count++;
            return count;
        };
        expect(visible(base)).toBeGreaterThan(0);
        expect(visible(stripe)).toBeGreaterThan(0);
        expect(base.data).not.toEqual(stripe.data);
    });
});
