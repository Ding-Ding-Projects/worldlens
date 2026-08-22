import { describe, expect, it } from "vitest";
import {
    displayPercent,
    hasReturningUserContent,
    inProgressRenders,
    inProgressRendersOverflow,
    recentProfiles,
    recentProfilesOverflow,
} from "./homeDashboardModel.js";
import type { ActiveRenderRow } from "../renders/activeRenders.js";
import type { ServerProfile } from "../../stores/profiles.js";

function row(overrides: Partial<ActiveRenderRow> = {}): ActiveRenderRow {
    return {
        key: "local:1",
        renderId: "1",
        route: "local",
        routeDetail: "this computer",
        worldLabel: "world",
        projectLabel: "project",
        state: "running",
        facts: {} as ActiveRenderRow["facts"],
        percent: 42,
        errorText: null,
        startedAtMs: null,
        canCancel: true,
        canOpenConsole: true,
        needsReattach: false,
        reattachMessage: null,
        busy: false,
        ...overrides,
    };
}

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
    return { id: "p1", name: "My server", url: "", trustCustomizations: false, ...overrides };
}

describe("inProgressRenders", () => {
    it("keeps starting, running and offer rows", () => {
        const rows = [
            row({ key: "a", state: "starting" }),
            row({ key: "b", state: "running" }),
            row({ key: "c", state: "offer" }),
            row({ key: "d", state: "finished" }),
            row({ key: "e", state: "failed" }),
            row({ key: "f", state: "cancelled" }),
        ];
        expect(inProgressRenders(rows).map((r) => r.key)).toEqual(["a", "b", "c"]);
    });

    it("caps to the limit and reports the overflow separately", () => {
        const rows = Array.from({ length: 6 }, (_, i) => row({ key: `r${i}` }));
        expect(inProgressRenders(rows, 4)).toHaveLength(4);
        expect(inProgressRendersOverflow(rows, 4)).toBe(2);
    });

    it("reports zero overflow when nothing was cut", () => {
        const rows = [row({ key: "a" }), row({ key: "b" })];
        expect(inProgressRendersOverflow(rows, 4)).toBe(0);
    });
});

describe("recentProfiles", () => {
    it("returns the most recently added profiles first", () => {
        const profiles = [profile({ id: "1" }), profile({ id: "2" }), profile({ id: "3" })];
        expect(recentProfiles(profiles, 2).map((p) => p.id)).toEqual(["3", "2"]);
    });

    it("reports overflow only when the list was actually cut", () => {
        const profiles = [profile({ id: "1" }), profile({ id: "2" }), profile({ id: "3" })];
        expect(recentProfilesOverflow(profiles, 2)).toBe(1);
        expect(recentProfilesOverflow(profiles, 10)).toBe(0);
    });
});

describe("hasReturningUserContent", () => {
    it("is false for a genuinely fresh install", () => {
        expect(hasReturningUserContent([], [], 0)).toBe(false);
    });

    it("is true with a saved profile alone", () => {
        expect(hasReturningUserContent([profile()], [], 0)).toBe(true);
    });

    it("is true with an in-progress render alone", () => {
        expect(hasReturningUserContent([], [row({ state: "starting" })], 0)).toBe(true);
    });

    it("ignores a finished render with no profiles and no drafts", () => {
        expect(hasReturningUserContent([], [row({ state: "finished" })], 0)).toBe(false);
    });

    it("is true with a project draft alone", () => {
        expect(hasReturningUserContent([], [], 1)).toBe(true);
    });
});

describe("displayPercent", () => {
    it("rounds and clamps into 0..100", () => {
        expect(displayPercent(42.6)).toBe(43);
        expect(displayPercent(-5)).toBe(0);
        expect(displayPercent(140)).toBe(100);
    });

    it("passes through null and non-finite values as null", () => {
        expect(displayPercent(null)).toBeNull();
        expect(displayPercent(Number.NaN)).toBeNull();
    });
});
