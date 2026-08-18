import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAGES_FEATURE_COVERAGE, REQUIRED_PAGES_FEATURE_IDS } from "./globalFeatureCoverage.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

const REQUIRED_GALLERY_WIRING = [
    {
        id: "complete-committed-registry",
        path: "design/packages/site/src/content/screenshotGallery.ts",
        pattern: /^export const committedCaptureGallery: readonly GalleryCapture\[\] = \[$/m,
    },
    {
        id: "evidence-inventory-source",
        path: "design/packages/site/src/content/screenshotGallery.ts",
        pattern: /^const evidenceInventoryModules = import\.meta\.glob\($/m,
    },
    {
        id: "all-search-fields",
        path: "design/packages/site/src/content/screenshotGallery.ts",
        pattern: /^export const GALLERY_SEARCH_FIELD_NAMES = \[$/m,
    },
    {
        id: "anchored-builder-search-field",
        path: "design/packages/site/src/shots/CaptureGallery.ts",
        pattern: /^\s*field = createSearchField\(\{$/m,
    },
    {
        id: "real-search-index",
        path: "design/packages/site/src/shots/CaptureGallery.ts",
        pattern: /^\s*const index = buildCandidateIndex\(candidates, GALLERY_SEARCH_FIELDS\);$/m,
    },
    {
        id: "category-filter",
        path: "design/packages/site/src/shots/CaptureGallery.ts",
        pattern:
            /^\s*const categoryButtons = new Map<GalleryCategoryId \| "all", HTMLButtonElement>\(\);$/m,
    },
    {
        id: "grouped-results",
        path: "design/packages/site/src/shots/CaptureGallery.ts",
        pattern: /^\s*for \(const group of groupGalleryCaptures\(captures\)\) \{$/m,
    },
    {
        id: "page-mount",
        path: "design/packages/site/src/main.ts",
        pattern: /^\s*const gallery = createCaptureGallery\(\{$/m,
    },
    {
        id: "page-attachment",
        path: "design/packages/site/src/main.ts",
        pattern: /^\s*committed\.appendChild\(gallery\.element\);$/m,
    },
] as const;

function missingGalleryWiring(sources: ReadonlyMap<string, string>): readonly string[] {
    return REQUIRED_GALLERY_WIRING.filter(
        (entry) => !entry.pattern.test(sources.get(entry.path) ?? ""),
    ).map((entry) => entry.id);
}

function missingMandatoryRows(rows: readonly { readonly id: string }[]): readonly string[] {
    return ["searchable-categorized-capture-gallery"].filter(
        (requiredId) => !rows.some((row) => row.id === requiredId),
    );
}

describe("hand-written GitHub Pages global-feature coverage", () => {
    it("covers every required id exactly once", () => {
        const actual = PAGES_FEATURE_COVERAGE.map((item) => item.id);
        expect(actual).toEqual(REQUIRED_PAGES_FEATURE_IDS);
        expect(new Set(actual).size).toBe(actual.length);
    });

    it("requires implementation and verification evidence for every applicable feature", () => {
        for (const item of PAGES_FEATURE_COVERAGE) {
            if (item.status !== "implemented") continue;
            expect(
                item.implementation.length,
                `${item.id} has no implementation evidence`,
            ).toBeGreaterThan(0);
            expect(
                item.verification.length,
                `${item.id} has no verification evidence`,
            ).toBeGreaterThan(0);
            for (const path of [...item.implementation, ...item.verification]) {
                expect(
                    existsSync(resolve(repoRoot, path)),
                    `${item.id} points at missing ${path}`,
                ).toBe(true);
            }
        }
    });

    it("requires a concrete public reason for every non-applicable or optional feature", () => {
        for (const item of PAGES_FEATURE_COVERAGE) {
            if (item.status === "implemented") continue;
            expect(item.reason.length, `${item.id} has only a hand-wave`).toBeGreaterThan(120);
        }
    });

    it("leaves no applicable feature incomplete", () => {
        expect(
            PAGES_FEATURE_COVERAGE.some((item) => (item.status as string) === "incomplete"),
        ).toBe(false);
    });

    it("keeps the searchable categorized capture-gallery row even if both broad lists drift", () => {
        const requiredId = "searchable-categorized-capture-gallery";
        const gallery = PAGES_FEATURE_COVERAGE.find((item) => item.id === requiredId);
        expect(REQUIRED_PAGES_FEATURE_IDS).toContain(requiredId);
        expect(gallery).toBeDefined();
        expect(gallery?.status).toBe("implemented");
        expect(missingMandatoryRows(PAGES_FEATURE_COVERAGE)).toEqual([]);

        const withoutGallery = PAGES_FEATURE_COVERAGE.filter((item) => item.id !== requiredId);
        expect(
            missingMandatoryRows(withoutGallery),
            "the deliberate missing-row fixture must turn the exact gallery guard red",
        ).toContain(requiredId);
    });

    it("fails exact gallery wiring one removed boundary at a time", () => {
        const sources = new Map<string, string>();
        for (const entry of REQUIRED_GALLERY_WIRING) {
            if (!sources.has(entry.path)) {
                sources.set(entry.path, readFileSync(resolve(repoRoot, entry.path), "utf8"));
            }
        }
        expect(missingGalleryWiring(sources)).toEqual([]);

        for (const entry of REQUIRED_GALLERY_WIRING) {
            const original = sources.get(entry.path) ?? "";
            expect(entry.pattern.test(original), `${entry.id} fixture never matched`).toBe(true);
            const broken = new Map(sources);
            broken.set(entry.path, original.replace(entry.pattern, ""));
            expect(
                missingGalleryWiring(broken),
                `${entry.id} stayed green after its exact boundary was removed`,
            ).toContain(entry.id);
        }
    });

    it("describes the no-solicitation policy without repeating copy the shipped-copy scanner rejects", () => {
        const policy = PAGES_FEATURE_COVERAGE.find((item) => item.id === "no-promotional-nags");
        expect(policy).toBeDefined();
        if (policy?.status !== "implemented") {
            throw new Error("no-promotional-nags must remain an implemented coverage row");
        }
        expect(policy.verification).toContain(
            "design/packages/site/src/notifications/notificationPolicy.test.ts",
        );
        expect(policy.title).toBe(
            "The shipped-copy policy guard rejects every unwanted solicitation pattern",
        );
    });
});
