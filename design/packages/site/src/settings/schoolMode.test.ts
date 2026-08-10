/**
 * @vitest-environment jsdom
 *
 * The mode has three promises and each one has a way of being broken that still looks correct
 * from the outside, so each gets its own assertion here rather than being taken on trust.
 *
 * It promises the visitor's site back. An implementation that forced English by *writing* `en`
 * over the stored choice would pass every "is it English now" test and fail the visitor the
 * moment they turned it off, so the stored preference is read directly out of storage after
 * arming and checked to be untouched.
 *
 * It promises a rename is total. A single hardcoded "School mode" left in a label, a
 * description or — most easily missed — an accessible name would defeat it, so the shipped
 * words are searched for across the rendered panel rather than checked key by key.
 *
 * And it promises a way off. A mode armed with no credential recorded would be a lock with no
 * key, which is the one failure mode that leaves a person stuck in their own browser.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Preferences } from "../platform/Preferences.js";
import { SchoolMode, SCHOOL_SUPPRESSED_SETTING_IDS } from "./schoolMode.js";
import { createSchoolModePanel } from "./schoolModePanel.js";
import "./uiModeStrings.js";

function freshPrefs(): Preferences {
    window.localStorage.clear();
    return new Preferences(window.localStorage);
}

describe("SchoolMode", () => {
    let prefs: Preferences;
    let mode: SchoolMode;

    beforeEach(() => {
        prefs = freshPrefs();
        mode = new SchoolMode(prefs);
    });

    it("is off, unnamed and unarmed to begin with", () => {
        expect(mode.enabled).toBe(false);
        expect(mode.hasCredential).toBe(false);
        expect(mode.chosenName).toBeNull();
    });

    it("arms with a secret and turns off again only with the same secret", async () => {
        expect(await mode.enable("2468")).toBe(true);
        expect(mode.enabled).toBe(true);

        expect(await mode.disable("1111")).toBe(false);
        expect(mode.enabled).toBe(true);

        expect(await mode.disable("2468")).toBe(true);
        expect(mode.enabled).toBe(false);
    });

    it("never stores the secret itself, only a salted digest", async () => {
        await mode.enable("hunter2");
        const everything = JSON.stringify({ ...window.localStorage });
        expect(everything).not.toContain("hunter2");
        expect(everything).toContain("sha-256");
    });

    it("refuses to arm with an empty secret, which would be a lock with no key", async () => {
        expect(await mode.enable("   ")).toBe(false);
        expect(mode.enabled).toBe(false);
    });

    it("reads as off when the credential record is gone, so nobody is stranded", async () => {
        await mode.enable("2468");
        prefs.remove("school.credential");
        expect(mode.enabled).toBe(false);
    });

    /*
     * The preservation promise. The language choice made before arming has to still be sitting
     * in storage afterwards, because turning the mode off is supposed to hand the visitor back
     * the site they had rather than a reset one.
     */
    it("leaves the visitor's stored language choices completely untouched", async () => {
        prefs.write("language.mode", "bilingual");
        prefs.write("language.funny.en", "5");
        await mode.enable("2468");

        expect(window.localStorage.getItem("mbm-site:language.mode")).toBe("bilingual");
        expect(window.localStorage.getItem("mbm-site:language.funny.en")).toBe("5");

        await mode.disable("2468");
        expect(prefs.read("language.mode", "en")).toBe("bilingual");
    });

    it("suppresses every playful setting only while it is on", async () => {
        for (const id of SCHOOL_SUPPRESSED_SETTING_IDS) expect(mode.suppresses(id)).toBe(false);
        await mode.enable("2468");
        for (const id of SCHOOL_SUPPRESSED_SETTING_IDS) expect(mode.suppresses(id)).toBe(true);
        expect(mode.suppresses("theme.mode")).toBe(false);
        expect(mode.suppressesTab("language")).toBe(true);
        expect(mode.suppressesTab("general")).toBe(false);
    });

    it("forgets everything on the documented local reset", async () => {
        await mode.enable("2468");
        mode.rename("Classroom");
        mode.resetLocalRecord();
        expect(mode.enabled).toBe(false);
        expect(mode.hasCredential).toBe(false);
        expect(mode.chosenName).toBeNull();
    });
});

describe("the mode's panel", () => {
    it("uses only the chosen name once renamed, in copy and in accessible names alike", () => {
        const prefs = freshPrefs();
        const mode = new SchoolMode(prefs);
        const panel = createSchoolModePanel({
            mode,
            onChange: () => undefined,
            confirmDestructive: () => Promise.resolve(true),
        });

        mode.rename("Classroom");
        panel.refresh();

        const rendered = panel.element.textContent ?? "";
        const accessibleNames = [...panel.element.querySelectorAll("[aria-label]")]
            .map((node) => node.getAttribute("aria-label") ?? "")
            .join(" ");

        expect(rendered).toContain("Classroom");
        expect(rendered).not.toContain("School mode");
        expect(accessibleNames).toContain("Classroom");
        expect(accessibleNames).not.toContain("School mode");
        panel.destroy();
    });

    it("says plainly that this is not a security boundary and that the record can be deleted", () => {
        const prefs = freshPrefs();
        const panel = createSchoolModePanel({
            mode: new SchoolMode(prefs),
            onChange: () => undefined,
            confirmDestructive: () => Promise.resolve(true),
        });
        const rendered = panel.element.textContent ?? "";
        expect(rendered).toContain("not a security boundary");
        expect(rendered.toLowerCase()).toContain("clears this browser's storage");
        panel.destroy();
    });

    it("keeps no secret on screen after it has been used", async () => {
        const prefs = freshPrefs();
        const mode = new SchoolMode(prefs);
        const panel = createSchoolModePanel({
            mode,
            onChange: () => undefined,
            confirmDestructive: () => Promise.resolve(true),
        });
        const secret = panel.element.querySelector<HTMLInputElement>("input[type='password']");
        const action = panel.element.querySelector("button");
        expect(secret).not.toBeNull();
        if (secret === null || action === null) return;

        secret.value = "2468";
        action.click();
        // The click handler awaits a digest, so let the microtask queue drain before asserting.
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mode.enabled).toBe(true);
        expect(secret.value).toBe("");
        panel.destroy();
    });
});
