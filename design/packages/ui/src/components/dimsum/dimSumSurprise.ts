/**
 * The dim sum surprise: a plain function over a random draw and a plain function over a
 * suppression context, kept separate from the component that renders either of them.
 *
 * The shared instructions ask for a specific, checkable shape - "a 10% chance at startup,
 * never during first run, an error path, an update flow, or mid-task, never twice in one
 * launch, no opt-out" - and every one of those is a fact about *when a draw counts*, not
 * about pixels. Writing it as `shouldShowDimSum(random, context)` means the whole contract
 * can be proved with a table of booleans and a handful of numbers between 0 and 1, without
 * mounting a component, spying on `Math.random`, or waiting for a network fetch to settle.
 *
 * There is deliberately no setting anywhere in this module. That absence is the feature: an
 * opt-out would be a boolean this file would have to read, and it reads none.
 */

import type { DimSumDish } from "./dimSumCatalog.js";

/** Exactly the shared instructions' number, kept as one named constant. */
export const DIM_SUM_SHOW_CHANCE = 0.1;

export interface DimSumEligibilityContext {
    /** True while the first-run wizard is on screen. */
    readonly firstRun: boolean;
    /** True while a download, install, or restart-to-update flow is in progress. */
    readonly updateFlowActive: boolean;
    /** True while a startup or runtime error surface is on screen. */
    readonly errorActive: boolean;
    /** True while the shared restricted mode makes dim-sum capability absent. */
    readonly restrictedModeActive: boolean;
    /** True once this launch has already shown the surprise, however that draw came out. */
    readonly alreadyShownThisLaunch: boolean;
}

/**
 * Whether a startup draw both wins the 10% chance and lands in a moment the surprise is
 * allowed to interrupt. `random` is `[0, 1)`, matching `Math.random()`'s own contract, so a
 * caller passes `Math.random()` in production and any fixed value in a test without needing
 * a second code path.
 *
 * The suppression checks are evaluated regardless of whether the draw itself won, so a
 * caller can also use this to decide "is now even a moment I could ask" before spending the
 * random draw at all - the function is pure either way and costs nothing to call twice.
 */
export function shouldShowDimSum(random: number, context: DimSumEligibilityContext): boolean {
    if (context.firstRun) return false;
    if (context.updateFlowActive) return false;
    if (context.errorActive) return false;
    if (context.restrictedModeActive) return false;
    if (context.alreadyShownThisLaunch) return false;
    return random < DIM_SUM_SHOW_CHANCE;
}

/**
 * Picks one dish for a winning draw. `random` is the same `[0, 1)` value the eligibility
 * check above takes (a fresh one, or the same one - either is a fair pick), and an empty
 * catalog returns null so the caller can fall back to "nothing to show tonight" instead of
 * indexing past the end of an array that never had anything in it.
 */
export function pickDish(dishes: readonly DimSumDish[], random: number): DimSumDish | null {
    if (dishes.length === 0) return null;
    const index = Math.min(dishes.length - 1, Math.floor(random * dishes.length));
    return dishes[index] ?? null;
}
