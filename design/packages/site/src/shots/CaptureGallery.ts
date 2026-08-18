/**
 * A grouped capture gallery with one plain-text-first search field and its own anchored
 * full regex builder.
 *
 * The search path is the site's shared one: SearchQueryModel -> runSearch -> bounded
 * evaluator. Category filtering narrows the same records before that path runs; it never
 * forks a second matching implementation or turns a category button into a hidden query.
 */

import {
    GALLERY_CATEGORIES,
    GALLERY_SEARCH_FIELD_NAMES,
    filterGalleryByCategory,
    galleryCategoryCounts,
    gallerySearchValue,
    groupGalleryCaptures,
} from "../content/screenshotGallery.js";
import type {
    GalleryCapture,
    GalleryCategoryDefinition,
    GalleryCategoryId,
    GallerySearchField,
} from "../content/screenshotGallery.js";
import { BoundedRegexEvaluator, sharedRegexEvaluator } from "../search/evaluator.js";
import type { SearchPreferenceStore } from "../search/preferences.js";
import { buildCandidateIndex, resolveHits, runSearch } from "../search/runSearch.js";
import type { CandidateField } from "../search/runSearch.js";
import { createSearchField } from "../search/searchField.js";
import type { SearchFieldView } from "../search/searchField.js";

const GALLERY_SEARCH_FIELDS: readonly CandidateField<GalleryCapture, GallerySearchField>[] =
    GALLERY_SEARCH_FIELD_NAMES.map((name) => ({
        name,
        get: (capture) => gallerySearchValue(capture, name),
    }));

export interface CaptureGalleryCopy {
    readonly searchLabel: string;
    readonly searchPlaceholder: string;
    readonly resultsLabel: string;
    readonly filterLabel: string;
    readonly allCategoriesLabel: string;
    readonly categoryLabel: (category: GalleryCategoryDefinition) => string;
    readonly categoryDescription: (category: GalleryCategoryDefinition) => string;
    readonly categoryButton: (label: string, count: number) => string;
    readonly countStatus: (shown: number, total: number, category: string) => string;
    readonly noMatchStatus: (query: string, category: string) => string;
    readonly invalidStatus: string;
    readonly timeoutStatus: (milliseconds: number) => string;
}

export interface CaptureGalleryOptions {
    readonly captures: readonly GalleryCapture[];
    readonly renderCard: (capture: GalleryCapture) => HTMLElement;
    /** Live provider so a language-mode change reaches labels without rebuilding the page. */
    readonly copy: () => CaptureGalleryCopy;
    readonly subscribeCopy?: ((listener: () => void) => () => void) | undefined;
    readonly evaluator?: BoundedRegexEvaluator | undefined;
    readonly searchStore?: SearchPreferenceStore | undefined;
    readonly persistSearch?: boolean | undefined;
}

export interface CaptureGalleryView {
    readonly element: HTMLElement;
    readonly field: SearchFieldView;
    readonly activeCategory: () => GalleryCategoryId | "all";
    readonly shownCaptures: () => readonly GalleryCapture[];
    refresh(): Promise<void>;
    destroy(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function categoryName(copy: CaptureGalleryCopy, categoryId: GalleryCategoryId | "all"): string {
    if (categoryId === "all") return copy.allCategoriesLabel;
    const category = GALLERY_CATEGORIES.find((candidate) => candidate.id === categoryId);
    return category === undefined ? categoryId : copy.categoryLabel(category);
}

export function createCaptureGallery(options: CaptureGalleryOptions): CaptureGalleryView {
    const root = element("div", "mb-capture-gallery");
    const controls = element("div", "mb-capture-gallery__controls");
    const filter = element("div", "mb-capture-gallery__categories");
    filter.setAttribute("role", "group");
    const results = element("div", "mb-capture-gallery__results");
    results.id = "screenshot-gallery-results";
    results.setAttribute("role", "region");
    const counts = galleryCategoryCounts(options.captures);
    const evaluator = options.evaluator ?? sharedRegexEvaluator();
    const fieldOrder = GALLERY_SEARCH_FIELDS.map((field) => field.name);
    const categoryButtons = new Map<GalleryCategoryId | "all", HTMLButtonElement>();

    let activeCategory: GalleryCategoryId | "all" = "all";
    let shown: readonly GalleryCapture[] = options.captures;
    let sequence = 0;
    let field: SearchFieldView | null = null;

    const categoriesWithCaptures = GALLERY_CATEGORIES.filter(
        (category) => (counts.get(category.id) ?? 0) > 0,
    );

    const categoryIds: readonly (GalleryCategoryId | "all")[] = [
        "all",
        ...categoriesWithCaptures.map((category) => category.id),
    ];

    for (const categoryId of categoryIds) {
        const button = element("button", "mb-capture-gallery__category");
        button.type = "button";
        button.setAttribute("aria-controls", results.id);
        button.addEventListener("click", () => {
            activeCategory = categoryId;
            applyCategoryButtonState();
            void refresh();
        });
        filter.appendChild(button);
        categoryButtons.set(categoryId, button);
    }

    function applyCategoryButtonState(): void {
        const copy = options.copy();
        filter.setAttribute("aria-label", copy.filterLabel);
        results.setAttribute("aria-label", copy.resultsLabel);
        for (const [categoryId, button] of categoryButtons) {
            const count =
                categoryId === "all" ? options.captures.length : (counts.get(categoryId) ?? 0);
            const label = categoryName(copy, categoryId);
            button.textContent = copy.categoryButton(label, count);
            button.setAttribute("aria-pressed", categoryId === activeCategory ? "true" : "false");
        }
    }

    function renderGroups(captures: readonly GalleryCapture[]): void {
        results.replaceChildren();
        const copy = options.copy();
        for (const group of groupGalleryCaptures(captures)) {
            const section = element("section", "mb-capture-gallery__group");
            section.dataset.category = group.category.id;
            const heading = element(
                "h3",
                "mb-capture-gallery__group-title",
                copy.categoryButton(copy.categoryLabel(group.category), group.captures.length),
            );
            section.append(
                heading,
                element(
                    "p",
                    "mb-capture-gallery__group-description",
                    copy.categoryDescription(group.category),
                ),
            );
            const grid = element("div", "mb-shot-grid mb-capture-gallery__grid");
            for (const capture of group.captures) grid.appendChild(options.renderCard(capture));
            section.appendChild(grid);
            results.appendChild(section);
        }
    }

    async function refresh(): Promise<void> {
        if (field === null) return;
        sequence += 1;
        const token = sequence;
        const copy = options.copy();
        const candidates = filterGalleryByCategory(options.captures, activeCategory);
        const query = field.model.effectiveQuery();

        if (query.kind === "empty") {
            shown = candidates;
            renderGroups(shown);
            field.setStatus(
                copy.countStatus(
                    shown.length,
                    options.captures.length,
                    categoryName(copy, activeCategory),
                ),
            );
            return;
        }

        if (query.kind === "invalid") {
            shown = [];
            renderGroups(shown);
            field.setStatus(copy.invalidStatus);
            return;
        }

        const index = buildCandidateIndex(candidates, GALLERY_SEARCH_FIELDS);
        const outcome = await runSearch(query, index.values, evaluator);
        if (token !== sequence) return;

        if (outcome.status === "ok") {
            shown = resolveHits(index, fieldOrder, outcome.hits)
                .map((hit) => candidates[hit.itemIndex])
                .filter((capture): capture is GalleryCapture => capture !== undefined);
            renderGroups(shown);
            const category = categoryName(copy, activeCategory);
            if (shown.length === 0) {
                field.setStatus(copy.noMatchStatus(field.model.snapshot().fieldValue, category));
            } else {
                field.setStatus(copy.countStatus(shown.length, options.captures.length, category));
            }
            return;
        }

        shown = [];
        renderGroups(shown);
        switch (outcome.status) {
            case "invalid":
                field.setStatus(copy.invalidStatus);
                return;
            case "timeout":
                field.setStatus(copy.timeoutStatus(outcome.limitMs));
                return;
            case "limit":
            case "unavailable":
                field.setStatus(outcome.message);
                return;
            case "all":
                shown = candidates;
                renderGroups(shown);
                field.setStatus(
                    copy.countStatus(
                        shown.length,
                        options.captures.length,
                        categoryName(copy, activeCategory),
                    ),
                );
        }
    }

    field = createSearchField({
        fieldId: "screenshot-gallery",
        labelText: options.copy().searchLabel,
        placeholder: options.copy().searchPlaceholder,
        labelTextSource: () => options.copy().searchLabel,
        placeholderSource: () => options.copy().searchPlaceholder,
        evaluator,
        store: options.searchStore,
        persist: options.persistSearch,
        sampleProvider: () =>
            options.captures
                .slice(0, 20)
                .map(
                    (capture) =>
                        `${capture.title}\n${capture.description}\n${gallerySearchValue(capture, "category")}`,
                )
                .join("\n"),
        onChange: () => {
            if (field !== null) void refresh();
        },
    });
    field.element.classList.add("mb-capture-gallery__search");
    controls.append(filter, field.element);
    root.append(controls, results);

    const unsubscribeCopy =
        options.subscribeCopy?.(() => {
            applyCategoryButtonState();
            void refresh();
        }) ?? null;

    applyCategoryButtonState();
    void refresh();

    return {
        element: root,
        field,
        activeCategory: () => activeCategory,
        shownCaptures: () => shown,
        refresh,
        destroy() {
            unsubscribeCopy?.();
            field?.destroy();
        },
    };
}
