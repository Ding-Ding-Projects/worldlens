/**
 * Kid mode's answers to the existing Material 3 role names.
 *
 * No new token: every key here is a role `colorRoles.ts` already declares, so a component that
 * reads `primary-container` keeps working and the contrast test suite still covers both schemes.
 * The seed is the same blue the product has always used (#00639B / #8FCDFF); kid mode moves the
 * surfaces to light, raises chroma on the containers, and adds the sunshine accent as tertiary.
 *
 * `ColorRole` (in `@worldlens/shared`) declares thirty-eight roles, not the thirty-two this file
 * used to answer. The six missing ones - `surface-dim`, `surface-bright`, `surface-light`,
 * `surface-tint`, `scrim` and `shadow` - are derived the same way `LIGHT_SCHEME` derives them from
 * its own light surfaces, so kid mode's light scheme relates to its own family exactly as the
 * product's real light scheme relates to its: `surface-bright` is the base surface itself (a light
 * scheme's surface is already its brightest state), `surface-light` matches `surface-container`,
 * `surface-tint` matches `primary`, and `scrim`/`shadow` are the fixed black every scheme in this
 * application uses for them. `surface-dim` is a genuinely darker step down from `surface`, the way
 * `LIGHT_SCHEME`'s own `#D8DAE0` sits below its `#F8F9FB`.
 */
import type { ColorScheme } from "@worldlens/shared";

export const KID_SCHEME: ColorScheme = {
    "primary": "#1177D1",
    "on-primary": "#FFFFFF",
    "primary-container": "#1177D1",
    "on-primary-container": "#FFFFFF",
    "secondary": "#0B5CA5",
    "on-secondary": "#FFFFFF",
    "secondary-container": "#E7F0FF",
    "on-secondary-container": "#0B5CA5",
    "tertiary": "#FFC531",
    "on-tertiary": "#4A2E00",
    "tertiary-container": "#FFF3D0",
    // Was #C98F00 against this #FFF3D0 background: 2.56:1, below both the 4.5:1 text floor and
    // the 3:1 large-text/graphical floor (see the kid-mode drop-in audit, defect 12). Reusing
    // `on-tertiary`'s own dark brown here clears 11:1 against the same background and keeps the
    // "written in chocolate on cream" pairing the container was always going for.
    "on-tertiary-container": "#4A2E00",
    "error": "#C63A26",
    "on-error": "#FFFFFF",
    "error-container": "#FFECE8",
    "on-error-container": "#7A2314",
    "background": "#072A4B",
    "on-background": "#FFFFFF",
    "surface": "#EAF4FF",
    "on-surface": "#12304F",
    "surface-variant": "#DCEBF8",
    "on-surface-variant": "#34526E",
    "surface-container-lowest": "#FFFFFF",
    "surface-container-low": "#F6FBFF",
    "surface-container": "#FFFFFF",
    "surface-container-high": "#EAF4FF",
    "surface-container-highest": "#DCEBF8",
    "outline": "#5B7793",
    "outline-variant": "#D2E5F6",
    "inverse-surface": "#0B3C68",
    "inverse-on-surface": "#EAF4FF",
    "inverse-primary": "#9CC8EA",
    // The six roles `KID_SCHEME` used to leave out entirely (see the module comment above).
    "surface-dim": "#C9DEF2",
    "surface-bright": "#EAF4FF",
    "surface-light": "#FFFFFF",
    "surface-tint": "#1177D1",
    "scrim": "#000000",
    "shadow": "#000000",
};

/** Kid mode's shape and density overrides, applied as CSS custom properties on the shell root. */
export const KID_SHELL_VARS: Record<string, string> = {
    "--wl-kid-radius-sm": "16px",
    "--wl-kid-radius-md": "22px",
    "--wl-kid-radius-lg": "28px",
    "--wl-kid-radius-full": "999px",
    /* The adult shell's floor is 48px. Kid mode raises it; nothing may go below this. */
    "--wl-kid-target-min": "64px",
    /*
     * 'Baloo 2' is not bundled anywhere in this checkout: no `@fontsource/baloo-2` dependency, no
     * `@font-face` rule, no local font file (grepped the whole repository - the only match for
     * "Baloo" was this line, before this fix). It would have silently resolved through the
     * fallback chain to Verdana on every machine that does not happen to have it installed, which
     * is effectively every machine, since nothing here ever fetches it and this application makes
     * no remote font requests. Adding it as a real bundled dependency means editing
     * `package.json` and `main.ts`, both outside this file's own ownership, so kid mode instead
     * leans on the Roboto weights `main.ts` already bundles via `@fontsource/roboto` (300/400/500/
     * 700) - the same family every other screen in this application renders with - and lets its
     * own generous `font-weight: 800` rules throughout `kid/*.vue` do the "big and friendly" work
     * a distinct rounded display face would otherwise carry.
     */
    "--wl-kid-font": "'Roboto', 'Segoe UI', system-ui, sans-serif",
    "--wl-kid-mono": "'Roboto Mono', monospace",
    /* The press-down shadow every kid control uses instead of M3 elevation. */
    "--wl-kid-press": "0 6px 0 rgb(var(--v-theme-outline-variant))",
};
