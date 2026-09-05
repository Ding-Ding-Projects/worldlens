/**
 * `computeRailShortcutSplit` at the two real, captured heights.
 *
 * v2-08-rail-7-jobs-1280x800-dark.png showed the four core destinations scrolled out of view
 * with seven multi-line shortcuts filling the rail instead. These numbers are the fix's real
 * budget: measured against the actual CSS this component ships (four 50px destinations, a
 * ~160px three-button footer, compact 44px single-line shortcuts, a 44px "More" button), a
 * 1280x800 window's rail should comfortably hold all seven; a 600px-tall window should not, and
 * must fold the remainder into "More" rather than ever letting the destinations move.
 */
import { describe, expect, it } from "vitest";
import {
    computeRailShortcutSplit,
    RAIL_MORE_BUTTON_PX,
    RAIL_SHORTCUT_ITEM_PX,
} from "./railOverflow.js";

// Mirrors the real AppRail.vue measurements: 4 destinations x 50px, footer ~160px.
const DESTINATIONS_BLOCK = 200;
const FOOTER_BLOCK = 160;
const SHORTCUT_ITEM = RAIL_SHORTCUT_ITEM_PX;
const MORE_BUTTON = RAIL_MORE_BUTTON_PX;

function split(availableBlockSize: number, shortcutCount: number) {
    return computeRailShortcutSplit({
        availableBlockSize,
        destinationsBlockSize: DESTINATIONS_BLOCK,
        footerBlockSize: FOOTER_BLOCK,
        shortcutItemBlockSize: SHORTCUT_ITEM,
        moreButtonBlockSize: MORE_BUTTON,
        shortcutCount,
    });
}

describe("computeRailShortcutSplit", () => {
    it("fits all seven shortcuts at an 800px window height, exactly the regression's own height", () => {
        const result = split(800, 7);
        expect(result).toEqual({ visibleCount: 7, overflowCount: 0, showMore: false });
        // The invariant the real captures violated: destinations + footer + every visible
        // shortcut must never exceed the available height. Proven here as arithmetic rather
        // than as a jsdom scrollHeight read, which is always zero in this suite.
        const consumed =
            DESTINATIONS_BLOCK + FOOTER_BLOCK + result.visibleCount * SHORTCUT_ITEM;
        expect(consumed).toBeLessThanOrEqual(800);
    });

    it("folds the remainder into More at a 600px window height, never touching the destinations", () => {
        const result = split(600, 7);
        expect(result.showMore).toBe(true);
        expect(result.overflowCount).toBeGreaterThan(0);
        expect(result.visibleCount + result.overflowCount).toBe(7);

        const consumed =
            DESTINATIONS_BLOCK +
            FOOTER_BLOCK +
            result.visibleCount * SHORTCUT_ITEM +
            (result.showMore ? MORE_BUTTON : 0);
        expect(consumed).toBeLessThanOrEqual(600);
    });

    it("never returns a negative or over-budget count at an absurdly short window", () => {
        const result = split(120, 7);
        expect(result.visibleCount).toBeGreaterThanOrEqual(0);
        expect(result.visibleCount).toBeLessThanOrEqual(7);
        expect(result.overflowCount).toBe(7 - result.visibleCount);
    });

    it("shows no More button and nothing folded when there are no shortcuts at all", () => {
        expect(split(800, 0)).toEqual({ visibleCount: 0, overflowCount: 0, showMore: false });
    });

    it("keeps the destinations budget fixed regardless of how many shortcuts are configured", () => {
        // Fifteen shortcuts, an intentionally larger set than the seven actually configured
        // today, so the algorithm's own correctness is not hostage to the exact current count.
        const result = split(800, 15);
        const consumed =
            DESTINATIONS_BLOCK + FOOTER_BLOCK + result.visibleCount * SHORTCUT_ITEM +
            (result.showMore ? MORE_BUTTON : 0);
        expect(consumed).toBeLessThanOrEqual(800);
        expect(result.overflowCount).toBe(15 - result.visibleCount);
    });
});
