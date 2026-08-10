<script setup lang="ts">
import { useId } from "vue";

/**
 * MD3 replacement for upstream `Menu/Group.vue`.
 *
 * Upstream drew a 2px box with the title floating on its top-right edge; that is legacy
 * chrome and is gone. What survives is the behaviour: a labelled grouping, and the
 * `max-height: 15em; overflow-y: auto` cap that stops the theme and language lists from
 * pushing the rest of the settings page off screen.
 *
 * The heading is `mb-section-rule` / `mb-section-label` from `styles/prototypeSurface.scss`
 * rather than a `v-list-subheader`. That pairing - an uppercase label in the primary role
 * with a hairline running out to the edge beside it - is the single most recognisable thing
 * about the approved design, and a screen without it reads as the old application even when
 * every other measurement is right. Using the shared classes also means this heading and the
 * ones on the project screens cannot drift apart, which is what happened when this file
 * carried its own 0.75rem/500/0.1em opinion and `prototypeSurface.scss` carried a
 * 12px/500/0.08em one.
 *
 * A `<div>` rather than the Vuetify subheader for the same reason: `v-list-subheader` is a
 * list part, this heading is not inside a `v-list`, and the component brought a Material 2
 * 48px height and an inline padding of its own that had to be fought with `!important`.
 */
withDefaults(
    defineProps<{
        title?: string;
        /** Caps the content at 15em and scrolls it (upstream's Group content behaviour). */
        scrollable?: boolean;
    }>(),
    { title: "", scrollable: false },
);

const titleId = useId();
</script>

<template>
    <section class="mb-menu-group" role="group" :aria-labelledby="title ? titleId : undefined">
        <div v-if="title" class="mb-section-rule mb-menu-group__head">
            <span :id="titleId" class="mb-section-label">{{ title }}</span>
        </div>
        <div
            class="mb-menu-group__content"
            :class="{ 'mb-menu-group__content--scroll': scrollable }"
        >
            <slot />
        </div>
    </section>
</template>

<style>
/*
 * A group is a heading plus its rows, and the space that says where one group ends is the
 * space above the next heading rather than a rule under the last row. 16px is the M3
 * list-section rhythm and twice the 8px the drawer insets its rows by, so the two read as
 * nested rather than as competing gaps.
 */
.mb-menu-group {
    margin-block-end: 16px;
}

/*
 * `mb-section-rule` sizes itself for a 900px page, where 10px under a heading is a hairline's
 * worth of breathing room. In a 340px drawer with twenty of these the same 10px is most of a
 * row, so the gap is tightened here and the label, its colour and the hairline itself are
 * left entirely to the shared class.
 */
.v-application .mb-menu-group .mb-menu-group__head {
    margin-block: 0 6px;
    padding-inline: 12px;
}

/*
 * The cap that stops sixteen languages pushing the rest of the settings page off screen.
 * `overscroll-behavior` keeps a flick inside this box from carrying on into the drawer
 * behind it, which on a touch screen is the difference between scrolling a list and
 * accidentally scrolling the whole panel.
 */
.mb-menu-group__content--scroll {
    max-height: 15em;
    overflow-y: auto;
    overscroll-behavior: contain;

    /*
     * Room for a focus ring inside the clip box, then given back with a negative margin so
     * the rows still line up with the ones in the group above.
     *
     * A box with `overflow-y: auto` computes its `overflow-x` to `auto` as well, and an
     * ancestor that clips its overflow clips a descendant's `outline` too. Without these two
     * declarations the theme and language lists - the only two groups that scroll - would be
     * the only two in the drawer where the 2px focus ring at a 2px offset was shaved off both
     * sides, which is the sort of defect that survives every screenshot and is found by the
     * first person who navigates the settings page by keyboard.
     */
    padding-inline: 4px;
    margin-inline: -4px;
}
</style>
