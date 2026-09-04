/**
 * The point of committing a pointer is that the record survives without a network, so
 * most of these are about the record staying readable and staying true - and about the
 * pointer bytes being the uploader's, not this module's.
 */

import { describe, expect, it } from "vitest";

import { CHEAP_LFS_POINTER_VERSION } from "../backup/pointer.js";
import {
    MAX_INDEX_ENTRIES,
    WORLD_BACKUP_INDEX_FILE,
    WORLD_BACKUP_INDEX_VERSION,
    WORLD_BACKUP_README_FILE,
    filesForUpload,
    parseIndex,
    pointerPathFor,
    withEntry,
    type WorldBackupEntry,
    type WorldBackupIndex,
} from "./worldBackupIndex.js";

const POINTER = [
    `version ${CHEAP_LFS_POINTER_VERSION}`,
    "release-tag wl-world-20260904-010203",
    "asset-name overworld.zip",
    "size 1234",
    "sha256 " + "a".repeat(64),
    "",
].join("\n");

const entry = (over: Partial<WorldBackupEntry> = {}): WorldBackupEntry => ({
    label: "Overworld",
    releaseTag: "wl-world-20260904-010203",
    archive: "overworld.zip",
    pointer: "worlds/overworld-wl-world-20260904-010203.cheaplfs",
    bytes: 1234,
    sha256: "a".repeat(64),
    parts: 1,
    createdAt: "2026-09-04T01:02:03.000Z",
    appVersion: "1.0.0",
    ...over,
});

describe("committing a world backup's pointer", () => {
    it("writes the uploader's pointer bytes through unaltered", () => {
        // The format is a shipped contract shared with a sibling application, and its own
        // module says in as many words not to invent near-misses of it. Anything this
        // module composed would be exactly that.
        const { files } = filesForUpload({
            existingIndex: null,
            pointerText: POINTER,
            entry: entry(),
            owner: "an-owner",
            repo: "a-repo",
        });
        const pointer = files.find((file) => file.path.endsWith(".cheaplfs"));
        expect(pointer?.content).toBe(POINTER);
    });

    it("refuses to commit anything that is not a Cheap LFS pointer", () => {
        // A caller that has lost the pointer must not get a plausible-looking file
        // committed in its place - that would be a record that reads as a backup and
        // restores nothing.
        expect(() =>
            filesForUpload({
                existingIndex: null,
                pointerText: '{"looks":"like json"}',
                entry: entry(),
                owner: "an-owner",
                repo: "a-repo",
            }),
        ).toThrow(/Cheap LFS/);
    });

    it("writes all three files, at stable paths", () => {
        const { files } = filesForUpload({
            existingIndex: null,
            pointerText: POINTER,
            entry: entry(),
            owner: "an-owner",
            repo: "a-repo",
        });
        expect(files.map((file) => file.path).sort()).toEqual(
            [entry().pointer, WORLD_BACKUP_INDEX_FILE, WORLD_BACKUP_README_FILE].sort(),
        );
    });

    it("appends rather than replacing, so earlier backups survive", () => {
        // The failure this exists to prevent: a second render quietly erasing the record
        // of the first, leaving a repository that looks like it only ever held one world.
        const first = filesForUpload({
            existingIndex: null,
            pointerText: POINTER,
            entry: entry({ label: "First", releaseTag: "tag-1" }),
            owner: "o",
            repo: "r",
        });
        const firstIndex = first.files.find((f) => f.path === WORLD_BACKUP_INDEX_FILE)!.content;

        const second = filesForUpload({
            existingIndex: firstIndex,
            pointerText: POINTER,
            entry: entry({ label: "Second", releaseTag: "tag-2" }),
            owner: "o",
            repo: "r",
        });
        const parsed = parseIndex(
            second.files.find((f) => f.path === WORLD_BACKUP_INDEX_FILE)!.content,
        ).index;

        expect(parsed.entries.map((e) => e.label)).toEqual(["Second", "First"]);
    });

    it("does not duplicate a retried upload of the same release", () => {
        const once = withEntry({ indexVersion: 1, entries: [] }, entry());
        const twice = withEntry(once, entry({ label: "Overworld (retry)" }));
        expect(twice.entries).toHaveLength(1);
        expect(twice.entries[0]?.label).toBe("Overworld (retry)");
    });

    it("starts fresh from an unreadable index, and says that it did", () => {
        // Silently keeping half of a corrupt index would look complete while having
        // dropped whatever it could not parse.
        const parsed = parseIndex("{ not json");
        expect(parsed.recovered).toBe(true);
        expect(parsed.index.entries).toEqual([]);
    });

    it("refuses a newer index rather than truncating it to what this build knows", () => {
        const future = JSON.stringify({ indexVersion: 99, entries: [entry()] });
        const parsed = parseIndex(future);
        expect(parsed.index.indexVersion).toBe(99);
        expect(parsed.recovered).toBe(false);
    });

    it("bounds how many entries the index keeps", () => {
        let index: WorldBackupIndex = { indexVersion: WORLD_BACKUP_INDEX_VERSION, entries: [] };
        for (let n = 0; n < MAX_INDEX_ENTRIES + 10; n += 1) {
            index = withEntry(index, entry({ releaseTag: `tag-${String(n)}` }));
        }
        expect(index.entries).toHaveLength(MAX_INDEX_ENTRIES);
    });

    it("says in the readme that the committed files are not the backup", () => {
        // Somebody finding a folder of tiny files in their own repository should not have
        // to guess whether these are the world.
        const { files } = filesForUpload({
            existingIndex: null,
            pointerText: POINTER,
            entry: entry(),
            owner: "an-owner",
            repo: "a-repo",
        });
        const readme = files.find((f) => f.path === WORLD_BACKUP_README_FILE)!.content;
        expect(readme).toMatch(/not the backup/i);
        expect(readme).toContain("an-owner/a-repo");
        expect(readme).toContain("Overworld");
    });

    it("keeps a label safe in a path without inventing a second convention", () => {
        expect(pointerPathFor({ label: "My World / 2024!", releaseTag: "wl-x" })).toBe(
            "worlds/my-world-2024-wl-x.cheaplfs",
        );
    });
});
