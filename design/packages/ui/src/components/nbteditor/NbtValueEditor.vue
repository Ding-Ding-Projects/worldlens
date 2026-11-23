<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VSelect, VSlider } from "vuetify/components";
import { rangeHint, validateScalar } from "./nbtEditorModel.js";
import type { NodeView } from "./nbtEditorBridge.js";
import { clockFor, durationFor, hexForRgb, readableResource, rgbForHex, type FieldInfo } from "./nbtFieldCatalogue.js";

/**
 * The inline editor for one scalar tag, chosen by what the tag means rather than only its type.
 *
 * `info.control` (from `nbtFieldCatalogue.ts`) picks the control: a switch for yes-or-no, a
 * select of names for a fixed set, a bounded stepper or slider for numbers, a clock for the time
 * of day, minutes and seconds for durations, a colour picker for RGB values, and a readable name
 * for resource ids. A typed text field is left only for free text and for raw values the
 * catalogue does not know, and it still checks the type's range as it is typed.
 *
 * Every control commits the same text the plain field would, through the same `commit` event,
 * so undo, history and the safety rules see no difference. Integer arithmetic runs on BigInt so
 * a 64-bit value is never rounded through a JavaScript number.
 */
const props = defineProps<{ node: NodeView; label: string; info?: FieldInfo | undefined; disabled?: boolean | undefined }>();
const emit = defineEmits<{ commit: [text: string]; flip: [on: boolean]; "edit-array": [] }>();
const { t } = useI18n();

const draft = ref(props.node.text);
const input = ref<HTMLInputElement | null>(null);
watch(
    () => props.node.text,
    (value) => {
        draft.value = value;
    },
);

const control = computed(() => props.info?.control ?? (props.node.isBool ? { type: "switch" as const } : { type: "raw" as const }));
const error = computed(() => (draft.value === props.node.text ? null : validateScalar(props.node.kind, draft.value)));
const hint = computed(() => rangeHint(props.node.kind));
const isArrayTag = computed(() => props.node.kind === "byteArray" || props.node.kind === "intArray" || props.node.kind === "longArray");
const isContainerTag = computed(() => props.node.kind === "list" || props.node.kind === "compound");
const isInteger = computed(() => ["byte", "short", "int", "long"].includes(props.node.kind));

const on = computed(() => {
    const c = control.value;
    return c.type === "switch" && c.stringBool === true ? props.node.text === "true" : props.node.text === "1";
});

function flip(): void {
    const c = control.value;
    if (c.type === "switch" && c.stringBool === true) emit("commit", on.value ? "false" : "true");
    else emit("flip", !on.value);
}

function commit(): void {
    if (draft.value === props.node.text) return;
    if (error.value !== null) return;
    emit("commit", draft.value);
}

function send(text: string): void {
    if (text === props.node.text) return;
    if (validateScalar(props.node.kind, text) !== null) return;
    emit("commit", text);
}

function revert(): void {
    draft.value = props.node.text;
}

function onKey(event: KeyboardEvent): void {
    if (event.key === "Enter") {
        event.preventDefault();
        commit();
    } else if (event.key === "Escape") {
        event.stopPropagation();
        revert();
        input.value?.blur();
    }
}

/* Numbers -------------------------------------------------------------------------------- */

const bounds = computed(() => {
    const c = control.value;
    return c.type === "stepper" || c.type === "slider" ? c : { min: -Infinity, max: Infinity, step: 1, unit: undefined };
});

function clampText(value: number | bigint): string {
    const { min, max } = bounds.value;
    if (typeof value === "bigint") {
        let v = value;
        if (Number.isFinite(min) && v < BigInt(Math.ceil(min))) v = BigInt(Math.ceil(min));
        if (Number.isFinite(max) && v > BigInt(Math.floor(max))) v = BigInt(Math.floor(max));
        return v.toString();
    }
    const v = Math.min(max, Math.max(min, value));
    return String(Math.round(v * 1e6) / 1e6);
}

function nudge(direction: 1 | -1, multiple = 1): void {
    const step = bounds.value.step * multiple;
    if (isInteger.value) {
        let current: bigint;
        try {
            current = BigInt(props.node.text);
        } catch {
            return;
        }
        send(clampText(current + BigInt(direction * Math.max(1, Math.round(step)))));
    } else {
        const current = Number(props.node.text);
        if (!Number.isFinite(current)) return;
        send(clampText(current + direction * step));
    }
}

const numeric = computed(() => Number(props.node.text));
const canLower = computed(() => !props.disabled && Number.isFinite(numeric.value) && numeric.value > bounds.value.min);
const canRaise = computed(() => !props.disabled && Number.isFinite(numeric.value) && numeric.value < bounds.value.max);

function onSlide(value: number): void {
    send(isInteger.value ? clampText(BigInt(Math.round(value))) : clampText(value));
}

/* Time of day and durations ---------------------------------------------------------------- */

const ticksBig = computed<bigint | null>(() => {
    try {
        return BigInt(props.node.text);
    } catch {
        return null;
    }
});
const timeInDay = computed(() => (ticksBig.value === null ? 0 : Number(((ticksBig.value % 24000n) + 24000n) % 24000n)));
const dayNumber = computed(() => (ticksBig.value === null ? 0n : ticksBig.value / 24000n));

function setTimeOfDay(value: number): void {
    if (ticksBig.value === null) return;
    send((dayNumber.value * 24000n + BigInt(Math.round(value))).toString());
}

function shiftTicks(delta: number): void {
    if (ticksBig.value === null) return;
    let next = ticksBig.value + BigInt(delta);
    if (next < 0n) next = 0n;
    send(next.toString());
}

/* Colour ------------------------------------------------------------------------------------ */

const hex = computed(() => (Number.isFinite(numeric.value) ? hexForRgb(numeric.value) : "#000000"));

function onColor(event: Event): void {
    const value = rgbForHex((event.target as HTMLInputElement).value);
    if (value !== null) send(String(value));
}

defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
    <div class="wl-nbt-value" @click.stop @keydown.stop>
        <button
            v-if="control.type === 'switch'"
            type="button"
            role="switch"
            class="wl-nbt-switch"
            :class="{ 'is-on': on }"
            :aria-checked="on ? 'true' : 'false'"
            :aria-label="label"
            :disabled="disabled"
            @click="flip"
        >
            <span class="wl-nbt-switch__knob" aria-hidden="true" />
        </button>

        <button
            v-else-if="isArrayTag"
            type="button"
            class="wl-nbt-link"
            :aria-label="t('nbt.value.editArray', { name: label }, 'Edit the values of {name}')"
            @click="emit('edit-array')"
        >
            {{ node.summary }}
        </button>

        <span v-else-if="isContainerTag" class="wl-nbt-summary">{{ node.summary }}</span>

        <v-select
            v-else-if="control.type === 'choice'"
            class="wl-nbt-select"
            :model-value="node.text"
            :items="[...control.options]"
            item-title="label"
            item-value="value"
            :aria-label="label"
            :disabled="!!disabled"
            density="compact"
            variant="outlined"
            hide-details
            @update:model-value="(v: string) => send(v)"
        />

        <div v-else-if="control.type === 'stepper'" class="wl-nbt-stepper" role="group" :aria-label="label">
            <button type="button" class="wl-nbt-step" :aria-label="t('nbt.value.lower', { name: label }, 'Lower {name}')" :disabled="!canLower" @click="nudge(-1)">&minus;</button>
            <input
                ref="input"
                v-model="draft"
                class="wl-nbt-input wl-nbt-input--num"
                :class="{ 'is-invalid': error !== null }"
                :aria-label="t('nbt.value.edit', { name: label }, '{name} value')"
                :aria-invalid="error !== null ? 'true' : 'false'"
                :disabled="disabled"
                inputmode="decimal"
                :title="hint"
                spellcheck="false"
                autocomplete="off"
                @keydown="onKey"
                @blur="commit"
            />
            <button type="button" class="wl-nbt-step" :aria-label="t('nbt.value.raise', { name: label }, 'Raise {name}')" :disabled="!canRaise" @click="nudge(1)">+</button>
            <span v-if="control.unit" class="wl-nbt-unit">{{ control.unit }}</span>
        </div>

        <div v-else-if="control.type === 'slider'" class="wl-nbt-slider">
            <v-slider
                :model-value="Number.isFinite(numeric) ? numeric : control.min"
                :min="control.min"
                :max="control.max"
                :step="control.step"
                :aria-label="label"
                :disabled="!!disabled"
                color="primary"
                density="compact"
                hide-details
                @end="(v: number) => onSlide(v)"
            />
            <output class="wl-nbt-readout">{{ node.text }}{{ control.unit ? ` ${control.unit}` : '' }}</output>
        </div>

        <div v-else-if="control.type === 'timeOfDay'" class="wl-nbt-slider">
            <v-slider
                :model-value="timeInDay"
                :min="0"
                :max="23999"
                :step="250"
                :aria-label="t('nbt.value.timeOfDay', { name: label }, '{name}, time within the day')"
                :disabled="!!disabled || ticksBig === null"
                color="primary"
                density="compact"
                hide-details
                @end="(v: number) => setTimeOfDay(v)"
            />
            <output class="wl-nbt-readout">{{ clockFor(timeInDay) }}</output>
        </div>

        <div v-else-if="control.type === 'duration'" class="wl-nbt-stepper" role="group" :aria-label="label">
            <button type="button" class="wl-nbt-step wl-nbt-step--wide" :aria-label="t('nbt.value.minuteLess', { name: label }, '{name}: one minute less')" :disabled="disabled" @click="shiftTicks(-1200)">&minus;1m</button>
            <button type="button" class="wl-nbt-step" :aria-label="t('nbt.value.secondLess', { name: label }, '{name}: one second less')" :disabled="disabled" @click="shiftTicks(-20)">&minus;</button>
            <output class="wl-nbt-readout">{{ ticksBig === null ? node.text : durationFor(Number(ticksBig)) }}</output>
            <button type="button" class="wl-nbt-step" :aria-label="t('nbt.value.secondMore', { name: label }, '{name}: one second more')" :disabled="disabled" @click="shiftTicks(20)">+</button>
            <button type="button" class="wl-nbt-step wl-nbt-step--wide" :aria-label="t('nbt.value.minuteMore', { name: label }, '{name}: one minute more')" :disabled="disabled" @click="shiftTicks(1200)">+1m</button>
        </div>

        <label v-else-if="control.type === 'color'" class="wl-nbt-color">
            <span class="wl-nbt-color__swatch" :style="{ background: hex }" aria-hidden="true" />
            <input type="color" class="wl-nbt-color__input" :value="hex.toLowerCase()" :aria-label="t('nbt.value.color', { name: label }, '{name} colour')" :disabled="disabled" @change="onColor" />
            <span class="wl-nbt-readout">{{ hex }}</span>
        </label>

        <template v-else>
            <span v-if="control.type === 'resource'" class="wl-nbt-resource">{{ readableResource(node.text) }}</span>
            <input
                ref="input"
                v-model="draft"
                class="wl-nbt-input"
                :class="{ 'is-invalid': error !== null, 'wl-nbt-input--id': control.type === 'resource' }"
                :aria-label="t('nbt.value.edit', { name: label }, '{name} value')"
                :aria-invalid="error !== null ? 'true' : 'false'"
                :disabled="disabled"
                :inputmode="node.kind === 'string' ? 'text' : 'decimal'"
                :title="hint"
                spellcheck="false"
                autocomplete="off"
                @keydown="onKey"
                @blur="commit"
            />
        </template>
        <span v-if="error" class="wl-nbt-error" role="alert">{{ error }}</span>
    </div>
</template>

<style scoped>
.wl-nbt-value { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-left: auto; flex: 1 1 160px; min-width: 0; }
.wl-nbt-input {
    width: min(240px, 100%);
    min-width: 80px;
    height: 30px;
    border-radius: 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.28);
    background: rgb(var(--v-theme-surface-container-high, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-surface));
    padding: 0 8px;
    font: 400 13px "Roboto Mono", ui-monospace, monospace;
}
.wl-nbt-input--num { width: 96px; min-width: 64px; text-align: center; }
.wl-nbt-input--id { width: min(200px, 100%); font-size: 11px; opacity: 0.85; }
.wl-nbt-input.is-invalid { border-color: rgb(var(--v-theme-error)); }
.wl-nbt-input:focus-visible, .wl-nbt-switch:focus-visible, .wl-nbt-link:focus-visible, .wl-nbt-step:focus-visible, .wl-nbt-color__input:focus-visible + .wl-nbt-readout { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-nbt-error { color: rgb(var(--v-theme-error)); font-size: 12px; max-width: 220px; }
.wl-nbt-summary, .wl-nbt-unit { color: rgb(var(--v-theme-on-surface-variant)); font-size: 12px; }
.wl-nbt-link { background: none; border: 0; color: rgb(var(--v-theme-primary)); font-size: 12px; cursor: pointer; text-decoration: underline; min-height: 30px; padding: 0 4px; }
.wl-nbt-select { flex: 0 1 200px; min-width: 140px; }
.wl-nbt-stepper { display: inline-flex; align-items: center; gap: 4px; }
.wl-nbt-step {
    min-width: 30px; height: 30px; border-radius: 8px; padding: 0 6px; cursor: pointer;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.28); background: transparent; color: rgb(var(--v-theme-on-surface));
    font: 500 14px Roboto, sans-serif;
}
.wl-nbt-step--wide { font-size: 12px; }
.wl-nbt-step:disabled { opacity: 0.38; cursor: default; }
.wl-nbt-slider { display: flex; align-items: center; gap: 8px; flex: 0 1 260px; min-width: 160px; }
.wl-nbt-slider :deep(.v-slider) { flex: 1; margin: 0; }
.wl-nbt-readout { font: 500 12px "Roboto Mono", ui-monospace, monospace; color: rgb(var(--v-theme-on-surface)); white-space: nowrap; min-width: 48px; text-align: end; }
.wl-nbt-color { display: inline-flex; align-items: center; gap: 8px; position: relative; cursor: pointer; }
.wl-nbt-color__swatch { width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(var(--v-theme-on-surface), 0.28); }
.wl-nbt-color__input { position: absolute; inset: 0; width: 28px; height: 28px; opacity: 0; cursor: pointer; }
.wl-nbt-resource { font: 400 13px Roboto, sans-serif; color: rgb(var(--v-theme-on-surface)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.wl-nbt-switch {
    width: 44px; height: 26px; border-radius: 13px; position: relative; cursor: pointer; padding: 0;
    border: 2px solid rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant)));
    background: transparent;
}
.wl-nbt-switch.is-on { background: rgb(var(--v-theme-primary)); border-color: rgb(var(--v-theme-primary)); }
.wl-nbt-switch__knob { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 8px; background: rgb(var(--v-theme-on-surface-variant)); transition: left 0.16s; }
.wl-nbt-switch.is-on .wl-nbt-switch__knob { left: 22px; background: rgb(var(--v-theme-on-primary)); }
@media (prefers-reduced-motion: reduce) { .wl-nbt-switch__knob { transition: none; } }
@media (max-width: 720px) {
    .wl-nbt-input { width: min(180px, 42vw); height: 40px; }
    .wl-nbt-step { min-width: 44px; height: 40px; }
    .wl-nbt-switch { width: 52px; height: 32px; border-radius: 16px; }
    .wl-nbt-switch__knob { width: 20px; height: 20px; border-radius: 10px; }
    .wl-nbt-switch.is-on .wl-nbt-switch__knob { left: 26px; }
}
</style>
