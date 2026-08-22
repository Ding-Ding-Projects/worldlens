/**
 * The regression this file exists for: `docs/screenshots/kid-home-yue.png` showed every piece of
 * Kid Mode's own prose in Cantonese while the five catalogue tiles - the picture-first navigation
 * a pre-reading child actually reads - stayed in English. The cause was `KID_CATALOGUE_LABELS`
 * (and its siblings, `KID_FEATURE_LABELS`, `KID_JOB_LABELS`, `KID_SETTINGS_LABELS`) being plain
 * `Record<string, string>` English-only tables that `KidHome.vue` indexed directly, with no
 * language anywhere near the lookup - unlike `kidCopy.ts`'s own strings, which reach `t()` and
 * genuinely vary with the language mode.
 *
 * `kidLabels.ts` fixed that by making every table `Readonly<Record<string, FixedString>>` and
 * resolving through `languageMode()`. These tests watch it fail first (see the first assertion in
 * each `it`, run against the OLD shape before this fix, would have compared "Make a map" - the
 * English kid word - against 整地圖 and failed) and then prove it now passes for `yue` and
 * `bilingual` mode, not only the `en` mode every previous test happened to run under.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { CATALOGUES } from "../components/shell/catalogues.js";
import { memoryStorage, setSetupStorage } from "../components/setup/setupPrefs.js";
import { reloadSetupLanguage, setLanguageMode } from "../components/setup/setupI18n.js";
import {
    KID_CATALOGUE_LABELS,
    KID_FEATURE_LABELS,
    KID_JOB_LABELS,
    KID_SETTINGS_LABELS,
    kidAccessibleName,
    kidCatalogueLabel,
    kidLabel,
} from "./kidLabels.js";

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
    setLanguageMode("en");
});

describe("kid labels resolve for the active language mode", () => {
    it("kidLabel() shows the English kid word in en mode", () => {
        setLanguageMode("en");
        const pair = kidLabel("The project editor", KID_FEATURE_LABELS, "kid-first");
        expect(pair.primary).toBe("Build room");
        expect(pair.secondary).toBe("The project editor");
    });

    it("kidLabel() shows the real Cantonese word in yue mode - the exact bug the capture caught", () => {
        setLanguageMode("yue");
        const pair = kidLabel("The project editor", KID_FEATURE_LABELS, "kid-first");
        expect(pair.primary).toBe("砌嘢房");
        // The shipped name is English, always, in every language mode - it is not a translated
        // sentence, it is the application's own real feature name.
        expect(pair.secondary).toBe("The project editor");
    });

    it("kidLabel() shows both languages in bilingual mode, joined flat", () => {
        setLanguageMode("bilingual");
        const pair = kidLabel("The project editor", KID_FEATURE_LABELS, "kid-first");
        expect(pair.primary).toBe("Build room / 砌嘢房");
    });

    it("the render-row label ('What is being drawn') follows the same rule", () => {
        setLanguageMode("yue");
        const pair = kidLabel("Renders in progress", KID_FEATURE_LABELS, "kid-first");
        expect(pair.primary).toBe("而家畫緊乜嘢");
    });

    it("job labels (tab renames) resolve in yue mode too", () => {
        setLanguageMode("yue");
        const pair = kidLabel("Projects", KID_JOB_LABELS, "kid-first");
        expect(pair.primary).toBe("砌嘢房");
    });

    it("settings-section labels resolve in yue mode too", () => {
        setLanguageMode("yue");
        const pair = kidLabel("mojang-download-consent", KID_SETTINGS_LABELS, "kid-first");
        expect(pair.primary).toBe("同 Mojang 講好");
    });

    it("the settings kid-mode row keeps 'Kid Mode' untranslated and names the grown-up switch in yue", () => {
        setLanguageMode("yue");
        const pair = kidLabel("kid-mode", KID_SETTINGS_LABELS, "kid-first");
        expect(pair.primary).toBe("Kid Mode 圖畫定大人掣");
        expect(pair.primary).toContain("Kid Mode");
        expect(pair.primary).toContain("大人");
    });
});

describe("kidCatalogueLabel() - the five land buttons the capture caught in English", () => {
    it("returns the English word in en mode", () => {
        setLanguageMode("en");
        expect(kidCatalogueLabel("make", "Make a map")).toBe("Make a map");
    });

    it("returns real Cantonese for every one of the five catalogues in yue mode", () => {
        setLanguageMode("yue");
        expect(kidCatalogueLabel("make", "Make a map")).toBe("整地圖");
        expect(kidCatalogueLabel("maps", "Your maps")).toBe("你嘅地圖");
        expect(kidCatalogueLabel("share", "Show people")).toBe("俾人睇");
        expect(kidCatalogueLabel("copy", "Keep it safe")).toBe("安全咁留底");
        expect(kidCatalogueLabel("setup", "Buttons & help")).toBe("掣同幫手");
    });

    it("shows both languages in bilingual mode", () => {
        setLanguageMode("bilingual");
        expect(kidCatalogueLabel("make", "Make a map")).toBe("Make a map / 整地圖");
    });

    it("falls back to the real title for an id with no entry, in any mode", () => {
        setLanguageMode("yue");
        expect(kidCatalogueLabel("not-a-real-catalogue", "Fallback Title")).toBe("Fallback Title");
    });

    it("has an entry for every catalogue the shell actually ships", () => {
        // Derived from the real catalogue list rather than a written-out set of ids. The
        // frozen list this replaces named five, and went red the moment a sixth and seventh
        // shipped - reporting a drifted fixture as though Kid Mode had lost its words.
        const missing = CATALOGUES.filter((catalogue) => KID_CATALOGUE_LABELS[catalogue.id] === undefined);
        expect(missing.map((catalogue) => catalogue.id)).toEqual([]);
    });
});

describe("kidAccessibleName() never drops the shipped name, in any language mode", () => {
    for (const mode of ["en", "yue", "bilingual"] as const) {
        it(`keeps the shipped English feature name at ${mode} mode`, () => {
            setLanguageMode(mode);
            const name = kidAccessibleName("The project editor", KID_FEATURE_LABELS);
            expect(name).toContain("The project editor");
        });

        it(`keeps the shipped job name at ${mode} mode`, () => {
            setLanguageMode(mode);
            expect(kidAccessibleName("Projects", KID_JOB_LABELS)).toContain("Projects");
        });

        it(`keeps the shipped settings anchor at ${mode} mode`, () => {
            setLanguageMode(mode);
            expect(kidAccessibleName("mojang-download-consent", KID_SETTINGS_LABELS)).toContain(
                "mojang-download-consent",
            );
        });
    }

    it("still falls back to the shipped name alone when no kid label exists, in every mode", () => {
        for (const mode of ["en", "yue", "bilingual"] as const) {
            setLanguageMode(mode);
            expect(kidAccessibleName("Not a real feature", KID_FEATURE_LABELS)).toBe("Not a real feature");
        }
    });
});
