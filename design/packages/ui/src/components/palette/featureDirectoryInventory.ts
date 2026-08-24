import type { PaletteItem } from "./paletteItems.js";

/**
 * Hand-written fail-closed inventory for the directory's canonical entry points.
 *
 * The catalogue remains the source of truth for labels and actions. This list is intentionally
 * explicit so removing a route cannot make the test list shrink with it and report success.
 */
export const FEATURE_DIRECTORY_REQUIRED_IDS = [
    "shell.settings",
    "shell.config",
    "settings.mojang-download-consent",
    "config.all",
    "config.history",
    "appearance.preset",
    "appearance.editors",
    "appearance.reset",
    "chrome.noticeCentre",
    "chrome.tabFinder",
    "chrome.tutorial",
    "chrome.eula",
    "chrome.welcome",
    "palette.size",
] as const;

export function assertFeatureDirectoryInventory(
    items: readonly PaletteItem[],
    requiredIds: readonly string[] = FEATURE_DIRECTORY_REQUIRED_IDS,
): void {
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const id of requiredIds) {
        const item = byId.get(id);
        if (item === undefined) throw new Error(`Feature directory entry is missing: ${id}`);
        if (item.location === undefined || item.location.length === 0) {
            throw new Error(`Feature directory entry has no breadcrumb: ${id}`);
        }
        if (item.kind === "destination" && item.where.trim().length === 0) {
            throw new Error(`Destination has no deep-link description: ${id}`);
        }
    }
}
