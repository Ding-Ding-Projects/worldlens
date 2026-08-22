/**
 * Compatibility re-export for consumers that historically obtained the WorldLens
 * color contract from `@worldlens/shared`. The canonical reusable definitions now
 * live in the publishable design-system package.
 */
export {
    COLOR_ROLES,
    COLOR_SCHEMES,
    CONTRAST_SCHEME,
    DARK_SCHEME,
    LIGHT_SCHEME,
    schemeToCustomProperties,
} from "@worldlens/design-system/colors";
export type { ColorRole, ColorScheme, SchemeName } from "@worldlens/design-system/colors";
