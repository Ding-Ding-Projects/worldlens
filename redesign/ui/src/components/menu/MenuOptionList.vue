<script setup lang="ts">
import { computed } from "vue";
import { VList, VListItem } from "vuetify/components";

export interface MenuChoiceOption {
    id: string;
    name: string;
    disabled?: boolean;
}

/**
 * Single-choice option list: upstream used a stack of `SimpleButton`s with `:active` for
 * the view mode, resolution, theme and language groups. Those rows were `<div>`s with no
 * role and no keyboard path, so a screen reader had no way to tell that exactly one of
 * them was chosen.
 *
 * Vuetify's selectable `v-list` gives the same behaviour with real `listbox`/`option`
 * roles, `aria-selected`, roving arrow-key focus and Enter/Space activation.
 */
const props = defineProps<{
    options: MenuChoiceOption[];
    /** Currently chosen option id, or null when nothing matches. */
    selected: string | null;
    /** Accessible name for the listbox. */
    label: string;
}>();

const emit = defineEmits<{ select: [id: string] }>();

const selection = computed<unknown[]>({
    get: () => (props.selected === null ? [] : [props.selected]),
    set: (value) => {
        const id = value[0];
        if (typeof id === "string" && id !== props.selected) emit("select", id);
    },
});
</script>

<template>
    <v-list
        v-model:selected="selection"
        class="mb-menu-option-list"
        density="compact"
        selectable
        mandatory
        select-strategy="single-independent"
        :aria-label="label"
    >
        <v-list-item
            v-for="option in options"
            :key="option.id"
            :value="option.id"
            :disabled="option.disabled === true"
            :title="option.name"
        />
    </v-list>
</template>

<style>
/*
 * Shape, tint, the two type ramps and - the one that matters most here - what a *chosen*
 * option looks like are all stated once for the whole drawer in `MenuSideSheet.vue`. This is
 * the component the selection rule was written for: four themes or sixteen languages where
 * exactly one is current, marked the M3 way with a filled `secondary-container` and the row's
 * own corner rather than the near-invisible overlay tint Vuetify paints by default.
 *
 * The `rounded="lg"` prop these rows used to carry is gone rather than corrected. Vuetify's
 * `.rounded-*` utilities are `!important` even after `global.scss` re-points them at the M3
 * scale, so a radius set by a prop can never be adjusted from a stylesheet later - which is
 * how three components in this directory ended up disagreeing about a row's corner with no
 * single place to fix it.
 */

/*
 * 44px was below both M3's 48px list step and this project's own 40px floor for a target
 * once the row's own padding is taken off it. The drawer's 48px applies; this only says that
 * a wrapped two-line option (bilingual mode, every time) grows rather than clips.
 */
.mb-menu-option-list .v-list-item__content {
    white-space: normal;
    overflow-wrap: anywhere;
}

/*
 * Options in one group sit closer together than the top-level commands do: they are a set to
 * be compared rather than a list to be aimed at, and 2px of separation is what makes them
 * read as one control instead of four.
 */
.mb-menu-option-list .v-list-item + .v-list-item {
    margin-block-start: 2px;
}
</style>
