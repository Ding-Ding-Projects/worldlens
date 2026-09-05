/**
 * material-exempt: default values for colour controls. What a control starts at is a colour, not a reference to one.
 */
/**
 * The controls every appearance editor is built from.
 *
 * Each returns a row with a label, the control, a per-property reset, and a place
 * for a capability note. Building them from one factory is what keeps a colour in
 * the typography section and a colour in the box section behaving identically, and
 * what makes "every property resets on its own" true by construction rather than
 * by remembering to add a button each time.
 */

import { clear, el, icon, uniqueId } from "../../platform/dom.js";
import type { IconName } from "../../platform/icons.js";
import { announce } from "../../settings/dom.js";
import { fillPhrase, t } from "../../settings/i18n.js";
import { AnchoredPanel } from "../../search/anchoredPanel.js";
import { attachRegexBuilder } from "../../search/attachBuilder.js";
import { compileMatcher } from "../../tabs/matcher.js";
import type { Preferences } from "../../platform/Preferences.js";
import { createColorPicker } from "../color/picker.js";
import { parseColor } from "../color/representations.js";
import { toRenderableCss } from "../color/value.js";
import type { FontFamilyEntry } from "../type/fonts.js";
import { findFamily, isFamilyAvailable } from "../type/fonts.js";

export interface ControlRow {
    readonly element: HTMLElement;
    /** Re-read the value from the store and update the control and its reset button. */
    refresh(): void;
}

export interface RowOptions {
    readonly labelKey: string;
    readonly descriptionKey?: string | undefined;
    /** i18n key for a note explaining that the browser will not render this property. */
    readonly capabilityNoteKey?: string | null | undefined;
    readonly onReset: () => void;
    readonly isDefault: () => boolean;
    /** Current value source, kept beside every setting rather than hidden in a tooltip. */
    readonly provenance?: (() => string) | undefined;
}

function buildRow(
    options: RowOptions,
    control: HTMLElement,
    controlId: string
): { row: HTMLElement; refreshReset: () => void } {
    const label = el("label", { class: "md-field__label", attrs: { for: controlId } });
    fillPhrase(label, options.labelKey);

    const reset = el("button", {
        class: "md-icon-button mb-reset",
        attrs: {
            type: "button",
            "aria-label": t("editor.resetProperty", { name: t(options.labelKey) }),
        },
    });
    /*
     * The glyph, for the same two reasons the explanation trigger below carries one.
     *
     * `.md-icon-button` is a fixed `--md-sys-min-touch-target` square with no overflow guard,
     * so a word placed inside it wraps past its own edges and collides with whatever sits
     * underneath -- the exact defect that reached a 400px verification pass as a clipped
     * "Clear search" on the settings search fields, and that `searchControls.test.ts` now
     * pins so it cannot come back there. Every row of every appearance editor grows one of
     * these buttons, so the same word repeated down a whole column was the worst possible
     * place to reintroduce it.
     *
     * The word was also redundant, and wrong in two of the three language modes: the
     * `aria-label` above already resolves through `t()` and already names the property being
     * reset, while the visible "Reset" was an English literal that stayed English for a
     * visitor reading the site in Cantonese. Deleting it removes a second, unlocalised
     * authority on what this button is called rather than merely hiding it.
     */
    reset.append(icon("restore"));
    reset.addEventListener("click", () => {
        options.onReset();
        announce(t("editor.resetProperty", { name: t(options.labelKey) }));
    });

    const head = el("div", { class: "mb-row-head" }, label, reset);
    const row = el("div", { class: "mb-property-row" }, head, control);

    /*
     * The explanation, behind a disclosure rather than printed under every row.
     *
     * A settings surface where every row carries a permanently visible paragraph is a
     * surface a visitor scrolls rather than scans: the control they came for is three
     * sentences further down than it looks, and the sentences are ones they read on their
     * first visit and never again. The explanation still has to be one keystroke away for
     * the visit where they do need it, so this is a real button with a real accessible name
     * rather than a hover-only tooltip that a keyboard or a touchscreen can never reach.
     *
     * `aria-controls` points at the paragraph and `aria-expanded` tracks it, so assistive
     * technology reports the same collapsed/expanded state the icon button's own
     * `[aria-expanded="true"]` styling shows sighted visitors -- one state, described twice,
     * rather than two states that can disagree.
     *
     * A row with no description grows no button at all. An affordance that opens onto
     * nothing is worse than an absent one, because a visitor who presses it once learns
     * that pressing these is a waste of time and stops pressing the ones that work.
     */
    const explanation = buildExplanationDisclosure(options);
    if (explanation !== null) row.append(explanation.trigger);

    const provenance =
        options.provenance === undefined
            ? null
            : el("p", { class: "md-field__help mb-provenance", attrs: { role: "status" } });
    if (provenance !== null) row.append(provenance);

    if (explanation !== null) row.append(explanation.region);
    if (options.capabilityNoteKey !== undefined && options.capabilityNoteKey !== null) {
        const note = el("p", { class: "mb-capability-note", attrs: { role: "note" } });
        fillPhrase(note, options.capabilityNoteKey);
        row.append(note);
        row.dataset["unsupported"] = "true";
    }

    const refreshReset = (): void => {
        const atDefault = options.isDefault();
        reset.disabled = atDefault;
        reset.title = atDefault ? t("settings.atDefault") : t("editor.resetProperty", { name: t(options.labelKey) });
        // Both the button's name and the paragraph's copy are re-resolved here rather than
        // only at construction, because `refresh()` is what a language-mode or funny-level
        // change calls. Filling the paragraph once would leave an explanation in the
        // previous language sitting behind a button labelled in the new one.
        explanation?.refresh();
        if (provenance !== null && options.provenance !== undefined) {
            provenance.textContent = options.provenance();
        }
    };
    refreshReset();
    return { row, refreshReset };
}

interface ExplanationDisclosure {
    readonly trigger: HTMLButtonElement;
    readonly region: HTMLParagraphElement;
    /** Re-resolve both the button's accessible name and the paragraph's copy. */
    refresh(): void;
}

/**
 * The disclosure pair for a row that has an explanation, or `null` for one that has not.
 *
 * It is built here rather than inline in `buildRow` so that the "no description, no button"
 * rule is a single early return that cannot be half-applied: every caller of this function
 * gets both halves or neither, and there is no arrangement of the arguments that produces a
 * trigger pointing at a paragraph that was never created.
 *
 * The paragraph carries `hidden` rather than a class, and the trigger carries `aria-expanded`
 * rather than a modifier class, because this module owns no stylesheet. Both are attributes
 * the base sheet already reacts to - `[hidden]` through the browser's own default rule and
 * `.md-icon-button[aria-expanded="true"]` through a rule that predates this disclosure - so
 * the state is expressed once, in the place assistive technology reads it, and the appearance
 * follows from that rather than from a second parallel signal that could drift out of step.
 */
function buildExplanationDisclosure(options: RowOptions): ExplanationDisclosure | null {
    const descriptionKey = options.descriptionKey;
    if (descriptionKey === undefined || descriptionKey === null) return null;

    const regionId = uniqueId("mb-explanation");
    const region = el("p", {
        class: "md-field__help mb-help",
        attrs: { id: regionId, hidden: "" },
    });
    const trigger = el("button", {
        class: "md-icon-button mb-explain",
        attrs: {
            type: "button",
            "aria-expanded": "false",
            "aria-controls": regionId,
        },
    });
    // The glyph is `aria-hidden`, so the button's whole accessible name comes from its
    // `aria-label`. Word text inside `.md-icon-button` -- a fixed square with no overflow
    // guard -- is the shape that produced the clipped "Clear search" defect on the search
    // fields, and there is no reason to reintroduce it here.
    trigger.append(icon("info"));
    trigger.addEventListener("click", () => {
        const expanded = trigger.getAttribute("aria-expanded") === "true";
        trigger.setAttribute("aria-expanded", expanded ? "false" : "true");
        region.hidden = expanded;
    });

    return {
        trigger,
        region,
        refresh(): void {
            trigger.setAttribute("aria-label", t("settings.explain", { name: t(options.labelKey) }));
            fillPhrase(region, descriptionKey);
        },
    };
}

/* ------------------------------------------------------------------ *
 * Toggle
 * ------------------------------------------------------------------ */

export function toggleRow(
    options: RowOptions & { read: () => boolean; write: (value: boolean) => void }
): ControlRow {
    const id = uniqueId("mb-toggle");
    const input = el("input", { class: "md-switch", attrs: { id, type: "checkbox", role: "switch" } });
    input.addEventListener("change", () => {
        options.write(input.checked);
    });
    const { row, refreshReset } = buildRow(options, el("div", { class: "mb-control" }, input), id);
    const refresh = (): void => {
        input.checked = options.read();
        input.setAttribute("aria-checked", input.checked ? "true" : "false");
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

/* ------------------------------------------------------------------ *
 * Select
 * ------------------------------------------------------------------ */

export interface SelectChoiceView {
    readonly value: string;
    readonly labelKey: string;
}

export function selectRow(
    options: RowOptions & {
        choices: readonly SelectChoiceView[];
        read: () => string;
        write: (value: string) => void;
    }
): ControlRow {
    const id = uniqueId("md-field__select");
    const select = el("select", { class: "md-field__select", attrs: { id } });
    for (const choice of options.choices) {
        select.append(el("option", { text: t(choice.labelKey), attrs: { value: choice.value } }));
    }
    select.addEventListener("change", () => {
        options.write(select.value);
    });
    const { row, refreshReset } = buildRow(options, el("div", { class: "mb-control" }, select), id);
    const refresh = (): void => {
        const current = options.read();
        clear(select);
        for (const choice of options.choices) {
            select.append(el("option", { text: t(choice.labelKey), attrs: { value: choice.value } }));
        }
        select.value = current;
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

/* ------------------------------------------------------------------ *
 * Number, with a stepper and free entry
 * ------------------------------------------------------------------ */

export function numberRow(
    options: RowOptions & {
        min: number;
        max: number;
        step: number;
        unit?: string | undefined;
        read: () => number;
        write: (value: number) => void;
    }
): ControlRow {
    const id = uniqueId("mb-number");
    const input = el("input", {
        class: "md-field__input mb-input-number",
        attrs: {
            id,
            type: "number",
            min: String(options.min),
            max: String(options.max),
            step: String(options.step),
            inputmode: "decimal",
            autocomplete: "off",
        },
    });
    const commit = (): void => {
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) {
            input.value = String(options.read());
            return;
        }
        options.write(Math.min(options.max, Math.max(options.min, parsed)));
    };
    input.addEventListener("change", commit);

    /*
     * Named through the catalogue, and drawn with the same glyph pair every stepper on the
     * site uses.
     *
     * These two were the last `.md-icon-button` in the editor still holding text, and the
     * only reason they escaped the first sweep is that their text was a single character:
     * a lone "-" or "+" does not visibly wrap out of a 48px square the way "Reset" did, so
     * nothing looked broken. What is wrong with them is the other half of the same defect.
     * A hyphen-minus is a text character, so it renders at the font's own size and weight
     * beside a real glyph elsewhere in the row and never quite matches it, and it is a
     * different shape from the minus a stepper is meant to show. The names were assembled
     * in TypeScript rather than looked up, which is exactly what left "Reset" English in
     * Cantonese, and here it left the whole sentence structure English.
     */
    const down = stepButton("remove", () => {
        options.write(Math.max(options.min, round(options.read() - options.step)));
    });
    const up = stepButton("add", () => {
        options.write(Math.min(options.max, round(options.read() + options.step)));
    });
    const nameStep = { name: t(options.labelKey), step: options.step };
    for (const [button, key] of [
        [down, "editor.decreaseProperty"],
        [up, "editor.increaseProperty"],
    ] as const) {
        button.setAttribute("aria-label", t(key, nameStep));
        // The same phrase as a tooltip, because the glyph alone says which direction but
        // not by how much, and the step is rarely one.
        button.title = t(key, nameStep);
    }

    const unit =
        options.unit === undefined || options.unit === ""
            ? null
            : el("span", { class: "mb-unit", text: options.unit, attrs: { "aria-hidden": "true" } });

    const control = el("div", { class: "mb-control mb-stepper" }, down, input, unit, up);
    const { row, refreshReset } = buildRow(options, control, id);
    const refresh = (): void => {
        if (document.activeElement !== input) input.value = String(options.read());
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

function round(value: number): number {
    return Number(value.toFixed(6));
}

// Takes an `IconName` rather than a string so that a caller cannot reach for a character
// again: there is no argument to this function that produces word text.
function stepButton(glyph: IconName, onClick: () => void): HTMLButtonElement {
    const button = el("button", { class: "md-icon-button", attrs: { type: "button" } });
    button.append(icon(glyph));
    button.addEventListener("click", onClick);
    return button;
}

/* ------------------------------------------------------------------ *
 * Slider
 * ------------------------------------------------------------------ */

export function sliderRow(
    options: RowOptions & {
        min: number;
        max: number;
        step: number;
        read: () => number;
        write: (value: number) => void;
        /** Screen-reader text for the current stop, when the number alone means little. */
        valueText?: ((value: number) => string) | undefined;
    }
): ControlRow {
    const id = uniqueId("mb-slider");
    const input = el("input", {
        class: "md-slider mb-range",
        attrs: {
            id,
            type: "range",
            min: String(options.min),
            max: String(options.max),
            step: String(options.step),
        },
    });
    const readout = el("output", { class: "mb-range-readout", attrs: { for: id } });
    input.addEventListener("input", () => {
        options.write(Number(input.value));
    });
    const control = el("div", { class: "mb-control mb-slider" }, input, readout);
    const { row, refreshReset } = buildRow(options, control, id);
    const refresh = (): void => {
        const value = options.read();
        input.value = String(value);
        const text = options.valueText?.(value) ?? String(value);
        readout.textContent = text;
        input.setAttribute("aria-valuetext", text);
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

/* ------------------------------------------------------------------ *
 * Free text
 * ------------------------------------------------------------------ */

export function textRow(
    options: RowOptions & {
        maxLength: number;
        placeholder?: string | undefined;
        read: () => string;
        write: (value: string) => void;
    }
): ControlRow {
    const id = uniqueId("mb-text");
    const input = el("input", {
        class: "md-field__input",
        attrs: {
            id,
            type: "text",
            maxlength: String(options.maxLength),
            autocomplete: "off",
            spellcheck: "false",
            ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
        },
    });
    input.addEventListener("change", () => {
        options.write(input.value);
    });
    const { row, refreshReset } = buildRow(options, el("div", { class: "mb-control" }, input), id);
    const refresh = (): void => {
        if (document.activeElement !== input) input.value = options.read();
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

export interface ColorRowExtras {
    readonly prefs?: Preferences | undefined;
    /** Surface the colour will sit on, for the contrast readout inside the picker. */
    readonly contrastAgainst?: string | undefined;
    readonly contrastAgainstName?: string | undefined;
    /** Show a Clear button that returns the value to the inherit sentinel. */
    readonly allowInherit?: boolean | undefined;
}

export function colorRow(
    options: RowOptions &
        ColorRowExtras & {
            read: () => string;
            write: (value: string) => void;
        }
): ControlRow {
    const id = uniqueId("mb-color");
    const swatch = el("span", { class: "mb-swatch-preview", attrs: { "aria-hidden": "true" } });
    const trigger = el("button", {
        class: "mb-color-trigger",
        attrs: { id, type: "button" },
    });
    const triggerText = el("span", { class: "mb-color-trigger-text" });
    trigger.append(swatch, triggerText);

    const textInput = el("input", {
        class: "md-field__input mb-input-mono",
        attrs: {
            type: "text",
            autocomplete: "off",
            spellcheck: "false",
            "aria-label": `${t(options.labelKey)} ${t("color.title")}`,
        },
    });
    textInput.addEventListener("change", () => {
        const parsed = parseColor(textInput.value);
        if (parsed.value === null && textInput.value.trim() !== "") {
            textInput.setAttribute("aria-invalid", "true");
            return;
        }
        textInput.removeAttribute("aria-invalid");
        options.write(textInput.value.trim());
    });

    const controlChildren: (HTMLElement | null)[] = [trigger, textInput];
    if (options.allowInherit === true) {
        const clearButton = el("button", {
            class: "md-icon-button",
            attrs: {
                type: "button",
                // The short word survives as the hover tooltip, where a fixed square imposes
                // no width at all, while the accessible name stays the longer phrase that
                // says which property is being returned to its inherited value.
                title: t("color.clear"),
                "aria-label": `${t("color.inherit")}: ${t(options.labelKey)}`,
            },
        });
        // A colour row sits beside a reset button that is now a glyph, so leaving this one as
        // the word "Clear" would have left two icon buttons of the same size in the same row
        // disagreeing about what an icon button contains -- on top of the clipping every
        // `.md-icon-button` carrying word text suffers.
        clearButton.append(icon("close"));
        clearButton.addEventListener("click", () => {
            options.write("");
        });
        controlChildren.push(clearButton);
    }

    const control = el("div", { class: "mb-control mb-color-control" }, ...controlChildren);
    const { row, refreshReset } = buildRow(options, control, id);

    const panel = new AnchoredPanel({
        anchor: trigger,
        returnFocusTo: trigger,
        title: t("color.open"),
    });
    trigger.addEventListener("click", () => {
        if (panel.isOpen) {
            panel.close();
            return;
        }
        const picker = createColorPicker({
            initial: options.read() === "" ? "#808080" : options.read(),
            onChange: (value) => {
                options.write(value);
            },
            contrastAgainst: options.contrastAgainst,
            contrastAgainstName: options.contrastAgainstName,
            prefs: options.prefs,
        });
        panel.show(picker.element);
    });

    const refresh = (): void => {
        const value = options.read();
        if (document.activeElement !== textInput) textInput.value = value;
        const parsed = value === "" ? null : parseColor(value).value;
        swatch.style.setProperty(
            "--mb-swatch-color",
            parsed === null ? "transparent" : toRenderableCss(parsed)
        );
        swatch.dataset["empty"] = parsed === null ? "true" : "false";
        triggerText.textContent = value === "" ? t("color.inherit") : value;
        trigger.setAttribute(
            "aria-label",
            `${t("color.open")}: ${t(options.labelKey)}, ${value === "" ? t("color.inherit") : value}`
        );
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

/* ------------------------------------------------------------------ *
 * Font family
 * ------------------------------------------------------------------ */

export interface FontRowExtras {
    readonly families: () => readonly FontFamilyEntry[];
    /** Ask the browser for the installed families. Returns the note key to show. */
    readonly requestInstalled: () => Promise<string>;
    readonly installedNoteKey: () => string;
}

export function fontRow(
    options: RowOptions &
        FontRowExtras & {
            read: () => string;
            write: (value: string) => void;
            /** Offer an explicit inherit choice. */
            allowInherit?: boolean | undefined;
        }
): ControlRow {
    const id = uniqueId("mb-font");
    const trigger = el("button", { class: "mb-font-trigger", attrs: { id, type: "button" } });
    const control = el("div", { class: "mb-control" }, trigger);
    const { row, refreshReset } = buildRow(options, control, id);

    let closeFontList = (): void => {
        // Replaced below once a font list has actually been built; a close before then has
        // nothing to tear down.
    };
    const panel = new AnchoredPanel({
        anchor: trigger,
        returnFocusTo: trigger,
        title: t("type.family"),
        onClose: () => closeFontList(),
    });

    trigger.addEventListener("click", () => {
        if (panel.isOpen) {
            panel.close();
            return;
        }
        const list = buildFontList();
        closeFontList = list.destroy;
        panel.show(list.element);
    });

    function buildFontList(): { element: HTMLElement; destroy: () => void } {
        const container = el("div", { class: "mb-font-list" });
        const searchId = uniqueId("mb-font-search");
        const search = el("input", {
            class: "md-field__input",
            attrs: {
                id: searchId,
                type: "search",
                autocomplete: "off",
                "aria-label": t("type.familySearch"),
                placeholder: t("type.familySearch"),
            },
        });
        // Same row-plus-anchored-builder shape as every other search field in this
        // application: plain substring by default, the guided pattern builder beside it.
        // Reuses the menu search row's own layout rule -- flex, gapped, input growing to
        // fill -- since the shape is identical and a second copy of the same three lines
        // of CSS would only be one more place for the two to drift apart.
        const searchRow = el("div", { class: "md-menu__search-row" }, search);
        let filterMode: "plain" | "regex" = "plain";
        let filterCaseSensitive = false;
        const note = el("p", { class: "md-field__help mb-help", text: t(options.installedNoteKey()) });
        const listbox = el("div", {
            class: "mb-font-options",
            attrs: { role: "listbox", "aria-label": t("type.family") },
        });

        const request = el("button", {
            class: "md-button md-button--tonal",
            text: t("type.fontsQuery"),
            attrs: { type: "button" },
        });
        request.addEventListener("click", () => {
            void options.requestInstalled().then((noteKey) => {
                note.textContent = t(noteKey);
                renderOptions(search.value);
            });
        });

        function renderOptions(query: string): void {
            clear(listbox);
            const current = options.read();
            const matcher =
                query.trim().length === 0
                    ? null
                    : compileMatcher({ query, mode: filterMode, caseSensitive: filterCaseSensitive });
            const keep = (name: string): boolean => matcher === null || (matcher.ok && matcher.test(name));

            if (options.allowInherit === true && keep(t("type.inherit"))) {
                listbox.append(fontOption("", t("type.inherit"), "inherit", current === ""));
            }
            for (const family of options.families()) {
                if (!keep(family.name)) continue;
                listbox.append(
                    fontOption(family.id, family.name, family.stack, current === family.id)
                );
            }
            if (listbox.childElementCount === 0) {
                listbox.append(el("p", { class: "md-field__help mb-help", text: t("menu.noItems") }));
            }
        }

        function fontOption(
            value: string,
            name: string,
            stack: string,
            selected: boolean
        ): HTMLElement {
            const option = el("button", {
                class: "mb-font-option",
                attrs: {
                    type: "button",
                    role: "option",
                    "aria-selected": selected ? "true" : "false",
                },
            });
            const sample = el("span", { class: "mb-font-name", text: name });
            if (stack !== "inherit") sample.style.fontFamily = stack;
            option.append(sample);
            // A family the machine does not have still appears, marked. Hiding it would
            // drop a value a visitor deliberately chose for another machine.
            const primary = stack.split(",")[0]?.replace(/["']/g, "").trim() ?? "";
            if (stack !== "inherit" && primary !== "" && !isFamilyAvailable(primary)) {
                option.append(el("span", { class: "mb-font-missing", text: t("type.fontMissing") }));
            }
            option.addEventListener("click", () => {
                options.write(value);
                panel.close();
            });
            return option;
        }

        const builder = attachRegexBuilder(search, {
            fieldId: searchId,
            fieldLabel: t("type.familySearch"),
            container: searchRow,
            persist: false,
            sampleProvider: () => options.families().map((family) => family.name).join("\n"),
            onChange: (spec) => {
                filterMode = spec.mode;
                filterCaseSensitive = spec.caseSensitive;
                renderOptions(spec.query);
            },
        });
        renderOptions("");
        container.append(searchRow, note, request, listbox);
        return { element: container, destroy: () => builder.destroy() };
    }

    const refresh = (): void => {
        const value = options.read();
        const family = value === "" ? undefined : findFamily(options.families(), value);
        const name = family?.name ?? (value === "" ? t("type.inherit") : value);
        trigger.textContent = name;
        if (family !== undefined) trigger.style.fontFamily = family.stack;
        else trigger.style.removeProperty("font-family");
        trigger.setAttribute("aria-label", `${t("type.family")}: ${name}`);
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}
