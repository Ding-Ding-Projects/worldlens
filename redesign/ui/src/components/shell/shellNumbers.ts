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

/** Convert a 0..1 render fraction to a safe percentage, preserving "no progress" as null. */
export function safeProgressPercent(value: number | null | undefined): number | null {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return Math.round(Math.min(1, Math.max(0, value)) * 100);
}
