<script setup lang="ts">
import { computed, useId } from "vue";
import { VListItem, VSlider } from "vuetify/components";

/**
 * MD3 replacement for upstream `Menu/Slider.vue`.
 *
 * The split that matters is `update` (fires continuously while dragging, so the caller can
 * apply the change live) versus `lazy` (fires once when the interaction ends, so the caller
 * can persist). Collapsing them writes localStorage on every pointer move of three sliders.
 *
 * Vuetify's `v-slider` only emits `end` for pointer interactions, so keyboard changes are
 * flushed on `keyup` as well; upstream got that for free from the native `change` event.
 */
const props = withDefaults(
    defineProps<{
        modelValue: number;
        min: number;
        max: number;
        step: number;
        /** Visible label, also the slider's accessible name. */
        label: string;
        /** Formats the readout and the announced value (upstream's `formatter` prop). */
        formatter?: (value: number) => string;
        disabled?: boolean;
    }>(),
    { disabled: false },
);

const emit = defineEmits<{ update: [value: number]; lazy: [value: number] }>();

const labelId = useId();

function countDecimals(value: number): number {
    if (Math.floor(value) === value) return 0;
    return value.toString().split(".")[1]?.length ?? 0;
}

const display = computed(() => {
    if (props.formatter) return props.formatter(props.modelValue);
    return props.modelValue.toFixed(countDecimals(props.step));
});

let dirty = false;

const value = computed<number>({
    get: () => props.modelValue,
    set: (next) => {
        dirty = true;
        emit("update", next);
    },
});

function flush(): void {
    if (!dirty) return;
    dirty = false;
    emit("lazy", props.modelValue);
}
</script>

<template>
    <v-list-item class="mb-menu-slider" @keyup="flush">
        <div class="mb-menu-slider__head">
            <span :id="labelId" class="mb-menu-slider__label">{{ label }}</span>
            <span class="mb-menu-slider__value" aria-hidden="true">{{ display }}</span>
        </div>
        <v-slider
            v-model="value"
            class="mb-menu-slider__control"
            :min="min"
            :max="max"
            :step="step"
            :disabled="disabled === true"
            :aria-labelledby="labelId"
            :aria-valuetext="display"
            color="primary"
            density="compact"
            hide-details
            @end="flush"
        />
    </v-list-item>
</template>

<style>
/*
 * A slider row is the one row in the drawer that is two things stacked rather than one line,
 * so it opts out of the sheet's flex row and lays itself out as a block. Everything else -
 * the corner, the tint, the state layers, the inline padding - is still the sheet's.
 */
.v-application .mb-side-sheet .mb-menu-slider.v-list-item {
    display: block;
    min-block-size: 56px;
    padding-block: 8px;
}

.mb-menu-slider__head {
    display: flex;
    align-items: baseline;
    gap: 8px;
}

/*
 * The label takes the same label-large ramp as every other row title, and the readout beside
 * it drops a step to body-small in `on-surface-variant`. Those two used to be one size at one
 * weight, separated only by an opacity, which is exactly the "three sizes within a point of
 * each other" the type scale exists to end: the name of the setting and its current value
 * are different kinds of thing and should not have to be read to be told apart.
 */
.mb-menu-slider__label {
    flex: 1 1 auto;
    font-size: var(--md-sys-typescale-label-large-size);
    line-height: var(--md-sys-typescale-label-large-line-height);
    font-weight: var(--md-sys-typescale-label-large-weight);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    overflow-wrap: anywhere;
}

.mb-menu-slider__value {
    flex: 0 0 auto;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
    /* So the number stops jittering sideways while the thumb is being dragged. */
    font-variant-numeric: tabular-nums;
    color: rgb(var(--v-theme-on-surface-variant));
}

/*
 * The track is inset by the thumb's own radius so that a thumb parked at either end sits
 * inside the row's 12px padding rather than overhanging it into the sheet's 8px gutter.
 */
.mb-menu-slider__control.v-slider {
    margin-inline: 4px;
}
</style>
