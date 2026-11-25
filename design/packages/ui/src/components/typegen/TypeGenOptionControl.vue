<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VSelect, VSwitch, VTextField } from "vuetify/components";
import InfoButton from "../info/InfoButton.vue";
import type { LanguageOption, OptionValue } from "./typeGenTypes.js";

/**
 * One renderer option of the selected language as a typed control: a switch for a boolean, a
 * select for a fixed set of values, and a text field only where the library asks for free
 * text. The control, its label, its default and its legal values all come from the library's
 * own definition, so a new option in a newer quicktype appears here without any change.
 */
const props = defineProps<{
    option: LanguageOption;
    modelValue: OptionValue | undefined;
}>();
const emit = defineEmits<{ "update:modelValue": [value: OptionValue | undefined] }>();

const { t } = useI18n();

/** `just-types` reads as "Just types". */
const label = computed(() => {
    const words = props.option.name.replace(/-/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
});

const shown = computed<OptionValue | undefined>(() => props.modelValue ?? props.option.defaultValue);

const defaultText = computed(() => {
    const value = props.option.defaultValue;
    if (value === undefined || value === "") return t("typegen.option.noDefault", "No default value.");
    if (typeof value === "boolean") return value ? t("typegen.option.on", "On") : t("typegen.option.off", "Off");
    return value;
});

const guide = computed(() => ({
    purpose: props.option.description,
    ...(props.option.values.length > 0 ? { choices: props.option.values.join(", ") } : {}),
    defaultValue: defaultText.value,
    effect: t("typegen.option.effect", "The generated code updates as soon as this changes."),
}));

const items = computed(() => props.option.values.map((value) => ({ title: value, value })));
</script>

<template>
    <div class="wl-tg-option" :data-option="option.name">
        <VSwitch
            v-if="option.kind === 'boolean'"
            :model-value="shown === true"
            :label="label"
            density="compact"
            hide-details
            color="primary"
            @update:model-value="(value: unknown) => emit('update:modelValue', value === true)"
        />
        <VSelect
            v-else-if="option.kind === 'enum'"
            :model-value="typeof shown === 'string' ? shown : undefined"
            :items="items"
            :label="label"
            density="compact"
            hide-details
            @update:model-value="(value: unknown) => emit('update:modelValue', String(value))"
        />
        <VTextField
            v-else
            :model-value="typeof shown === 'string' ? shown : ''"
            :label="label"
            :placeholder="option.typeLabel"
            density="compact"
            hide-details
            @update:model-value="(value: string) => emit('update:modelValue', value)"
        />
        <InfoButton :control="label" :guide="guide" resettable @reset="emit('update:modelValue', undefined)" />
    </div>
</template>

<style scoped>
.wl-tg-option { display: flex; align-items: center; gap: 2px; min-width: 0; }
.wl-tg-option > :first-child { flex: 1 1 auto; min-width: 0; }
</style>
