<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { rangeHint, validateScalar } from "./nbtEditorModel.js";
import type { NodeView } from "./nbtEditorBridge.js";

/**
 * The inline editor for one scalar tag.
 *
 * A byte that holds 0 or 1 is a switch, because that is what it almost always means; every
 * other number is a text field that checks its type's range as it is typed and says so, and a
 * string is a plain field. Enter or leaving the field commits, Escape puts the old value back,
 * and a value that fails the range check is never sent.
 */
const props = defineProps<{ node: NodeView; label: string; disabled?: boolean | undefined }>();
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

const error = computed(() => (draft.value === props.node.text ? null : validateScalar(props.node.kind, draft.value)));
const hint = computed(() => rangeHint(props.node.kind));
const isSwitch = computed(() => props.node.isBool);
const isArrayTag = computed(() => props.node.kind === "byteArray" || props.node.kind === "intArray" || props.node.kind === "longArray");
const isContainerTag = computed(() => props.node.kind === "list" || props.node.kind === "compound");
const on = computed(() => props.node.text === "1");

function commit(): void {
    if (draft.value === props.node.text) return;
    if (error.value !== null) return;
    emit("commit", draft.value);
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

defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
    <div class="wl-nbt-value">
        <button
            v-if="isSwitch"
            type="button"
            role="switch"
            class="wl-nbt-switch"
            :class="{ 'is-on': on }"
            :aria-checked="on ? 'true' : 'false'"
            :aria-label="label"
            :disabled="disabled"
            @click.stop="emit('flip', !on)"
            @keydown.stop
        >
            <span class="wl-nbt-switch__knob" aria-hidden="true" />
        </button>
        <button
            v-else-if="isArrayTag"
            type="button"
            class="wl-nbt-link"
            :aria-label="t('nbt.value.editArray', { name: label }, 'Edit the values of {name}')"
            @click.stop="emit('edit-array')"
            @keydown.stop
        >
            {{ node.summary }}
        </button>
        <span v-else-if="isContainerTag" class="wl-nbt-summary">{{ node.summary }}</span>
        <template v-else>
            <input
                ref="input"
                v-model="draft"
                class="wl-nbt-input"
                :class="{ 'is-invalid': error !== null }"
                :aria-label="t('nbt.value.edit', { name: label }, '{name} value')"
                :aria-invalid="error !== null ? 'true' : 'false'"
                :disabled="disabled"
                :inputmode="node.kind === 'string' ? 'text' : 'decimal'"
                :title="hint"
                spellcheck="false"
                autocomplete="off"
                @keydown="onKey"
                @blur="commit"
                @click.stop
            />
            <span v-if="error" class="wl-nbt-error" role="alert">{{ error }}</span>
        </template>
    </div>
</template>

<style scoped>
.wl-nbt-value { display: flex; align-items: center; gap: 8px; margin-left: auto; min-width: 0; }
.wl-nbt-input {
    width: min(240px, 38vw);
    height: 30px;
    border-radius: 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.28);
    background: rgb(var(--v-theme-surface-container-high, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-surface));
    padding: 0 8px;
    font: 400 13px "Roboto Mono", ui-monospace, monospace;
}
.wl-nbt-input.is-invalid { border-color: rgb(var(--v-theme-error)); }
.wl-nbt-input:focus-visible, .wl-nbt-switch:focus-visible, .wl-nbt-link:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-nbt-error { color: rgb(var(--v-theme-error)); font-size: 12px; max-width: 220px; }
.wl-nbt-summary { color: rgb(var(--v-theme-on-surface-variant)); font-size: 12px; }
.wl-nbt-link { background: none; border: 0; color: rgb(var(--v-theme-primary)); font-size: 12px; cursor: pointer; text-decoration: underline; min-height: 30px; padding: 0 4px; }
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
    .wl-nbt-switch { width: 52px; height: 32px; border-radius: 16px; }
    .wl-nbt-switch__knob { width: 20px; height: 20px; border-radius: 10px; }
    .wl-nbt-switch.is-on .wl-nbt-switch__knob { left: 26px; }
}
</style>
