/**
 * The contract between the tab strip and the docking layer.
 *
 * `TabStrip` draws the menus and the keyboard entry points, and it knows nothing
 * about how a pane is arranged. `TabbedNavigation` owns the arrangement and hands
 * the strip this small object when docking is enabled. When it is absent, which is
 * the case for every strip that is not the Work workspace, the strip draws exactly
 * what it always drew: no extra menu rows, no extra button.
 */

import type { LayoutCommand } from "./workLayout.js";

/** What the person sees of a saved layout. */
export interface WorkLayoutSummary {
    readonly id: string;
    readonly name: string;
    /** ISO-8601, or an empty string when the layout predates the field. */
    readonly savedAt: string;
}

export type SaveLayoutResult = "saved" | "replaced" | "empty-name" | "full";

export interface WorkLayoutHost {
    /** How many panes there are, which decides which commands are meaningful. */
    readonly paneCount: number;
    /** The saved layouts, in the order they were saved. */
    readonly layouts: readonly WorkLayoutSummary[];
    isFloating(stripId: string): boolean;
    isMaximised(stripId: string): boolean;
    /** Runs one arrangement command for the pane (and, for a split or move, the tab) given. */
    run(stripId: string, tabId: string | null, command: LayoutCommand): void;
    /** Saves the current arrangement under a name. */
    save(name: string): SaveLayoutResult;
    apply(id: string): boolean;
    rename(id: string, name: string): boolean;
    remove(id: string): void;
    /** Throws the arrangement away and lays every tab out as one pane again. */
    reset(): void;
}
