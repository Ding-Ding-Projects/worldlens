/**
 * What one pane needs to draw itself, computed by the host (`TabbedNavigation`).
 *
 * A pane owns no state. Everything in here is read from the workspace for one strip, and
 * `stripBindings` carries both the strip's props and its listeners, each already bound to the
 * strip they belong to.
 */

import type { TabPage, TabPlacement, TabRecord } from "./tabModel.js";

export interface PaneModel {
    readonly stripId: string;
    readonly placement: TabPlacement;
    /** The DOM id of this pane's tabpanel, which the active tab's `aria-controls` names. */
    readonly panelDomId: string;
    /** The DOM id of the active tab, for the panel's `aria-labelledby`. */
    readonly labelledBy: string | null;
    readonly activeTab: TabRecord | null;
    readonly page: TabPage | null;
    readonly pages: readonly TabPage[];
    readonly panelPassThrough: boolean;
    readonly stripBindings: Record<string, unknown>;
}
