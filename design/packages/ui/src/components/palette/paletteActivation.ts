import type { PaletteItem } from "./paletteItems.js";

export type PaletteEnterIntent =
    | { readonly kind: "activate"; readonly item: PaletteItem }
    | { readonly kind: "focus-control"; readonly item: PaletteItem }
    | { readonly kind: "blocked"; readonly reason: string; readonly recovery?: string };

/** Keeps keyboard activation honest for disabled results as well as pointer activation. */
export function paletteEnterIntent(item: PaletteItem): PaletteEnterIntent {
    if (item.disabled !== undefined) {
        return {
            kind: "blocked",
            reason: item.disabled.reason,
            ...(item.disabled.recovery === undefined ? {} : { recovery: item.disabled.recovery }),
        };
    }
    return item.kind === "setting"
        ? { kind: "focus-control", item }
        : { kind: "activate", item };
}
