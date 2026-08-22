import type { ThemeDefinition } from "vuetify";
import {
    WORLDLENS_COMPONENT_DEFAULTS,
    WORLDLENS_THEMES,
    createWorldLensDesignSystem,
} from "@worldlens/design-system/theme";
import { KID_SCHEME } from "./kid/kidTheme.js";

const kidScheme: ThemeDefinition = { dark: false, colors: { ...KID_SCHEME } };

/**
 * The product adds its kid presentation scheme to the reusable WorldLens
 * design-system themes. No product mode or behavior leaks into the package.
 */
export const THEME_SCHEMES: Readonly<
    Record<"dark" | "light" | "contrast" | "kid", ThemeDefinition>
> = {
    ...WORLDLENS_THEMES,
    kid: kidScheme,
};

/** Compatibility name retained for existing WorldLens UI consumers. */
export const COMPONENT_DEFAULTS = WORLDLENS_COMPONENT_DEFAULTS;

/** The WorldLens Vuetify bootstrap now consumes the reusable package directly. */
export const vuetify = createWorldLensDesignSystem({
    defaultTheme: "dark",
    themes: { kid: kidScheme },
});
