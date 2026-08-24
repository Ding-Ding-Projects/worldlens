import { describe, expect, it } from "vitest";
import {
    RAINBOW_CSS,
    RAINBOW_SENTINEL,
    RAINBOW_SPEED_DURATIONS,
    isRainbowColor,
    rainbowDuration,
} from "./rainbow.js";

describe("rainbow appearance colour", () => {
    it("is a sentinel rather than a palette colour", () => {
        expect(isRainbowColor(RAINBOW_SENTINEL)).toBe(true);
        expect(Object.values(RAINBOW_SPEED_DURATIONS)).toHaveLength(5);
        expect(isRainbowColor("#ff0000")).toBe(false);
    });

    it("maps one bounded speed level to one global duration", () => {
        expect(rainbowDuration(0)).toBe("36s");
        expect(rainbowDuration(3)).toBe("16s");
        expect(rainbowDuration(99)).toBe("6s");
    });

    it("uses stylesheet hue rotation and settles under reduced motion", () => {
        expect(RAINBOW_CSS).toContain("hue-rotate(360deg)");
        expect(RAINBOW_CSS).toContain("prefers-reduced-motion: reduce");
        expect(RAINBOW_CSS).toContain("animation: none");
    });
});
