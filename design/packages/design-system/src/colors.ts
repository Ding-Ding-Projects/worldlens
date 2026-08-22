/**
 * The one place the Material colour roles are written down.
 *
 * There used to be two. `ui/src/vuetify.ts` held the three schemes the desktop application renders
 * with, and `viewer/src/materialShell.ts` held a miniature vocabulary of its own - six roles,
 * hand-picked, in different hex values - because the viewer is framework-neutral and could not
 * import a Vuetify theme definition. The consequence was not theoretical: the two disagreed about
 * every single colour, so the same product looked like two products depending on whether you
 * opened it or visited it.
 *
 * This module is the fix, and its shape is the whole point: **plain data with no imports at all.**
 * No Vue, no Vuetify, no DOM. That is what lets the desktop theme and the framework-neutral viewer
 * shell read the same values without the viewer growing a runtime it has no business carrying.
 *
 * `vuetify.ts` builds its theme definitions from these. `materialShell.ts` emits its custom
 * properties from these. `colorRoles.test.ts` fails when they diverge - which they cannot do
 * silently any more, because there is only one of them.
 *
 * Generated once from the schemes that were already in `vuetify.ts`, then hand-owned. A colour
 * changes here and it changes in both places, in the same commit.
 */

/** Every role name a scheme defines. Exhaustive: a scheme missing one fails the identity test. */
export type ColorRole =
    | "primary"
    | "on-primary"
    | "primary-container"
    | "on-primary-container"
    | "secondary"
    | "on-secondary"
    | "secondary-container"
    | "on-secondary-container"
    | "tertiary"
    | "on-tertiary"
    | "tertiary-container"
    | "on-tertiary-container"
    | "error"
    | "on-error"
    | "error-container"
    | "on-error-container"
    | "background"
    | "on-background"
    | "surface"
    | "on-surface"
    | "surface-dim"
    | "surface-bright"
    | "surface-light"
    | "surface-container-lowest"
    | "surface-container-low"
    | "surface-container"
    | "surface-container-high"
    | "surface-container-highest"
    | "surface-variant"
    | "on-surface-variant"
    | "outline"
    | "outline-variant"
    | "inverse-surface"
    | "inverse-on-surface"
    | "inverse-primary"
    | "surface-tint"
    | "scrim"
    | "shadow";

/** The three schemes this product ships. Contrast is deliberately not tonal - see below. */
export type SchemeName = "dark" | "light" | "contrast";

export type ColorScheme = Readonly<Record<ColorRole, string>>;

/** The default a fresh install opens in - see `themeSetting.ts` for why dark rather than the system. */
export const DARK_SCHEME: ColorScheme = {
    "primary": "#8FCDFF",
    "on-primary": "#003351",
    "primary-container": "#004B73",
    "on-primary-container": "#CEE5FF",
    "secondary": "#B7C9D9",
    "on-secondary": "#22323F",
    "secondary-container": "#384956",
    "on-secondary-container": "#D3E5F5",
    "tertiary": "#D1BFE7",
    "on-tertiary": "#372A49",
    "tertiary-container": "#4E4161",
    "on-tertiary-container": "#EDDCFF",
    "error": "#FFB4AB",
    "on-error": "#410002",
    "error-container": "#93000A",
    "on-error-container": "#FFDAD6",
    "background": "#0B0E11",
    "on-background": "#E1E2E8",
    "surface": "#101418",
    "on-surface": "#E1E2E8",
    "surface-dim": "#101418",
    "surface-bright": "#37393E",
    "surface-light": "#272A2E",
    "surface-container-lowest": "#0B0E11",
    "surface-container-low": "#191C20",
    "surface-container": "#1D2024",
    "surface-container-high": "#272A2E",
    "surface-container-highest": "#323539",
    "surface-variant": "#42474E",
    "on-surface-variant": "#C2C7CF",
    "outline": "#8C9199",
    "outline-variant": "#42474E",
    "inverse-surface": "#E1E2E8",
    "inverse-on-surface": "#2E3135",
    "inverse-primary": "#00639B",
    "surface-tint": "#8FCDFF",
    "scrim": "#000000",
    "shadow": "#000000",
};

/** Light, shipped unchanged by the Material Design 3 shell rewrite. */
export const LIGHT_SCHEME: ColorScheme = {
    "primary": "#00639B",
    "on-primary": "#FFFFFF",
    "primary-container": "#CDE5FF",
    "on-primary-container": "#001D32",
    "secondary": "#3B4A57",
    "on-secondary": "#FFFFFF",
    "secondary-container": "#D3E5F5",
    "on-secondary-container": "#0C1D29",
    "tertiary": "#66587B",
    "on-tertiary": "#FFFFFF",
    "tertiary-container": "#EDDCFF",
    "on-tertiary-container": "#211634",
    "error": "#BA1A1A",
    "on-error": "#FFFFFF",
    "error-container": "#FFDAD6",
    "on-error-container": "#410002",
    "background": "#F7F9FF",
    "on-background": "#181C20",
    "surface": "#F1F4FA",
    "on-surface": "#181C20",
    "surface-dim": "#D8DAE0",
    "surface-bright": "#F8F9FB",
    "surface-light": "#ECEEF4",
    "surface-container-lowest": "#FFFFFF",
    "surface-container-low": "#F1F4FA",
    "surface-container": "#EBEEF4",
    "surface-container-high": "#E5E8EE",
    "surface-container-highest": "#DFE2E8",
    "surface-variant": "#DEE3EA",
    "on-surface-variant": "#41474D",
    "outline": "#6C737A",
    "outline-variant": "#C1C7CE",
    "inverse-surface": "#2E3135",
    "inverse-on-surface": "#EFF1F6",
    "inverse-primary": "#8FCDFF",
    "surface-tint": "#00639B",
    "scrim": "#000000",
    "shadow": "#000000",
};

/**
 * Answers the same role names with the highest-contrast values that keep their meaning.
 *
 * Deliberately **not** derived from the blue seed the other two share. Deriving it tonally would
 * produce a scheme that is merely darker, which defeats the one thing it exists for.
 */
export const CONTRAST_SCHEME: ColorScheme = {
    "primary": "#FFFFFF",
    "on-primary": "#000000",
    "primary-container": "#FFFFFF",
    "on-primary-container": "#000000",
    "secondary": "#FFFF00",
    "on-secondary": "#000000",
    "secondary-container": "#000000",
    "on-secondary-container": "#FFFF00",
    "tertiary": "#FFFF00",
    "on-tertiary": "#000000",
    "tertiary-container": "#000000",
    "on-tertiary-container": "#FFFF00",
    "error": "#FF5449",
    "on-error": "#000000",
    "error-container": "#000000",
    "on-error-container": "#FF5449",
    "background": "#000000",
    "on-background": "#FFFFFF",
    "surface": "#000000",
    "on-surface": "#FFFFFF",
    "surface-dim": "#000000",
    "surface-bright": "#000000",
    "surface-light": "#000000",
    "surface-container-lowest": "#000000",
    "surface-container-low": "#000000",
    "surface-container": "#000000",
    "surface-container-high": "#141414",
    "surface-container-highest": "#1F1F1F",
    "surface-variant": "#000000",
    "on-surface-variant": "#FFFFFF",
    "outline": "#FFFFFF",
    "outline-variant": "#FFFFFF",
    "inverse-surface": "#FFFFFF",
    "inverse-on-surface": "#000000",
    "inverse-primary": "#000000",
    "surface-tint": "#FFFFFF",
    "scrim": "#000000",
    "shadow": "#000000",
};

/** By name, for a consumer that resolves a scheme at runtime rather than importing one. */
export const COLOR_SCHEMES: Readonly<Record<SchemeName, ColorScheme>> = {
    dark: DARK_SCHEME,
    light: LIGHT_SCHEME,
    contrast: CONTRAST_SCHEME,
};

/** Every role name, in declaration order. */
export const COLOR_ROLES: readonly ColorRole[] = Object.keys(DARK_SCHEME) as ColorRole[];

/**
 * A scheme as CSS custom properties, for a consumer that cannot use Vuetify's theme system.
 *
 * The prefix is the caller's, because the viewer's shell already namespaces its properties `--bm-`
 * and renaming them would be a breaking change to a published stylesheet for no gain at all.
 */
export function schemeToCustomProperties(scheme: ColorScheme, prefix = "--bm"): string {
    return COLOR_ROLES.map((role) => `${prefix}-${role}:${scheme[role]};`).join("");
}


