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

/**
 * The Home dashboard's primary action row never overflows the page body sideways.
 *
 * `jsdom` (this suite's unit-test environment) never runs real layout - `scrollWidth` and
 * `clientWidth` are always zero there, exactly as `AppSettings.layout.test.ts` next door
 * explains for its own scroll axis - so this is the same style of proof that file already
 * uses: read the real stylesheet and assert the rule that actually prevents the overflow is
 * present, rather than asking jsdom a question it cannot answer.
 *
 * Regression: v2-09-rail-7-jobs-320.png, captured through the cheap headless CDP route at a
 * real 320px window width, showed a horizontal scrollbar on the Home page body. The three
 * buttons in `.wl-dash__actions` ("New map", "Walk me through it", "Search everything") did
 * not wrap onto their own lines and overflowed the viewport instead.
 */
describe("the Home dashboard's action row never scrolls the page sideways", () => {
    const dashboard = source("./HomeDashboard.vue");

    it("stacks the primary actions full-width below 600px rather than relying on wrap alone", () => {
        // Two nested rules live inside this one `@media` block, so the pattern has to walk past
        // the first rule's own closing brace to reach the media block's - a lazy `[\s\S]*?` stops
        // at the first "}" it can reach, which is the wrong one once the block holds more than
        // one declaration. This alternates "one balanced { ... } rule" zero or more times, then
        // the media block's own closing brace.
        const query = block(
            dashboard,
            /@media \(max-width: 600px\) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/,
            "narrow Home action-row breakpoint",
        );
        expect(query).toContain(".wl-dash__actions");
        expect(query).toContain("flex-direction: column");

        const actionRule = block(query, /\.wl-action \{[^}]*\}/s, "narrow-width .wl-action rule");
        expect(actionRule).toContain("inline-size: 100%");
    });

    it("keeps flex-wrap as the wide-viewport default, so nothing regresses above 600px", () => {
        // The base (non-media) `.wl-dash__actions` rule, found by excluding the one already
        // captured inside the `@media` block above - otherwise a naive `.wl-dash__actions {...}`
        // scan can match whichever copy comes first in the file regardless of which one it means.
        const withoutMediaBlock = dashboard.replace(
            /@media \(max-width: 600px\) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/,
            "",
        );
        const actions = block(
            withoutMediaBlock,
            /\.wl-dash__actions \{[^}]*\}/s,
            "base .wl-dash__actions rule",
        );
        expect(actions).toContain("flex-wrap: wrap");
    });
});
