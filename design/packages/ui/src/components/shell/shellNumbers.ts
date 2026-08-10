/**
 * Numbers shown in persistent shell chrome must be finite and bounded.
 *
 * Counts originate in live stores and progress originates in external render processes. A bad
 * transient value must not become a negative badge, `NaN unread`, or a progress bar outside its
 * ARIA range. Normalising at the shell boundary keeps the stores authoritative while making the
 * presentation fail closed.
 */
export function nonNegativeInteger(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.floor(value);
}

/**
 * Clamp an already-percentage render value to the ARIA range, preserving "no progress" as null.
 *
 * The unit is a **percentage**, 0 to 100, because that is what this application's own progress
 * model produces: `progress/progressModel.ts` declares `ProgressLevel.percent` as `number | null`
 * on a 0-100 scale, and `activeRenders.ts` surfaces exactly that as `ActiveRenderRow.percent`.
 * An earlier version of this helper took a 0..1 fraction and multiplied by 100, which is a quiet
 * trap rather than a safety net: feeding it the real 41 would clamp to 1 and render a bar that
 * reads 100% for the whole of every render. A boundary guard that silently reports "finished" is
 * worse than no guard, so the unit here matches the only source there is.
 */
export function safeProgressPercent(value: number | null | undefined): number | null {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return Math.round(Math.min(100, Math.max(0, value)));
}
