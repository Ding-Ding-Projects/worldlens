/**
 * A dashboard is believed, so most of these are about it not saying more than it knows.
 */

import { describe, expect, it } from "vitest";

import { renderDashboardHtml, type RenderDashboardInput } from "./renderDashboard.js";

const input = (over: Partial<RenderDashboardInput> = {}): RenderDashboardInput => ({
    owner: "an-owner",
    repo: "a-repo",
    mapId: "overworld",
    mapName: "Overworld",
    world: "worlds/survival",
    commit: "abc1234",
    runId: "12345",
    shards: 8,
    renderedAt: "2026-09-04T01:02:03Z",
    backups: [
        {
            label: "Survival",
            releaseTag: "wl-world-1",
            bytes: 3 * 1024 * 1024 * 1024,
            sha256: "a".repeat(64),
            createdAt: "2026-09-04T00:00:00Z",
            parts: 7,
        },
    ],
    ...over,
});

describe("the render dashboard", () => {
    it("links to the map beside it, not into it", () => {
        // The map is upstream's webapp. A page of ours written inside it is a file
        // upstream's next release quietly overwrites.
        const html = renderDashboardHtml(input());
        expect(html).toContain('href="../map/"');
    });

    it("shows the backups it was given, with a real download link", () => {
        const html = renderDashboardHtml(input());
        expect(html).toContain("Survival");
        expect(html).toContain("3.0 GiB");
        expect(html).toContain("https://github.com/an-owner/a-repo/releases/tag/wl-world-1");
    });

    it("says no record was found, rather than implying no backup was made", () => {
        // The distinction matters: an empty table reads as "your world was not saved",
        // which would be a false alarm about the one thing people check this page for.
        const html = renderDashboardHtml(input({ backups: [] }));
        expect(html).toMatch(/No backup has been recorded/);
        expect(html).toMatch(/not that the world was not uploaded/);
    });

    it("omits what it was not told, rather than printing zero", () => {
        // A shard count nobody measured is not 0, and a run that was not named has no
        // link. Both would be numbers a reader could check and find wrong.
        const html = renderDashboardHtml(input({ shards: null, commit: null, runId: null }));
        expect(html).not.toContain("Shards");
        expect(html).not.toContain("Toolchain commit");
        expect(html).not.toContain("/actions/runs/");
    });

    it("escapes what it is handed", () => {
        // Map names come from a world folder, which is a name somebody else chose.
        const html = renderDashboardHtml(input({ mapName: '<img src=x onerror="alert(1)">' }));
        expect(html).not.toContain("<img src=x");
        expect(html).toContain("&lt;img src=x");
    });

    it("defines both themes, so it is not one look imposed on everybody", () => {
        const html = renderDashboardHtml(input());
        expect(html).toContain("prefers-color-scheme: dark");
        expect(html).toContain("--md-sys-color-surface");
    });

    it("carries no network dependency", () => {
        // Published to a static host with nothing of ours beside it. A stylesheet or font
        // fetched from elsewhere is a page that stops working when that elsewhere does.
        const html = renderDashboardHtml(input());
        expect(html).not.toMatch(/<link[^>]+href="https?:/);
        expect(html).not.toMatch(/<script/);
        expect(html).not.toMatch(/@import/);
    });

    it("lets a wide table scroll inside itself rather than the page", () => {
        const html = renderDashboardHtml(input());
        expect(html).toContain('class="scroll"');
        expect(html).toContain("overflow-x: auto");
    });

    it("gives its one action a visible focus ring and a real target size", () => {
        const html = renderDashboardHtml(input());
        expect(html).toContain("focus-visible");
        expect(html).toContain("min-height: 40px");
    });
});
