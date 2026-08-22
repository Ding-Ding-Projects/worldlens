/**
 * Pure decisions behind the home dashboard: which real state counts as "you have something
 * going on" versus "you have nothing yet", and how to cap the lists so a hundred servers do not
 * turn a dashboard back into an index.
 *
 * Nothing here touches Vue, `t()`, or a store. `HomeDashboard.vue` reads a store and a live
 * render list and hands the plain values in; this module only decides what to do with them, so
 * every branch is testable without mounting anything.
 */

import type { ActiveRenderRow } from "../renders/activeRenders.js";
import type { ServerProfile } from "../../stores/profiles.js";

/** Render rows worth showing on the dashboard: still moving, in the order they arrived. */
const IN_PROGRESS_STATES = new Set<ActiveRenderRow["state"]>(["starting", "running", "offer"]);

/** Rows the dashboard treats as "in progress", capped so a burst of renders stays a list. */
export function inProgressRenders(
    rows: readonly ActiveRenderRow[],
    limit = 4,
): readonly ActiveRenderRow[] {
    return rows.filter((row) => IN_PROGRESS_STATES.has(row.state)).slice(0, limit);
}

/** How many more rows `inProgressRenders` left out, for a "+N more" line. */
export function inProgressRendersOverflow(rows: readonly ActiveRenderRow[], limit = 4): number {
    const total = rows.filter((row) => IN_PROGRESS_STATES.has(row.state)).length;
    return Math.max(0, total - limit);
}

/** Profiles worth showing on the dashboard: most recently added first, capped to a handful. */
export function recentProfiles(
    profiles: readonly ServerProfile[],
    limit = 6,
): readonly ServerProfile[] {
    return profiles.slice(-limit).reverse();
}

/** How many profiles `recentProfiles` left out. */
export function recentProfilesOverflow(profiles: readonly ServerProfile[], limit = 6): number {
    return Math.max(0, profiles.length - limit);
}

/**
 * Whether this install has anything real to lead with.
 *
 * A fresh install has zero profiles, zero renders and zero project drafts, and that is a
 * genuinely different first screen from a returning user's - not the same layout with empty
 * rows, which is the exact "documentation site" failure this rewrite exists to fix. `false`
 * here is what switches the page to the welcome state.
 */
export function hasReturningUserContent(
    profiles: readonly ServerProfile[],
    renderRows: readonly ActiveRenderRow[],
    projectCount: number,
): boolean {
    return profiles.length > 0 || renderRows.some((row) => IN_PROGRESS_STATES.has(row.state)) || projectCount > 0;
}

/** A percent clamped to a sane display range, or `null` when the row cannot report one. */
export function displayPercent(percent: number | null): number | null {
    if (percent === null || !Number.isFinite(percent)) return null;
    return Math.min(100, Math.max(0, Math.round(percent)));
}
