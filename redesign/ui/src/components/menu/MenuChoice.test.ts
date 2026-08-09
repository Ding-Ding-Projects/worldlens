/**
 * The menu-choice row's segmented toggle.
 *
 * The toggle itself already sizes as a floor (`height: auto` plus a `min-height`), but the
 * rule for its buttons pinned a fixed `height` straight back on. At (0,3,0) that rule also
 * out-ranked bilingual.css's `html[data-language-mode="bilingual"] .v-btn { height: auto;
 * min-height: 36px }` at (0,2,1), so in bilingual mode the Cantonese half of the marker
 * sort labels (`markers.sort.by.*`) was clipped inside the box.
 *
 * The floor itself moved from 32px to 40px when the menu was brought onto the Material
 * Design 3 measurements, because 32px was below this project's own 40x40 minimum for a hit
 * target before the button's padding was even counted. That is a deliberate design change,
 * and the assertions below have moved with it rather than being relaxed: the fixed-height
 * check that this file exists for is now stated as "no fixed pixel height at all" rather
 * than as "not the one value that was wrong in 2026-08", so it catches a regression to any
 * fixed height instead of only to that one.
 *
 * The assertion reads the shipped rule out of the component source. This workspace's
 * `vitest.config.ts` does not enable `test.css`, so no stylesheet is attached to a mounted
 * component and a real cascade is not observable from a test here at all; `RunScreen.test.ts`
 * and the components fixed alongside it check their own CSS fixes the same way.
 */

import { describe, expect, it } from "vitest";

import menuChoiceSource from "./MenuChoice.vue?raw";

/** The buttons' rule body with its comments removed, so prose never trips an assertion. */
function buttonDeclarations(): string {
    const rule = /\.mb-menu-choice__group\.v-btn-toggle \.v-btn\s*\{[^}]*\}/.exec(menuChoiceSource)?.[0] ?? "";
    return rule.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The toggle container's own rule, which the buttons' floor has to agree with. */
function groupDeclarations(): string {
    const rule = /\.mb-menu-choice__group\.v-btn-toggle\s*\{[^}]*\}/.exec(menuChoiceSource)?.[0] ?? "";
    return rule.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("the choice group's buttons", () => {
    it("size as a floor, like the toggle around them, so a second label line can grow the box", () => {
        const declarations = buttonDeclarations();
        expect(declarations).not.toBe("");
        expect(declarations).toContain("height: auto");
        expect(declarations).toContain("min-height: 40px");
        // A fixed height is what did the clipping; no value of it may come back.
        expect(declarations).not.toMatch(/(?<!min-)(?<!max-)height:\s*\d/);
    });

    it("pad the grown box so a wrapped label does not touch its edges", () => {
        expect(buttonDeclarations()).toContain("padding-block: 4px");
    });

    it("clears this project's 40x40 floor for a hit target, container and buttons alike", () => {
        // Stated on both because either one alone decides the rendered height: the container
        // can only grow a button it does not constrain, and a button can only fill a
        // container that is at least as tall as it is.
        expect(groupDeclarations()).toContain("min-height: 40px");
        expect(buttonDeclarations()).toContain("min-height: 40px");
    });
});
