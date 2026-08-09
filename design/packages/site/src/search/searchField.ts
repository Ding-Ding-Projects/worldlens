/**
 * One search bar, with its own builder anchored to it.
 *
 * Every search surface on the site is built from this. Each call creates a separate model, a
 * separate builder and a separate panel, so two fields on the same page share no state at all:
 * typing in one cannot move the other's pattern, flags or mode.
 *
 * Plain text is the default. The Regex control is the deliberate opt in, and it is mirrored by the
 * switch inside the builder, so either one flips the other.
 */

import { fillPhrase, registerStrings, subscribeI18n, t } from "../settings/i18n.js";
import type { StringTable } from "../settings/i18n.js";
import { createBuilderController } from "./builderPanel.js";
import { el, localisedLabel, uniqueId } from "./dom.js";
import type { BoundedRegexEvaluator } from "./evaluator.js";
import { sharedRegexEvaluator } from "./evaluator.js";
import { searchPreferenceStore } from "./preferences.js";
import type { SearchPreferenceStore } from "./preferences.js";
import { SearchQueryModel } from "./queryModel.js";
import type { SearchQuerySnapshot } from "./queryModel.js";
import { label, onSearchLocaleChange, phrase } from "./strings.js";

/**
 * Copy for the collapsed options row, in English and Hong Kong Cantonese.
 *
 * Which filter is on is a fact about what the field is doing, so each key's fact clause is
 * word-for-word identical at every funny level and only the framing around it moves. A visitor
 * who has turned the playfulness up is still told exactly which control is on, because the whole
 * purpose of this sentence is that they can act on it.
 *
 * There are three keys rather than one key with a list because the two languages punctuate lists
 * differently, and joining names with a separator chosen for one language reads wrong in the
 * other. Only three combinations exist, so writing all three out costs less than the machinery a
 * per-language join would need, and each one reads as a natural sentence instead of a template.
 *
 * The names inside each sentence are the names of the controls the row hides -- Regex and Match
 * case -- rather than descriptions of them. Someone who expands the row after reading this has to
 * find the thing that is on, and a label that matches what they will see is what makes that
 * possible.
 */
export const SEARCH_FIELD_STRINGS: StringTable = {
    "searchField.hiddenFiltersRegex": {
        en: {
            1: "Search options are hidden and still in effect: Regex is on.",
            4: "Options are hiding, and still calling the shots: Regex is on.",
        },
        yue: {
            1: "搜尋選項收埋咗，但仲生效緊：Regex 開咗。",
            4: "選項匿咗埋，但仲話晒事：Regex 開咗。",
        },
    },
    "searchField.hiddenFiltersCase": {
        en: {
            1: "Search options are hidden and still in effect: Match case is on.",
            4: "Options are hiding, and still calling the shots: Match case is on.",
        },
        yue: {
            1: "搜尋選項收埋咗，但仲生效緊：分大細楷開咗。",
            4: "選項匿咗埋，但仲話晒事：分大細楷開咗。",
        },
    },
    "searchField.hiddenFiltersBoth": {
        en: {
            1: "Search options are hidden and still in effect: Regex and Match case are both on.",
            4: "Options are hiding, and still calling the shots: Regex and Match case are both on.",
        },
        yue: {
            1: "搜尋選項收埋咗，但仲生效緊：Regex 同分大細楷都開咗。",
            4: "選項匿咗埋，但仲話晒事：Regex 同分大細楷都開咗。",
        },
    },
};

/*
 * Registered here rather than by a caller.
 *
 * A search field is reachable on its own -- the documentation search, the settings search and all
 * four tab searches each build one without going through any settings surface -- so a caller that
 * forgot would leave the collapsed toggle rendering a raw key at exactly the moment it is trying
 * to warn someone. The i18n module imports nothing from here, so this creates no cycle.
 */
registerStrings("searchField", SEARCH_FIELD_STRINGS);

/**
 * Which of the two controls the collapsed row hides are currently narrowing the results.
 *
 * Read straight off the snapshot every time rather than tracked in a variable of its own. A second
 * copy of "is regex on" would be a second thing that can be wrong, and the failure it produces is
 * the worst kind: a toggle that has stopped agreeing with the field it describes still looks
 * authoritative, so it would be believed.
 *
 * Only mode and Match case are considered, because those are the only two controls this row
 * hides. The remaining flags -- multiline, sticky, dot-all -- live in the builder panel, which
 * collapsing this row does not touch, so naming them here would report as hidden something that is
 * in plain sight.
 */
function hiddenFilterKey(snapshot: SearchQuerySnapshot): string | null {
    const regex = snapshot.mode === "regex";
    // Match case is the absence of the `i` flag, and the shipped flags include `i`, so a
    // case-sensitive field is always a deliberate choice rather than the default.
    const matchCase = snapshot.caseSensitive;
    if (regex && matchCase) {
        return "searchField.hiddenFiltersBoth";
    }
    if (regex) {
        return "searchField.hiddenFiltersRegex";
    }
    if (matchCase) {
        return "searchField.hiddenFiltersCase";
    }
    return null;
}

export interface SearchFieldOptions {
    /** Stable id. Also the preference key, so it must differ between fields. */
    readonly fieldId: string;
    /** The visible label. Search bars are labelled, never placeholder-only. */
    readonly labelText: string;
    readonly placeholder: string;
    /** Optional live providers for shell-owned language settings. */
    readonly labelTextSource?: (() => string) | undefined;
    readonly placeholderSource?: (() => string) | undefined;
    /** Called whenever the query, pattern, flags or mode change. */
    readonly onChange: (snapshot: SearchQuerySnapshot) => void;
    readonly evaluator?: BoundedRegexEvaluator | undefined;
    /** Real text from the surface being searched, used as the builder's starting sample. */
    readonly sampleProvider?: (() => string) | undefined;
    readonly store?: SearchPreferenceStore | undefined;
    readonly persist?: boolean | undefined;
}

export interface SearchFieldView {
    readonly element: HTMLElement;
    readonly model: SearchQueryModel;
    /** Replace the result summary announced to screen readers and shown under the field. */
    setStatus(text: string, secondary?: string | null): void;
    focus(): void;
    destroy(): void;
}

export function createSearchField(options: SearchFieldOptions): SearchFieldView {
    const evaluator = options.evaluator ?? sharedRegexEvaluator();
    const store = options.store ?? searchPreferenceStore();
    const persist = options.persist ?? true;
    const model = new SearchQueryModel({
        fieldId: options.fieldId,
        store,
        persist,
    });

    const inputId = uniqueId("mbm-search");
    const statusId = `${inputId}-status`;
    const optionsId = `${inputId}-options`;
    const hintId = `${inputId}-hint`;

    const root = el("div", { class: "mbm-search" });

    const currentLabel = (): string => options.labelTextSource?.() ?? options.labelText;
    const currentPlaceholder = (): string => options.placeholderSource?.() ?? options.placeholder;

    const labelEl = el("label", {
        class: "mbm-search__label",
        attrs: { for: inputId },
        text: currentLabel(),
    });

    const input = el("input", {
        class: "mbm-input mbm-search__input",
        attrs: {
            id: inputId,
            type: "search",
            placeholder: currentPlaceholder(),
            autocomplete: "off",
            spellcheck: "false",
            "aria-describedby": `${statusId} ${hintId}`,
        },
    });

    const clearButton = el("button", {
        class: "mbm-icon-button mbm-search__clear",
        attrs: { type: "button", "aria-label": label("clearSearch", { field: options.labelText }) },
        text: "✕",
    });

    const builderButton = el("button", {
        class: "mbm-icon-button mbm-search__builder",
        attrs: {
            type: "button",
            "aria-label": label("builderOpenLabel", { field: options.labelText }),
            title: label("builderOpenLabel", { field: options.labelText }),
        },
        text: ".*",
    });

    const row = el("div", {
        class: "mbm-search__row",
        children: [input, clearButton, builderButton],
    });

    // Search options, collapsed by default so the controls do not outweigh the results.
    const optionsToggle = el("button", {
        class: "mbm-search__options-toggle",
        attrs: { type: "button", "aria-controls": optionsId },
        children: [localisedLabel("searchModeLegend")],
    });

    /*
     * The badge that says a collapsed row is still filtering.
     *
     * Collapsing the options row hides the mode control and Match case while leaving both of them
     * running. That combination produces a specific and nasty illusion: the list is shorter than
     * the visitor expects, nothing on the page says why, and the obvious conclusion is that the
     * data is missing rather than that a filter they set earlier -- or that was restored from a
     * previous visit, because mode and flags persist -- is still narrowing it. They then go
     * looking for the missing records instead of for the control that removed them.
     *
     * A dot or a highlight would say only that *something* is on, which sends them hunting through
     * a row they would have to expand to read. Naming the control in words means the collapsed
     * toggle answers the question without being opened.
     *
     * `mbm-chip` is the existing pill treatment from the search stylesheet. It carries
     * `overflow-wrap: anywhere`, which is what lets this text shrink and wrap rather than push the
     * toggle wider than its container at narrow widths, and its colours come from the site's own
     * M3 roles, so this adds no second colour authority.
     */
    const hiddenFilterBadge = el("span", { class: "mbm-chip" });

    const modeGroup = el("div", {
        class: "mbm-segmented",
        attrs: { role: "radiogroup", "aria-label": label("searchModeLegend") },
    });
    const textModeButton = el("button", {
        class: "mbm-segmented__option",
        attrs: { type: "button", role: "radio" },
        children: [localisedLabel("searchModeText")],
    });
    const regexModeButton = el("button", {
        class: "mbm-segmented__option",
        attrs: { type: "button", role: "radio" },
        children: [localisedLabel("searchModeRegex")],
    });
    modeGroup.append(textModeButton, regexModeButton);

    const caseId = `${inputId}-case`;
    const caseInput = el("input", {
        class: "mbm-check__input",
        attrs: { type: "checkbox", id: caseId },
    });
    const caseField = el("div", {
        class: "mbm-check",
        children: [
            caseInput,
            el("label", {
                class: "mbm-check__label",
                attrs: { for: caseId },
                children: [localisedLabel("matchCase")],
            }),
        ],
    });

    const optionsRow = el("div", {
        class: "mbm-search__options",
        attrs: { id: optionsId },
        children: [modeGroup, caseField],
    });

    const hint = el("p", {
        class: "mbm-hint",
        attrs: { id: hintId },
        text: label("searchModeTextHint"),
    });

    const status = el("p", {
        class: "mbm-search__status",
        attrs: { id: statusId, role: "status", "aria-live": "polite" },
        text: phrase("searchStatusIdle"),
    });

    root.append(labelEl, row, optionsToggle, optionsRow, hint, status);

    const builder = createBuilderController({
        model,
        evaluator,
        fieldLabel: options.labelText,
        fieldLabelSource: currentLabel,
        sampleProvider: options.sampleProvider,
        anchor: builderButton,
        returnFocusTo: input,
    });

    let optionsOpen = store.read(options.fieldId)?.optionsOpen ?? false;

    /**
     * Put the "still filtering" framing on the toggle, or take it off again.
     *
     * The framing exists only while the row is collapsed. Once it is expanded the mode control and
     * Match case are on screen with their own states visible, so repeating them on the toggle
     * would be telling the visitor something they can already see, and calling a visible control
     * hidden is simply false.
     *
     * The accessible name is where the change is announced, and it is the only place it is
     * announced. Overriding the name replaces the button's content for assistive technology rather
     * than adding to it, so the badge below and this string are one statement heard once. A live
     * region beside it would announce the same fact a second time, half a beat later, which is how
     * a warning turns into noise a visitor learns to ignore.
     *
     * With plain text and no flags there is no attribute, no badge and no name override, so a
     * field nobody has touched reads exactly as it did before any of this existed. A warning that
     * is always on is a warning that means nothing.
     */
    function applyHiddenFilterState(): void {
        const key = optionsOpen ? null : hiddenFilterKey(model.snapshot());
        if (key === null) {
            hiddenFilterBadge.remove();
            optionsToggle.removeAttribute("aria-label");
            optionsToggle.removeAttribute("data-hidden-filters");
            return;
        }
        fillPhrase(hiddenFilterBadge, key);
        if (hiddenFilterBadge.parentNode !== optionsToggle) {
            optionsToggle.append(hiddenFilterBadge);
        }
        // The toggle keeps its own name in front of the warning. A button announced only as a
        // warning is a button whose purpose has gone missing.
        optionsToggle.setAttribute("aria-label", `${label("searchModeLegend")}. ${t(key)}`);
        // A styling and inspection hook that carries no copy of the state: it is derived from the
        // same snapshot as everything above, one line earlier.
        optionsToggle.setAttribute("data-hidden-filters", key);
    }

    function applyOptionsState(): void {
        optionsToggle.setAttribute("aria-expanded", optionsOpen ? "true" : "false");
        optionsRow.hidden = !optionsOpen;
        applyHiddenFilterState();
    }

    optionsToggle.addEventListener("click", () => {
        optionsOpen = !optionsOpen;
        applyOptionsState();
        if (persist) {
            store.write(options.fieldId, { optionsOpen });
        }
    });

    input.addEventListener("input", () => {
        model.setFieldValue(input.value);
    });

    clearButton.addEventListener("click", () => {
        model.clear();
        input.focus();
    });

    builderButton.addEventListener("click", () => {
        builder.toggle();
    });

    textModeButton.addEventListener("click", () => model.setMode("text"));
    regexModeButton.addEventListener("click", () => model.setMode("regex"));
    for (const button of [textModeButton, regexModeButton]) {
        button.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                model.setMode("regex");
                regexModeButton.focus();
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                model.setMode("text");
                textModeButton.focus();
            }
        });
    }

    caseInput.addEventListener("change", () => {
        model.setCaseSensitive(caseInput.checked);
    });

    function sync(snapshot: SearchQuerySnapshot): void {
        if (input.value !== snapshot.fieldValue) {
            input.value = snapshot.fieldValue;
        }
        const isRegex = snapshot.mode === "regex";
        textModeButton.setAttribute("aria-checked", isRegex ? "false" : "true");
        regexModeButton.setAttribute("aria-checked", isRegex ? "true" : "false");
        textModeButton.tabIndex = isRegex ? -1 : 0;
        regexModeButton.tabIndex = isRegex ? 0 : -1;
        textModeButton.classList.toggle("is-selected", !isRegex);
        regexModeButton.classList.toggle("is-selected", isRegex);
        root.dataset.mode = snapshot.mode;

        caseInput.checked = snapshot.caseSensitive;
        clearButton.hidden = snapshot.fieldValue === "";

        // Every route into mode and flags ends here -- the buttons above, the checkbox, the
        // builder panel's own switches, a caller writing to the model directly, and the
        // preferences restored at construction. Deriving the toggle's framing from this one
        // subscription is what stops it drifting away from the field it is describing.
        applyHiddenFilterState();

        const invalid = snapshot.validation.status === "invalid";
        input.setAttribute("aria-invalid", invalid ? "true" : "false");
        root.classList.toggle("is-invalid", invalid);
        if (invalid) {
            setStatus(
                phrase("invalidPattern", { message: snapshot.validation.message ?? "" }),
                null,
            );
        }
        options.onChange(snapshot);
    }

    function setStatus(text: string, secondary: string | null = null): void {
        status.replaceChildren(el("span", { text }));
        if (secondary !== null) {
            status.append(
                el("span", {
                    class: "mbm-label__secondary",
                    text: secondary,
                    attrs: { lang: "zh-HK" },
                }),
            );
        }
    }

    const unsubscribeModel = model.subscribe(sync);
    const unsubscribeLocale = onSearchLocaleChange(() => {
        labelEl.textContent = currentLabel();
        input.placeholder = currentPlaceholder();
        hint.textContent = label("searchModeTextHint");
        clearButton.setAttribute("aria-label", label("clearSearch", { field: currentLabel() }));
        builderButton.setAttribute(
            "aria-label",
            label("builderOpenLabel", { field: currentLabel() }),
        );
        builderButton.title = label("builderOpenLabel", { field: currentLabel() });
        modeGroup.setAttribute("aria-label", label("searchModeLegend"));
        // The toggle's name is built from a search string and one of this module's own, so a
        // change to either language port has to reach it.
        applyHiddenFilterState();
    });

    /*
     * The warning's own copy is registered with the settings language port rather than the search
     * one, and the two are notified separately. Subscribing to both is not belt and braces: a
     * visitor who switches to Cantonese would otherwise be left reading a warning in English
     * beside a field that had already changed language, which reads as a bug in the warning and
     * invites doubt about whether it is current.
     */
    const unsubscribeI18n = subscribeI18n(() => {
        applyHiddenFilterState();
    });

    applyOptionsState();
    sync(model.snapshot());

    return {
        element: root,
        model,
        setStatus,
        focus() {
            input.focus();
        },
        destroy() {
            unsubscribeModel();
            unsubscribeLocale();
            unsubscribeI18n();
            builder.destroy();
        },
    };
}
