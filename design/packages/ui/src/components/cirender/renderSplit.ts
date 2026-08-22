/**
 * Rendering one world across several engines at once, in shares the user chooses.
 *
 * A big world is hours of work, and most people have more than one place to do it: this
 * machine, a container, a runner in the cloud, a box over SSH. Until now a render picked
 * one and left the rest idle. This splits the world's regions between them - half and half,
 * seventy-thirty, or across four engines at once - so the wall-clock is the slowest share
 * rather than the whole job.
 *
 * ## Why the split is by region, and deterministic
 *
 * Regions are the unit BlueMap already renders and already resumes at, so splitting there
 * needs no new merge step: every engine writes tiles for its own regions into the same map
 * layout, and the result is the map that a single engine would have produced.
 *
 * The assignment is a pure function of the region list and the shares, with no randomness
 * and no clock. That is what makes a re-run safe: if one engine fails and the render is
 * repeated, every other engine is handed exactly the regions it had before, so their
 * finished work is still theirs and is not silently redone by somebody else.
 *
 * ## What it does NOT do
 *
 * It does not measure how fast each engine is, and it does not rebalance while running. A
 * share is a statement of intent - "put 30% of it there" - not a promise about when that
 * 30% finishes. An engine given a third of the world on hardware half as fast will finish
 * last, and this module has no way to know that in advance and does not pretend to.
 */

/** Somewhere a share of a render can run. */
export interface RenderEngine {
    readonly id: string;
    /** What to call it on screen. Never used to build a command. */
    readonly label: string;
    /**
     * Whether this engine can actually be used right now.
     *
     * A share may be assigned to an engine that is currently unavailable - the user is
     * describing what they want, not what is up this second - but a plan built from it says
     * so rather than silently dropping the work.
     */
    readonly available: boolean;
    /** Why it cannot be used, when it cannot. Shown beside the disabled control. */
    readonly unavailableReason: string | null;
}

/** One engine's requested portion of the work. */
export interface EngineShare {
    readonly engineId: string;
    /** 0 to 100. Whole numbers only: a person setting a slider is not choosing 33.3333%. */
    readonly percent: number;
}

export interface AllocatedShare {
    readonly engineId: string;
    readonly percent: number;
    /** The regions this engine renders. Disjoint from every other engine's. */
    readonly regions: readonly string[];
}

export interface SplitPlan {
    readonly shares: readonly AllocatedShare[];
    /** Every engine that has work but cannot currently take it. */
    readonly blocked: readonly { readonly engineId: string; readonly reason: string }[];
    readonly totalRegions: number;
}

export const MIN_PERCENT = 0;
export const MAX_PERCENT = 100;

/** A share below this is not worth the cost of starting an engine for it. */
export const MIN_USEFUL_PERCENT = 1;

/**
 * Forces a set of shares to total exactly 100, without surprising the person adjusting one.
 *
 * The rule is that the share being edited keeps the number that was typed, and the others
 * absorb the difference in proportion to what they already had. Anything else makes a
 * slider fight back: a naive normalise that scales every share, including the one under the
 * cursor, means dragging to 50 lands on 43 and the control feels broken.
 *
 * With nothing else to absorb it, the edited share is clamped instead - one engine cannot
 * be given 150% of a world.
 */
export function rebalance(
    shares: readonly EngineShare[],
    editedEngineId: string,
    percent: number,
): readonly EngineShare[] {
    if (shares.length === 0) return shares;

    const clamped = Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, Math.round(percent)));
    const others = shares.filter((share) => share.engineId !== editedEngineId);
    if (others.length === 0) {
        return shares.map((share) => ({ ...share, percent: MAX_PERCENT }));
    }

    const remaining = MAX_PERCENT - clamped;
    const otherTotal = others.reduce((sum, share) => sum + share.percent, 0);

    // Everything else is at zero, so there is no proportion to preserve. Spread what is left
    // evenly rather than dumping all of it on whichever happens to be first.
    const spread =
        otherTotal === 0
            ? others.map((share, index) => ({
                  ...share,
                  percent: Math.floor(remaining / others.length) + (index < remaining % others.length ? 1 : 0),
              }))
            : others.map((share) => ({
                  ...share,
                  percent: Math.round((share.percent / otherTotal) * remaining),
              }));

    const result = shares.map((share) =>
        share.engineId === editedEngineId
            ? { ...share, percent: clamped }
            : (spread.find((entry) => entry.engineId === share.engineId) ?? share),
    );

    return settleToHundred(result, editedEngineId);
}

/**
 * Absorbs the rounding error so the total is exactly 100.
 *
 * Rounding several proportions independently can land on 99 or 101, and a panel that says
 * "101%" reads as a defect regardless of how small the cause was. The remainder goes to the
 * largest share that is not the one being edited, because moving it by one is invisible
 * there and would be obvious on a share of 2.
 */
function settleToHundred(
    shares: readonly EngineShare[],
    protectedEngineId: string,
): readonly EngineShare[] {
    const total = shares.reduce((sum, share) => sum + share.percent, 0);
    const drift = MAX_PERCENT - total;
    if (drift === 0) return shares;

    const candidates = shares
        .filter((share) => share.engineId !== protectedEngineId)
        .sort((left, right) => right.percent - left.percent);
    const target = candidates[0];
    if (target === undefined) return shares;

    return shares.map((share) =>
        share.engineId === target.engineId
            ? { ...share, percent: Math.max(MIN_PERCENT, share.percent + drift) }
            : share,
    );
}

/** Whether these shares can actually be rendered. */
export function sharesAreValid(shares: readonly EngineShare[]): boolean {
    if (shares.length === 0) return false;
    const total = shares.reduce((sum, share) => sum + share.percent, 0);
    if (total !== MAX_PERCENT) return false;
    return shares.some((share) => share.percent >= MIN_USEFUL_PERCENT);
}

/**
 * Divides the regions between the engines.
 *
 * Largest-remainder rather than plain rounding, so the counts add up to exactly the number
 * of regions there are. Plain rounding loses or duplicates a region at the boundary, and a
 * lost region is a hole in the finished map that nothing else would report.
 */
export function allocate(
    regions: readonly string[],
    shares: readonly EngineShare[],
    engines: readonly RenderEngine[],
): SplitPlan {
    const usable = shares.filter((share) => share.percent >= MIN_USEFUL_PERCENT);
    const byId = new Map(engines.map((engine) => [engine.id, engine]));

    if (regions.length === 0 || usable.length === 0) {
        return {
            shares: usable.map((share) => ({ ...share, regions: [] })),
            blocked: [],
            totalRegions: regions.length,
        };
    }

    // Sorted, so the same world always splits the same way regardless of the order the
    // caller happened to collect its regions in. A re-run must hand each engine the work it
    // had before, or a retry silently redoes somebody else's finished regions.
    const ordered = [...regions].sort();

    const exact = usable.map((share) => (share.percent / MAX_PERCENT) * ordered.length);
    const counts = exact.map((value) => Math.floor(value));
    let assigned = counts.reduce((sum, value) => sum + value, 0);

    // Hand out what rounding left over, largest fractional part first.
    const order = exact
        .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
        .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

    let cursor = 0;
    while (assigned < ordered.length) {
        const next = order[cursor % order.length];
        if (next === undefined) break;
        counts[next.index] = (counts[next.index] ?? 0) + 1;
        assigned += 1;
        cursor += 1;
    }

    const allocated: AllocatedShare[] = [];
    let start = 0;
    usable.forEach((share, index) => {
        const count = counts[index] ?? 0;
        allocated.push({ ...share, regions: ordered.slice(start, start + count) });
        start += count;
    });

    const blocked = allocated
        .filter((share) => share.regions.length > 0)
        .map((share) => byId.get(share.engineId))
        .filter((engine): engine is RenderEngine => engine !== undefined && !engine.available)
        .map((engine) => ({
            engineId: engine.id,
            reason: engine.unavailableReason ?? "This engine is not available right now.",
        }));

    return { shares: allocated, blocked, totalRegions: ordered.length };
}

/**
 * An even split across the engines given, which is what "half and half" actually means.
 *
 * The remainder goes to the first engines rather than being dropped, so three engines are
 * 34/33/33 and total 100 rather than 33/33/33 and total 99.
 */
export function evenShares(engineIds: readonly string[]): readonly EngineShare[] {
    if (engineIds.length === 0) return [];
    const base = Math.floor(MAX_PERCENT / engineIds.length);
    const remainder = MAX_PERCENT % engineIds.length;
    return engineIds.map((engineId, index) => ({
        engineId,
        percent: base + (index < remainder ? 1 : 0),
    }));
}
