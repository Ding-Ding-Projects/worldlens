import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    GALLERY_CATEGORIES,
    GALLERY_CATEGORY_IDS,
    GALLERY_SEARCH_FIELD_NAMES,
    committedCaptureGallery,
    filterGalleryByCategory,
    galleryCategoryCounts,
    gallerySearchValue,
    groupGalleryCaptures,
} from "./screenshotGallery.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const screenshotRoot = resolve(repoRoot, "docs/screenshots");

describe("committed screenshot gallery registry", () => {
    it("covers every tracked PNG exactly once", () => {
        const tracked = readdirSync(screenshotRoot)
            .filter((file) => file.toLowerCase().endsWith(".png"))
            .sort();
        const gallery = committedCaptureGallery.map((capture) => capture.file).sort();

        expect(gallery).toEqual(tracked);
        expect(new Set(gallery).size).toBe(gallery.length);
    });

    it("keeps every record truthful and searchable", () => {
        const categoryIds = new Set(GALLERY_CATEGORY_IDS);
        for (const capture of committedCaptureGallery) {
            expect(capture.url, `${capture.file} has no bundled URL`).not.toBe("");
            expect(capture.title, `${capture.file} has no title`).not.toBe("");
            expect(capture.description, `${capture.file} has no description`).not.toBe("");
            expect(capture.state, `${capture.file} has no recorded state`).not.toBe("");
            expect(capture.alt.length, `${capture.file} has weak alt text`).toBeGreaterThan(40);
            expect(
                categoryIds.has(capture.categoryId),
                `${capture.file} has no known category`,
            ).toBe(true);
            for (const field of GALLERY_SEARCH_FIELD_NAMES) {
                expect(
                    gallerySearchValue(capture, field).trim().length,
                    `${capture.file}/${field} is not searchable`,
                ).toBeGreaterThan(0);
            }
        }
    });

    it("groups without dropping or duplicating a capture", () => {
        const grouped = groupGalleryCaptures(committedCaptureGallery).flatMap(
            (group) => group.captures,
        );
        expect(grouped.map((capture) => capture.file).sort()).toEqual(
            committedCaptureGallery.map((capture) => capture.file).sort(),
        );
    });

    it("gives every populated category an honest count and filter", () => {
        const counts = galleryCategoryCounts(committedCaptureGallery);
        for (const category of GALLERY_CATEGORIES) {
            const filtered = filterGalleryByCategory(committedCaptureGallery, category.id);
            expect(filtered).toHaveLength(counts.get(category.id) ?? 0);
            expect(filtered.every((capture) => capture.categoryId === category.id)).toBe(true);
        }
        expect(filterGalleryByCategory(committedCaptureGallery, "all")).toBe(
            committedCaptureGallery,
        );
    });

    it("labels retired notification evidence separately from its current replacements", () => {
        const byFile = new Map(committedCaptureGallery.map((capture) => [capture.file, capture]));
        expect(byFile.get("notifications-toast.png")?.categoryId).toBe("historical-retired");
        expect(byFile.get("notifications-corner.png")?.categoryId).toBe("historical-retired");
        expect(byFile.get("notifications-rail-bell.png")?.categoryId).not.toBe(
            "historical-retired",
        );
        expect(byFile.get("notifications-history.png")?.categoryId).not.toBe("historical-retired");
    });

    it("keeps the requested search metadata fields explicit and complete", () => {
        expect(GALLERY_SEARCH_FIELD_NAMES).toEqual([
            "category",
            "title",
            "description",
            "state",
            "theme",
            "viewport",
            "commit",
        ]);
    });
});
