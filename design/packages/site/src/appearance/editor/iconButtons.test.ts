// @vitest-environment jsdom

/**
 * Regression guard: no `.md-icon-button` in the appearance surfaces carries word text.
 *
 * `.md-icon-button` is a fixed `--md-sys-min-touch-target` square with `padding: 0` and no
 * overflow guard (see `theme/base.css`), so a word placed inside one wraps past its own edges
 * and collides with whatever sits below. That defect reached a 400px verification pass once
 * already, as a clipped "Clear search" on the settings search fields, and
 * `settings/searchControls.test.ts` pins the fix there. This file pins the same property for
 * the appearance family, where the sweep that followed found six more of them -- the
 * per-property reset on every row of every editor being the worst of them, because a whole
 * column of a panel repeated it.
 *
 * Several of those buttons carried a *hard-coded English literal* rather than a `t()` call,
 * so they also stayed English for a visitor reading the site in Cantonese. That is why the
 * accessible-name assertions below run in both language modes and check the two differ:
 * asserting a hard-coded English phrase would re-encode exactly the half of the defect that
 * had nothing to do with clipping.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppearanceController } from "../controller.js";
import { AppearanceStore } from "../store.js";
import { Preferences } from "../../platform/Preferences.js";
import { setI18nState, t } from "../../settings/i18n.js";
import { closeAppearanceEditor, openAppearanceEditor } from "./appearanceEditor.js";
import { createPresetsPanel } from "../presetsPanel.js";
import { numberRow, toggleRow } from "./controls.js";

const LABEL_KEY = "type.family";

beforeEach(() => {
    document.body.replaceChildren();
});

afterEach(() => {
    closeAppearanceEditor();
    document.body.replaceChildren();
    // `setI18nState` is a process-wide singleton shared with every other test file, so a test
    // that switches language has to switch it back or unrelated files start asserting against
    // Cantonese for no reason of their own.
    setI18nState({ mode: "en" });
});

function buildToggleRow(): HTMLElement {
    let value = false;
    const row = toggleRow({
        labelKey: LABEL_KEY,
        onReset: () => (value = false),
        isDefault: () => false,
        read: () => value,
        write: (next) => (value = next),
    });
    document.body.append(row.element);
    return row.element;
}

const STEP = 0.5;

/** A number row, whose stepper is the only place in the editor that renders a pair of buttons. */
function buildNumberRow(): HTMLElement {
    let value = 1;
    const row = numberRow({
        labelKey: LABEL_KEY,
        min: 0,
        max: 4,
        step: STEP,
        onReset: () => (value = 1),
        isDefault: () => value === 1,
        read: () => value,
        write: (next) => (value = next),
    });
    document.body.append(row.element);
    return row.element;
}

/** The stepper's two ends, in document order: decrease then increase. */
function stepperEnds(row: HTMLElement): readonly HTMLButtonElement[] {
    return [...row.querySelectorAll<HTMLButtonElement>(".mb-stepper button.md-icon-button")];
}

function newController(): AppearanceController {
    return new AppearanceController(new Preferences(null), new AppearanceStore());
}

/** Every icon button inside a subtree, so a sweep cannot miss one nobody thought to name. */
function iconButtons(root: ParentNode): readonly HTMLButtonElement[] {
    return [...root.querySelectorAll<HTMLButtonElement>("button.md-icon-button")];
}

function expectIconOnly(button: HTMLButtonElement, what: string): void {
    expect(button.querySelector("svg"), `${what} renders no glyph`).not.toBeNull();
    // The glyph is `aria-hidden`, so an empty text content is not a missing name -- the whole
    // accessible name comes from the button's own `aria-label`, asserted separately.
    expect(button.textContent?.trim(), `${what} still renders word text`).toBe("");
}

describe("the appearance editor's per-property reset button", () => {
    it("renders a glyph and no word text at all", () => {
        const row = buildToggleRow();
        const reset = row.querySelector<HTMLButtonElement>("button.mb-reset");
        expect(reset, "the row grew no reset button").not.toBeNull();
        expectIconOnly(reset!, "the per-property reset button");
    });

    it("carries the localized 'Reset ...' phrase, with the property name interpolated, as its whole name", () => {
        const reset = buildToggleRow().querySelector<HTMLButtonElement>("button.mb-reset")!;
        const label = reset.getAttribute("aria-label");

        expect(label).toBe(t("editor.resetProperty", { name: t(LABEL_KEY) }));
        // Resolved through `t()` on both sides above, so that assertion alone would also pass
        // for the wrong key. These pin the two things the wrong key would lose: the phrase is
        // really the reset phrase, and the property's own name is really interpolated into it
        // rather than the button being named after the action alone.
        expect(label).toContain(t(LABEL_KEY));
        expect(label).not.toBe(t(LABEL_KEY));
    });

    it("names itself in Cantonese for a visitor reading in Cantonese, which a literal never did", () => {
        const english = buildToggleRow()
            .querySelector<HTMLButtonElement>("button.mb-reset")!
            .getAttribute("aria-label");

        document.body.replaceChildren();
        setI18nState({ mode: "yue" });
        const cantonese = buildToggleRow()
            .querySelector<HTMLButtonElement>("button.mb-reset")!
            .getAttribute("aria-label");

        expect(cantonese).toBe(t("editor.resetProperty", { name: t(LABEL_KEY) }));
        // The point of the whole assertion: a hard-coded string would be identical in both
        // modes, so two identical labels means the name is not going through the catalogue.
        expect(cantonese).not.toBe(english);
    });

    it("keeps the glyph and grows no text after a refresh re-resolves the button's title", () => {
        let value = false;
        const row = toggleRow({
            labelKey: LABEL_KEY,
            onReset: () => (value = false),
            isDefault: () => value === false,
            read: () => value,
            write: (next) => (value = next),
        });
        document.body.append(row.element);

        // `refresh()` is what a language-mode or funny-level change calls, and it is the path
        // that overwrote the button's contents on the search fields once the same defect was
        // fixed on the button itself. It rewrites `title` and `disabled` here; if it ever
        // reaches for `textContent` again, this goes red.
        setI18nState({ mode: "yue" });
        row.refresh();
        expectIconOnly(row.element.querySelector<HTMLButtonElement>("button.mb-reset")!, "the reset button after refresh");
    });
});

/*
 * The stepper is pinned on its own rather than being left to the sweep below, because it is
 * the offender the sweep found *after* the first round of fixes had already been made and
 * reviewed. Its text was a single "-" or "+", which is why it survived: a lone character does
 * not visibly wrap out of a 48px square the way a word does, so a screenshot of a stepper with
 * this defect looks entirely correct, and only a test that asks what is inside the button can
 * tell the difference between a glyph and a punctuation mark that resembles one.
 */
describe("a number row's stepper", () => {
    it("draws both ends with a glyph rather than a hyphen and a plus character", () => {
        const ends = stepperEnds(buildNumberRow());
        expect(ends.length, "the stepper grew the wrong number of ends").toBe(2);
        expectIconOnly(ends[0]!, "the stepper's decrease end");
        expectIconOnly(ends[1]!, "the stepper's increase end");
    });

    it("names each end as a localized sentence with the step interpolated into it", () => {
        const [down, up] = stepperEnds(buildNumberRow());
        const values = { name: t(LABEL_KEY), step: STEP };

        expect(down!.getAttribute("aria-label")).toBe(t("editor.decreaseProperty", values));
        expect(up!.getAttribute("aria-label")).toBe(t("editor.increaseProperty", values));
        // The step size is the one thing the glyph cannot say, and it was interpolated into
        // the old assembled name too, so losing it would be a regression a `t()` call alone
        // would not catch. The two ends must also not resolve to the same phrase, which is
        // what one copied key would produce.
        expect(down!.getAttribute("aria-label")).toContain(String(STEP));
        expect(up!.getAttribute("aria-label")).toContain(String(STEP));
        expect(down!.getAttribute("aria-label")).not.toBe(up!.getAttribute("aria-label"));
    });

    it("names both ends in Cantonese for a visitor reading in Cantonese", () => {
        const english = stepperEnds(buildNumberRow()).map((end) => end.getAttribute("aria-label"));

        document.body.replaceChildren();
        setI18nState({ mode: "yue" });
        const cantonese = stepperEnds(buildNumberRow()).map((end) => end.getAttribute("aria-label"));

        expect(cantonese[0]).toBe(t("editor.decreaseProperty", { name: t(LABEL_KEY), step: STEP }));
        // The old names were built in TypeScript out of a localized property name and English
        // punctuation, so the property half already changed with the language mode while the
        // structure around it never did. Comparing whole names is what catches that: a name
        // that is identical in both modes never reached the catalogue at all.
        expect(cantonese[0]).not.toBe(english[0]);
        expect(cantonese[1]).not.toBe(english[1]);
    });
});

describe("every icon button the appearance editor renders", () => {
    /*
     * Scoped to `.mb-appearance-editor`, the editor's own content, rather than to the whole
     * `.mbm-panel` that carries it.
     *
     * The panel prepends a geometry toolbar of its own (see `platform/PanelGeometry.ts`) whose
     * buttons wear the same `.md-icon-button` class while holding a single arrow character --
     * a lone glyph in a 48px square neither clips nor needs translating, which is why those
     * are deliberately not part of the defect this file is about. Sweeping the panel would
     * have made this test fail for the geometry toolbar and say nothing about the editor.
     */
    it("carries a glyph rather than word text, and a real accessible name", () => {
        const anchor = document.createElement("div");
        anchor.className = "mb-shell-footer";
        anchor.tabIndex = -1;
        document.body.append(anchor);
        openAppearanceEditor({ anchor, kind: "card", controller: newController() });

        const editor = document.querySelector<HTMLElement>(".mb-appearance-editor");
        expect(editor, "the appearance editor never rendered its content").not.toBeNull();
        const buttons = iconButtons(editor!);
        /*
         * A count floor, not an exact count.
         *
         * The property under test is the one in the name, checked for all of them in the loop.
         * The floor is here for the failure mode a sweep like this cannot otherwise see: a
         * selector that matches nothing passes every assertion in an empty loop, so a future
         * refactor that renames the class or stops rendering the editor would turn this file
         * green while checking nothing at all. The editor renders a close button plus one
         * reset per property row, so anything below a handful means the sweep lost its subject.
         */
        expect(buttons.length).toBeGreaterThanOrEqual(5);

        for (const button of buttons) {
            expectIconOnly(button, `an icon button in the appearance editor (label: ${button.getAttribute("aria-label")})`);
            expect(button.getAttribute("aria-label")?.trim() ?? "").not.toBe("");
        }
    });

    /*
     * The colour picker's own per-representation copy buttons carried the same literal "Copy"
     * and were fixed with the same glyph, but they are deliberately not asserted here.
     * `createColorPicker` cannot be constructed under jsdom at all: it exhausts the call stack
     * during construction and takes the worker's heap with it, on this file's changes and
     * equally on an unmodified checkout of `color/picker.ts`, so it is a pre-existing defect
     * of the picker rather than anything this change introduced. Adding an assertion that
     * cannot run would leave a red test standing in for a fixed control.
     */
});

describe("the saved-presets list", () => {
    it("gives each preset's rename and delete controls a glyph, not a repeated word", async () => {
        const controller = newController();
        controller.store.savePreset("Evening");
        const panel = createPresetsPanel({
            controller,
            settingsSnapshot: () => ({}),
            applySettings: () => 0,
            confirmDestructive: () => Promise.resolve(false),
        });
        document.body.append(panel.element);

        const buttons = iconButtons(panel.element);
        // One rename and one delete for the single saved preset above. Without this floor an
        // empty preset list would satisfy the loop below without ever rendering a button.
        expect(buttons.length).toBeGreaterThanOrEqual(2);
        for (const button of buttons) {
            expectIconOnly(button, `a preset row control (title: ${button.title})`);
            expect(button.getAttribute("aria-label")).toContain("Evening");
        }
    });
});
