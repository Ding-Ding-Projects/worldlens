import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(name: string): string {
    return readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
}

function block(text: string, pattern: RegExp, label: string): string {
    const match = text.match(pattern);
    expect(match, `missing layout rule: ${label}`).not.toBeNull();
    return match?.[0] ?? "";
}

describe("the settings sheet keeps one scroll axis", () => {
    const settings = source("./AppSettings.vue");

    it("lets the tab host shrink and contains overflow inside the active vertical scroller", () => {
        const body = block(settings, /\.mb-settings__body\s*\{[^}]*\}/s, "settings body");
        expect(body).toContain("min-width: 0");
        expect(body).toContain("overflow: hidden");

        const panel = block(
            settings,
            /\.mb-settings__body \.mb-tabs__panel,\s*\.mb-settings__body \.mb-setting\s*\{[^}]*\}/s,
            "settings panel and card",
        );
        expect(panel).toContain("min-width: 0");
        expect(panel).toContain("max-width: 100%");
    });

    it("sizes a left or right settings strip from the panel instead of the desktop viewport", () => {
        const strip = block(
            settings,
            /\.mb-settings__body \.mb-tabs-strip-row\[data-placement="left"\],\s*\.mb-settings__body \.mb-tabs-strip-row\[data-placement="right"\]\s*\{[^}]*\}/s,
            "vertical settings strip",
        );
        expect(strip).toContain("flex: 0 1 clamp(10rem, 32%, 15rem)");
        expect(strip).toContain("max-width: 40%");
    });

    it("gives both translated segmented controls intrinsic grid rows instead of overflowing a fixed group height", () => {
        for (const [name, text, selector] of [
            ["interface size", source("./UiSizeRow.vue"), "mb-ui-size__toggle"],
            ["theme", source("./ThemeRow.vue"), "mb-theme-row__toggle"],
        ] as const) {
            const group = block(text, new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`, "s"), name);
            expect(group).toContain("width: 100%");
            expect(group).toContain("max-width: 100%");
            expect(group).toContain("display: grid !important");
            expect(group).toContain(
                "grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr))",
            );
            expect(group).toContain("grid-auto-rows: minmax(48px, auto)");
            expect(group).toContain("height: auto !important");
            expect(group).toContain("overflow: visible");

            const button = block(
                text,
                new RegExp(`\\.${selector} \\.v-btn\\s*\\{[^}]*\\}`, "s"),
                `${name} button`,
            );
            expect(button).toContain("width: 100%");
            expect(button).toContain("height: 100% !important");
            expect(button).toContain("min-width: 0");
        }
    });

    /**
     * Regression captured driving the real packaged app through the cheap
     * Lowlevel headless route at a 320px window width: the vertical strip's
     * `min-width: 10rem` (160px) left the detail pane so little of a ~280px
     * content area that its M3 title-medium heading broke every character of
     * "Mojang download consent" onto its own line, because
     * `overflow-wrap: anywhere` had no real width left to wrap into. The
     * `flex: 0 1 clamp(...)` rule already let the strip shrink; the fixed
     * floor was the one thing stopping it. Verified fixed by re-capturing the
     * same 320px window after this rule landed - the title now wraps at word
     * boundaries.
     */
    /**
     * Superseded by the single-column collapse below: a 320px window
     * genuinely needs the strip out of the detail pane's way entirely, not
     * merely a lower floor on a strip that still sits beside it. Kept as
     * history in the comment on the 37.5rem rule rather than as a live
     * assertion on a value that no longer exists.
     */

    /**
     * The M3 single-column collapse, below ~600px (37.5rem): the strip stops
     * sitting beside the detail pane (`.mb-tabs--left`/`.mb-tabs--right`
     * forced to `column`, from `TabbedNavigation.vue`) and flattens into a
     * horizontal row (`data-placement="left"`/`"right"` still apply -
     * `TabStrip.vue` itself is untouched - only their axis is overridden
     * here), so the detail pane gets the dialog's full width. This is the
     * breakpoint a real capture at 320px was taken against; see
     * `docs/display-and-ease-of-use.md` for the capture evidence and the
     * jsdom-has-no-layout-engine reason this is asserted against the
     * stylesheet text rather than a mounted measurement, the same approach
     * `tabPanelContainingBlock.test.ts` documents for the same limitation.
     */
    it("collapses the docked tab strip into a horizontal row below the 37.5rem single-column breakpoint", () => {
        const collapse = block(
            settings,
            /@media \(max-width: 37\.5rem\) \{[\s\S]*?\n\}/,
            "single-column collapse",
        );
        expect(collapse).toContain(".mb-tabs--left");
        expect(collapse).toContain(".mb-tabs--right");
        expect(collapse).toContain("flex-direction: column");
        expect(collapse).toContain('[data-placement="left"]');
        expect(collapse).toContain('[data-placement="right"]');
        expect(collapse).toContain("flex-direction: row");
        expect(collapse).toContain("overflow-x: auto");
    });

    /**
     * The detail pane must actually receive the width the collapse frees up,
     * not just have the strip step out of a layout that still constrains it
     * some other way.
     */
    it("gives the detail pane the dialog's full width once the strip has collapsed", () => {
        const collapse = block(
            settings,
            /@media \(max-width: 37\.5rem\) \{[\s\S]*?\n\}/,
            "single-column collapse",
        );
        expect(collapse).toContain(".mb-tabs__panel");
        expect(collapse).toContain("inline-size: 100%");
    });

    /**
     * Real regression: capturing this dialog through the cheap Lowlevel
     * headless route at 320px measured `.mb-consent-row__facts`
     * (`ConsentSettingsRow.vue`, outside this task's file scope) at
     * `scrollWidth: 192` against a `clientWidth: 136` parent - a real
     * sideways-scrolling detail pane, from a `minmax(12rem, 1fr)` grid floor
     * wider than the narrow dialog ever gives it. Fixed with a descendant
     * override here rather than editing that out-of-scope file. The
     * assertion is against the override rule rather than a live
     * `scrollWidth`/`clientWidth` measurement because jsdom has no layout
     * engine to produce either number; the real measurement that found and
     * then cleared this overflow is the probe recorded alongside the capture
     * evidence for this task.
     */
    it("removes the 12rem column floor that overflowed the consent row's fact grid at 320px", () => {
        const collapse = block(
            settings,
            /@media \(max-width: 37\.5rem\) \{[\s\S]*?\n\}/,
            "single-column collapse",
        );
        const factsRule = block(
            collapse,
            /\.mb-consent-row__facts\s*\{[^}]*\}/s,
            "consent-facts column override",
        );
        expect(factsRule).toContain("grid-template-columns: 1fr");
    });

    /**
     * The search field's bilingual label ("Search settings 搜尋設定") stays on
     * one line with its append-inner icons beside it rather than wrapping and
     * pushing the regex-builder affordance underneath - a real defect a
     * capture at 320px found. Fixed by swapping to a short label under the
     * same breakpoint (`isNarrowSearch` in the script block) rather than by
     * truncating the long one with CSS, which fought Vuetify's own
     * floating-label notch sizing.
     */
    it("swaps the search field to a short one-line label below the single-column breakpoint", () => {
        expect(settings).toContain("isNarrowSearch");
        expect(settings).toMatch(/settings\.search\.labelShort['"],\s*['"]Search['"]/);
    });

    /**
     * `TabbedNavigation`'s own tests (`TabbedNavigation.test.ts`) already prove
     * `aria-orientation` flips to `"vertical"` and arrow keys move along that
     * axis whenever a strip is docked left or right; this only has to prove
     * Settings never opts out of that default into a horizontal top/bottom
     * strip, which would silently undo the docked-left M3 list-detail layout
     * this revamp asked for.
     */
    it("never overrides TabbedNavigation's default placement away from the docked-left vertical strip", () => {
        expect(settings).not.toMatch(/<TabbedNavigation[\s\S]*?default-placement/);
    });
});
