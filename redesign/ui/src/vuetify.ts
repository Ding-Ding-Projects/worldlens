import "vuetify/styles";
import { createVuetify } from "vuetify";
import type { ThemeDefinition } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { md3 } from "vuetify/blueprints";
import { CONTRAST_SCHEME, DARK_SCHEME, LIGHT_SCHEME } from "@worldlens/shared";
import { aliases, mdi } from "vuetify/iconsets/mdi-svg";

/**
 * MD3 token bridge: these palettes drive Vuetify AND are exported as CSS custom
 * properties (--v-theme-*, mapped onto --md-sys-color-* in styles/markers.scss) so the
 * viewer's raw-DOM marker elements can share the theme. Three themes preserve upstream's
 * dark/light/contrast.
 *
 * ## The complete Material Design 3 colour system, not five colours and a guess
 *
 * Each theme used to name five colours and let Vuetify's own grey defaults answer for
 * every other role - so `surface-variant`, `outline` and the container tiers came from
 * Vuetify's reference palette rather than from this product's, and every surface that
 * asked for an M3 role it could not find approximated one. The schemes below are the
 * full M3 role set, generated from the tonal palettes of the blue seed the app has
 * always used (#00639B is that palette's tone 40, #8FCDFF its tone 80 - the two values
 * that were already here). Nothing that was shipping changed hue; the other thirty roles
 * now come from the same family instead of from a neutral guess.
 *
 * Tone recipe, per the M3 spec: light schemes take primary/secondary/tertiary at tone
 * 40 on containers at 90, dark schemes tone 80 on containers at 30; neutral surfaces run
 * N99..N10 in light and N6..N90 in dark, with the container ladder
 * (lowest/low/default/high/highest) as the spec's five surface steps; `outline` is NV50
 * against `outline-variant` NV80 (light) / NV30 (dark); error is the spec's own red
 * ramp, unchanged.
 *
 * ## The contrast theme is deliberate, not tonal
 *
 * It answers the same role names with the highest-contrast values that keep their
 * meaning: black surfaces at every tier, white text and outlines, white primary, yellow
 * secondary, and the error red on black. Deriving it from a seed would defeat the one
 * thing it exists for.
 */
/*
 * The three schemes are `@worldlens/shared`'s now, not this file's.
 *
 * They lived here, and the served viewer's framework-neutral shell carried a miniature vocabulary
 * of its own beside them - six roles, hand-picked, in entirely different hex values. The same
 * product looked like two products depending on whether you opened it or visited it, and nothing
 * could have caught it because there was nothing to compare against.
 *
 * `colorRoles.ts` is plain data with no framework import at all, which is exactly what lets a
 * Vuetify theme and a shell that must never import Vuetify read the same values.
 * `materialShell.tokenIdentity.test.ts` fails if they ever stop agreeing.
 *
 * What stays here is the one thing that is genuinely Vuetify's: which schemes are dark.
 */
const darkScheme: ThemeDefinition = { dark: true, colors: { ...DARK_SCHEME } };


const lightScheme: ThemeDefinition = { dark: false, colors: { ...LIGHT_SCHEME } };


/*
 * `dark: true` and deliberately not tonal. Contrast answers the same role names with the
 * highest-contrast values that keep their meaning; deriving it from the blue seed the other two
 * share would produce a scheme that is merely darker, which defeats the one thing it exists for.
 */
const contrastScheme: ThemeDefinition = { dark: true, colors: { ...CONTRAST_SCHEME } };


/** The three schemes, exported for the completeness test rather than re-parsed from CSS. */
export const THEME_SCHEMES: Readonly<Record<"dark" | "light" | "contrast", ThemeDefinition>> = {
    dark: darkScheme,
    light: lightScheme,
    contrast: contrastScheme,
};

/**
 * One shape language, declared once, reaching every screen.
 *
 * The app is built from Vuetify components, so the fastest honest way to change how it looks
 * is to change what those components default to - not to edit forty component files, each of
 * which then owns its own opinion about what a rounded card is. This object is that single
 * lever, and the intent behind it is MD3 Expressive: generous corners, pressable things fully
 * rounded, overlays the most generous of all.
 *
 * The values are Vuetify's `rounded` vocabulary; `styles/global.scss` re-points that
 * vocabulary at the M3 corner scale in `styles/md3.scss`, so `"lg"` here means M3's 16px
 * rather than Vuetify's 8px and `"xl"` means 28px rather than 24px. Both halves are needed:
 * without the defaults nothing asks for the shape, without the remap the shape is Material 2.
 *
 * `createVuetify` does `mergeDeep(blueprint, options)`, so this merges over the md3
 * blueprint rather than replacing it - everything the blueprint sets and this does not
 * mention (the outlined field variants, the date picker's geometry, `VList`'s prepend gap)
 * survives untouched.
 *
 * Three things worth knowing about the entries below:
 *
 * - `VDialog` and `VMenu` take no `rounded` prop of their own; an overlay's visible corner is
 *   the corner of the card, sheet or list *inside* it. So they are expressed as nested
 *   defaults, which Vuetify provides down the component tree (the same mechanism the
 *   blueprint's own `VBtnGroup: { VBtn: ... }` uses) and which follows the component
 *   hierarchy through the overlay's teleport rather than the DOM.
 * - `VSelect`, `VAutocomplete`, `VCombobox` and `VFileInput` all render a `VTextField`
 *   internally and pass their own field props through with `undefined` where nothing was
 *   set - and Vuetify's defaults treat an explicit `undefined` as "not provided" - so the
 *   one `VTextField` entry reaches all of them.
 * - `"md"` is not in Vuetify's radius scale at all. `useRounded` builds the class name from
 *   the prop value, and `global.scss` defines `.rounded-md`, so the 12px step the M3 scale
 *   has and Vuetify's does not is available to fields here.
 */
export const COMPONENT_DEFAULTS = {
    /* Things you press are fully round. This is the single loudest signal of the new look,
       and M3 Expressive is unambiguous about it. `VBtnGroup` re-states the blueprint's own
       `VBtn: { rounded: null }` so the segments inside a group stay square against each
       other and only the group's outer edge is a pill. */
    VBtn: { rounded: "pill" },
    VBtnGroup: { rounded: "pill", VBtn: { rounded: null } },
    VChip: { rounded: "pill" },

    /* Containers: the M3 large corner. The blueprint already said `"lg"` for cards; it is
       restated rather than inherited so the shape of a card is declared in the file that
       decides shape, and so a test can hold it there. */
    VCard: { rounded: "lg" },
    VSheet: { rounded: "lg" },
    VAlert: { rounded: "lg" },
    VBanner: { rounded: "lg" },
    VSnackbar: { rounded: "lg" },
    VExpansionPanel: { rounded: "lg" },
    VList: { rounded: "lg" },
    VListItem: { rounded: "lg" },

    /* Overlays get the extra-large corner: a dialog or a menu is the surface furthest from
       the page and should read that way. Expressed through what they actually contain. */
    VDialog: { VCard: { rounded: "xl" }, VSheet: { rounded: "xl" }, VList: { rounded: "xl" } },
    VMenu: { VCard: { rounded: "xl" }, VSheet: { rounded: "xl" }, VList: { rounded: "xl" } },

    /* Fields sit one step tighter than their container, which is what keeps a form inside a
       card from looking like a stack of pills. */
    VTextField: { rounded: "md" },
    VTextarea: { rounded: "md" },
} as const;

export const vuetify = createVuetify({
    blueprint: md3,
    defaults: COMPONENT_DEFAULTS,
    // `createVuetify` registers NOTHING by itself: it only calls app.component() for what it
    // is handed here. Without this the whole UI compiled down to resolveComponent("v-app-bar")
    // calls that resolved to nothing, so every Vuetify tag rendered as an unknown inline HTML
    // element with no layout, no z-index and no surface -- and the fixed map canvas painted
    // straight over it. Importing the component modules is also what pulls each component's
    // stylesheet in; `vuetify/styles` alone carries none of it.
    components,
    directives,
    icons: {
        defaultSet: "mdi",
        aliases,
        sets: { mdi },
    },
    theme: {
        defaultTheme: "dark",
        themes: {
            dark: darkScheme,
            light: lightScheme,
            contrast: contrastScheme,
        },
    },
});
