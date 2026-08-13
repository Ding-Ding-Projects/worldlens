/**
 * The shipped marks a person can pick from, without touching a file picker at all.
 *
 * Every preset points at an asset already bundled in `packages/ui/public/assets/`, the same
 * files `AppTitleBar.vue` and `InfoPage.vue` already render as the title-bar mark and the
 * about-screen mark. Nothing here invents new artwork: a preset is a pointer to a real file
 * this application already ships, not a fresh drawing this feature would be the only user of.
 *
 * `square` is the shipped default: it is what `AppTitleBar.vue` and `InfoPage.vue` already
 * render before this feature exists, so picking it back is the same as never having picked
 * anything at all. That equivalence is what "reset to the shipped mark" means below.
 */

import type { Translate } from "../settings/settingsCopy.js";

export const LOGO_PRESET_IDS = ["square", "circleLarge", "circleCompact"] as const;

export type LogoPresetId = (typeof LOGO_PRESET_IDS)[number];

export interface LogoPreset {
    readonly id: LogoPresetId;
    /** A public-asset-relative path, exactly the shape `AppTitleBar.vue`'s own mark uses. */
    readonly src: string;
}

/**
 * The mark this application ships and renders before anybody has opened this row. Picking
 * this preset, or clearing a custom upload, both land on exactly this file - one shipped
 * mark, not two different ideas of "default" drifting apart over time.
 */
export const DEFAULT_LOGO_PRESET_ID: LogoPresetId = "square";

export const LOGO_PRESETS: readonly LogoPreset[] = [
    { id: "square", src: "assets/logo.png" },
    { id: "circleLarge", src: "assets/logoCircle512.png" },
    { id: "circleCompact", src: "assets/logoCircle64.png" },
];

export function logoPresetById(id: LogoPresetId): LogoPreset {
    // `LOGO_PRESET_IDS` and `LOGO_PRESETS` are written by hand, in the same order, right
    // above this function, so a lookup miss here means the two lists have drifted apart
    // rather than that a caller passed a bad id - `find` returning `undefined` would just
    // move that same drift one call site further away, so it fails loudly instead.
    const found = LOGO_PRESETS.find((preset) => preset.id === id);
    if (found === undefined) {
        throw new Error(`No shipped logo preset is registered for "${id}".`);
    }
    return found;
}

/** The name shown on the preset's own picker tile. */
export function logoPresetLabel(t: Translate, id: LogoPresetId): string {
    switch (id) {
        case "square":
            return t("appLogo.preset.square", "Shipped mark (square)");
        case "circleLarge":
            return t("appLogo.preset.circleLarge", "Shipped mark (circle, large)");
        case "circleCompact":
            return t("appLogo.preset.circleCompact", "Shipped mark (circle, compact)");
    }
}
