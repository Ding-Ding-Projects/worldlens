// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { describeDependencies, describeDependency } from "./dependsOn.js";
import { guidanceText } from "./scheduleHelp.js";
import { SETTINGS } from "./schema.js";
import type { SettingDefinition, SettingValue } from "./types.js";

/**
 * A reader over a plain object, standing in for the live store.
 *
 * The real reader has bridges and a scheduled override layer behind it; none of
 * that changes the answer this module gives, which is exactly why the value
 * arrives as a function rather than as a store.
 */
function reader(
    values: Readonly<Record<string, SettingValue>>,
): (id: string) => SettingValue | undefined {
    return (id) => values[id];
}

const MODE: SettingDefinition = {
    id: "language.mode",
    kind: "select",
    tab: "language",
    group: "languageMode",
    labelKey: "set.languageMode",
    defaultValue: "en",
    options: [
        { value: "en", labelKey: "set.languageMode.en" },
        { value: "bilingual", labelKey: "set.languageMode.bilingual" },
    ],
};

const TOGGLE: SettingDefinition = {
    id: "ui.dialogEmoji",
    kind: "toggle",
    tab: "general",
    group: "dialogs",
    labelKey: "ui.dialogEmojiLabel",
    defaultValue: true,
};

function dependent(dependsOn: SettingDefinition["dependsOn"]): SettingDefinition {
    return {
        id: "language.secondaryInline",
        kind: "toggle",
        tab: "language",
        group: "languageMode",
        labelKey: "set.secondaryInline",
        defaultValue: false,
        dependsOn,
    };
}

describe("declared dependencies between settings", () => {
    it("reports an unmet dependency as a sentence naming the setting and the value it waits for", () => {
        const note = describeDependency(
            dependent({ id: "language.mode", equals: "bilingual" }),
            [MODE],
            reader({ "language.mode": "en" }),
        );
        expect(note?.unmet).toBe(true);
        expect(note?.code).toBe("unmet");
        expect(note?.dependsOnId).toBe("language.mode");
        expect(note?.requiredValue).toBe("bilingual");
        const said = guidanceText(note!);
        expect(said).toContain("Language");
        expect(said).toContain("English and Cantonese");
        // The option's stored token is an internal identifier; the visitor reads the
        // option's own label, which is the string they picked it by.
        expect(said).not.toContain("bilingual");
    });

    it("reports the same dependency as met once the value matches, without changing the sentence", () => {
        const met = describeDependency(
            dependent({ id: "language.mode", equals: "bilingual" }),
            [MODE],
            reader({ "language.mode": "bilingual" }),
        );
        expect(met?.unmet).toBe(false);
        expect(met?.code).toBe("met");
        expect(met?.messageKey).toBe("scheduleHelp.dependsOn.unmet");
    });

    it("treats an unreadable dependency as unconfirmed rather than as satisfied", () => {
        const note = describeDependency(
            dependent({ id: "language.mode", equals: "bilingual" }),
            [MODE],
            reader({}),
        );
        expect(note?.unmet).toBe(true);
    });

    it("says plainly when the dependency names a setting this build does not have", () => {
        const note = describeDependency(
            dependent({ id: "nothing.here", equals: true }),
            [MODE],
            reader({}),
        );
        expect(note?.code).toBe("missing");
        expect(note?.unmet).toBe(true);
        expect(note?.dependsOnId).toBe("nothing.here");
        const said = guidanceText(note!);
        expect(said.toLowerCase()).toContain("does not have");
        // The id identifies the pair for a developer, through the note. It is not
        // something a visitor could act on, so it is not in the sentence.
        expect(said).not.toContain("nothing.here");
    });

    it("says plainly when the dependency names a value the setting does not offer", () => {
        const note = describeDependency(
            dependent({ id: "language.mode", equals: "klingon" }),
            [MODE],
            reader({ "language.mode": "en" }),
        );
        expect(note?.code).toBe("unmatched-value");
        expect(note?.unmet).toBe(true);
        expect(guidanceText(note!)).toContain("Language");
        expect(guidanceText(note!)).not.toContain("klingon");
    });

    it("reads a toggle dependency as on or off, and a number as the number itself", () => {
        const on = describeDependency(
            dependent({ id: "ui.dialogEmoji", equals: true }),
            [TOGGLE],
            reader({ "ui.dialogEmoji": false }),
        );
        expect(on?.messageKey).toBe("scheduleHelp.dependsOn.on");
        expect(guidanceText(on!)).toContain("turned on");
        const off = describeDependency(
            dependent({ id: "ui.dialogEmoji", equals: false }),
            [TOGGLE],
            reader({ "ui.dialogEmoji": true }),
        );
        expect(off?.messageKey).toBe("scheduleHelp.dependsOn.off");
        expect(guidanceText(off!)).toContain("turned off");
        const numeric: SettingDefinition = {
            id: "motion.scale",
            kind: "slider",
            tab: "general",
            group: "motion",
            labelKey: "set.motionScale",
            defaultValue: 1,
            min: 0,
            max: 2,
            step: 1,
        };
        const note = describeDependency(
            dependent({ id: "motion.scale", equals: 2 }),
            [numeric],
            reader({ "motion.scale": 1 }),
        );
        expect(guidanceText(note!)).toContain("2");
    });

    it("returns nothing for a setting that declares no dependency", () => {
        expect(describeDependency(dependent(undefined), [MODE], reader({}))).toBeNull();
        expect(describeDependencies([MODE, TOGGLE], reader({})).size).toBe(0);
    });

    it("covers the dependency the shipped schema actually declares", () => {
        const notes = describeDependencies(SETTINGS, reader({ "language.mode": "en" }));
        expect([...notes.keys()]).toContain("language.secondaryInline");
        expect(notes.get("language.secondaryInline")?.unmet).toBe(true);
        expect(notes.get("language.secondaryInline")?.dependsOnId).toBe("language.mode");
        // Nothing in the shipped schema depends on a setting that is missing or on a
        // value it does not offer; either would be a control that can never do anything.
        for (const note of notes.values()) {
            expect(note.code).not.toBe("missing");
            expect(note.code).not.toBe("unmatched-value");
        }
        expect(
            describeDependencies(SETTINGS, reader({ "language.mode": "bilingual" })).get(
                "language.secondaryInline",
            )?.unmet,
        ).toBe(false);
    });
});
