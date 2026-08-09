// @vitest-environment jsdom

/**
 * Regression guard: a collapsed search options row must say that it is still filtering.
 *
 * The options row holds the two controls that decide what the field excludes -- the plain
 * text/regex mode and Match case -- and it collapses. Collapsing does not turn either of them off,
 * and both are remembered between visits, so a visitor can arrive at a page already filtering,
 * with nothing on screen that says so. What they see is a list shorter than they expected and no
 * cause for it, and the natural reading of that is that records are missing rather than that a
 * control they cannot currently see is removing them. They then go looking for the data instead of
 * for the filter.
 *
 * These tests pin the two halves of the fix that can silently stop working. The first is that the
 * warning appears at all, in the accessible name as well as on screen. The second, and the one a
 * casual reading would miss, is that it is derived from the query model on every change rather
 * than written alongside a set of the model: a warning maintained by a second writer eventually
 * disagrees with the field it describes, and a warning that disagrees is worse than none, because
 * it is still believed.
 *
 * The default state is asserted just as hard as the warning states. A badge that is always present
 * is decoration, and a visitor learns within a day to stop reading it -- including on the day it
 * would have told them something true.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setI18nState } from "../settings/i18n.js";
import { memoryPreferenceStore } from "./preferences.js";
import type { SearchPreferenceStore, StoredFieldPreference } from "./preferences.js";
import { createSearchField } from "./searchField.js";
import type { SearchFieldView } from "./searchField.js";
import { phrase } from "./strings.js";

let field: SearchFieldView | null = null;

beforeEach(() => {
    document.body.replaceChildren();
    // The warning's copy comes from the settings language port, whose state is module-global.
    // Pinning it here means these assertions are about the toggle rather than about whatever the
    // last thing to touch that port happened to leave behind.
    setI18nState({ mode: "en", funnyEn: 3, funnyYue: 3 });
});

afterEach(() => {
    field?.destroy();
    field = null;
    document.body.replaceChildren();
});

interface Harness {
    readonly view: SearchFieldView;
    readonly toggle: HTMLButtonElement;
}

function build(stored: StoredFieldPreference | null = null): Harness {
    const store: SearchPreferenceStore = memoryPreferenceStore();
    if (stored !== null) {
        store.write("test-field", stored);
    }
    const view = createSearchField({
        fieldId: "test-field",
        labelText: "Search things",
        placeholder: "Type here",
        onChange: () => {},
        store,
        // Whether the preference survives a reload is a different question from whether the
        // toggle tells the truth, and leaving it on would let one test's field write into the
        // next one's expectations.
        persist: stored !== null,
    });
    field = view;
    document.body.append(view.element);
    const toggle = view.element.querySelector<HTMLButtonElement>(".mbm-search__options-toggle");
    if (toggle === null) {
        throw new Error("the search field rendered no options toggle");
    }
    return { view, toggle };
}

/**
 * What a screen reader would call the toggle.
 *
 * `aria-label` replaces an element's contents as the source of its name rather than adding to it,
 * so resolving it the same way here is what makes "the name states regex is on" and "the name
 * reads exactly as the default" two assertions about the same string.
 */
function accessibleName(element: HTMLElement): string {
    return element.getAttribute("aria-label") ?? (element.textContent ?? "");
}

const REGEX_SENTENCE = "Search options are hidden and still in effect: Regex is on.";
const CASE_SENTENCE = "Search options are hidden and still in effect: Match case is on.";
const BOTH_SENTENCE =
    "Search options are hidden and still in effect: Regex and Match case are both on.";

describe("the collapsed search options toggle", () => {
    it("reads exactly as it always has with plain text and no flags", () => {
        const { toggle } = build();

        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        // The untouched toggle is its legend and nothing else: no override of its name, no badge
        // in its contents, no attribute for a stylesheet to react to.
        expect(toggle.textContent).toBe(phrase("searchModeLegend"));
        expect(toggle.hasAttribute("aria-label")).toBe(false);
        expect(toggle.hasAttribute("data-hidden-filters")).toBe(false);
        expect(toggle.querySelector(".mbm-chip")).toBeNull();
        expect(accessibleName(toggle)).toBe(phrase("searchModeLegend"));
        expect(toggle.textContent).not.toMatch(/hidden|filter/i);
    });

    it("states that regex is on while the row is collapsed", () => {
        const { view, toggle } = build();
        view.model.setMode("regex");

        expect(accessibleName(toggle)).toContain(REGEX_SENTENCE);
        // The legend survives the override, so the button still says what it is as well as what
        // it is warning about.
        expect(accessibleName(toggle)).toContain(phrase("searchModeLegend"));
        expect(toggle.getAttribute("data-hidden-filters")).toBe("searchField.hiddenFiltersRegex");
    });

    it("states that Match case is on while the row is collapsed", () => {
        const { view, toggle } = build();
        view.model.setCaseSensitive(true);

        expect(accessibleName(toggle)).toContain(CASE_SENTENCE);
        expect(toggle.getAttribute("data-hidden-filters")).toBe("searchField.hiddenFiltersCase");
    });

    it("names both controls when both are on", () => {
        const { view, toggle } = build();
        view.model.setMode("regex");
        view.model.setCaseSensitive(true);

        expect(accessibleName(toggle)).toContain(BOTH_SENTENCE);
        expect(toggle.getAttribute("data-hidden-filters")).toBe("searchField.hiddenFiltersBoth");
    });

    it("shows the warning on screen, not only to assistive technology", () => {
        const { view, toggle } = build();
        view.model.setMode("regex");

        const badge = toggle.querySelector<HTMLElement>(".mbm-chip");
        expect(badge).not.toBeNull();
        // Words a sighted visitor can read at a glance, saying which control is on. A dot or a
        // colour would say only that something is, which is the state that sends people hunting
        // through a row they have to expand before it can answer them.
        expect(badge?.textContent).toBe(REGEX_SENTENCE);
        expect(toggle.textContent).toContain("Regex is on");
    });

    it("drops the hidden framing when the row is expanded and restores it when it is collapsed", () => {
        const { view, toggle } = build();
        view.model.setMode("regex");
        expect(accessibleName(toggle)).toContain(REGEX_SENTENCE);

        toggle.click();

        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        // Nothing is hidden any more: the mode control is on screen showing its own state, so
        // calling it hidden would be false and repeating it would be noise.
        expect(toggle.hasAttribute("aria-label")).toBe(false);
        expect(toggle.hasAttribute("data-hidden-filters")).toBe(false);
        expect(toggle.querySelector(".mbm-chip")).toBeNull();
        expect(accessibleName(toggle)).toBe(phrase("searchModeLegend"));

        toggle.click();

        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(accessibleName(toggle)).toContain(REGEX_SENTENCE);
        expect(toggle.querySelector(".mbm-chip")?.textContent).toBe(REGEX_SENTENCE);
    });

    it("follows the query model rather than a copy of it", () => {
        const { view, toggle } = build();
        const regexButton = view.element.querySelectorAll<HTMLButtonElement>(
            ".mbm-segmented__option",
        )[1];
        const caseBox = view.element.querySelector<HTMLInputElement>(".mbm-check__input");

        // Nothing here touches the field's own controls. The model is written directly, exactly as
        // the builder panel, a restored preference or a caller would write it, and the toggle is
        // expected to have noticed on its own. A second copy of the state kept beside the controls
        // would still be reading "plain text" at this point.
        view.model.setMode("regex");
        expect(accessibleName(toggle)).toContain(REGEX_SENTENCE);

        view.model.setCaseSensitive(true);
        expect(accessibleName(toggle)).toContain(BOTH_SENTENCE);

        // The rest of the field agrees with the same snapshot, which is what proves the toggle is
        // reading the model and not merely echoing whatever was last passed to it.
        expect(regexButton?.getAttribute("aria-checked")).toBe("true");
        expect(caseBox?.checked).toBe(true);

        view.model.reset();
        expect(toggle.hasAttribute("aria-label")).toBe(false);
        expect(toggle.hasAttribute("data-hidden-filters")).toBe(false);
        expect(accessibleName(toggle)).toBe(phrase("searchModeLegend"));
    });

    it("warns on a field that opens already filtering from a remembered preference", () => {
        // The case the whole guard exists for. Nobody in this session set anything; the mode came
        // back from a previous visit, the row came back collapsed, and without the warning the
        // first thing this visitor would see is a short list with no explanation.
        const { toggle } = build({ mode: "regex", flags: "gu", optionsOpen: false });

        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(accessibleName(toggle)).toContain(BOTH_SENTENCE);
    });
});
