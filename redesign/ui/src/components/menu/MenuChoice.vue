<script setup lang="ts">
import { useId } from "vue";
import { VBtn, VBtnToggle } from "vuetify/components";

export interface MenuChoiceItem {
    id: string;
    name: string;
}

/**
 * MD3 replacement for upstream `Menu/ChoiceBox.vue`: an inline segmented control with an
 * optional leading title. Upstream used it only for the marker sort order.
 *
 * Kept exactly: the emitted payload is the whole choice object, not its id.
 */
withDefaults(
    defineProps<{
        title?: string;
        choices: MenuChoiceItem[];
        selection: string;
    }>(),
    { title: "" },
);

const emit = defineEmits<{ choice: [choice: MenuChoiceItem] }>();

const titleId = useId();

function pick(choices: MenuChoiceItem[], id: unknown): void {
    const choice = choices.find((c) => c.id === id);
    if (choice) emit("choice", choice);
}
</script>

<template>
    <div class="mb-menu-choice">
        <span v-if="title" :id="titleId" class="mb-menu-choice__title">{{ title }}</span>
        <!--
            role="group" is what makes the aria-labelledby mean anything: Vuetify's toggle
            root is a plain div, and a label on a role-less element is ignored. Likewise the
            per-button aria-pressed - VBtn inside a VBtnToggle marks selection with a class
            only, so without this a screen reader hears N unstated buttons.
        -->
        <v-btn-toggle
            class="mb-menu-choice__group"
            role="group"
            :model-value="selection"
            :aria-labelledby="title ? titleId : undefined"
            mandatory
            divided
            density="compact"
            variant="outlined"
            @update:model-value="pick(choices, $event)"
        >
            <v-btn
                v-for="choice in choices"
                :key="choice.id"
                :value="choice.id"
                :aria-pressed="choice.id === selection"
                size="small"
            >
                {{ choice.name }}
            </v-btn>
        </v-btn-toggle>
    </div>
</template>

<style>
.mb-menu-choice {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    /* The drawer insets its rows 12px; this is a row too, even though it is not a list item. */
    padding: 4px 12px 8px;
}

/*
 * The same label-medium the section headings use, minus the uppercasing: this is a name for
 * the control beside it rather than a heading over a group of them, and two uppercase labels
 * a few pixels apart would read as two sections.
 */
.mb-menu-choice__title {
    font-size: var(--md-sys-typescale-label-medium-size);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    letter-spacing: var(--md-sys-typescale-label-medium-tracking);
    color: rgb(var(--v-theme-on-surface-variant));
}

/*
 * M3's segmented button: one fully-rounded outlined container with hairline separators
 * inside it, 40dp tall. Vuetify's toggle is Material 2 - a 4px-cornered strip at whatever
 * height it is told - and the 32px this used to ask for was below this project's own 40px
 * floor for a hit target before its padding was counted.
 *
 * The radius is set here rather than through `rounded="pill"` for the reason that keeps
 * recurring in this directory: Vuetify's radius utilities are `!important`, so a shape
 * chosen by a prop is a shape no stylesheet can correct afterwards.
 */
.mb-menu-choice__group.v-btn-toggle {
    flex: 1 1 auto;
    height: auto;
    min-height: 40px;
    /*
     * The end buttons pick this up on their own: Vuetify gives `.v-btn-group .v-btn:first-child`
     * and `:last-child` a `border-*-radius: inherit`, so the pill propagates without the
     * `overflow: hidden` that would otherwise seem to be needed to clip them. That matters -
     * an ancestor with `overflow: hidden` clips a descendant's `outline`, and `global.scss`
     * draws every focus ring in this application as a 2px outline at a 2px offset, so hiding
     * the overflow here would have quietly taken the focus ring off all three choices.
     */
    border-radius: var(--md-sys-shape-corner-full);
}

.mb-menu-choice__group.v-btn-toggle .v-btn {
    flex: 1 1 0;
    min-width: 0;
    /* A floor, like the toggle above, not a fixed height: the fixed 32px here undid the
       toggle's own `height: auto`, and at (0,3,0) it also out-ranked bilingual.css's
       `html[data-language-mode="bilingual"] .v-btn` sizing at (0,2,1), so in bilingual
       mode the Cantonese half of each choice label was clipped inside a one-line box. */
    height: auto;
    min-height: 40px;
    padding-block: 4px;
    /*
     * The label ramp M3 gives a segmented button. `prototypeSurface.scss` already strips
     * Vuetify's Material 2 upper-casing and letter-spacing from every `.v-btn` in the shell
     * layer; this only settles the size, which its `size="small"` was leaving at 13px -
     * a step below the row titles these choices sit among.
     */
    font-size: var(--md-sys-typescale-label-large-size);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
}

/*
 * Selection, the same way the drawer's list rows mark it: a filled secondary container and
 * the control's own shape. Vuetify marks a chosen toggle button with `--v-activated-opacity`
 * of the button's own colour, which on an outlined variant is a tint faint enough that the
 * segmented control looks like it has nothing chosen at all.
 */
.mb-menu-choice__group.v-btn-toggle .v-btn--active {
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.mb-menu-choice__group.v-btn-toggle .v-btn--active > .v-btn__overlay {
    opacity: 0;
}
</style>
