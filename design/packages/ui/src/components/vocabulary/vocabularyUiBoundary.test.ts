// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import {
    createSetupStorageSchoolModeAdapter,
    enableSchoolMode,
    resetSchoolModeRecordAdapter,
    setSchoolModeRecordAdapter,
} from "../setup/schoolMode.js";
import { english } from "../setup/setupI18n.js";
import { updateText } from "../update/updateCopy.js";
import { kidAccessibleName } from "../../kid/kidLabels.js";
import {
    applyVocabulary,
    applyVocabularyMessageTree,
    applyVocabularyTemplate,
} from "./applyVocabulary.js";
import { setVocabularyPersistence, vocabularyStore } from "./vocabularyStore.js";
import { installVocabularyTranslationBoundary } from "../../i18n.js";

function load(entries: Readonly<Record<string, string>>): void {
    vocabularyStore.status = "loaded";
    vocabularyStore.entries = entries;
}

beforeEach(async () => {
    setVocabularyPersistence(false);
    vocabularyStore.status = "no-file";
    vocabularyStore.entries = {};
    const records = new Map<string, string>();
    await setSchoolModeRecordAdapter(
        createSetupStorageSchoolModeAdapter({
            read: (key) => records.get(key) ?? null,
            write: (key, value) => records.set(key, value),
            remove: (key) => records.delete(key),
        }),
    );
});

afterEach(async () => {
    vocabularyStore.status = "no-file";
    vocabularyStore.entries = {};
    setVocabularyPersistence(true);
    await resetSchoolModeRecordAdapter();
});

describe("the personal-vocabulary UI text boundary", () => {
    it("replaces app-owned template segments and never interpolated facts", () => {
        load({ Open: "Launch" });

        expect(applyVocabularyTemplate("Open {value}")).toBe("Launch {value}");

        const i18n = createI18n({ legacy: false, locale: "en", messages: {} });
        installVocabularyTranslationBoundary(i18n);
        const translate = i18n.global.t as unknown as (...args: unknown[]) => string;
        expect(translate("missing.key", { value: "Open" }, "Open {value}")).toBe("Launch Open");
    });

    it("never rewrites the inside of a longer word", () => {
        // Found in the shipped interface. With `repo` mapped, an update notice reading
        // "No download size was reported" rendered as "...was <replacement>rted" - the
        // sentence still looked like a sentence, so nothing read as broken, and one word
        // had quietly become nonsense.
        load({ repo: "vault" });

        expect(applyVocabulary("No download size was reported, so there is no percentage to show.")).toBe(
            "No download size was reported, so there is no percentage to show.",
        );
        // The standalone word still maps, which is the whole point of having the feature.
        expect(applyVocabulary("open the repo")).toBe("open the vault");
        expect(applyVocabulary("repository")).toBe("repository");
        expect(applyVocabulary("preposition")).toBe("preposition");
    });

    it("prefers the longer key when a shorter one is a prefix of it", () => {
        // Both mapped, so replacing `repo` first would leave "vaultsitory".
        load({ repo: "vault", repository: "archive" });

        expect(applyVocabulary("the repository and the repo")).toBe("the archive and the vault");
    });

    it("still matches a key whose own edges are not word characters", () => {
        // Word boundaries are applied only where the KEY's edge is a word character. A
        // multi-word key or a flag has non-word edges, and `` there would refuse
        // matches that ought to be made.
        load({ "working tree": "workspace", "--force": "--insist" });

        expect(applyVocabulary("the working tree is clean")).toBe("the workspace is clean");
        expect(applyVocabulary("pass --force here")).toBe("pass --insist here");
    });

    it("inserts a replacement containing $& literally rather than as a backreference", () => {
        load({ cost: "$& per hour" });

        expect(applyVocabulary("the cost")).toBe("the $& per hour");
    });

    it("keeps embedded technical facts exact while replacing the prose around them", () => {
        load({ Open: "Launch", PATH: "ROUTE", "level.dat": "world.file", "256": "many" });

        expect(
            applyVocabularyTemplate(
                "Open `PATH`, PATH, level.dat, /map/, https://example.test/map/ and 256 files",
            ),
        ).toBe("Launch `PATH`, PATH, level.dat, /map/, https://example.test/map/ and 256 files");
    });

    it("walks every string in a nested viewer-locale message tree without changing keys or facts", () => {
        load({ Open: "Launch", map: "atlas" });

        expect(
            applyVocabularyMessageTree({
                menu: { open: "Open {map}" },
                retries: 3,
                flags: ["Open map", true],
            }),
        ).toEqual({
            menu: { open: "Launch {map}" },
            retries: 3,
            flags: ["Launch atlas", true],
        });
    });

    it("covers setup, update, kid-label, visible-text, and accessible-name copy engines", () => {
        load({ Start: "Begin", Updates: "Refreshes", Settings: "Preferences" });

        expect(english("action.startHere")).toBe("Begin here");
        expect(updateText("update.title")).toBe("Refreshes");
        expect(kidAccessibleName("Settings")).toContain("Preferences");
    });

    it("keeps setup's legal and consent fact tier exact", () => {
        const exact = english("consent.quoteLabel");
        load({ [exact]: "Changed legal wording" });

        expect(english("consent.quoteLabel")).toBe(exact);
    });

    it("suppresses replacements while School mode is active without clearing the cache", async () => {
        load({ Open: "Launch" });
        expect(applyVocabulary("Open")).toBe("Launch");

        await enableSchoolMode({ name: null, credential: "" });

        expect(applyVocabulary("Open")).toBe("Open");
        expect(vocabularyStore.entries).toEqual({ Open: "Launch" });
    });
});

const UI_BOUNDARIES = [
    {
        file: "../../copy/appVoice.ts",
        needle: "messages[key] = applyVocabularyTemplate(appMessage(key, settings));",
    },
    {
        file: "../../i18n.ts",
        needle: "installVocabularyTranslationBoundary(i18nModule);",
    },
    {
        file: "../../i18n.ts",
        needle: "i18n.global.setLocaleMessage(locale, applyVocabularyMessageTree(source));",
    },
    {
        file: "../setup/setupI18n.ts",
        needle: "return applyVocabularyTemplate(FIXED[key as FixedKey][language]);",
    },
    {
        file: "../update/updateCopy.ts",
        needle: 'applyVocabularyTemplate(updateString(key, "en", funnyLevel("en")))',
    },
    {
        file: "../../kid/kidLabels.ts",
        needle: "const displayName = applyVocabulary(shippedName);",
    },
    {
        file: "../github/LegacyCredentialCleanup.vue",
        needle: "return applyVocabulary(en);",
    },
] as const;

function missingBoundaries(sourceOf: (file: string) => string): string[] {
    return UI_BOUNDARIES.filter(({ file, needle }) => !sourceOf(file).includes(needle)).map(
        ({ file, needle }) => `${file}: ${needle}`,
    );
}

describe("the hand-written UI boundary inventory", () => {
    const sourceOf = (file: string): string =>
        readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

    it("fails when any independent UI copy engine loses its vocabulary boundary", () => {
        expect(missingBoundaries(sourceOf)).toEqual([]);
    });

    it("its negative regression catches a removed boundary exactly", () => {
        const removed = UI_BOUNDARIES[0];
        expect(
            missingBoundaries((file) =>
                file === removed.file
                    ? sourceOf(file).replaceAll(removed.needle, "")
                    : sourceOf(file),
            ),
        ).toEqual([`${removed.file}: ${removed.needle}`]);
    });
});
