import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The map menu's surface language, guarded.
 *
 * ## Why a source-reading test rather than a mounted one
 *
 * This workspace's `vitest.config.ts` does not enable `test.css`, so no stylesheet is ever
 * attached to a mounted component and `getComputedStyle` in a test reports the jsdom default
 * for everything. `MenuChoice.test.ts` already reasons through that and reads its rule out of
 * the component source for the same reason. Every assertion below therefore reads the shipped
 * `<style>` text. That is a real limit and worth stating plainly: this file proves what the
 * stylesheet *says*, not what the browser resolves after cascade and specificity. The
 * specificity arguments are made at length in the components themselves and were checked
 * against the built bundle; what a test can still hold is that the declarations do not quietly
 * disappear or regress to the Material 2 values they replaced.
 *
 * ## Why the inventory is hand-written
 *
 * A rule of the shape "every colour that is present must be a role" passes perfectly on a
 * component that states no colour at all, and a rule about hit targets passes on a control
 * that never declares a size. Those are the regressions worth catching, so the two lists
 * below are written out by hand and checked against the directory: a component added to
 * `menu/` fails the first test until somebody has decided whether it belongs in these checks,
 * and a 40px floor deleted from a control fails the last one rather than silently becoming a
 * 34px target again.
 *
 * ## Why only the `<style>` block is read
 *
 * Colour, shape, type and motion are decided there. The template and script are deliberately
 * excluded, and one case makes that more than a convenience: `MapsMenu.vue` binds each row's
 * sky dot to `map.skyColor`, which is functional data colour straight off the map and is
 * correctly *not* a theme role. A check that swept the template would have to carve out an
 * exception for the one value in this directory that is right to be a literal.
 */

const menuRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Every component in `menu/`, written out rather than globbed.
 *
 * The first test asserts this equals the directory, which is what makes the rest of the file
 * exhaustive: a new component cannot join the drawer without joining these checks.
 */
const MENU_COMPONENTS = [
    "InfoPage.vue",
    "MainMenu.vue",
    "MapsMenu.vue",
    "MenuChoice.vue",
    "MenuGroup.vue",
    "MenuOption.vue",
    "MenuOptionList.vue",
    "MenuRegexBuilder.vue",
    "MenuSearchBar.vue",
    "MenuSearchField.vue",
    "MenuSideSheet.vue",
    "MenuSlider.vue",
    "MenuSuperConfirm.vue",
    "MenuSwitch.vue",
    "SettingsMenu.vue",
];

/**
 * The controls whose size is stated in this directory, with the declarations that keep each
 * one at or above the project's 40x40 floor.
 *
 * These are the controls a person aims at inside a 340px panel that is floating over a map
 * they may also be dragging, which is the case the floor exists for. `MenuChoice.vue`'s
 * segmented buttons are covered by `MenuChoice.test.ts`, which also guards the fixed-height
 * regression that file was written for; they are repeated here so this list is the one place
 * the whole drawer's targets can be read at once.
 *
 * ## Why the selector is checked as well as the declaration
 *
 * A floor is only a floor if it wins. `copy/bilingual.css` deliberately releases the fixed
 * height of every button and chip in the application so a second language can push the box
 * down, and it does so as `html[data-language-mode="bilingual"] .v-btn { height: auto;
 * min-height: 36px }` - specificity (0,2,1). A logical `min-block-size` and a physical
 * `min-height` cascade against each other as one property, so a two-class rule stating a 40px
 * floor here loses to it and silently becomes 36px the moment somebody switches language.
 *
 * Four of the entries below were exactly that when this list was first written, and none of
 * them had a second line to grow them back: an icon-only button and a one-character flag chip
 * carry no label at all. So each selector is also required to reach three class-weight
 * components, which is the cheapest mechanical statement of "out-ranks the bilingual layout
 * sheet". It is a proxy rather than a real specificity calculation, and it is the right kind
 * of proxy: it can only ever be too strict, never too lax.
 */
const HIT_TARGET_FLOORS: { file: string; selector: string; declarations: string[]; what: string }[] =
    [
        {
            file: "MenuSideSheet.vue",
            selector: ".mb-side-sheet .mb-side-sheet__bar .v-btn--icon",
            declarations: ["inline-size: 40px", "block-size: 40px"],
            what: "the drawer's back and close button, which the prototype draws at 36px",
        },
        {
            file: "MenuSearchField.vue",
            selector: ".v-application .mb-menu-search .mb-menu-search__toggle",
            declarations: ["inline-size: 40px", "block-size: 40px"],
            what: "the regex toggle and the builder affordance inside the search field",
        },
        {
            file: "MenuSearchBar.vue",
            selector: ".mb-menu-searchbar .mb-menu-searchbar__head .v-btn",
            declarations: ["min-block-size: 40px"],
            what: "the control that reveals the filter",
        },
        {
            file: "MenuRegexBuilder.vue",
            selector: ".mb-regex-builder.v-card .v-btn",
            declarations: ["min-block-size: 40px", "min-inline-size: 40px"],
            what: "the builder's token buttons",
        },
        {
            file: "MenuRegexBuilder.vue",
            selector: ".mb-regex-builder.v-card .v-chip",
            declarations: ["min-block-size: 40px"],
            what: "the one-character flag chips, the smallest targets in the application",
        },
        {
            file: "MenuSuperConfirm.vue",
            selector: ".mb-super-confirm.v-card .v-btn",
            declarations: ["min-block-size: 40px"],
            what: "the destructive gate's buttons",
        },
        {
            file: "MenuSuperConfirm.vue",
            selector: ".mb-super-confirm.v-card .mb-super-confirm__exit",
            declarations: ["min-height: 40px"],
            what: "the emergency exit, which is the one control a person may need in a hurry",
        },
        {
            file: "MenuChoice.vue",
            selector: ".mb-menu-choice__group.v-btn-toggle .v-btn",
            declarations: ["min-height: 40px"],
            what: "the segmented choice buttons",
        },
    ];

/** The `<style>` text of one component, with comments removed so quoted values do not count. */
function styleOf(file: string): string {
    const source = readFileSync(resolve(menuRoot, file), "utf8");
    const blocks = source.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? [];
    return blocks.join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The declarations of the first rule whose selector list contains `selector`. */
function ruleBody(file: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`${escaped}[^{}]*\\{([^}]*)\\}`).exec(styleOf(file));
    expect(match, `${file} states no rule for ${selector}`).not.toBeNull();
    return match?.[1] ?? "";
}

describe("the menu's component inventory", () => {
    it("names every component in the directory, so a new one cannot skip these checks", () => {
        const onDisk = readdirSync(menuRoot)
            .filter((name) => name.endsWith(".vue"))
            .sort();
        expect(onDisk).toEqual([...MENU_COMPONENTS].sort());
    });
});

describe("every colour in the menu is a theme role", () => {
    // `colorRoles.ts` is the single place a colour is decided, and a second authority has been
    // introduced and removed twice in this repository. A hex typed into a component is exactly
    // how the third one would arrive - it would look right in whichever theme it was picked in
    // and be wrong in the other two, which is a defect no screenshot of one theme reveals.
    it.each(MENU_COMPONENTS)("%s states no hex literal", (file) => {
        expect(styleOf(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });

    // The other second authority, and the quieter one: an emphasis opacity decides how strong
    // a colour reads without going through a role at all. The contrast theme answers every
    // role at maximum and then has 60% of it taken back off by a wash it cannot see, which is
    // why `MenuOption.vue` and `MapsMenu.vue` both argue this at length where they undo it.
    it.each(MENU_COMPONENTS)("%s decides emphasis by role rather than by opacity", (file) => {
        expect(styleOf(file)).not.toMatch(/--v-(?:medium|high)-emphasis-opacity/);
    });

    // The general form of both of the above, over the four properties that decide what a
    // surface and its text look like. `transparent` is allowed and is not a loophole: it is
    // how a menu row opts out of having a container of its own so the state layer beneath it
    // can be seen, which is the M3 answer and the reason the drawer's rows stopped being
    // cards. A *partly* transparent role is what is refused - see the second half below.
    it.each(MENU_COMPONENTS)("%s resolves every colour through a role or a token", (file) => {
        const properties =
            /(?:^|[;{])\s*(background|background-color|color|border-color|border)\s*:\s*([^;}]+)/g;
        const offenders: string[] = [];
        for (const match of styleOf(file).matchAll(properties)) {
            // Both groups are non-optional in the pattern, so neither can be absent on a
            // match; the fallbacks are for the type checker, which cannot know that.
            const property = match[1] ?? "";
            const value = (match[2] ?? "").trim();
            const resolved =
                value.includes("var(--v-theme-") ||
                value.includes("var(--md-sys-") ||
                /^(?:transparent|inherit|initial|unset|none|currentColor)$/i.test(value) ||
                // A border shorthand may state only its width and style and take its colour
                // from `color`, which is itself checked by this same loop.
                (property === "border" && /^[\d.]+(?:px|em|rem)?\s+\w+$/.test(value));
            if (!resolved) {
                offenders.push(`${property}: ${value}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    // A role behind an alpha channel passes the check above - it does contain a role - while
    // being the exact defect this menu had to be fixed for, because the whole panel opens over
    // a live terrain render. `rgb()` and `rgba()` differ by one character and the wrong one
    // looks entirely plausible in a diff, so it is worth refusing on its own rather than
    // trusting the drawer's own rule to be the only surface anybody ever fills.
    //
    // Only the four properties above. The authorization flash in `MenuSuperConfirm.vue` ramps
    // a `box-shadow` from a role at 0.55 alpha down to 0 alpha, which is what fading out means
    // and is correctly not caught here.
    it.each(MENU_COMPONENTS)("%s fills no surface with a partly transparent role", (file) => {
        const properties =
            /(?:^|[;{])\s*(?:background|background-color|color|border-color|border)\s*:\s*([^;}]+)/g;
        const translucent = [...styleOf(file).matchAll(properties)]
            .map((match) => (match[1] ?? "").trim())
            .filter((value) => value.includes("rgba(var(--v-theme-"));
        expect(translucent).toEqual([]);
    });
});

describe("the drawer paints its own opaque surface", () => {
    // This is the one panel in the application that opens over a live terrain render, and a
    // translucent surface there puts a map behind a paragraph. The notification toast already
    // had to be fixed for exactly this, so it is a regression this project has actually had
    // rather than one it is imagining.
    const drawer = () => ruleBody("MenuSideSheet.vue", ".mb-side-sheet.v-navigation-drawer");

    it("fills itself with a solid surface role", () => {
        expect(drawer()).toMatch(/background:\s*rgb\(var\(--v-theme-surface\)\)/);
    });

    it("uses no alpha anywhere in that fill", () => {
        const background = /background:\s*([^;]+)/.exec(drawer())?.[1] ?? "";
        expect(background).not.toContain("rgba(");
    });

    it("separates itself from the map with a full-strength hairline, not a 12% border", () => {
        expect(drawer()).toMatch(
            /border-inline-end:\s*1px solid rgb\(var\(--v-theme-outline-variant\)\)/,
        );
    });
});

describe("the menu's motion spends the token ladder", () => {
    // The same rule `motion.scss` holds itself to: no millisecond and no curve is typed into a
    // rule, so the whole application slows down or speeds up as one decision. The reduced-motion
    // kill switches are the deliberate exception - `0.01ms` is not a tempo, it is the idiom for
    // "effectively none" that keeps a transition event firing.
    //
    // The token references are removed before the search rather than allowed for afterwards.
    // That is what lets the duration pattern be the bare `250ms` rather than `: 250ms`: a
    // duration inside an `animation` shorthand sits after the animation's name and never after
    // a colon, so a colon-anchored pattern reads `animation: mb-thing-pop 260ms ease-out` as
    // clean. It was written that way first and passed on exactly that line.
    it.each(MENU_COMPONENTS)("%s writes no bare duration or curve", (file) => {
        const spent = styleOf(file)
            .replace(/0\.01ms/g, "")
            .replace(/var\(--md-sys-[a-z0-9-]+\)/g, "");
        expect(spent).not.toMatch(/[\d.]+m?s\b/);
        expect(spent).not.toMatch(/cubic-bezier\(/);
        // The keyword curves are off the ladder too, and are the easier thing to reach for.
        // `linear` is caught with them: the M3 set has its own linear token, so the bare
        // keyword still means a curve chosen here rather than from the scale.
        expect(spent).not.toMatch(/\bease(?:-in|-out|-in-out)?\b/);
        expect(spent).not.toMatch(/\blinear\b/);
    });
});

describe("the menu's hit targets clear 40x40", () => {
    it.each(HIT_TARGET_FLOORS)(
        "$file keeps $what at the floor",
        ({ file, selector, declarations }) => {
            const body = ruleBody(file, selector);
            for (const declaration of declarations) {
                expect(body).toContain(declaration);
            }
        },
    );

    // See the note over `HIT_TARGET_FLOORS` for why a floor that does not out-rank
    // `copy/bilingual.css` is not a floor. Class-weight components are counted rather than a
    // full specificity computed: three of anything that carries class weight - a class, an
    // attribute selector or a pseudo-class - beats (0,2,1), and counting is something a reader
    // of this file can check by eye.
    it.each(HIT_TARGET_FLOORS)("$file states $what specifically enough to win", ({ selector }) => {
        const weighted = selector.match(/[.[:]/g)?.length ?? 0;
        expect(weighted, `${selector} loses to bilingual.css at (0,2,1)`).toBeGreaterThanOrEqual(3);
    });
});
