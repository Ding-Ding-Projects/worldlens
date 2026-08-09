<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mdiMagnify } from "@mdi/js";
import { VBtn, VExpandTransition, VTooltip } from "vuetify/components";
import MenuSearchField from "./MenuSearchField.vue";
import type { MenuSearchState } from "./menuPrefs";

/**
 * Collapsible search bar for a menu page.
 *
 * It starts collapsed and remembers that choice, so a three-map server does not spend a
 * third of a 600px-tall sheet on a filter nobody needs. The toggle states plainly when a
 * filter is currently hiding rows, because a collapsed bar that is quietly excluding
 * results is how a user concludes the data is missing.
 */
defineProps<{
    /** Shared reactive state (see `useMenuSearch`). */
    state: MenuSearchState;
    label: string;
    placeholder?: string;
    /** Real corpus for the regex builder preview, one candidate per line. */
    sample?: string;
    /** Honest "showing X of Y" summary, rendered when the filter is doing something. */
    summary?: string;
}>();

const { t } = useI18n();
</script>

<template>
    <div class="mb-menu-searchbar">
        <div class="mb-menu-searchbar__head">
            <v-btn
                :prepend-icon="mdiMagnify"
                :aria-expanded="state.open ? 'true' : 'false'"
                :active="state.open"
                variant="text"
                size="small"
                density="comfortable"
                @click="state.open = !state.open"
            >
                {{ label }}
                <v-tooltip
                    activator="parent"
                    location="bottom"
                    :text="t('search.tooltip', 'Show or hide the search field')"
                />
            </v-btn>
            <span v-if="summary" class="mb-menu-searchbar__summary">{{ summary }}</span>
        </div>

        <v-expand-transition>
            <MenuSearchField
                v-if="state.open"
                v-model="state.query"
                v-model:regex="state.regex"
                v-model:flags="state.flags"
                :placeholder="placeholder ?? ''"
                :sample="sample ?? ''"
                :label="label"
            />
        </v-expand-transition>
    </div>
</template>

<style>
.mb-menu-searchbar__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    /* Lines the toggle's own text up with the rows below it once its 8px of button padding
       is taken off the drawer's 12px row inset. */
    padding: 4px 12px 0;
}

/*
 * The toggle is a text button and therefore has no container of its own, which makes its
 * label the only thing deciding where the eye starts - so it takes the same label-large ramp
 * a row title does, and `prototypeSurface.scss` has already taken Vuetify's Material 2
 * upper-casing off it. 40px is this project's floor for a target; `size="small"` alone would
 * leave it at 34px, which prototypeSurface deliberately allows for a dense toolbar and which
 * this is not.
 */
.mb-menu-searchbar .mb-menu-searchbar__head .v-btn {
    /*
     * Three classes deep, not two. `prototypeSurface.scss` gives `.mb-shell-layer
     * .v-btn--size-small` a 34px floor and a 13px label - deliberately, for the dense
     * toolbars it was written for - and it is imported after every component's style block,
     * so a two-class rule here would tie and lose. This toggle is not in a dense toolbar; it
     * is the control that reveals the filter on a 340px sheet, and 34px is under this
     * project's own 40x40 minimum for something to aim at.
     */
    min-block-size: 40px;
    font-size: var(--md-sys-typescale-label-large-size);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
}

/*
 * "9 of 60" is the honest count of what the filter is currently hiding, and it sits beside a
 * collapsed bar precisely so a person cannot conclude the data is missing. It is metadata
 * about the list rather than part of it, so it takes the supporting ramp and the variant
 * colour - the same pair every other count and path in the design uses.
 */
.mb-menu-searchbar__summary {
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
    font-variant-numeric: tabular-nums;
    color: rgb(var(--v-theme-on-surface-variant));
}

/*
 * The field unrolling is a surface arriving, which in the M3 motion set is the decelerate
 * curve over the medium step. Vuetify's expand transition ships at its own 0.2s on the
 * Material 2 standard curve, and that curve is the reason a Vuetify expand reads as a box
 * being resized rather than as a field being offered.
 */
.mb-menu-searchbar .v-expand-transition-enter-active,
.mb-menu-searchbar .v-expand-transition-leave-active {
    transition-duration: var(--md-sys-motion-duration-medium2);
    transition-timing-function: var(--md-sys-motion-easing-emphasized-decelerate);
}

/*
 * `global.scss`'s kill switch already reaches this, since the bar is under `#app`. Restated
 * because the rule above is the one thing in this file that would otherwise be visibly
 * slower than the default it replaced, and a reduced-motion preference must never be
 * something a later retune can quietly overshoot.
 */
@media (prefers-reduced-motion: reduce) {
    .mb-menu-searchbar .v-expand-transition-enter-active,
    .mb-menu-searchbar .v-expand-transition-leave-active {
        transition-duration: 0.01ms !important;
    }
}
</style>
