/**
 * `docs/screenshots/kid-home-390.png` (Kid Home at 390 CSS px, the same compact-phone width the
 * redesigned adult shell already proves itself at) caught Kid Mode falling apart at a width the
 * project's own contract requires it to survive: the hero headline clipped mid-word, the child's
 * own name in the status header truncated to "Explor", the five catalogue "lands" crushed to
 * roughly one character wide each, the "Walk me through it" button overlapping the hero text, and
 * a horizontal scrollbar on a body this project's own rule says must never scroll sideways.
 *
 * The real cause is layout, not markup or data - three fixed-size things (`KidRail.vue`'s 124px
 * rail, `KidHome.vue`'s five-column lands grid and single-row hero, `KidShell.vue`'s 240px XP bar)
 * that never gave up space as the window narrowed, each one degrading gracefully at every width a
 * unit test can render but only *appearing* to, because jsdom has no layout engine: it never
 * computes a `minmax(0, 1fr)` grid track's real pixel width, never wraps a flex row, and never
 * clips overflow the way a browser paints one. A `getComputedStyle` assertion here would report
 * "PASS" on every one of these components in their pre-fix, actually-broken state - which is
 * exactly why this defect shipped past a large existing suite and was only caught by a real
 * Chromium screenshot (`design/packages/app/test/screenshots.spec.ts`'s own "Kid Home, compact
 * phone viewport" capture).
 *
 * So this file checks the fix the only way jsdom can: against the components' own source, for the
 * `@media (max-width: 860px)` rules that make each fixed-size thing give up space below that
 * width - the same 860px measure `HomeCatalogues.vue`'s own hero/grid breakpoint already uses for
 * the adult shell, so a reader who wants "why 860" has one answer in one place rather than three
 * components each picking their own number. It is deliberately not a computed-style assertion:
 * that would prove the rule text exists (which regex proves just as well) without proving the fix
 * works, and would invite exactly the same false confidence that let the original defect through.
 * The real proof that the layout itself is fixed is the re-captured `kid-home-390.png` this
 * project's screenshot harness produces from a real browser - this file is the regression guard
 * that stops the *rules themselves* from being deleted or renamed out from under that proof.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(file: string): string {
    return readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
}

/** Pulls the first `@media (max-width: 860px) { ... }` block's body out of a component's
 * `<style scoped>` source, matching balanced braces one level deep - the narrow-width rules
 * below always nest ordinary single-level selector rules, never another at-rule. */
function narrowBlock(file: string): string {
    const text = source(file);
    const start = text.indexOf("@media (max-width: 860px)");
    expect(start, `${file} must declare an @media (max-width: 860px) narrow-width block`).toBeGreaterThanOrEqual(0);
    const openBrace = text.indexOf("{", start);
    let depth = 0;
    let end = openBrace;
    for (let i = openBrace; i < text.length; i += 1) {
        if (text[i] === "{") depth += 1;
        else if (text[i] === "}") {
            depth -= 1;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    return text.slice(openBrace + 1, end);
}

describe("KidHome.vue's narrow-width reflow", () => {
    const block = narrowBlock("./KidHome.vue");

    it("drops the hero from a one-row layout to a stacked column, so the headline gets the hero's full width to wrap in", () => {
        expect(block).toMatch(/\.wl-kid-home__hero\s*\{[^}]*flex-direction:\s*column/);
    });

    it("drops the five-column lands grid to two columns, so a land's label gets a real column to sit in rather than a sliver", () => {
        expect(block).toMatch(/\.wl-kid-home__lands\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    });

    it("collapses the two-panel split to one column, for the same reason the lands grid does", () => {
        expect(block).toMatch(/\.wl-kid-home__split\s*\{[^}]*grid-template-columns:\s*1fr/);
    });

    it("never shrinks the GO button below Kid Mode's own 64px touch-target floor", () => {
        const match = block.match(/\.wl-kid-home__go\s*\{([^}]*)\}/);
        expect(match, "narrow-width block must still style .wl-kid-home__go").not.toBeNull();
        const minHeight = (match![1] ?? "").match(/min-height:\s*(\d+)px/);
        expect(minHeight, ".wl-kid-home__go must keep an explicit min-height in the narrow block").not.toBeNull();
        expect(Number(minHeight![1])).toBeGreaterThanOrEqual(64);
    });
});

describe("every crushable label in KidHome.vue wraps at word/character boundaries instead of overflowing its box", () => {
    const text = source("./KidHome.vue");

    // Each of these is the exact failure mode the screenshot caught: a bold label in a narrow
    // flex/grid cell that the default `overflow-wrap: normal` lets overflow past its own box
    // rather than wrap - which is what turned the hero headline into a horizontal-scrollbar
    // defect and (whatever Chromium's precise fallback line-breaking did to the lands grid at
    // near-zero column widths) is what a real column-width fix and an explicit wrap policy
    // both need to hold, belt and braces.
    const mustWrap: readonly [string, RegExp][] = [
        ["hero headline", /\.wl-kid-home__hero-copy h1\s*\{[^}]*overflow-wrap:\s*anywhere/],
        ["hero blurb", /\.wl-kid-home__hero-copy p\s*\{[^}]*overflow-wrap:\s*anywhere/],
        ["land label", /\.wl-kid-home__land strong\s*\{[^}]*overflow-wrap:\s*anywhere/],
        ["land subtitle", /\.wl-kid-home__land em\s*\{[^}]*overflow-wrap:\s*anywhere/],
    ];

    for (const [label, pattern] of mustWrap) {
        it(`the ${label} declares overflow-wrap: anywhere`, () => {
            expect(text).toMatch(pattern);
        });
    }
});

describe("KidHome.vue never lets its own scroll region go sideways", () => {
    it("declares overflow-x: hidden beside its vertical scroll, so an overflow this file cannot yet anticipate cannot become a horizontal scrollbar", () => {
        const text = source("./KidHome.vue");
        const rule = text.match(/\.wl-kid-home\s*\{([^}]*)\}/);
        expect(rule, ".wl-kid-home's own rule must exist").not.toBeNull();
        expect(rule![1]).toMatch(/overflow-x:\s*hidden/);
    });
});

describe("KidRail.vue's narrow-width shrink", () => {
    const block = narrowBlock("./KidRail.vue");

    it("shrinks the rail's own column width below its fixed 124px default", () => {
        const match = block.match(/\.wl-kid-rail\s*\{([^}]*)\}/);
        expect(match, "narrow-width block must style .wl-kid-rail itself").not.toBeNull();
        const width = (match![1] ?? "").match(/width:\s*(\d+)px/);
        expect(width, ".wl-kid-rail must set an explicit narrower width").not.toBeNull();
        expect(Number(width![1])).toBeLessThan(124);
    });

    it("never shrinks a rail button below the 64px --wl-kid-target-min floor", () => {
        // Both selectors restate their own `min-height` inside this narrow block (each
        // also shrinks its width and/or type scale here), so the floor is checked against
        // the rule that is actually active at narrow widths, not inferred from a base rule
        // a media query could shadow.
        for (const selector of [".wl-kid-rail__big", ".wl-kid-rail__small"]) {
            const escaped = selector.replace(/[.[\]]/g, "\\$&");
            const rule = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(block);
            expect(rule, `${selector} must be styled in the narrow-width block`).not.toBeNull();
            const body = rule![1] ?? "";
            const usesFloorVariable = /min-height:\s*var\(--wl-kid-target-min\)/.test(body);
            const explicitMinHeight = body.match(/min-height:\s*(\d+)px/);
            const meetsFloor = usesFloorVariable || (explicitMinHeight !== null && Number(explicitMinHeight[1]) >= 64);
            expect(meetsFloor, `${selector} must keep min-height at or above the 64px floor`).toBe(true);
        }
    });
});

describe("KidShell.vue's status header never clips the child's own name", () => {
    const text = source("./KidShell.vue");

    it("lets the header wrap onto a second line instead of clipping when its children run out of room", () => {
        const rule = text.match(/\.wl-kid__status\s*\{([^}]*)\}/);
        expect(rule, ".wl-kid__status's own rule must exist").not.toBeNull();
        expect(rule![1]).toMatch(/flex-wrap:\s*wrap/);
    });

    it("lets the XP bar shrink below its original 240px instead of forcing the row wider than the pane", () => {
        const rule = text.match(/\.wl-kid__xp\s*\{([^}]*)\}/);
        expect(rule, ".wl-kid__xp's own rule must exist").not.toBeNull();
        expect(rule![1]).toMatch(/flex:\s*1\s+1\s+\d+px/);
        expect(rule![1]).not.toMatch(/^\s*width:\s*240px/m);
    });

    it("gives .wl-kid__name a rule of its own that can actually shrink, rather than leaving it a bare, unconstrained span", () => {
        const rule = text.match(/\.wl-kid__name\s*\{([^}]*)\}/);
        expect(rule, ".wl-kid__name must have a CSS rule - it had none at all before this fix").not.toBeNull();
        expect(rule![1]).toMatch(/min-width:\s*0/);
    });
});
