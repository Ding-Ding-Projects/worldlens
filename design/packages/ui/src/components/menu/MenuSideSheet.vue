<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mdiArrowLeft, mdiClose } from "@mdi/js";
import {
    VBtn,
    VDivider,
    VIcon,
    VNavigationDrawer,
    VToolbar,
    VToolbarTitle,
    VTooltip,
} from "vuetify/components";

/**
 * MD3 replacement for upstream `Menu/SideMenu.vue`: the sliding panel the whole menu lives
 * in. Upstream hand-rolled a fixed 20em panel with a fading `<Transition>`; this is a
 * Vuetify side sheet with the same geometry and the same two controls.
 *
 * The leading button is back/close exactly as upstream's morphing hamburger was: at the
 * bottom of the page stack it closes the sheet, deeper in it goes up one page. The trailing
 * close-everything button only appears when there is somewhere to go back to.
 *
 * Upstream's hamburger-to-X morph (the double `$nextTick` dance) is gone deliberately: the
 * sheet covers the control bar's own menu button while open, so there is exactly one button
 * at that position and nothing to morph between.
 *
 * The `<style>` block at the foot of this file is also where the whole menu's row language
 * is stated, rather than in each of the eight components that draw one. See the comment
 * above that section for why the drawer is the right place for it.
 */
withDefaults(
    defineProps<{
        title: string;
        open: boolean;
        /** True when the page stack is deeper than one page. */
        back?: boolean;
    }>(),
    { back: false },
);

const emit = defineEmits<{ back: []; close: [] }>();

const { t } = useI18n();
</script>

<template>
    <v-navigation-drawer
        class="mb-side-sheet"
        :model-value="open"
        :scrim="false"
        location="left"
        width="340"
        temporary
        :aria-label="title"
        @keydown.esc="emit('back')"
        @update:model-value="(value: boolean) => !value && emit('close')"
    >
        <template #prepend>
            <v-toolbar class="mb-side-sheet__bar" density="comfortable" flat color="surface">
                <template #prepend>
                    <v-btn
                        icon
                        :aria-label="
                            back ? t('menu.back', 'Back') : t('menu.close', 'Close the menu')
                        "
                        variant="text"
                        @click="emit('back')"
                    >
                        <!-- The icon goes in the default slot: `icon="<path>"` and slot
                             content are mutually exclusive in VBtn, and the tooltip needs
                             to be a child for `activator="parent"`. -->
                        <v-icon :icon="back ? mdiArrowLeft : mdiClose" />
                        <v-tooltip
                            activator="parent"
                            location="bottom"
                            :text="back ? t('menu.back', 'Back') : t('menu.close', 'Close the menu')"
                        />
                    </v-btn>
                </template>

                <v-toolbar-title class="mb-side-sheet__title">{{ title }}</v-toolbar-title>

                <template #append>
                    <v-btn
                        v-if="back"
                        icon
                        :aria-label="t('menu.close', 'Close the menu')"
                        variant="text"
                        @click="emit('close')"
                    >
                        <v-icon :icon="mdiClose" />
                        <v-tooltip
                            activator="parent"
                            location="bottom"
                            :text="t('menu.close', 'Close the menu')"
                        />
                    </v-btn>
                    <!--
                        The spacer that used to sit here balanced a centred title against the
                        leading button. The title is start-aligned now, as M3's modal drawer
                        headline and the prototype's own header both are, so there is nothing
                        left to balance and an empty 48px reservation would only shorten the
                        line a long bilingual title has to wrap in.
                    -->
                </template>
            </v-toolbar>
            <v-divider class="mb-side-sheet__rule" />
        </template>

        <slot />
    </v-navigation-drawer>
</template>

<style>
/* ===========================================================================
 * The sheet.
 *
 * `Worldlens.dc.html` draws this exact surface - search it for "Map menu" - and every
 * measurement below is read off that markup rather than chosen here. Its own numbers, with
 * the M3 token each one resolves to:
 *
 *   width                340px          (was 320)
 *   container            #101418        the `surface` role, opaque, over the map
 *   trailing hairline    #42474E        the `outline-variant` role
 *   header               14px 12px 14px 16px, title 16px/500
 *   search block         12px, field 44px tall at radius 12px
 *   row                  50px tall, radius 12px, 14px gap, 12px inline padding
 *   row label / meta     14px / 12px
 *
 * Two of those are deliberately not copied verbatim, and both are named where they are
 * spent below: the row height (50px is off the 4dp rhythm) and the 36px header button (below
 * this project's own 40px floor for a hit target).
 * ------------------------------------------------------------------------- */
.mb-side-sheet.v-navigation-drawer {
    /*
     * Above the floating control bar and above DockedSurface.vue's `.mb-docked` (z-index
     * 1500), below Vuetify's overlay stack (menus, dialogs).
     *
     * A docked surface (e.g. Settings) can be persisted by the user to the left edge, the
     * same edge this temporary drawer opens on, and nothing closes one when the other
     * opens. A tied z-index left whichever painted last on top by accident, so this is
     * pinned explicitly above the docked panel's band: while the main menu is open it
     * fully covers and out-stacks a same-edge docked surface, rather than the two
     * colliding at an accident of paint order. Coordinate any change to either value with
     * the other file.
     */
    z-index: 1600 !important;
    max-width: 100vw;
    pointer-events: auto;

    /*
     * Opaque, and stated rather than inherited. This drawer is the one panel in the app
     * that opens over a live terrain render, and a translucent surface there puts a map
     * behind a paragraph - the defect the notification toast already had to be fixed for.
     * `surface` is the role the prototype's #101418 is, so this is the prototype's own
     * container written as a role rather than as its dark-theme hex.
     */
    background: rgb(var(--v-theme-surface));

    /*
     * Vuetify draws the trailing edge at `--v-border-opacity` (0.12) of the border colour,
     * which over a bright map render is not a visible edge at all. `outline-variant` at full
     * strength is both the prototype's #42474E and the hairline every other surface in the
     * application already separates itself with.
     */
    border-inline-end: 1px solid rgb(var(--v-theme-outline-variant));

    /*
     * M3's modal navigation drawer is square on the edge it is anchored to and 16dp on the
     * edge that faces the content - the shape is what says which way the panel came from.
     * `corner-lg` is that 16dp step. `overflow: hidden` is what makes it visible: Vuetify
     * sets no overflow on the drawer root, so the toolbar's own opaque surface would
     * otherwise paint a square corner straight over the rounded one. The scrolling region is
     * `.v-navigation-drawer__content`, which keeps its own overflow, so nothing here costs
     * the sheet its scroll.
     */
    border-start-end-radius: var(--md-sys-shape-corner-lg);
    border-end-end-radius: var(--md-sys-shape-corner-lg);
    overflow: hidden;

    /*
     * The prototype's `4px 0 24px rgba(0,0,0,0.6)` as the token it approximates. M3 puts a
     * modal navigation drawer at elevation level 1, and the ladder in `md3.scss` is tinted
     * from the theme's own `shadow` role, so the contrast theme is not quietly handed the
     * light theme's soft grey haze. The separation this surface actually relies on is the
     * tonal one above - an opaque container against a hairline - with the shadow doing what
     * a shadow is for in M3, which is saying which of two surfaces is nearer.
     */
    box-shadow: var(--md-sys-elevation-shadow-level1);
}

/* ---------------------------------------------------------------------------
 * The header.
 * ------------------------------------------------------------------------- */

/*
 * Vuetify's toolbar fixes `.v-toolbar__content`'s height from its density prop, so a min-
 * height alone would never be read. `height: auto` hands the box back to its content, which
 * is what lets a long bilingual title wrap instead of being clipped to one line, and the
 * min-height then holds the prototype's 14px/16px/14px header at its stated size when the
 * title is short.
 */
.mb-side-sheet .mb-side-sheet__bar .v-toolbar__content {
    height: auto;
    min-height: 64px;
    padding-inline: 16px 8px;
}

.mb-side-sheet .mb-side-sheet__title {
    /*
     * M3's title-medium ramp, which is 16px/500 - the prototype's header size exactly, and
     * a real step above the 14px/500 a row title uses rather than the point-and-a-half
     * apart the two used to be. Start-aligned: a centred title in a drawer whose content is
     * all start-aligned reads as a different component's header.
     */
    font-size: var(--md-sys-typescale-title-medium-size);
    line-height: var(--md-sys-typescale-title-medium-line-height);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking);
    text-align: start;
    overflow-wrap: anywhere;
    white-space: normal;
}

/*
 * Three deep, like nearly every rule in this file: `prototypeSurface.scss` also has an
 * opinion about `.v-divider` at two classes and is imported later, so a two-class rule here
 * would tie and lose. The two happen to agree on the colour today, which is exactly what
 * makes a tie dangerous - it would look correct right up until one of them changed.
 */
.v-application .mb-side-sheet .mb-side-sheet__rule {
    border-color: rgb(var(--v-theme-outline-variant));
    opacity: 1;
}

/*
 * The prototype's header control is 36px square. This project's own floor for a hit target
 * is 40x40, and a 4px difference on the one control that closes the panel is not worth
 * winning, so the tile is drawn at 40 and stays fully round - M3 marks an icon button's
 * shape with `corner-full`, and `prototypeSurface.scss` already gives `.v-btn` that pill.
 */
.mb-side-sheet .mb-side-sheet__bar .v-btn--icon {
    inline-size: 40px;
    block-size: 40px;
}

/* ---------------------------------------------------------------------------
 * The scrolling body.
 *
 * The prototype insets its rows 8px from the sheet edge and pads the last of them 12px off
 * the bottom, so a row's own 12px inline padding puts its label 20px in - a hair short of
 * the header's 16px plus the icon it does not have.
 * ------------------------------------------------------------------------- */
.mb-side-sheet .v-navigation-drawer__content {
    overscroll-behavior: contain;
    padding: 8px 8px 16px;
}

/* ===========================================================================
 * The row language, stated once for the whole menu.
 *
 * ## Why it is here and not in the eight components that draw a row
 *
 * `MenuOption`, `MenuOptionList`, `MenuSwitch`, `MenuSlider`, `MapsMenu` and the marker list
 * the sheet hosts through its slot all render a `v-list-item`, and each of them used to
 * state its own height, its own corner and its own idea of what a selected row looks like -
 * 48px here, 44px there, `rounded="lg"` on two of them and nothing on a third. Five opinions
 * about one row is how the drawer ended up reading as five components sharing a panel. The
 * sheet is the surface they all sit on, so it is the surface that decides.
 *
 * ## Why every selector is three deep
 *
 * This drawer is inside `.mb-shell-layer--map`, so `prototypeSurface.scss` reaches it - and
 * that sheet turns a `v-list-item` into the prototype's *card row*: a 14px corner, 15px 18px
 * of padding, an opaque `surface-container` fill, a 1px outline and a 10px gap to the next
 * one. That is right for a project row on a 900px page and wrong for a settings switch in a
 * 340px drawer, where twenty bordered cards stacked one per toggle is what a Material 2
 * settings screen looked like. Both selectors would otherwise be two classes deep, and
 * `main.ts` imports `App.vue` (and with it every component's style block) *before* it
 * imports `prototypeSurface.scss`, so on a tie that sheet wins and nothing written here
 * would take effect. Three deep is what makes these rules decisive rather than hopeful.
 * ------------------------------------------------------------------------- */
.v-application .mb-side-sheet .v-list {
    background: transparent;
    padding: 0;

    /*
     * Vuetify ships `.v-navigation-drawer .v-list { overflow: hidden }`, which is a clip box
     * exactly the width of the rows inside it - and an ancestor with a hidden overflow clips a
     * descendant's `outline`, not only its box. `global.scss` draws every focus ring in the
     * application as a 2px outline at a 2px offset, so that one declaration was taking the
     * left and right edges off the focus ring of every row in this drawer. The scroll that
     * rule looks like it is for lives on `.v-navigation-drawer__content`, which keeps its own
     * overflow, so releasing it here costs nothing and restores the ring.
     */
    overflow: visible;
}

.v-application .mb-side-sheet .v-list-item {
    /*
     * The prototype's 12px row corner, which is `corner-md` on the M3 scale exactly. Set
     * here rather than through Vuetify's `rounded` prop: `global.scss` re-points the
     * `.rounded-*` utilities at the token scale but they are still `!important`, so a row
     * carrying `rounded="lg"` could never be corrected from a stylesheet - the prop was the
     * only place the value lived, which is precisely the second-opinion problem this block
     * exists to end.
     */
    border-radius: var(--md-sys-shape-corner-md);

    /*
     * The card treatment, undone. A menu row in the prototype is a *state layer over the
     * sheet*, not a container of its own: transparent at rest, tinted on hover, focus and
     * press. Vuetify paints those tints through `.v-list-item__overlay` at the four
     * opacities `global.scss` has already re-pointed to M3's 8/10/10/16, so removing the
     * opaque fill is all that is needed for the state layers to become visible again -
     * they were being painted over a solid `surface-container` the whole time.
     */
    background: transparent;
    border: none;
    margin-block-end: 0;

    /*
     * 48px is M3's one-line list item and the floor every row in the drawer starts from -
     * the settings page is twenty of them in a 340px sheet, and a taller default would cost
     * a scroll for nothing. `MenuOption` raises its own to 56px, which is M3's
     * navigation-drawer item and the nearest step on the 4dp rhythm to the prototype's 50px;
     * that is stated in `MenuOption.vue`, where those rows are actually drawn.
     */
    min-block-size: 48px;
    padding: 4px 12px;
}

/*
 * Selection, M3's way: a filled container in the secondary role plus the row's own shape,
 * rather than a border or a heavier weight. Vuetify marks an active list item by tinting
 * `--v-theme-overlay-multiplier` worth of the item's own colour over it, which on a
 * transparent row reads as a slightly darker patch and is easy to miss entirely at a glance
 * down a list of four themes. `secondary-container` is what M3's navigation drawer and its
 * lists actually use for the chosen item, and it survives the contrast theme because both
 * halves of the pair move together.
 *
 * The overlay is zeroed rather than left to stack: a state tint on top of the container tint
 * would make the selected row change colour on hover in a way no other row does.
 */
.v-application .mb-side-sheet .v-list-item--active {
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.v-application .mb-side-sheet .v-list-item--active > .v-list-item__overlay {
    opacity: 0;
}

/*
 * A selected row still has to answer hover and focus, or it stops looking interactive the
 * moment it is chosen. The state layer goes over `on-secondary-container` - the role the
 * row's own content is drawn in - which is what M3 means by a state layer being tinted from
 * the content colour rather than from a fixed grey.
 */
.v-application .mb-side-sheet .v-list-item--active:hover > .v-list-item__overlay {
    opacity: var(--md-sys-state-hover-opacity);
    background: rgb(var(--v-theme-on-secondary-container));
}

.v-application .mb-side-sheet .v-list-item--active:focus-visible > .v-list-item__overlay {
    opacity: var(--md-sys-state-focus-opacity);
    background: rgb(var(--v-theme-on-secondary-container));
}

/*
 * The row's two type ramps, a real step apart. A title at label-large (14px/500) over
 * supporting text at body-small (12px/400) is the contrast the prototype draws; Vuetify's
 * own list ships them at 1rem and 0.875rem with the subtitle only distinguished by an
 * opacity, which at this size is three sizes within a point and a half of each other.
 */
.v-application .mb-side-sheet .v-list-item-title {
    font-size: var(--md-sys-typescale-label-large-size);
    line-height: var(--md-sys-typescale-label-large-line-height);
    font-weight: var(--md-sys-typescale-label-large-weight);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    /* Bilingual mode puts two languages in one label; neither may be clipped. */
    white-space: normal;
    overflow-wrap: anywhere;
}

.v-application .mb-side-sheet .v-list-item-subtitle {
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
    opacity: 1;
    color: rgb(var(--v-theme-on-surface-variant));
    white-space: normal;
    overflow-wrap: anywhere;
}

/*
 * The gap between a row's leading icon and its label. The prototype's is 14px; Vuetify's
 * `--v-list-item-prepend-space`/`__spacer` arithmetic is Material 2's 32px, which on a 340px
 * sheet pushes every label a third of the way across the panel.
 */
.v-application .mb-side-sheet .v-list-item__prepend > .v-icon ~ .v-list-item__spacer {
    inline-size: 14px;
}

.v-application .mb-side-sheet .v-list-item__append > .v-list-item__spacer {
    inline-size: 8px;
}

/* ---------------------------------------------------------------------------
 * Motion.
 *
 * The drawer's own slide is already tokenised: `global.scss` re-points
 * `#app .v-navigation-drawer` at `medium2` on the emphasized-decelerate curve, which is the
 * M3 shape for a surface arriving. What is left is the tint a row paints on itself, which
 * Vuetify leaves at its own 0.2s standard curve.
 * ------------------------------------------------------------------------- */
.v-application .mb-side-sheet .v-list-item__overlay {
    transition-duration: var(--md-sys-motion-duration-short4);
    transition-timing-function: var(--md-sys-motion-easing-standard);
}

/*
 * `global.scss`'s kill switch already zeroes every duration under `#app`, and this drawer is
 * under `#app`. It is restated here for the same reason the sheet states its own opacity:
 * this is the one panel that opens over a moving render, and a slide that survives a
 * reduced-motion preference here is the most noticeable place it could survive.
 */
@media (prefers-reduced-motion: reduce) {
    .mb-side-sheet.v-navigation-drawer,
    .mb-side-sheet .v-navigation-drawer__content,
    .v-application .mb-side-sheet .v-list-item__overlay {
        transition-duration: 0.01ms !important;
    }
}
</style>
