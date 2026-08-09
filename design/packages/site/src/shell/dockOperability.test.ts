// @vitest-environment jsdom

/**
 * Regression guard: every tab dock leaves the page operable.
 *
 * ## The failure this exists to catch
 *
 * Docking the tab strip to the top made the whole site unusable on a phone. The rail rendered
 * correctly as a horizontal band and the canvas rendered correctly beneath it, so nothing about
 * the picture said "broken" except a faint grey wash over the content - and every tap below the
 * band did nothing at all. Measured on a real build at 375x812: `button.mb-navigation-scrim`,
 * `position: fixed`, `inset: 0`, `z-index: 25`, `pointer-events: auto`, background
 * `rgba(0, 0, 0, 0.36)`, rect `[0, 0, 375, 812]`. Nine probe points spread across the canvas all
 * returned that one element from `elementFromPoint`, a real click on a hero button never reached
 * it, and hiding only the scrim - changing nothing else - restored every hit immediately.
 *
 * The scrim is the dismiss layer for the overlay drawer that a *side* dock becomes below 720px.
 * It was shown on `data-navigation-open="true"`, which is derived from the collapsed flag, and
 * `applySidebarNavigation` deliberately forces that flag false for a horizontal dock - so a
 * top-docked rail read as permanently "open" and got a dismiss layer for a drawer that does not
 * exist. Tapping it collapsed a sidebar the layout has no concept of, which is why the page
 * stayed dead however many times it was tapped. The dock choice persists, so a reload came back
 * into the same trap.
 *
 * ## Why these assertions and not a screenshot or a class check
 *
 * jsdom does not lay out or hit-test, so "click the middle of the page and see what happens" is
 * not available here; it was done by hand against a real Chrome build and is what produced the
 * numbers above. What jsdom *can* do is resolve the real question end to end: take the actual
 * selectors out of `shell.css`, and ask the actual DOM the shell built whether they match. That
 * is the decision the browser makes when it decides whether to paint the scrim, made against
 * both halves of the fix at once - re-widen the selector, or re-break the `hidden` flag, and one
 * of these fails.
 *
 * The positive case matters as much as the negative one. A guard that only asserts "the scrim
 * never shows" would pass just as happily on a build that deleted the scrim entirely and left
 * the side drawer with no way to dismiss it, so the compact side dock asserts the scrim *is*
 * there and *is* shown.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AppearanceController } from "../appearance/controller.js";
import { AppearanceStore } from "../appearance/store.js";
import { I18n } from "../i18n/I18n.js";
import { Notifications } from "../notifications/Notifications.js";
import { Preferences } from "../platform/Preferences.js";
import { RegexBuilderSlot } from "../platform/RegexBuilderSlot.js";
import { ShortcutRegistry } from "../platform/shortcuts.js";
import { applyLayoutRescue } from "../platform/layoutRescue.js";
import { TabModel, type TabPlacement } from "../tabs/TabModel.js";
import { TabStrip } from "../tabs/TabStrip.js";
import { ExpressiveSiteShell } from "./ExpressiveSiteShell.js";
import { SidebarNavigation } from "./SidebarNavigation.js";

const here = dirname(fileURLToPath(import.meta.url));
/*
 * Comments are stripped before anything is matched. This file is heavily commented, and a
 * comment sitting immediately above a rule otherwise lands inside the selector the crude rule
 * regex below extracts - which then reaches `matches()` as an invalid selector and throws.
 */
const shellCss = readFileSync(resolve(here, "shell.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const PLACEMENTS: readonly TabPlacement[] = ["left", "right", "top", "bottom"];
const HORIZONTAL: readonly TabPlacement[] = ["top", "bottom"];
const VERTICAL: readonly TabPlacement[] = ["left", "right"];

const PAGES: readonly (readonly [string, string])[] = [
    ["docs", "Documentation"],
    ["screenshots", "Screenshots"],
    ["settings", "Settings"],
    ["search", "Search"],
    ["changelog", "Changelog"],
    ["notifications", "Notifications"],
];

function memoryStorage(): Storage {
    const cells = new Map<string, string>();
    return {
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => void cells.set(key, value),
        removeItem: (key) => void cells.delete(key),
        clear: () => cells.clear(),
        key: (index) => [...cells.keys()][index] ?? null,
        get length() {
            return cells.size;
        },
    };
}

/**
 * Every selector in `shell.css` that would paint a given element, i.e. that declares
 * `display: block`.
 *
 * Selector lists are split on commas so `element.matches` is asked about one selector at a
 * time; a browser resolves a list that way too, and a whole list handed to `matches` would
 * report a match for the wrong branch of it. Media conditions are not evaluated here - the
 * viewport is supplied separately by the caller, which is what keeps this readable.
 */
function showSelectorsFor(fragment: string): string[] {
    const found: string[] = [];
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    let match = rule.exec(shellCss);
    while (match !== null) {
        const selectorList = match[1] ?? "";
        const body = match[2] ?? "";
        if (/display\s*:\s*block/.test(body)) {
            for (const selector of selectorList.split(",")) {
                const trimmed = selector.replace(/\s+/g, " ").trim();
                /*
                 * `:not([hidden])` is dropped. It is the TypeScript half of the fix restated
                 * inside the selector, so leaving it in makes the stylesheet check pass merely
                 * because the shell set the attribute - which is exactly the entanglement this
                 * separation exists to remove, and it was found by experiment: with the selector
                 * widened back to its broken form, every assertion still passed while
                 * `:not([hidden])` was part of what got matched. What is left is the stylesheet's
                 * own opinion about which docks deserve a scrim, which is the half that broke.
                 */
                const withoutHiddenGuard = trimmed.replace(/:not\(\[hidden\]\)/g, "");
                if (withoutHiddenGuard.includes(fragment)) found.push(withoutHiddenGuard);
            }
        }
        match = rule.exec(shellCss);
    }
    return found;
}

const SCRIM_SHOW_SELECTORS = showSelectorsFor(".mb-navigation-scrim");

interface Harness {
    readonly shell: ExpressiveSiteShell;
    readonly model: TabModel;
    readonly sidebar: SidebarNavigation;
    readonly strip: TabStrip;
    readonly root: HTMLElement;
    readonly scrim: HTMLButtonElement;
}

/**
 * The real shell, the real strip and the site's own seven-page shape, at one viewport.
 *
 * A null placement means "take whatever the storage already holds", which is what a reload
 * does. Passing a placement writes one, so a reload test that passed one would be overwriting
 * the very value it is trying to prove survived.
 */
function build(
    placement: TabPlacement | null,
    compact: boolean,
    storage: Storage = memoryStorage(),
): Harness {
    Object.defineProperty(window, "innerWidth", { value: compact ? 375 : 1280, configurable: true });
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn().mockReturnValue({ matches: compact }),
    });

    const prefs = new Preferences(storage);
    const i18n = new I18n(new Preferences(memoryStorage()));
    const model = new TabModel(prefs, i18n);
    const notifications = new Notifications(i18n, document.createElement("div"));
    const strip = new TabStrip({
        i18n,
        model,
        notifications,
        shortcuts: new ShortcutRegistry(document.createElement("div")),
        regex: new RegexBuilderSlot(),
        appearance: new AppearanceController(new Preferences(null), new AppearanceStore()),
        confirmDestructive: async () => true,
    });

    model.register({
        id: "home",
        label: { text: "Home" },
        pinned: true,
        closable: false,
        render: () => {},
    });
    for (const [id, label] of PAGES) model.register({ id, label: { text: label }, render: () => {} });
    if (placement !== null) model.setPlacement(placement);

    const sidebar = new SidebarNavigation(prefs, compact);
    const root = document.createElement("div");
    document.body.append(root);
    const shell = new ExpressiveSiteShell({
        root,
        i18n,
        tabs: model,
        sidebar,
        tabBar: strip.bar,
        panels: strip.panels,
        footer: document.createElement("footer"),
        actions: {
            home: vi.fn(),
            search: vi.fn(),
            settings: vi.fn(),
            notifications: vi.fn(),
            palette: vi.fn(),
        },
    });

    const scrim = root.querySelector<HTMLButtonElement>(".mb-navigation-scrim");
    expect(scrim, "the shell no longer builds a navigation scrim at all").not.toBeNull();
    return { shell, model, sidebar, strip, root, scrim: scrim as HTMLButtonElement };
}

/**
 * Whether the *stylesheet* would paint the scrim over this DOM, ignoring the `hidden` flag.
 *
 * Asked separately from the flag on purpose. The two halves of the fix are independent, and a
 * combined check is satisfied by either one of them - which was proved by experiment rather than
 * assumed: with the stylesheet's selector deliberately widened back to its broken form and only
 * the TypeScript half in place, a combined check passed all 22 assertions, because `hidden`
 * short-circuited before any selector was ever matched. A guard that can only see one half of
 * what it guards is the kind that passes review and catches nothing.
 */
function stylesheetSelectsTheScrim(harness: Harness): boolean {
    return SCRIM_SHOW_SELECTORS.some((selector) => harness.scrim.matches(selector));
}

/** Whether the shell has left the scrim in the tree for assistive technology and hit-testing. */
function scrimIsInTheTree(harness: Harness): boolean {
    return !harness.scrim.hidden;
}

/** Both halves agreeing that the scrim is genuinely over the canvas. */
function scrimWouldCoverThePage(harness: Harness): boolean {
    return scrimIsInTheTree(harness) && stylesheetSelectsTheScrim(harness);
}

afterEach(() => {
    document.body.replaceChildren();
});

describe("the tab dock never covers the page it navigates", () => {
    it("has at least one rule that shows the scrim, so the checks below can fail", () => {
        // Without this, a stylesheet that lost the rule entirely would make every negative
        // assertion below pass for the wrong reason.
        expect(SCRIM_SHOW_SELECTORS.length).toBeGreaterThan(0);
    });

    for (const placement of HORIZONTAL) {
        it(`leaves nothing over the canvas docked ${placement} on a phone`, () => {
            const harness = build(placement, true);
            // Asserted apart, so neither half can carry the other.
            expect(stylesheetSelectsTheScrim(harness), "shell.css still paints it").toBe(false);
            expect(scrimIsInTheTree(harness), "the shell still leaves it in the tree").toBe(false);
        });

        it(`leaves nothing over the canvas docked ${placement} on a desktop`, () => {
            // Only the tree half here. The stylesheet's selectors do not vary with the viewport,
            // so repeating that assertion at a second width would be the same check wearing a
            // different name, and would read as a claim about the media query that it is not.
            const harness = build(placement, false);
            expect(scrimIsInTheTree(harness)).toBe(false);
        });
    }

    for (const placement of VERTICAL) {
        it(`still dismisses the ${placement} overlay drawer with a scrim on a phone`, () => {
            const harness = build(placement, true);
            // A compact side dock starts collapsed, so the drawer is not overlaying anything
            // yet and the scrim must stay out of the way.
            expect(scrimWouldCoverThePage(harness)).toBe(false);

            harness.sidebar.setCollapsed(false);
            expect(scrimWouldCoverThePage(harness)).toBe(true);

            // And it does what it is for.
            harness.scrim.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            expect(harness.sidebar.collapsed).toBe(true);
            expect(scrimWouldCoverThePage(harness)).toBe(false);
        });

        it(`closes the open ${placement} drawer on Escape`, () => {
            const harness = build(placement, true);
            harness.sidebar.setCollapsed(false);
            expect(scrimWouldCoverThePage(harness)).toBe(true);

            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            expect(harness.sidebar.collapsed).toBe(true);
        });
    }

    it("shows the scrim in no dock at all once the viewport is wide", () => {
        for (const placement of PLACEMENTS) {
            const harness = build(placement, false);
            harness.sidebar.setCollapsed(false);
            expect(harness.scrim.hidden, `${placement} left the scrim in the tree at 1280px`).toBe(
                true,
            );
            document.body.replaceChildren();
        }
    });

    it("keeps the scrim the only thing in the shell that can cover the viewport", () => {
        // A second full-viewport fixed layer would reintroduce exactly this failure by a
        // different door, so the stylesheet is held to one.
        const covering: string[] = [];
        const rule = /([^{}]+)\{([^{}]*)\}/g;
        let match = rule.exec(shellCss);
        while (match !== null) {
            const body = match[2] ?? "";
            if (/position\s*:\s*fixed/.test(body) && /inset\s*:\s*0/.test(body)) {
                covering.push((match[1] ?? "").replace(/\s+/g, " ").trim());
            }
            match = rule.exec(shellCss);
        }
        expect(covering).toEqual([".mb-navigation-scrim"]);
    });
});

describe("every dock is operable", () => {
    for (const placement of PLACEMENTS) {
        it(`activates a page from a real click on its tab, docked ${placement}`, () => {
            const harness = build(placement, true);
            const tabs = [...harness.strip.bar.querySelectorAll<HTMLElement>(".tab")];
            const target = tabs.find((tab) => tab.textContent?.includes("Documentation"));
            expect(target, `no Documentation tab rendered docked ${placement}`).toBeDefined();

            target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            expect(harness.model.active).toBe("docs");
            if (HORIZONTAL.includes(placement)) {
                expect(stylesheetSelectsTheScrim(harness)).toBe(false);
                expect(scrimIsInTheTree(harness)).toBe(false);
            }
        });

        it(`reports the axis it is actually laid out on, docked ${placement}`, () => {
            const harness = build(placement, true);
            const strip = harness.strip.bar.querySelector(".tab-strip");
            expect(strip?.getAttribute("aria-orientation")).toBe(
                VERTICAL.includes(placement) ? "vertical" : "horizontal",
            );
        });
    }

    it("restores the persisted dock, and stays operable, across a reload", () => {
        const storage = memoryStorage();
        for (const placement of PLACEMENTS) {
            build(placement, true, storage);
            document.body.replaceChildren();

            // A second shell over the same storage is what a reload is.
            const reloaded = build(null, true, storage);
            expect(reloaded.model.placement, `${placement} did not survive a reload`).toBe(
                placement,
            );
            if (HORIZONTAL.includes(placement)) {
                expect(stylesheetSelectsTheScrim(reloaded)).toBe(false);
                expect(scrimIsInTheTree(reloaded)).toBe(false);
            }
            document.body.replaceChildren();
        }
    });
});

describe("a persisted dock cannot strand a visitor", () => {
    it("forgets the dock when the address asks it to, and cleans the address up", () => {
        const storage = memoryStorage();
        const prefs = new Preferences(storage);
        const i18n = new I18n(new Preferences(memoryStorage()));
        const model = new TabModel(prefs, i18n);
        model.register({ id: "home", label: { text: "Home" }, closable: false, render: () => {} });
        model.setPlacement("top");
        expect(model.placement).toBe("top");

        let replaced: string | null = null;
        const outcome = applyLayoutRescue(prefs, {
            href: "https://example.invalid/worldlens/?reset=layout",
            replace: (url) => {
                replaced = url;
            },
        });

        expect(outcome).toBe("layout");
        expect(replaced).toBe("https://example.invalid/worldlens/");
        // A shell built after the rescue reads the default, not the dock that stranded them.
        expect(new TabModel(new Preferences(storage), i18n).placement).toBe("left");
    });

    it("leaves preferences alone when no reset was asked for", () => {
        const storage = memoryStorage();
        const prefs = new Preferences(storage);
        const i18n = new I18n(new Preferences(memoryStorage()));
        const model = new TabModel(prefs, i18n);
        model.register({ id: "home", label: { text: "Home" }, closable: false, render: () => {} });
        model.setPlacement("bottom");

        expect(applyLayoutRescue(prefs, { href: "https://example.invalid/worldlens/" })).toBe(
            "none",
        );
        expect(applyLayoutRescue(prefs, { href: "https://example.invalid/?reset=maybe" })).toBe(
            "none",
        );
        expect(new TabModel(new Preferences(storage), i18n).placement).toBe("bottom");
    });
});
