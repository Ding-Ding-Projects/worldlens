import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const shellCss = readFileSync(resolve(here, "shell.css"), "utf8");
const shellTs = readFileSync(resolve(here, "ExpressiveSiteShell.ts"), "utf8");
const mainTs = readFileSync(resolve(here, "..", "main.ts"), "utf8");

/*
 * These are source-text guards over the shell's structural decisions, not behaviour tests -
 * `ExpressiveSiteShell.test.ts` beside this file exercises the built DOM. They exist because
 * the decisions below are the kind that a later edit undoes by accident while every rendered
 * pixel still looks plausible: a top app bar creeping back in, the canvas quietly gaining an
 * `overflow-x: hidden` that hides a real overflow bug rather than fixing it, or a hex literal
 * appearing in a file whose whole contract is that it decides no colour.
 */
describe("rail-led M3 Expressive shell", () => {
    it("has no top app bar, and puts the chrome in one full-height rail instead", () => {
        // The absence is the design decision, so it is what gets asserted. A shell that grew a
        // banner back would still render fine, and would still be the layout this replaced.
        expect(shellTs).not.toContain("mb-app-bar");
        expect(shellCss).not.toContain(".mb-app-bar");

        expect(shellTs).toContain('this.navigation.className = "mb-shell-topbar"');
        expect(shellTs).toContain('this.main.className = "mb-main"');
        expect(shellTs).toContain("this.element.append(frame, this.navigationScrim)");
        expect(mainTs).toContain("new ExpressiveSiteShell({");
    });

    it("carries the brand and the quick actions inside the rail", () => {
        expect(shellTs).toContain("this.createRailHead()");
        expect(shellTs).toContain("this.createRailActions()");
        // The tab strip sits between them, which is what makes the rail the navigation rather
        // than a frame around a second copy of it.
        expect(shellTs).toMatch(
            /this\.createRailHead\(\),\s*options\.tabBar,\s*this\.createRailActions\(\)/,
        );
    });

    it("runs the rail the full height of the viewport and rounds only its inner edge", () => {
        /*
         * Anchored to the start of a line, and every base-rule probe below is too.
         *
         * Without the anchor this pattern also matches the tail of a descendant selector -
         * `.mb-shell-workspace[data-tab-placement="bottom"] .mb-shell-topbar { order: 2; }` -
         * so the guard silently reads a one-line dock override instead of the rule it means
         * to check, and reports the base rule missing every property it actually has.
         */
        const rail = /^\.mb-shell-topbar\s*{[^}]*}/m.exec(shellCss)?.[0] ?? "";
        expect(rail).toContain("min-height: 100dvh");
        expect(rail).toContain("position: sticky");
        // Square against the viewport, round against the canvas - the detail that makes the
        // frame read as an inset panel rather than a tall card.
        expect(rail).toContain(
            "border-radius: 0 var(--md-sys-shape-corner-extra-large) var(--md-sys-shape-corner-extra-large)",
        );
        expect(rail).toContain("var(--md-sys-motion-duration-medium2)");
        expect(rail).toContain("var(--md-sys-motion-easing-standard-decelerate)");
    });

    it("builds the frame from three surface-container tones rather than one background", () => {
        expect(shellCss).toMatch(
            /^\.mb-app-shell\s*{[^}]*background:\s*var\(--md-sys-color-surface-container-lowest\);/m,
        );
        expect(shellCss).toMatch(
            /^\.mb-shell-topbar\s*{[^}]*background:\s*var\(--md-sys-color-surface-container-high\);/m,
        );
        expect(shellCss).toMatch(/^\.mb-main\s*{[^}]*background:\s*var\(--md-sys-color-surface\);/m);
    });

    it("decides no colour of its own", () => {
        // The one place colour is decided in this project is packages/shared/src/colorRoles.ts,
        // reaching this package as a generated sheet. A hex literal here would be a second.
        expect(shellCss).not.toMatch(/#[0-9a-f]{3,8}/i);
    });

    it("ships an adaptive mobile drawer, persistent reachable toggle and scrim", () => {
        expect(shellCss).toContain("@media (width <= 720px)");
        expect(shellCss).toContain("--mb-navigation-width: min(19rem, calc(100vw - 3rem))");
        expect(shellCss).toContain("--mb-navigation-collapsed-width: 4rem");
        expect(shellCss).toContain('.mb-app-shell[data-navigation-open="true"]');
        expect(shellTs).toContain('this.navigationScrim.className = "mb-navigation-scrim"');
        expect(shellTs).toContain("options.sidebar.setCollapsed(true)");
    });

    it("uses a bounded, left-anchored content canvas without hiding horizontal overflow", () => {
        expect(shellCss).toContain("--mb-content-max-width: 76rem");
        expect(shellCss).toMatch(/^\.mb-main\s*{[^}]*min-width:\s*0;/m);
        expect(shellCss).toMatch(
            /^\.mb-main > \.tab-panels\s*{[^}]*width:\s*min\(100%, var\(--mb-content-max-width\)\);/m,
        );
        // Anchored to the rail with the slack on the right, rather than centred between two
        // gutters. `margin-inline: 0 auto` is the whole of that decision.
        expect(shellCss).toMatch(/^\.mb-main > \.tab-panels\s*{[^}]*margin-inline:\s*0 auto;/m);
        // Hiding overflow here would silently swallow the horizontal-scroll defects the
        // viewport audit exists to catch, which is worse than the overflow itself.
        expect(shellCss).not.toMatch(/^\.mb-main\s*{[^}]*overflow-x:\s*hidden/m);
    });

    it("keeps every quick action real and the palette shortcut-labelled", () => {
        for (const action of ["search", "settings", "notifications", "palette"] as const) {
            expect(shellTs).toContain(`this.options.actions.${action}`);
        }
        expect(shellTs).toContain('"Command palette (Ctrl+Shift+F)"');
        expect(mainTs).toContain("palette: () => palette.open()");
    });

    it("provides reduced-motion and forced-colour adaptations", () => {
        expect(shellCss).toContain("@media (prefers-reduced-motion: reduce)");
        expect(shellCss).toContain("transition: none");
        expect(shellCss).toContain("@media (forced-colors: active)");
        expect(shellCss).toContain("background: Canvas");
        expect(shellCss).toContain("color: CanvasText");
    });
});
