/**
 * Kid mode's contract: it is a skin, and this test is what stops it becoming a fork.
 *
 * The assertions are deliberately about *coverage and non-divergence* rather than about pixels:
 * a kid label that goes missing, a feature that stops being reachable, a second credential, a new
 * colour token or a hand-written feature list all fail here.
 */
import { describe, expect, it } from "vitest";
import { ALL_CATALOGUE_FEATURES, CATALOGUES } from "../components/shell/catalogues.js";
import { JOB_DEFINITIONS } from "../components/shell/jobRegistry.js";
import { SETTINGS_SECTIONS } from "../components/settings/settingsSections.js";
import { DARK_SCHEME } from "@worldlens/shared";
import { KID_CATALOGUE_LABELS, KID_FEATURE_LABELS, KID_JOB_LABELS, KID_SETTINGS_LABELS, kidAccessibleName, kidLabel } from "./kidLabels.js";
import { KID_SCHEME } from "./kidTheme.js";
import { STICKER_DEFINITIONS } from "./useKidProgress.js";

describe("kid mode covers the whole application", () => {
    /* The count is asserted from the source, never from a number written down here. */
    it("labels exactly as many features as the catalogues declare", () => {
        expect(Object.keys(KID_FEATURE_LABELS).length).toBe(ALL_CATALOGUE_FEATURES.length);
    });

    it("labels every catalogue feature", () => {
        const missing = ALL_CATALOGUE_FEATURES.filter((feature) => KID_FEATURE_LABELS[feature.nameFallback] === undefined);
        expect(missing.map((feature) => feature.nameFallback)).toEqual([]);
    });

    it("labels every job and every settings section", () => {
        expect(JOB_DEFINITIONS.filter((job) => KID_JOB_LABELS[job.labelFallback] === undefined)).toEqual([]);
        expect(SETTINGS_SECTIONS.filter((section) => KID_SETTINGS_LABELS[section] === undefined)).toEqual([]);
    });

    it("labels every catalogue", () => {
        expect(CATALOGUES.filter((catalogue) => KID_CATALOGUE_LABELS[catalogue.id] === undefined)).toEqual([]);
    });

    it("keeps the shipped name in every accessible name, at every label style", () => {
        for (const feature of ALL_CATALOGUE_FEATURES) {
            expect(kidAccessibleName(feature.nameFallback)).toContain(feature.nameFallback);
            for (const style of ["kid-first", "name-first", "name-only"] as const) {
                const pair = kidLabel(feature.nameFallback, KID_FEATURE_LABELS, style);
                expect([pair.primary, pair.secondary ?? ""].join(" ")).toContain(feature.nameFallback);
            }
        }
    });

    it("adds no colour role the design system does not already declare", () => {
        expect(Object.keys(KID_SCHEME).sort()).toEqual(Object.keys(DARK_SCHEME).sort());
    });

    it("binds every sticker to a real feature", () => {
        for (const sticker of STICKER_DEFINITIONS) {
            expect(ALL_CATALOGUE_FEATURES.some((feature) => feature.nameFallback === sticker.feature)).toBe(true);
        }
    });
});
