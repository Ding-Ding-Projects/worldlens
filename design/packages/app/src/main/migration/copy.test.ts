import { describe, expect, it } from "vitest";
import { profileMigrationConsentCopy } from "./copy.js";
import type { ProfileMigrationPlan } from "./profileMigration.js";

const plan: ProfileMigrationPlan = {
    legacyDirectory: "C:\\Profiles\\legacy",
    worldlensDirectory: "C:\\Profiles\\Worldlens",
    stagingDirectory: "C:\\Profiles\\.staging",
};

describe("profile migration consent copy", () => {
    it.each(["en", "yue", "bilingual"] as const)(
        "keeps the no-write, retention, and retry facts in %s",
        (language) => {
            const copy = profileMigrationConsentCopy(language, plan);
            expect(copy.title).not.toHaveLength(0);
            expect(copy.message).not.toHaveLength(0);
            expect(copy.detail).toMatch(/(legacy|舊 profile)/iu);
            expect(copy.detail).toContain("Worldlens");
            expect(copy.detail).toMatch(/(No profile files are changed|唔會改任何 profile)/u);
            expect(copy.detail).toMatch(/(old profile remains|舊 profile 會保留|舊 profile 原封不動)/u);
            expect(copy.detail).toMatch(/(retry|重試)/iu);
            expect(copy.buttons).toHaveLength(2);
            expect(copy.buttons[0]).toMatch(/(verify|驗證)/iu);
            expect(copy.buttons[1]).toMatch(/(Not now|而家唔做)/iu);
        },
    );
});
