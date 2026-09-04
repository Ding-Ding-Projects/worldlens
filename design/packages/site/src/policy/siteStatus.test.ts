/**
 * Almost entirely about the missing case.
 *
 * A status surface is believed, so the expensive failure is not "it shows nothing", it is
 * "it shows something plausible that is not true". Launch time rendered as build time is the
 * exact shape of that, and it is what a fallback would produce.
 */

import { describe, expect, it } from "vitest";

import {
    formatBuiltAt,
    provenanceAvailable,
    siteProvenance,
    statusFacts,
    type SiteProvenance,
} from "./siteStatus.js";

const complete: SiteProvenance = {
    version: "1.0.1911",
    commit: "2409b492aaaabbbbccccdddd",
    builtAt: "2026-09-04T05:02:37.000Z",
};

const empty: SiteProvenance = { version: null, commit: null, builtAt: null };

describe("reading provenance", () => {
    it("does not throw when the toolchain defined nothing", () => {
        // An older config, or this module imported directly by a test. Nothing is a valid
        // answer; a crash on a status surface is the worst possible way to report a gap.
        expect(() => siteProvenance()).not.toThrow();
    });

    it("says a build with no provenance has none", () => {
        expect(provenanceAvailable(empty)).toBe(false);
        expect(provenanceAvailable(complete)).toBe(true);
        expect(provenanceAvailable({ ...empty, version: "1.0.0" })).toBe(true);
    });
});

describe("what a surface is given", () => {
    it("reports version, updated-at and commit, in that order", () => {
        expect(statusFacts(complete).map((f) => f.label)).toEqual([
            "Version",
            "Updated at",
            "Commit",
        ]);
    });

    it("leaves a missing value missing, and explains rather than blanking it", () => {
        // The one that matters. Nothing here may invent a time, and a blank cell would read
        // as a broken page rather than as an absent fact.
        for (const fact of statusFacts(empty)) {
            expect(fact.known).toBe(false);
            expect(fact.known === false && fact.why).toMatch(/Not recorded/);
        }
    });

    it("never falls back to the current time", () => {
        // A guessed timestamp looks exactly like a real one, on the one surface whose whole
        // job is to be trusted about exactly that.
        const now = new Date().getFullYear().toString();
        const updated = statusFacts(empty)[1];
        expect(updated?.known).toBe(false);
        expect(JSON.stringify(updated)).not.toContain(now);
    });

    it("shortens the commit without losing which commit it is", () => {
        const commit = statusFacts(complete)[2];
        expect(commit?.known === true && commit.value).toBe("2409b492aaaa");
    });
});

describe("formatting the updated-at time", () => {
    it("names the timezone, to the second", () => {
        // Without a zone a timestamp is ambiguous by up to a day, and a reader comparing it
        // against a release in a different unlabelled zone cannot.
        const formatted = formatBuiltAt(complete.builtAt as string);
        expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/);
        expect(formatted).toMatch(/\(.+\)$/);
    });

    it("says a bad value is unreadable rather than printing Invalid Date", () => {
        // "Invalid Date" reads as a defect in the page rather than in the value it was
        // handed, which sends whoever sees it looking in the wrong place.
        expect(formatBuiltAt("not a date")).toBe("recorded, but not a readable date");
    });
});
