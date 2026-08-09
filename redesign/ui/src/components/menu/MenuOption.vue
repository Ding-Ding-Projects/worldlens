<script setup lang="ts">
import { mdiChevronRight } from "@mdi/js";
import { VIcon, VListItem, VListItemTitle, VTooltip } from "vuetify/components";

/**
 * MD3 replacement for upstream `Menu/SimpleButton.vue`: a menu row with an optional
 * "opens a submenu" chevron.
 *
 * Upstream's version was a bare `<div>` with a click handler: no role, no tabindex, no
 * keyboard path. `v-list-item` gives a real focusable row with Enter/Space activation and
 * MD3 state layers, and upstream's native `title` attribute becomes a `v-tooltip` that is
 * announced rather than only hovered.
 */
withDefaults(
    defineProps<{
        /** Renders the trailing chevron: this row opens another page. */
        submenu?: boolean;
        /** Radio-style highlight (upstream used `active` for theme/resolution rows). */
        active?: boolean;
        disabled?: boolean;
        /** Supplementary description, e.g. upstream's `updateMap.tooltip`. */
        tooltip?: string;
        /**
         * Leading glyph, as an `@mdi/js` path.
         *
         * The prototype draws every row of this menu with one, and a column of icons is what
         * makes a list of eight commands scannable rather than eight lines of prose. It is
         * decoration in the strict sense - `aria-hidden`, never the only thing distinguishing
         * two rows, and a row without one simply has none rather than reserving the space.
         */
        icon?: string;
    }>(),
    { submenu: false, active: false, disabled: false, tooltip: "", icon: "" },
);

const emit = defineEmits<{ action: [] }>();
</script>

<template>
    <v-list-item
        class="mb-menu-option"
        :active="active === true"
        :disabled="disabled === true"
        @click="emit('action')"
    >
        <template v-if="icon" #prepend>
            <v-icon class="mb-menu-option__icon" :icon="icon" aria-hidden="true" />
        </template>
        <v-list-item-title class="mb-menu-option__label">
            <slot />
        </v-list-item-title>
        <template v-if="submenu" #append>
            <v-icon
                class="mb-menu-option__chevron"
                :icon="mdiChevronRight"
                size="small"
                aria-hidden="true"
            />
        </template>
        <v-tooltip v-if="tooltip" activator="parent" location="end" :text="tooltip" />
    </v-list-item>
</template>

<style>
/*
 * Shape, tint, selection, the two type ramps and the prepend gap are all stated once for the
 * whole drawer in `MenuSideSheet.vue`; see the long comment over that block for why a row's
 * appearance is the sheet's business rather than each row component's. What is left here is
 * only what is true of *this* row and not of a settings switch beside it.
 */

/*
 * M3's navigation-drawer item, which is the nearest step on the 4dp rhythm to the
 * prototype's 50px row. The root menu is eight commands rather than the settings page's
 * twenty, so it can afford the taller step - and these are the rows a person aims at with a
 * mouse over a map they are also dragging.
 *
 * Written through the sheet rather than as `.mb-menu-option.v-list-item`, which was the first
 * attempt and rendered at 48px. `prototypeSurface.scss` sets `min-block-size: 0` on
 * `.mb-shell-layer .v-list-item` at the same two classes of specificity, and it is imported
 * *after* every component's style block, so on a tie it wins - the rule was there, was
 * correct, and did nothing. Verified against the built stylesheet rather than reasoned about:
 * the component rules land around byte 378k and that sheet around 804k.
 */
.v-application .mb-side-sheet .mb-menu-option.v-list-item {
    min-block-size: 56px;
}

/*
 * 21px in the prototype, drawn in `on-surface-variant` so the glyph column reads as
 * supporting the labels rather than competing with them. Not `primary`: eight primary-
 * coloured icons in a 340px sheet is a column of highlights with nothing highlighted.
 *
 * `opacity: 1` because Vuetify dims every prepend and append icon in a list to
 * `--v-medium-emphasis-opacity`, which is 0.6 - so a role chosen to be one step quieter
 * arrives quieter again, twice over, and the emphasis is then decided by an opacity rather
 * than by the colour role. Which of the two is deciding matters: an opacity is invisible to
 * the contrast theme, where every role is answered at maximum and 60% of it is not.
 */
.mb-menu-option .mb-menu-option__icon {
    font-size: 21px;
    color: rgb(var(--v-theme-on-surface-variant));
    opacity: 1;
}

/*
 * A chevron is a hint about what pressing the row does, not a second label, so it sits a
 * step quieter than the icon that identifies it - by role, again, and not by opacity.
 */
.mb-menu-option .mb-menu-option__chevron {
    color: rgb(var(--v-theme-outline));
    opacity: 1;
}

/*
 * The selected row draws its content in `on-secondary-container` (see the sheet's rule), and
 * an icon that kept `on-surface-variant` there would be the one part of the row that did not
 * follow the selection. `currentColor` is what makes the whole row move as one.
 */
.mb-menu-option.v-list-item--active .mb-menu-option__icon,
.mb-menu-option.v-list-item--active .mb-menu-option__chevron {
    color: currentColor;
}

.mb-menu-option__label {
    white-space: normal;
    overflow-wrap: anywhere;
}
</style>
