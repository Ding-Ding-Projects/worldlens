import { describe, expect, it } from "vitest";

import { filterByOwner, ownersPresent, type OwnedRepository } from "./ownerFilter.js";

function repo(owner: string, name: string): OwnedRepository {
    return { owner, fullName: `${owner}/${name}` };
}

const ALL: OwnedRepository[] = [
    repo("cntow", "worldlens"),
    repo("cntow", "notes"),
    repo("Ding-Ding-Projects", "worldlens"),
    repo("Ding-Ding-Projects", "dim-sum-photos"),
    repo("Ding-Ding-Projects", "anti-cheat"),
];

describe("narrowing repositories to a chosen owner", () => {
    it("shows only that owner's repositories", () => {
        // The defect this exists for: choosing an organization set the owner and changed
        // nothing on screen, so the control read as broken when it was simply unconnected.
        const result = filterByOwner(ALL, ALL, "Ding-Ding-Projects");

        expect(result.shown.map((entry) => entry.fullName)).toEqual([
            "Ding-Ding-Projects/worldlens",
            "Ding-Ding-Projects/dim-sum-photos",
            "Ding-Ding-Projects/anti-cheat",
        ]);
        expect(result.hiddenByOwner).toBe(2);
    });

    it("shows everything when no owner is chosen", () => {
        for (const owner of [null, "", "   "]) {
            const result = filterByOwner(ALL, ALL, owner);
            expect(result.shown).toHaveLength(ALL.length);
            expect(result.hiddenByOwner).toBe(0);
        }
    });

    it("matches an owner regardless of case", () => {
        // GitHub treats owner names case-insensitively. A picker returning one casing while
        // a record holds another would hide everything for a reason nobody could see.
        expect(filterByOwner(ALL, ALL, "ding-ding-projects").shown).toHaveLength(3);
        expect(filterByOwner(ALL, ALL, "CNTOW").shown).toHaveLength(2);
    });

    it("narrows what a search already matched rather than replacing it", () => {
        const searched = ALL.filter((entry) => entry.fullName.includes("worldlens"));
        const result = filterByOwner(searched, ALL, "cntow");

        // Both filters apply. The search found two, the owner keeps one.
        expect(result.shown.map((entry) => entry.fullName)).toEqual(["cntow/worldlens"]);
    });

    it("separates an owner with nothing from a search that matched nothing", () => {
        // The two need different sentences: an empty search says to search differently, an
        // empty owner is a fact about what this account may write to.
        const emptyOwner = filterByOwner(ALL, ALL, "some-other-org");
        expect(emptyOwner.shown).toHaveLength(0);
        expect(emptyOwner.ownerIsEmpty).toBe(true);

        const noSearchMatch = filterByOwner([], ALL, "cntow");
        expect(noSearchMatch.shown).toHaveLength(0);
        expect(noSearchMatch.ownerIsEmpty).toBe(false);
    });

    it("handles an empty repository list without claiming the owner is at fault", () => {
        const result = filterByOwner([], [], "cntow");
        expect(result.shown).toHaveLength(0);
        // Nothing was loaded at all, so blaming the owner would be wrong.
        expect(result.ownerIsEmpty).toBe(true);
    });
});

describe("listing the owners that are actually present", () => {
    it("names each owner once, in the order they first appear", () => {
        expect(ownersPresent(ALL)).toEqual(["cntow", "Ding-Ding-Projects"]);
    });

    it("treats differently-cased spellings of one owner as one owner", () => {
        expect(ownersPresent([repo("cntow", "a"), repo("CNTOW", "b")])).toEqual(["cntow"]);
    });

    it("has nothing to list for an empty set", () => {
        expect(ownersPresent([])).toEqual([]);
    });
});
