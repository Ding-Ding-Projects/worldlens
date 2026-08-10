/**
 * The travelling history, proven on a real disk with a real git.
 *
 * The property under test is the one the module's header promises: a project file that
 * carries its embedded bundle can rebuild the full revision history on a machine that has
 * never seen the project - and a machine that already holds a history is never overwritten
 * by a file's copy of one.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    PROJECT_FORMAT_VERSION,
    projectFileSchema,
    type ProjectFile,
} from "@worldlens/config";

function project(overrides: Partial<ProjectFile> = {}): ProjectFile {
    return projectFileSchema.parse({
        version: PROJECT_FORMAT_VERSION,
        id: "p-embed",
        name: "Bastion",
        createdAt: "2026-08-10T12:00:00-04:00",
        updatedAt: "2026-08-10T12:00:00-04:00",
        ...overrides,
    });
}

import {
    bundleProjectHistory,
    canonicalDiskText,
    readEmbeddedHistory,
    seedProjectHistory,
    withEmbeddedHistory,
} from "./embeddedHistory.js";
import { projectHistoryListing } from "./history.js";
import { saveProject } from "./save.js";

let dataDir: string;
let otherDataDir: string;
let world: string;

beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "worldlens-embed-data-"));
    otherDataDir = await mkdtemp(join(tmpdir(), "worldlens-embed-other-"));
    world = await mkdtemp(join(tmpdir(), "worldlens-embed-world-"));
});

afterEach(async () => {
    for (const folder of [dataDir, otherDataDir, world]) {
        await rm(folder, { recursive: true, force: true });
    }
});

describe("the embedded history, on a real disk with a real git", () => {
    it("writes the trailer on save, and the trailer never contains itself", async () => {
        const first = project();
        const saved = await saveProject({ dataDir, embedHistory: true }, world, first);
        expect(saved.ok).toBe(true);
        if (!saved.ok) return;
        expect(saved.historyOk).toBe(true);

        const text = await readFile(join(world, "worldlens.project.json"), "utf8");
        const embedded = readEmbeddedHistory(JSON.parse(text));
        expect(embedded).not.toBeNull();

        // The canonical view drops exactly the trailer and nothing else.
        const canonical = canonicalDiskText(text);
        expect(canonical).not.toContain('"history"');
        expect(canonical).toContain('"Bastion"');

        // A second save's bundle covers both revisions without compounding: the snapshot
        // the second revision records is the canonical text, not the first trailer.
        const second = await saveProject(
            { dataDir, embedHistory: true },
            world,
            project({ name: "Bastion Renamed" }),
        );
        expect(second.ok && second.historyOk).toBe(true);
        const listing = await projectHistoryListing({ dataDir }, world);
        expect(listing.revisions).toHaveLength(2);
    });

    it("seeds an empty machine's history from the file, and never overwrites a live one", async () => {
        await saveProject({ dataDir, embedHistory: true }, world, project());
        await saveProject({ dataDir, embedHistory: true }, world, project({ name: "Renamed" }));

        const text = await readFile(join(world, "worldlens.project.json"), "utf8");
        const embedded = readEmbeddedHistory(JSON.parse(text));
        expect(embedded).not.toBeNull();
        if (embedded === null) return;

        // A "new machine": same world path, an application data directory with no history.
        const seeded = await seedProjectHistory({ dataDir: otherDataDir }, world, embedded);
        expect(seeded).toMatchObject({ ok: true, seeded: true });
        const listing = await projectHistoryListing({ dataDir: otherDataDir }, world);
        expect(listing.available).toBe(true);
        expect(listing.revisions).toHaveLength(2);

        // Seeding again is a stated no-op: the machine's own record is the authority.
        const again = await seedProjectHistory({ dataDir: otherDataDir }, world, embedded);
        expect(again).toMatchObject({ ok: true, seeded: false });
        expect((await projectHistoryListing({ dataDir: otherDataDir }, world)).revisions).toHaveLength(2);
    });

    it("round-trips through withEmbeddedHistory with the trailer last and the JSON intact", async () => {
        await saveProject({ dataDir, embedHistory: true }, world, project());
        const bundled = await bundleProjectHistory({ dataDir }, world);
        expect(bundled.ok).toBe(true);
        if (!bundled.ok) return;

        const canonical = canonicalDiskText(
            await readFile(join(world, "worldlens.project.json"), "utf8"),
        );
        const trailed = withEmbeddedHistory(canonical, bundled.history);
        const parsed = JSON.parse(trailed) as Record<string, unknown>;
        expect(Object.keys(parsed).at(-1)).toBe("history");
        expect(readEmbeddedHistory(parsed)).toEqual(bundled.history);
        expect(canonicalDiskText(trailed)).toBe(canonical);
    });
});
