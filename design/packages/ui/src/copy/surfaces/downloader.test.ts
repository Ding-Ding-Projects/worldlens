/**
 * `downloader.ts`'s own integrity, checked directly rather than through the merged catalogue.
 *
 * Same reasoning as `project.test.ts` next door, and the same reason it matters here: the
 * world-downloader screen is being written alongside this copy, so `components/downloader` is
 * not on `catalogueCoverage.test.ts`'s `COVERED_SURFACES` list yet and `appCopy.test.ts`'s
 * call-site check cannot see keys nothing calls. A mistake made in this module would pass
 * every test that runs today. This file is what catches it anyway: it imports
 * `DOWNLOADER_VOICED`, `DOWNLOADER_FIXED` and `DOWNLOADER_FACTS` straight from
 * `./downloader.js`, so the module is held to the shape the finished catalogue requires from
 * the moment it exists rather than from the moment the screen lands.
 *
 * Mirrors the checks in `../appCopy.test.ts`, narrowed to this module's own keys, plus one
 * this module wants of its own: every key is prefixed `downloader.`, because a key that
 * strays out of the namespace is how one surface starts answering another surface's calls.
 */

import { describe, expect, it } from "vitest";

import { DOWNLOADER_FACTS, DOWNLOADER_FIXED, DOWNLOADER_VOICED } from "./downloader.js";

const LANGUAGES = ["en", "yue"] as const;

type VoicedKey = keyof typeof DOWNLOADER_VOICED;
type FixedKey = keyof typeof DOWNLOADER_FIXED;

const voicedKeys = Object.keys(DOWNLOADER_VOICED) as VoicedKey[];
const fixedKeys = Object.keys(DOWNLOADER_FIXED) as FixedKey[];

const PLACEHOLDER = /\{\s*([A-Za-z_$][\w$]*)\s*\}/g;

function placeholdersIn(text: string): Set<string> {
    PLACEHOLDER.lastIndex = 0;
    const found = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = PLACEHOLDER.exec(text)) !== null) found.add(match[1] as string);
    return found;
}

function sorted(values: Iterable<string>): string[] {
    return [...values].sort();
}

describe("downloader.ts: shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys) {
            expect(DOWNLOADER_VOICED[key].en, key).toHaveLength(5);
            expect(DOWNLOADER_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                DOWNLOADER_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(DOWNLOADER_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                DOWNLOADER_VOICED[key][language].forEach((text, index) => {
                    expect(text, `${key} ${language} L${index + 1}`).not.toContain("—");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(DOWNLOADER_FIXED[key][language], `${key} ${language}`).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const overlap = voicedKeys.filter((key) => (fixedKeys as string[]).includes(key));
        expect(overlap).toEqual([]);
    });

    it("keeps every key inside the downloader namespace", () => {
        const strays = [...(voicedKeys as string[]), ...(fixedKeys as string[])].filter(
            (key) => !key.startsWith("downloader."),
        );
        expect(
            strays,
            "a key outside this surface's namespace answers some other surface's call, or " +
                "nobody's. Either way the module it lives in is no longer the place to look " +
                "for it.",
        ).toEqual([]);
    });
});

describe("downloader.ts: the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const strings = DOWNLOADER_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys) {
            for (let level = 0; level < 5; level++) {
                expect(DOWNLOADER_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    DOWNLOADER_VOICED[key].yue[level],
                );
            }
        }
    });
});

describe("downloader.ts: no level drops a value out of a sentence", () => {
    it("uses the same placeholders at every level, in both languages", () => {
        for (const key of voicedKeys) {
            const expected = sorted(placeholdersIn(DOWNLOADER_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                DOWNLOADER_VOICED[key][language].forEach((text, index) => {
                    expect(
                        sorted(placeholdersIn(text)),
                        `${key} ${language} L${index + 1}`,
                    ).toEqual(expected);
                });
            }
        }
    });
});

describe("downloader.ts: no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys) {
            const required = DOWNLOADER_FACTS[key];
            for (const language of LANGUAGES) {
                DOWNLOADER_VOICED[key][language].forEach((text, index) => {
                    for (const fact of required[language]) {
                        if (!text.includes(fact)) {
                            missing.push(`${key} ${language} L${index + 1} lost "${fact}"`);
                        }
                    }
                });
            }
        }
        expect(
            missing,
            "the funny level styles the voice and never the facts. A level that stops " +
                "saying only what was walked through is saved, or that a discard cannot be " +
                "undone, is a broken warning rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys.filter((key) => {
            const entry = DOWNLOADER_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});
