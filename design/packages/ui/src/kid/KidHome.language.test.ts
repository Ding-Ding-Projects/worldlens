// @vitest-environment jsdom

/**
 * `docs/screenshots/kid-home-yue.png` is `KidHome.vue` in `yue` mode: the hero, the rail and both
 * panel headings all read in Cantonese, and the five catalogue tiles - the picture-first
 * navigation Kid Mode exists to give a pre-reading child - stayed in English regardless. This
 * mounts the real component with the real, resolved catalogues (`resolveCatalogues()`, the same
 * helper `App.vue` calls) and reads the actual rendered DOM text, so it proves the fix at the
 * layer the screenshot caught the bug at, not only at `kidLabels.ts`'s own unit-tested functions
 * (see `kidLabels.language.test.ts` for those).
 *
 * Run against the pre-fix `KidHome.vue` (`KID_CATALOGUE_LABELS[catalogue.id] ?? catalogue.title`,
 * no language anywhere near the lookup), the "shows real Cantonese" assertion below fails: the
 * tile keeps reading "Make a map" in `yue` mode because the table it read was English-only and the
 * lookup never consulted the language mode at all.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import KidHome from "./KidHome.vue";
import { resolveCatalogues } from "../components/shell/catalogueSearch.js";
import type { Translate } from "../components/shell/catalogueMeta.js";
import { memoryStorage, setSetupStorage } from "../components/setup/setupPrefs.js";
import { reloadSetupLanguage, setLanguageMode } from "../components/setup/setupI18n.js";

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

/**
 * `Translate` is the repository's real `t()` shape: `(key, valuesOrFallback?, fallback?)`. Every
 * call `resolveCatalogues()` makes for a catalogue title/blurb is the two-argument form
 * (`t(key, fallback)`), so the fallback always lands in `valuesOrFallback` as a string - but the
 * stub still has to satisfy the whole type, including the three-argument shape, to typecheck.
 */
const untranslated: Translate = (_key, valuesOrFallback, fallback) => {
    if (typeof valuesOrFallback === "string") return valuesOrFallback;
    if (typeof fallback === "string") return fallback;
    return "";
};

/** The six real, resolved catalogues - fallback text only, exactly as an untranslated build sees them. */
function realCatalogues() {
    return resolveCatalogues(untranslated, () => undefined);
}

function home() {
    return mount(KidHome, {
        global: { plugins: [vuetify, i18n()] },
        props: { catalogues: realCatalogues(), renderRows: [] },
    });
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
});

afterEach(() => {
    setLanguageMode("en");
});

describe("KidHome's six land tiles follow the language mode", () => {
    it("reads the English kid words in en mode", () => {
        setLanguageMode("en");
        const wrapper = home();
        const tiles = wrapper.findAll(".wl-kid-home__land strong").map((node) => node.text());
        expect(tiles).toEqual(["Make a map", "Your maps", "Show people", "Keep it safe", "Host a server", "Buttons & help"]);
    });

    it("shows the kid words for all six tiles in yue mode - the exact regression the screenshot caught", () => {
        setLanguageMode("yue");
        const wrapper = home();
        const tiles = wrapper.findAll(".wl-kid-home__land strong").map((node) => node.text());
        expect(tiles).toEqual(["整地圖", "你嘅地圖", "俾人睇", "安全咁留底", "Host a server", "掣同幫手"]);
        // None of the six translated tiles is still showing its English word.
        expect(tiles).not.toContain("Make a map");
        expect(tiles).not.toContain("Your maps");
        expect(tiles).not.toContain("Show people");
        expect(tiles).not.toContain("Keep it safe");
        expect(tiles).not.toContain("Buttons & help");
    });

    it("shows both languages, joined flat, in bilingual mode", () => {
        setLanguageMode("bilingual");
        const wrapper = home();
        const tiles = wrapper.findAll(".wl-kid-home__land strong").map((node) => node.text());
        expect(tiles).toEqual([
            "Make a map / 整地圖",
            "Your maps / 你嘅地圖",
            "Show people / 俾人睇",
            "Keep it safe / 安全咁留底",
            "Host a server",
            "Buttons & help / 掣同幫手",
        ]);
    });

    it("keeps the shipped catalogue title on the second line under every tile, in every mode", () => {
        for (const mode of ["en", "yue", "bilingual"] as const) {
            setLanguageMode(mode);
            const wrapper = home();
            const shippedTitles = wrapper.findAll(".wl-kid-home__land em").map((node) => node.text());
        expect(shippedTitles).toEqual(["Make a map", "Your maps", "Share a map", "Keep a copy", "Host a server", "Set up & help"]);
        }
    });
});
