<script setup lang="ts">
import { computed, useId } from "vue";
import { VListItem, VSwitch, VTooltip } from "vuetify/components";

/**
 * MD3 replacement for upstream `Menu/SwitchButton.vue` + `Menu/SwitchHandle.vue`.
 *
 * Upstream's handle was a styled `<div>` with no role, no tabindex and no keyboard
 * handling; `v-switch` renders a real `<input role="switch">` with `aria-checked`.
 * The row keeps upstream's large hit target by making the visible label a `<label for>`
 * of that input, so clicking anywhere on the text toggles it.
 *
 * Like upstream, the component does not flip its own state: it emits `action` and the
 * caller inverts and persists, so the switch always shows what the viewer actually has.
 */
const props = withDefaults(
    defineProps<{
        on: boolean;
        label: string;
        disabled?: boolean;
        tooltip?: string;
    }>(),
    { disabled: false, tooltip: "" },
);

const emit = defineEmits<{ action: [] }>();

const inputId = useId();

const checked = computed<boolean>({
    get: () => props.on,
    set: () => emit("action"),
});
</script>

<template>
    <v-list-item class="mb-menu-switch">
        <label :for="inputId" class="mb-menu-switch__label">{{ label }}</label>
        <template #append>
            <v-switch
                :id="inputId"
                v-model="checked"
                class="mb-menu-switch__control"
                role="switch"
                :disabled="disabled === true"
                color="primary"
                density="compact"
                hide-details
                inset
            />
        </template>
        <v-tooltip v-if="tooltip" activator="parent" location="end" :text="tooltip" />
    </v-list-item>
</template>

<style>
/*
 * The row's shape, tint, height and state layers are the drawer's, stated once in
 * `MenuSideSheet.vue`. What is left here is the label, which is not a `v-list-item-title`
 * (it is a `<label for>`, so that a click anywhere on the text reaches the input) and
 * therefore misses the ramp the sheet gives that element.
 */

.mb-menu-switch__label {
    display: block;
    flex: 1 1 auto;
    padding-block: 8px;
    cursor: pointer;
    /*
     * The same label-large ramp a row title takes, spelled out rather than inherited: a
     * settings switch and a menu command are the same kind of row and a person reading down
     * the page must not be able to tell which component drew which. The old 0.875rem/1.4 was
     * the right size by accident and the wrong line height, which is what made a wrapped
     * bilingual label sit tighter here than two lines away.
     */
    font-size: var(--md-sys-typescale-label-large-size);
    line-height: var(--md-sys-typescale-label-large-line-height);
    font-weight: var(--md-sys-typescale-label-large-weight);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    overflow-wrap: anywhere;
}

.mb-menu-switch__control.v-switch {
    flex: 0 0 auto;
}

/*
 * Vuetify's selection control reserves a 48px block for its own ripple even at compact
 * density, which inside a row that is already 48px makes the switch decide the row's height
 * and leaves the label off-centre against it. Releasing it lets the row's own min-height and
 * the label's padding agree on where the middle is.
 */
.mb-menu-switch__control .v-selection-control {
    min-height: 0;
}
</style>
