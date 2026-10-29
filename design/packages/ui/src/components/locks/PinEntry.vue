<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VTextField } from "vuetify/components";

import { PIN_MAX_LENGTH, pinDigits } from "./lockModel.js";

/**
 * One PIN field with an on-screen keypad beside it.
 *
 * Typing and the keypad edit the same value, filtered through the same `pinDigits`, so there
 * is exactly one PIN however it was entered and the lock checks it once. The field asks the
 * platform for a numeric keyboard; the keypad is there for a pointer, a touch screen, or
 * somebody who would rather not type.
 */
const props = defineProps<{
    modelValue: string;
    label: string;
    /** `new-password` in the wizard, `current-password` on the prompt. */
    autocomplete: string;
    /** Prefix for the data-test anchors, so two PIN fields on one form stay distinct. */
    testId: string;
    disabled?: boolean | undefined;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: string];
    /** Enter pressed in the field. */
    submit: [];
    /** Escape pressed in the field. */
    cancel: [];
}>();

const { t } = useI18n();
const field = ref<{ focus: () => void } | null>(null);

const value = computed({
    get: () => props.modelValue,
    set: (next: string) => emit("update:modelValue", pinDigits(next)),
});

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function press(digit: string): void {
    if (props.disabled === true || props.modelValue.length >= PIN_MAX_LENGTH) return;
    emit("update:modelValue", pinDigits(props.modelValue + digit));
}

function backspace(): void {
    emit("update:modelValue", props.modelValue.slice(0, -1));
}

function clear(): void {
    emit("update:modelValue", "");
}

defineExpose({ focus: () => field.value?.focus() });
</script>

<template>
    <div class="mb-pin" :data-test="`${props.testId}`">
        <VTextField
            ref="field"
            v-model="value"
            :label="props.label"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            :maxlength="PIN_MAX_LENGTH"
            :autocomplete="props.autocomplete"
            :disabled="props.disabled"
            density="compact"
            :data-test="`${props.testId}-field`"
            @keydown.enter.prevent="emit('submit')"
            @keydown.esc.prevent="emit('cancel')"
        />
        <div
            class="mb-pin__pad"
            role="group"
            :aria-label="t('locks.pin.keypad', { label: props.label }, 'Keypad for {label}')"
        >
            <VBtn
                v-for="digit in KEYS"
                :key="digit"
                variant="tonal"
                size="small"
                class="mb-pin__key"
                :disabled="props.disabled"
                :data-test="`${props.testId}-key-${digit}`"
                @click="press(digit)"
            >
                {{ digit }}
            </VBtn>
            <VBtn
                variant="text"
                size="small"
                class="mb-pin__key"
                :disabled="props.disabled"
                :aria-label="t('locks.pin.clear', 'Clear the PIN')"
                :data-test="`${props.testId}-clear`"
                @click="clear"
            >
                {{ t("locks.pin.clearShort", "Clear") }}
            </VBtn>
            <VBtn
                variant="tonal"
                size="small"
                class="mb-pin__key"
                :disabled="props.disabled"
                :data-test="`${props.testId}-key-0`"
                @click="press('0')"
            >
                0
            </VBtn>
            <VBtn
                variant="text"
                size="small"
                class="mb-pin__key"
                :disabled="props.disabled"
                :aria-label="t('locks.pin.backspace', 'Delete the last digit')"
                :data-test="`${props.testId}-back`"
                @click="backspace"
            >
                {{ t("locks.pin.backShort", "Back") }}
            </VBtn>
        </div>
    </div>
</template>

<style scoped>
.mb-pin {
    margin-bottom: 8px;
}

.mb-pin__pad {
    display: grid;
    grid-template-columns: repeat(3, minmax(48px, 1fr));
    gap: 8px;
    max-width: 240px;
}

.mb-pin__key {
    min-height: 48px;
    white-space: nowrap;
}
</style>
