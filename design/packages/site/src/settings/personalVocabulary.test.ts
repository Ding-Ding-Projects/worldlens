/**
 * @vitest-environment jsdom
 *
 * These tests exist mostly to pin down the exclusions, because the exclusions are what make
 * the feature safe rather than merely clever.
 *
 * A vocabulary that rewrote a command turns a working instruction into one that fails, and a
 * vocabulary that rewrote a path points at a file nobody has. Both would look like a bug in the
 * site rather than a consequence of the visitor's own file, and neither would be obvious from
 * the rendered page. So a fair share of what follows is a list of things that must come back
 * out exactly as they went in.
 *
 * The other load-bearing assertion is the absent state: with nothing supplied, the module has
 * to report `installed === false` and pass text through untouched, because every surface asks
 * that question before deciding whether the feature exists at all.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Preferences } from "../platform/Preferences.js";
import { MAX_VOCABULARY_ENTRIES, PersonalVocabulary } from "./personalVocabulary.js";

function freshPrefs(): Preferences {
    window.localStorage.clear();
    return new Preferences(window.localStorage);
}

/** Built here rather than committed as a fixture: no vocabulary content belongs in this repo. */
function file(pairs: readonly (readonly [string, string])[]): string {
    return JSON.stringify(pairs.map(([from, to]) => ({ from, to })));
}

describe("PersonalVocabulary", () => {
    let prefs: Preferences;
    let vocabulary: PersonalVocabulary;

    beforeEach(() => {
        prefs = freshPrefs();
        vocabulary = new PersonalVocabulary(prefs);
    });

    it("does not exist until a file is supplied", () => {
        expect(vocabulary.installed).toBe(false);
        expect(vocabulary.entryCount).toBe(0);
        expect(vocabulary.apply("Settings and appearance")).toBe("Settings and appearance");
    });

    it("applies whole-token replacements once a file is accepted", () => {
        expect(vocabulary.load(file([["settings", "knobs"]]))).toEqual({ ok: true, count: 1 });
        expect(vocabulary.installed).toBe(true);
        expect(vocabulary.apply("Open settings now")).toBe("Open knobs now");
    });

    it("matches case-insensitively but never inside a longer word", () => {
        vocabulary.load(file([["map", "atlas"]]));
        expect(vocabulary.apply("Map and map")).toBe("atlas and atlas");
        expect(vocabulary.apply("mapping mapper roadmap")).toBe("mapping mapper roadmap");
    });

    it("keeps surrounding punctuation where it was", () => {
        vocabulary.load(file([["settings", "knobs"]]));
        expect(vocabulary.apply('The "settings", then.')).toBe('The "knobs", then.');
    });

    /*
     * The exclusion list, one assertion per shape a machine has to read literally. A failure in
     * any of these produces text that still looks runnable and is not, which is worse for the
     * visitor than the replacement simply not happening.
     */
    it("leaves commands, addresses, paths, flags and identifiers exactly as written", () => {
        vocabulary.load(
            file([
                ["map", "atlas"],
                ["settings", "knobs"],
                ["build", "bake"],
            ]),
        );
        const literal = [
            "https://example.test/map",
            "src/settings/page.ts",
            "C:\\map\\settings",
            "--build",
            "-map",
            "settings.json",
            "#map",
            "@map",
            "map_id",
            "$build",
        ];
        for (const token of literal) expect(vocabulary.apply(token)).toBe(token);
    });

    it("survives a reload of the same storage", () => {
        vocabulary.load(file([["settings", "knobs"]]));
        expect(new PersonalVocabulary(prefs).apply("settings")).toBe("knobs");
    });

    it("returns the site to its shipped wording when removed", () => {
        vocabulary.load(file([["settings", "knobs"]]));
        vocabulary.clear();
        expect(vocabulary.installed).toBe(false);
        expect(vocabulary.apply("settings")).toBe("settings");
    });

    it("refuses a file it cannot safely use, naming which refusal it was", () => {
        expect(vocabulary.load("not json at all").ok).toBe(false);
        expect(vocabulary.load("not json at all")).toEqual({ ok: false, reason: "not-json" });
        expect(vocabulary.load('{"from":"a","to":"b"}')).toEqual({ ok: false, reason: "wrong-shape" });
        expect(vocabulary.load("[]")).toEqual({ ok: false, reason: "empty" });
        expect(vocabulary.load(file([["", "x"]]))).toEqual({ ok: false, reason: "wrong-shape" });
        expect(vocabulary.load(JSON.stringify(["nope"]))).toEqual({ ok: false, reason: "wrong-shape" });
    });

    it("bounds the file before parsing it, so a hostile file cannot stall the page", () => {
        expect(vocabulary.load("x".repeat(200_000))).toEqual({ ok: false, reason: "too-large" });
    });

    it("bounds how many replacements it will apply", () => {
        const many = Array.from({ length: MAX_VOCABULARY_ENTRIES + 1 }, (_unused, index) => [
            `term${index}`,
            `other${index}`,
        ] as const);
        expect(vocabulary.load(file(many))).toEqual({ ok: false, reason: "too-many" });
    });

    /*
     * The privacy assertion. The settings export walks declared settings, and this is not one,
     * so a visitor sharing their export cannot leak their own wording by accident. Asserting it
     * here rather than trusting the design means a future refactor that made vocabulary a
     * declared setting would go red instead of quietly changing what an export contains.
     */
    it("is not reachable from a settings snapshot", () => {
        vocabulary.load(file([["settings", "knobs"]]));
        const declared = prefs.keys().filter((key) => key.startsWith("settings."));
        expect(declared).not.toContain("settings.vocabulary.record");
    });

    it("falls back rather than throwing on a hand-edited record", () => {
        prefs.write("vocabulary.record", '{"broken":true}');
        const rebuilt = new PersonalVocabulary(prefs);
        expect(rebuilt.installed).toBe(false);
        expect(rebuilt.apply("settings")).toBe("settings");
    });

    it("rewrites Cantonese copy as readily as English", () => {
        vocabulary.load(file([["設定", "掣房"]]));
        expect(vocabulary.apply("開 設定 啦")).toBe("開 掣房 啦");
    });
});
