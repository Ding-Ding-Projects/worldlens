import { describe, expect, it } from "vitest";
import { ViewerPresentationPolicy } from "./presentationPolicy";

describe("ViewerPresentationPolicy", () => {
    it("uses English and level one while retaining the raw locale and funny level", () => {
        const policy = new ViewerPresentationPolicy({ languageAndToneRestricted: true });

        expect(policy.resolveLoadedLocale("zh-HK")).toBe("en");
        expect(policy.resolveSavedLocale("en")).toBe("zh-HK");
        expect(policy.effectiveFunnyLevel(5)).toBe(1);
    });

    it("restores the remembered raw locale when the restriction ends", () => {
        const policy = new ViewerPresentationPolicy();
        expect(policy.resolveLoadedLocale("zh-HK")).toBe("zh-HK");

        expect(policy.setRestriction({ languageAndToneRestricted: true }, "zh-HK")).toBe("en");
        expect(policy.resolveSavedLocale("en")).toBe("zh-HK");

        expect(policy.setRestriction({ languageAndToneRestricted: false }, "en")).toBe("zh-HK");
        expect(policy.effectiveFunnyLevel(5)).toBe(5);
    });

    it("does not treat the viewer's bootstrap locale as a recoverable user choice", () => {
        const policy = new ViewerPresentationPolicy({ languageAndToneRestricted: true });

        expect(policy.resolveLoadedLocale("none")).toBe("en");
        expect(policy.resolveSavedLocale("en")).toBe("en");
        expect(policy.setRestriction({ languageAndToneRestricted: false }, "en")).toBeNull();
    });
});
