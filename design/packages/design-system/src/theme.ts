import "vuetify/styles";
import { createVuetify } from "vuetify";
import type { ThemeDefinition } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { md3 } from "vuetify/blueprints";
import { aliases, mdi } from "vuetify/iconsets/mdi-svg";
import { CONTRAST_SCHEME, DARK_SCHEME, LIGHT_SCHEME } from "./colors.js";

export const WORLDLENS_THEME_NAMES = ["dark", "light", "contrast"] as const;
export type WorldLensThemeName = (typeof WORLDLENS_THEME_NAMES)[number];

export const WORLDLENS_THEMES: Readonly<Record<WorldLensThemeName, ThemeDefinition>> = {
    dark: { dark: true, colors: { ...DARK_SCHEME } },
    light: { dark: false, colors: { ...LIGHT_SCHEME } },
    contrast: { dark: true, colors: { ...CONTRAST_SCHEME } },
};

/**
 * WorldLens component anatomy in one reusable contract. The radius names are
 * resolved by `tokens.css` and the consuming surface's utility bridge.
 */
export const WORLDLENS_COMPONENT_DEFAULTS = {
    VBtn: { rounded: "pill" },
    VBtnGroup: { rounded: "pill", VBtn: { rounded: null } },
    VChip: { rounded: "pill" },
    VCard: { rounded: "lg" },
    VSheet: { rounded: "lg" },
    VAlert: { rounded: "lg" },
    VBanner: { rounded: "lg" },
    VSnackbar: { rounded: "lg" },
    VExpansionPanel: { rounded: "lg" },
    VList: { rounded: "lg" },
    VListItem: { rounded: "lg" },
    VDialog: { VCard: { rounded: "xl" }, VSheet: { rounded: "xl" }, VList: { rounded: "xl" } },
    VMenu: { VCard: { rounded: "xl" }, VSheet: { rounded: "xl" }, VList: { rounded: "xl" } },
    VTextField: { rounded: "md" },
    VTextarea: { rounded: "md" },
} as const;

export interface CreateWorldLensDesignSystemOptions {
    /** Initial theme name. Defaults to WorldLens dark. */
    defaultTheme?: string;
    /** Additional product themes, such as a mode-specific presentation scheme. */
    themes?: Readonly<Record<string, ThemeDefinition>>;
}

/**
 * Creates a complete Vuetify plugin with the WorldLens blueprint, theme roles,
 * component defaults, directives, and SVG icon set. Product behavior stays in
 * the consumer; this function owns only reusable visual-system configuration.
 */
export function createWorldLensDesignSystem(
    options: CreateWorldLensDesignSystemOptions = {},
): ReturnType<typeof createVuetify> {
    const additionalThemes = options.themes ?? {};
    return createVuetify({
        blueprint: md3,
        defaults: WORLDLENS_COMPONENT_DEFAULTS,
        components,
        directives,
        icons: {
            defaultSet: "mdi",
            aliases,
            sets: { mdi },
        },
        theme: {
            defaultTheme: options.defaultTheme ?? "dark",
            themes: {
                ...WORLDLENS_THEMES,
                ...additionalThemes,
            },
        },
    });
}

