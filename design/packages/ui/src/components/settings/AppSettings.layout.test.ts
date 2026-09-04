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
    it("lowers the strip's minimum width below 22.5rem so the detail pane keeps a readable width at a 320px window", () => {
        const narrow = block(
            settings,
            /@media \(max-width: 22\.5rem\) \{[\s\S]*?\n\}/,
            "narrow-window strip floor",
        );
        expect(narrow).toContain("min-width: 5.5rem");
        expect(narrow).toContain('[data-placement="left"]');
        expect(narrow).toContain('[data-placement="right"]');
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
