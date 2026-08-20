import { describe, expect, it } from "vitest";

import { CATALOGUES } from "./catalogues.js";
import { capabilityState } from "./capabilities.js";
import { resolveCatalogues } from "./catalogueSearch.js";

describe("the restricted-mode capability boundary", () => {
    it("keeps the always-present personal-vocabulary upload reachable outside restricted mode", () => {
        expect(capabilityState("personal-vocabulary")).toEqual({ available: true, reason: "" });

        const personalVocabulary = CATALOGUES.flatMap((catalogue) => catalogue.features).find(
            (feature) => feature.key === "setup.language.personal-vocabulary",
        );
        expect(personalVocabulary?.target).toEqual({
            kind: "conditional",
            capability: "personal-vocabulary",
            target: { kind: "overlay", overlay: "settings", reveal: "vocabulary" },
        });
        expect(personalVocabulary?.hideInRestrictedMode).toBe(true);
    });

    it("reports the real shared record and credential route as available", () => {
        const state = capabilityState("restricted-mode");

        expect(state).toEqual({ available: true, reason: "" });
        const restrictedMode = CATALOGUES.flatMap((catalogue) => catalogue.features).find(
            (feature) => feature.key === "setup.language.modename",
        );
        expect(restrictedMode?.target).toEqual({
            kind: "conditional",
            capability: "restricted-mode",
            target: { kind: "overlay", overlay: "settings", reveal: "language-and-tone" },
        });
    });

    it("keeps narrator and scheduled settings absent until their real runtimes exist", () => {
        expect(capabilityState("narrator").available).toBe(false);
        expect(capabilityState("scheduled-settings").available).toBe(false);
        const visible = resolveCatalogues(
            (_key, fallback) => (typeof fallback === "string" ? fallback : ""),
            () => undefined,
            false,
        )
            .flatMap((catalogue) => catalogue.features)
            .map((feature) => feature.definition.key);
        expect(visible).not.toContain("setup.language.spoken-narrator");
        expect(visible).not.toContain("setup.language.scheduled-language-and-appearance");
    });

    it("keeps marked language and personal-capability rows out of the pre-indexed catalogue", () => {
        const resolved = (restrictedModeActive: boolean) =>
            resolveCatalogues(
                (_key, fallback) => (typeof fallback === "string" ? fallback : ""),
                () => undefined,
                restrictedModeActive,
            )
                .flatMap((catalogue) => catalogue.features)
                .map((feature) => feature.definition.key);

        const visible = resolved(true);
        expect(resolved(false)).toContain("setup.language.language-and-tone");
        expect(visible).not.toContain("setup.language.language-and-tone");

        for (const feature of CATALOGUES.flatMap((catalogue) => catalogue.features)) {
            if (feature.hideInRestrictedMode !== true) continue;
            expect(visible, feature.key).not.toContain(feature.key);
        }
    });
});
