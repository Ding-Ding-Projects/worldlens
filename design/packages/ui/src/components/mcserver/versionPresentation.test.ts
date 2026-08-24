import { describe, expect, it } from "vitest";

import {
    gameVersionOf,
    isNumberedRelease,
    releaseDateLabel,
    wikiArticleStateFor,
    wikiUrlFor,
} from "./versionPresentation.js";

describe("presenting a version", () => {
    it("drops a build suffix, because only the game version means anything to the wiki", () => {
        expect(gameVersionOf("1.21.4#123")).toBe("1.21.4");
        expect(gameVersionOf("1.21.4")).toBe("1.21.4");
    });

    it("tells a numbered release from a snapshot, which the wiki titles differently", () => {
        expect(isNumberedRelease("1.21")).toBe(true);
        expect(isNumberedRelease("1.21.4")).toBe(true);
        expect(isNumberedRelease("24w14a")).toBe(false);
        expect(isNumberedRelease("1.21-pre1")).toBe(false);
    });

    it("addresses a release and a snapshot the way the wiki actually titles them", () => {
        expect(wikiUrlFor("1.21.4")).toBe("https://minecraft.wiki/w/Java_Edition_1.21.4");
        expect(wikiUrlFor("24w14a")).toBe("https://minecraft.wiki/w/24w14a");
        expect(wikiUrlFor("1.21.4#123")).toBe("https://minecraft.wiki/w/Java_Edition_1.21.4");
    });

    it("returns nothing rather than an address that would land somewhere unrelated", () => {
        expect(wikiUrlFor("")).toBeNull();
        expect(wikiUrlFor("   ")).toBeNull();
        // Anything carrying characters a version name never has is refused outright.
        expect(wikiUrlFor("../../Main_Page")).toBeNull();
        expect(wikiUrlFor("1.21 4")).toBeNull();
    });

    it("keeps article verification honest", () => {
        expect(wikiArticleStateFor("1.21.4")).toBe("offline-unverified");
        expect(wikiArticleStateFor("1.21.4", true)).toBe("verified");
        expect(wikiArticleStateFor("1.21.4", false)).toBe("unavailable");
        expect(wikiArticleStateFor("../../Main_Page")).toBe("unavailable");
    });

    it("shows a date when there is one and says nothing when there is not", () => {
        expect(releaseDateLabel("2024-12-03T10:12:57+00:00", "en-GB")).toContain("2024");
        expect(releaseDateLabel(null)).toBeNull();
        expect(releaseDateLabel("")).toBeNull();
        // A date the API sent but nothing can parse must not become "Invalid Date" on screen.
        expect(releaseDateLabel("not a date")).toBeNull();
    });
});
