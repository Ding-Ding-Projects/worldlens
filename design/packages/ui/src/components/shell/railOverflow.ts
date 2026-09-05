/**
 * How many of the rail's job shortcuts fit before the four core destinations would have to
 * scroll to stay visible, and the pure arithmetic behind it.
 *
 * The four destinations never move: this function only ever decides how many shortcuts render
 * directly versus fold into the "More" button beneath them. `AppRail.vue` measures the real
 * rendered height of the destinations block and the footer with `ResizeObserver` and feeds the
 * remainder in here; this file owns none of that measurement so it can be tested with plain
 * numbers, at the two heights (800px and 600px) that were actually captured showing the rail
 * scrolling its own primary destinations out of view.
 *
 * `jsdom` (this project's unit-test environment) never runs real layout - `getBoundingClientRect`
 * and `scrollHeight`/`clientHeight` are always zero there - so a test that mounted the component
 * and asked whether it "overflowed" would be asserting nothing. This function is the honest
 * alternative: the actual decision the component makes, extracted so its correctness can be
 * proven with arithmetic rather than with a browser this suite does not have.
 */

/** Fixed height of one compact rail row (a shortcut, or the "More" button) - a single source
 *  of truth shared between the component's own CSS comment and this arithmetic. */
// 48px is the row's own block-size; +2 folds in `.wl-rail__items`'s 2px inter-item gap so the
// per-item cost used for the fitting arithmetic matches what each additional row actually
// costs, rather than under-counting by exactly the gap and drifting over budget one item late.
export const RAIL_SHORTCUT_ITEM_PX = 50;
export const RAIL_MORE_BUTTON_PX = 50;
/** `.wl-rail__shortcuts`'s own margin-block-start (8) + padding-block-start (8) + its 1px
 *  top border - the fixed cost of the divider between destinations and shortcuts, spent once
 *  whenever at least one shortcut renders at all. */
export const RAIL_SHORTCUTS_DIVIDER_PX = 17;

export interface RailOverflowInput {
    /** The rail's total available block size (its own `clientHeight`, in px). */
    readonly availableBlockSize: number;
    /** Real measured height of the four-destination block, including its own gaps/padding. */
    readonly destinationsBlockSize: number;
    /** Real measured height of the footer's three action buttons, including gaps/padding. */
    readonly footerBlockSize: number;
    /** Fixed height of one compact, single-line shortcut row (icon + short label). */
    readonly shortcutItemBlockSize: number;
    /** Height of the "More" button itself, spent only when not every shortcut fits. */
    readonly moreButtonBlockSize: number;
    readonly shortcutCount: number;
}

export interface RailOverflowResult {
    /** How many shortcuts, from the start of the list, render directly. */
    readonly visibleCount: number;
    /** How many shortcuts fold into the "More" menu. */
    readonly overflowCount: number;
    /** Whether the "More" button itself needs to be shown at all. */
    readonly showMore: boolean;
}

export function computeRailShortcutSplit(input: RailOverflowInput): RailOverflowResult {
    const budget = Math.max(
        0,
        input.availableBlockSize - input.destinationsBlockSize - input.footerBlockSize,
    );
    const itemSize = Math.max(1, input.shortcutItemBlockSize);
    const shortcutCount = Math.max(0, Math.trunc(input.shortcutCount));

    if (shortcutCount === 0) {
        return { visibleCount: 0, overflowCount: 0, showMore: false };
    }

    const fitsEverything = Math.floor(budget / itemSize);
    if (fitsEverything >= shortcutCount) {
        return { visibleCount: shortcutCount, overflowCount: 0, showMore: false };
    }

    // Not everything fits: one slot is spent on the "More" button, so the destinations are the
    // one thing in this budget that is never traded away for a shortcut.
    const budgetForShortcuts = Math.max(0, budget - Math.max(1, input.moreButtonBlockSize));
    const visibleCount = Math.min(shortcutCount, Math.floor(budgetForShortcuts / itemSize));
    const overflowCount = shortcutCount - visibleCount;

    return { visibleCount, overflowCount, showMore: overflowCount > 0 };
}
