// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import type { GalleryCapture } from "../content/screenshotGallery.js";
import { BoundedRegexEvaluator } from "../search/evaluator.js";
import { memoryPreferenceStore } from "../search/preferences.js";
import { createInProcessChannel } from "../search/workerChannel.js";
import { createCaptureGallery } from "./CaptureGallery.js";
import type { CaptureGalleryCopy, CaptureGalleryView } from "./CaptureGallery.js";

function capture(
    file: string,
    title: string,
    categoryId: GalleryCapture["categoryId"],
    overrides: Partial<GalleryCapture> = {},
): GalleryCapture {
    return {
        file,
        url: `/assets/${file}`,
        title,
        description: `${title} description`,
        state: `${title} recorded state`,
        alt: `${title} real application capture with enough exact descriptive text for a screen reader.`,
        categoryId,
        theme: "Not recorded",
        viewport: "Not recorded",
        sourceCommit: "deadbeef1234567890",
        sourceRun: "local proof run",
        capturedAt: "2026-08-18T12:00:00.000Z",
        aspectRatio: "16 / 9",
        ...overrides,
    };
}

const CAPTURES: readonly GalleryCapture[] = [
    capture("shell.png", "Application shell", "shell-navigation", { theme: "Dark" }),
    capture("home.png", "Home catalogue", "getting-started", { viewport: "360 × 800" }),
    capture("kid.png", "Kid stickers", "kid-mode"),
    capture("issue.png", "Issue baseline", "issue-baselines", {
        description: "Before and after the clipped control was repaired",
    }),
];

const COPY: CaptureGalleryCopy = {
    searchLabel: "Search screenshots",
    searchPlaceholder: "Search metadata",
    resultsLabel: "Screenshot results",
    filterLabel: "Screenshot categories",
    allCategoriesLabel: "All categories",
    categoryLabel: (category) => category.label,
    categoryDescription: (category) => category.description,
    categoryButton: (label, count) => `${label} (${count})`,
    countStatus: (shown, total, category) => `Showing ${shown} of ${total} in ${category}.`,
    noMatchStatus: (query, category) => `No screenshots match ${query} in ${category}.`,
    invalidStatus: "Invalid regular expression.",
    timeoutStatus: (milliseconds) => `Timed out after ${milliseconds} ms.`,
};

function evaluator(): BoundedRegexEvaluator {
    return new BoundedRegexEvaluator({ spawn: () => createInProcessChannel(), timeoutMs: 2_000 });
}

function createView(): { view: CaptureGalleryView; bounded: BoundedRegexEvaluator } {
    const bounded = evaluator();
    const view = createCaptureGallery({
        captures: CAPTURES,
        evaluator: bounded,
        searchStore: memoryPreferenceStore(),
        persistSearch: false,
        copy: () => COPY,
        renderCard: (item) => {
            const card = document.createElement("article");
            card.dataset.file = item.file;
            card.textContent = item.title;
            return card;
        },
    });
    document.body.appendChild(view.element);
    return { view, bounded };
}

const open: CaptureGalleryView[] = [];
const evaluators: BoundedRegexEvaluator[] = [];

afterEach(() => {
    for (const view of open.splice(0)) view.destroy();
    for (const bounded of evaluators.splice(0)) bounded.dispose();
    document.body.replaceChildren();
});

describe("CaptureGallery", () => {
    it("renders grouped cards, category counts, and the adjacent full builder affordance", async () => {
        const created = createView();
        open.push(created.view);
        evaluators.push(created.bounded);
        await created.view.refresh();

        expect(created.view.shownCaptures()).toHaveLength(CAPTURES.length);
        expect(document.querySelectorAll(".mb-capture-gallery__group")).toHaveLength(4);
        expect(document.querySelectorAll("[data-file]")).toHaveLength(CAPTURES.length);
        expect(document.querySelector(".mbm-search__builder")?.textContent).toBe(".*");
        expect(document.querySelector(".mbm-search")?.getAttribute("data-mode")).toBe("text");
        expect(document.querySelector(".mbm-search__status")?.textContent).toContain(
            "Showing 4 of 4",
        );
    });

    it("searches theme, viewport, category, description, state, and source commit metadata", async () => {
        const created = createView();
        open.push(created.view);
        evaluators.push(created.bounded);

        for (const [query, file] of [
            ["dark", "shell.png"],
            ["360 × 800", "home.png"],
            ["Kid Mode", "kid.png"],
            ["clipped control", "issue.png"],
            ["recorded state", "shell.png"],
            ["deadbeef", "shell.png"],
        ] as const) {
            created.view.field.model.setMode("text");
            created.view.field.model.setFieldValue(query);
            await created.view.refresh();
            expect(
                created.view.shownCaptures().some((capture) => capture.file === file),
                query,
            ).toBe(true);
        }
    });

    it("uses the real bounded regex path and reports an invalid pattern separately", async () => {
        const created = createView();
        open.push(created.view);
        evaluators.push(created.bounded);

        created.view.field.model.setMode("regex");
        created.view.field.model.setPattern("^(Kid|Issue)");
        await created.view.refresh();
        expect(created.view.shownCaptures().map((capture) => capture.file)).toEqual([
            "kid.png",
            "issue.png",
        ]);

        created.view.field.model.setPattern("(");
        await created.view.refresh();
        expect(created.view.shownCaptures()).toHaveLength(0);
        expect(document.querySelector(".mbm-search__status")?.textContent).toContain(
            "Invalid regular expression",
        );
    });

    it("composes the category filter with search and keeps an honest no-match state", async () => {
        const created = createView();
        open.push(created.view);
        evaluators.push(created.bounded);
        await created.view.refresh();

        const kidButton = [
            ...document.querySelectorAll<HTMLButtonElement>(".mb-capture-gallery__category"),
        ].find((button) => button.textContent?.startsWith("Kid Mode"));
        expect(kidButton).toBeDefined();
        kidButton?.click();
        await created.view.refresh();
        expect(created.view.activeCategory()).toBe("kid-mode");
        expect(created.view.shownCaptures().map((capture) => capture.file)).toEqual(["kid.png"]);

        created.view.field.model.setFieldValue("definitely absent");
        await created.view.refresh();
        expect(created.view.shownCaptures()).toHaveLength(0);
        expect(document.querySelector(".mbm-search__status")?.textContent).toContain(
            "No screenshots match",
        );
        expect(document.querySelectorAll("[data-file]")).toHaveLength(0);
    });
});
