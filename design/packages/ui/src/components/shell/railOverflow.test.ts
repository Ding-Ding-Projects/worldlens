/**
 * `computeRailShortcutSplit`'s own arithmetic, at illustrative heights standing in for the two
 * real, captured ones.
 *
 * v2-08-rail-7-jobs-1280x800-dark.png showed the four core destinations scrolled out of view
 * with seven multi-line shortcuts filling the rail instead. `DESTINATIONS_BLOCK`/`FOOTER_BLOCK`
 * below are illustrative constants for exercising the algorithm, not a literal transcription of
 * the real CSS - `AppRail.vue` measures both live via `getBoundingClientRect()`, and the real
 * numbers vary with how many destination labels happen to wrap onto a second line. What has to
 * hold regardless of the exact numbers is the invariant these tests assert: destinations plus
 * footer plus every visible shortcut (plus "More" when shown) never exceeds the available
 * height. A real running build (not jsdom) is what actually proved this arithmetic correct -
 * see the doc comment on `measureRail()` in `AppRail.vue` for the real bug it caught: measuring
 * the footer's *position* rather than its *height* fed the split function a number that was
 * only honest when nothing had overflowed yet, which is exactly backwards.
 */
import { describe, expect, it } from "vitest";
import {
    computeRailShortcutSplit,
    RAIL_MORE_BUTTON_PX,
    RAIL_SHORTCUT_ITEM_PX,
} from "./railOverflow.js";

// Illustrative, not a literal CSS transcription - see the file-level doc comment above.
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
