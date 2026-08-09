import { describe, expect, it } from "vitest";

/**
 * The panel must be the containing block for the page drawn inside it.
 *
 * A page is entitled to fill the space the tab set gave it, and the way a page says that is
 * `position: absolute; inset: 0`. That resolves against the nearest *positioned* ancestor,
 * so if `.mb-tabs__panel` is static the page does not fill the panel - it fills whichever
 * ancestor above the tab set happens to be positioned, which in this application is the box
 * that contains the tab strip as well. Every Work job screen does exactly this, through
 * `App.vue`'s `.mb-world-host` wrapper, and every one of those wrappers paints an opaque
 * background: the strip was laid out correctly, complete, and then painted over.
 *
 * This is asserted against the stylesheet text rather than by mounting and measuring,
 * because jsdom has no layout engine and Vue Test Utils does not apply an SFC's scoped or
 * global `<style>` block at all - a mounted assertion here would report a passing panel no
 * matter what the rule said, which is worse than no test. The same reading-the-rule-by-name
 * approach is what `tabMenuSizing.test.ts` beside this file already uses.
 */

const ruleFor = (source: string, selector: string): string => {
    const pattern = new RegExp(`(^|[,}])\\s*${selector.replace(/\./gu, "\\.")}\\s*\\{[^}]*\\}`, "mu");
    return pattern.exec(source)?.[0] ?? "";
};

describe("the tab panel is the containing block for its own page", () => {
    it("declares position: relative on .mb-tabs__panel", async () => {
        const source = (await import("./TabbedNavigation.vue?raw")).default as string;
        const rule = ruleFor(source, ".mb-tabs__panel");

        expect(rule).not.toBe("");
        expect(rule).toContain("position: relative");
    });

    /**
     * The pairing the rule above exists for, asserted so that a change to either half lands
     * on this test rather than on a screenshot nobody takes. If these hosts ever stop being
     * absolutely positioned the panel's rule is no longer load-bearing, and whoever makes
     * that change should read the comment on it before deciding it is dead weight.
     */
    it("still faces slot content that positions itself absolutely", async () => {
        const source = (await import("../../App.vue?raw")).default as string;
        const rule = ruleFor(source, ".mb-world-host");

        expect(rule).not.toBe("");
        expect(rule).toContain("position: absolute");
        expect(rule).toContain("inset: 0");
    });
});
