// @vitest-environment jsdom

/**
 * A rail label never wraps, in either rail width, and never loses its full text.
 *
 * History: an earlier rule here was the opposite - the compact shortcut label wrapped and its
 * row grew - because a single-line label once ended in an ellipsis with nothing behind it. The
 * approved shell redesign makes every rail label one line in both the extended and the compact
 * rail, and closes that original gap differently: the full text is always the button's
 * accessible name, its `title` in the extended rail and a tooltip in the compact one. So a
 * longer personal-vocabulary replacement now ellipsizes visibly and is still readable in full.
 *
 * ### What this file can and cannot prove
 *
 * `jsdom` runs no layout, so no test here can measure a real ellipsis. Two things are provable
 * and asserted: the rendered text reaches the DOM whole (the ellipsis is CSS, never a truncated
 * string), with the full form as the accessible name; and the scoped stylesheet asks for one
 * ellipsized line, read from source, because that rule is what decides wrapping.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { beforeAll, describe, expect, it } from "vitest";

import AppRail from "./AppRail.vue";
import { RAIL_EXPANDED_SHORTCUT_ITEM_PX, RAIL_SHORTCUT_ITEM_PX } from "./railOverflow.js";

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

describe("a rail label stays on one line and keeps its full text", () => {
    it.each(["compact", "expanded"] as const)(
        "renders a longer replacement label whole in the %s rail, with the full name as its accessible name",
        (mode) => {
            const rail = mount(AppRail, {
                props: {
                    destination: "home",
                    openJobCount: 0,
                    unreadCount: 0,
                    productName: "Worldlens",
                    mode,
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
            expect(label.text()).toBe(
                mode === "compact"
                    ? LONG_REPLACEMENT
                    : "A job whose short label was replaced locally",
            );
            expect(label.text()).not.toContain("…");
            expect(rail.find("[data-job-shortcut]").attributes("aria-label")).toBe(
                "A job whose short label was replaced locally",
            );
        },
    );

    it("asks the browser for one ellipsized line, never a wrap or a clamp", () => {
        for (const selector of [".wl-rail-label", ".wl-rail-label--compact"]) {
            const label = ruleBody(selector);
            expect(label, `${selector} must stay on one line`).toMatch(/white-space:\s*nowrap/);
            expect(label, `${selector} must ellipsize`).toMatch(/text-overflow:\s*ellipsis/);
            expect(label, `${selector} must not wrap`).not.toMatch(/overflow-wrap:\s*anywhere/);
            expect(label, `${selector}: a line clamp is a second line`).not.toMatch(
                /-webkit-line-clamp:\s*\d/,
            );
        }
        expect(ruleBody(".wl-rail__section-label")).toMatch(/white-space:\s*nowrap/);
    });

    it("keeps the compact row a 48px minimum rather than a fixed height", () => {
        const row = ruleBody(".wl-rail-item--compact");
        expect(row).not.toMatch(/(?:^|[\s;])block-size:\s*\d/);
        expect(row, "48px stays the row's minimum").toMatch(/min-block-size:\s*48px/);
    });

    it("gives the extended rail 48px destinations and 40px single-line job rows", () => {
        expect(ruleBody(".wl-rail--expanded .wl-rail-item")).toMatch(/block-size:\s*48px/);
        expect(ruleBody(".wl-rail--expanded .wl-rail-item--compact")).toMatch(
            /(?:^|[\s;])block-size:\s*40px/,
        );
    });

    it("budgets each mode's row with room for the inter-item gap", () => {
        expect(RAIL_SHORTCUT_ITEM_PX).toBeGreaterThanOrEqual(50);
        expect(RAIL_EXPANDED_SHORTCUT_ITEM_PX).toBeGreaterThanOrEqual(42);
    });
});
