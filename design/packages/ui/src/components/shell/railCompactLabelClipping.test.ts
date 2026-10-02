// @vitest-environment jsdom

/**
 * A rail shortcut label is never allowed to end in an ellipsis, whatever text it is asked to
 * render.
 *
 * Regression, reported by the owner against the packaged v1.0.2026 build and reproduced in it:
 * the second shortcut rendered as an eight-character word truncated to "Yere Do…". The shipped
 * short labels are all short enough - `railShortcutLabels.test.ts` already locks that - but the
 * text this row actually renders is not always the shipped text. The local personal-vocabulary
 * file replaces user-facing wording, and a replacement is free to be longer than the label it
 * replaces; driving the packaged build through the cheap headless route measured a ten-character
 * replacement at `scrollWidth` 58 inside a `clientWidth` 49 box, `text-overflow: ellipsis`,
 * `white-space: nowrap`, row height pinned at 48. A visible label nobody can read is a clipping
 * defect, and the project's own rule says so.
 *
 * The fix is that the compact row's label wraps and its row grows, rather than the label being
 * truncated to fit a height nothing was allowed to exceed.
 *
 * ### What this file can and cannot prove
 *
 * `jsdom` runs no layout: `scrollWidth` and `clientWidth` are both always 0 here, so no test in
 * this environment can measure a real ellipsis - the same limitation `railShortcutLabels.test.ts`
 * and `railOverflow.test.ts` already state for their own axes. Two things are provable, and both
 * are asserted below. The first is the rendered text itself: a long replacement label reaches the
 * DOM whole, with no ellipsis character and nothing dropped. The second is the rule that decides
 * whether the browser truncates it - the component's own scoped stylesheet, read from source,
 * which is where `white-space: nowrap` plus `text-overflow: ellipsis` actually lived. Asserting
 * on the stylesheet is not a proxy for the defect here; it *is* the defect.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { beforeAll, describe, expect, it } from "vitest";

import AppRail from "./AppRail.vue";
import { RAIL_SHORTCUT_ITEM_PX } from "./railOverflow.js";

// `import.meta.url` is not a file URL under this runner, so the component is read relative to
// the workspace root the suite is started from.
const SOURCE = readFileSync(
    resolve(process.cwd(), "packages/ui/src/components/shell/AppRail.vue"),
    "utf8",
);

/** The scoped `<style>` rule for one selector, comments stripped so a comment that mentions a
 *  property can never satisfy or fail an assertion about that property. */
function ruleBody(selector: string): string {
    const withoutComments = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");
    const at = withoutComments.indexOf(`\n${selector} {`);
    expect(at, `${selector} has no rule in AppRail.vue`).toBeGreaterThan(-1);
    const open = withoutComments.indexOf("{", at);
    const close = withoutComments.indexOf("}", open);
    return withoutComments.slice(open + 1, close);
}

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
});

const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    locale: "none",
    fallbackLocale: "none",
    messages: {},
});
const vuetify = createVuetify();

/**
 * A generic long replacement, deliberately not the private word that provoked the report: what
 * is being tested is that *any* longer replacement survives, not one particular string.
 */
const LONG_REPLACEMENT = "Recomposing";

describe("a compact shortcut label can never ellipsize", () => {
    it("renders a longer replacement label whole, with no ellipsis", () => {
        const rail = mount(AppRail, {
            props: {
                destination: "home",
                openJobCount: 0,
                unreadCount: 0,
                productName: "Worldlens",
                jobShortcuts: [
                    {
                        id: "replaced",
                        icon: "mdi-test-icon",
                        label: "A job whose short label was replaced locally",
                        shortLabel: LONG_REPLACEMENT,
                    },
                ],
            },
            global: { plugins: [i18n, vuetify] },
        });

        const label = rail.find("[data-job-shortcut] .wl-rail-label--compact");
        expect(label.exists()).toBe(true);
        expect(label.text()).toBe(LONG_REPLACEMENT);
        expect(label.text()).not.toContain("…");
        // The full form is still the accessible name, unchanged by any of this.
        expect(rail.find("[data-job-shortcut]").attributes("aria-label")).toBe(
            "A job whose short label was replaced locally",
        );
    });

    it("does not ask the browser to truncate the compact label", () => {
        const label = ruleBody(".wl-rail-label--compact");
        expect(label, "the compact label must not be single-line").not.toMatch(
            /white-space:\s*nowrap/,
        );
        expect(label, "the compact label must not be ellipsized").not.toMatch(
            /text-overflow:\s*ellipsis/,
        );
        expect(label, "hiding the overflow is still clipping").not.toMatch(/overflow:\s*hidden/);
        expect(label, "a line clamp is still clipping").not.toMatch(/-webkit-line-clamp:\s*\d/);
        expect(label, "a wrapped label needs somewhere to wrap").toMatch(
            /overflow-wrap:\s*anywhere/,
        );
    });

    it("lets the row grow instead of pinning it to one line's height", () => {
        const row = ruleBody(".wl-rail-item--compact");
        expect(row, "a fixed block-size is what forced the ellipsis").not.toMatch(
            /(?:^|[\s;])block-size:\s*\d/,
        );
        expect(row, "48px stays the row's minimum").toMatch(/min-block-size:\s*48px/);
    });

    it("budgets the grown row, not the shipped one, so the destinations still cannot be pushed out", () => {
        // Three wrapped lines of 11px/1.25 text plus the row's 8px of block padding is ~50px;
        // the per-item cost also folds in the list's 2px gap, exactly as it did before.
        expect(RAIL_SHORTCUT_ITEM_PX).toBeGreaterThanOrEqual(52);
    });
});
