import { describe, expect, it } from "vitest";

import { requiredJavaFeature } from "./javaRequirement.js";

describe("requiredJavaFeature", () => {
    it("maps everything up to 1.16 to Java 8", () => {
        expect(requiredJavaFeature("1.12.2")).toEqual({ known: true, feature: 8 });
        expect(requiredJavaFeature("1.16.5")).toEqual({ known: true, feature: 8 });
    });

    it("maps 1.17 to Java 16", () => {
        expect(requiredJavaFeature("1.17")).toEqual({ known: true, feature: 16 });
        expect(requiredJavaFeature("1.17.1")).toEqual({ known: true, feature: 16 });
    });

    it("maps 1.18 through 1.20.4 to Java 17", () => {
        expect(requiredJavaFeature("1.18")).toEqual({ known: true, feature: 17 });
        expect(requiredJavaFeature("1.18.2")).toEqual({ known: true, feature: 17 });
        expect(requiredJavaFeature("1.19.4")).toEqual({ known: true, feature: 17 });
        expect(requiredJavaFeature("1.20")).toEqual({ known: true, feature: 17 });
        expect(requiredJavaFeature("1.20.4")).toEqual({ known: true, feature: 17 });
    });

    it("maps 1.20.5 and everything after it to Java 21", () => {
        expect(requiredJavaFeature("1.20.5")).toEqual({ known: true, feature: 21 });
        expect(requiredJavaFeature("1.20.6")).toEqual({ known: true, feature: 21 });
        expect(requiredJavaFeature("1.21")).toEqual({ known: true, feature: 21 });
        expect(requiredJavaFeature("1.21.4")).toEqual({ known: true, feature: 21 });
    });

    it("reports unknown rather than guessing for a version older than 1.12", () => {
        const result = requiredJavaFeature("1.8.9");
        expect(result.known).toBe(false);
    });

    it("reports unknown for a non-numeric or unrecognized tag", () => {
        expect(requiredJavaFeature("24w14a").known).toBe(false);
        expect(requiredJavaFeature("2.0").known).toBe(false);
        expect(requiredJavaFeature("not-a-version").known).toBe(false);
    });

    /**
     * The guard: 1.20.5 is the exact boundary the mapping has to get right, because it
     * is the one place the requirement changes *inside* a minor version rather than at
     * a minor-version edge. Breaking `patch ?? 0` back into an unconditional `>= 5`
     * check without the parenthesised minor guard mis-maps 1.21.0 - deliberately
     * verified red before this test was trusted. See the commit message for what was
     * broken and restored.
     */
    it("does not mis-map a later minor version whose patch is below 5", () => {
        expect(requiredJavaFeature("1.21.0")).toEqual({ known: true, feature: 21 });
        expect(requiredJavaFeature("1.20.5")).toEqual({ known: true, feature: 21 });
        expect(requiredJavaFeature("1.20.4")).toEqual({ known: true, feature: 17 });
    });
});
