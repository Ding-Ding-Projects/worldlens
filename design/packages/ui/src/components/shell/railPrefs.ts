/**
 * Whether the navigation rail is drawn expanded (a ~200px column with full single-line labels)
 * or compact (the 80px column of icons and short labels).
 *
 * Expanded is the default, because a rail whose labels are readable without hovering is the one
 * a newcomer can learn by reading. Compact is the choice of somebody who already knows the
 * icons and wants the width back for the map or a job.
 *
 * Persisted through `setupStorage()` rather than `localStorage` directly, for the same reasons
 * `uiSizeSetting.ts` gives: unit tests have no `localStorage`, and a private window or a full
 * quota makes a raw write throw. A stored value that is not one of the two known modes is
 * discarded rather than trusted, because storage is editable by hand and by older builds.
 *
 * One module-level ref, shared by the rail's own footer toggle, the Settings row and the
 * command palette row, so the three controls can never disagree about which mode is in force.
 */

import { ref } from "vue";
import { setupStorage } from "../setup/setupPrefs.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

/** The two modes, in the order a choice control would list them. */
export const RAIL_MODES = ["expanded", "compact"] as const;

export type RailMode = (typeof RAIL_MODES)[number];

/** What somebody who has never chosen gets. */
export const DEFAULT_RAIL_MODE: RailMode = "expanded";

/** Where the chosen mode is remembered. */
export const RAIL_MODE_KEY = "worldlens.shell.railMode";

/** True for a value that names one of the two modes. */
export function isRailMode(value: unknown): value is RailMode {
    return typeof value === "string" && (RAIL_MODES as readonly string[]).includes(value);
}

/** The stored mode, or the default when nothing was stored or the value is not a mode. */
export function readRailMode(): RailMode {
    const raw = setupStorage().read(RAIL_MODE_KEY);
    return isRailMode(raw) ? raw : DEFAULT_RAIL_MODE;
}

/** Remembers a mode and mirrors it into the settings history, fire-and-forget. */
export function writeRailMode(mode: RailMode): void {
    setupStorage().write(RAIL_MODE_KEY, mode);
    recordAppSetting("railMode", mode);
}

/** The mode the rail is drawn in right now. */
export const currentRailMode = ref<RailMode>(readRailMode());

/** Changes the mode: updates the shared readout and remembers it. */
export function changeRailMode(mode: RailMode): void {
    if (!isRailMode(mode)) return;
    currentRailMode.value = mode;
    writeRailMode(mode);
}

/** Flips between expanded and compact. */
export function toggleRailMode(): void {
    changeRailMode(currentRailMode.value === "expanded" ? "compact" : "expanded");
}
