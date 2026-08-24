<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCard, VCardText, VList, VListItem, VMenu } from "vuetify/components";

import ConfigSearchField from "../config/ConfigSearchField.vue";

export interface SearchablePickerOption {
    readonly title: string;
    readonly value: string;
    readonly subtitle?: string;
    readonly disabled?: boolean;
}

const props = withDefaults(
    defineProps<{
        modelValue: string;
        options: readonly SearchablePickerOption[];
        label: string;
        sample?: string;
        noMatchText?: string;
    }>(),
    { sample: "", noMatchText: "No matching options." },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const { t } = useI18n();
const open = ref(false);
const query = ref("");
const useRegex = ref(false);
const flags = ref("i");

const visible = computed(() => {
    if (query.value.trim() === "") return props.options;
    if (!useRegex.value) {
        const needle = query.value.trim().toLocaleLowerCase();
        return props.options.filter((option) =>
            `${option.title} ${option.subtitle ?? ""}`.toLocaleLowerCase().includes(needle),
        );
    }
    try {
        const pattern = new RegExp(query.value, flags.value);
        return props.options.filter((option) =>
            pattern.test(`${option.title} ${option.subtitle ?? ""}`),
        );
    } catch {
        return [];
    }
});

const selectedTitle = computed(
    () =>
        props.options.find((option) => option.value === props.modelValue)?.title ??
        t("common.notSet", "Not set"),
);

function choose(option: SearchablePickerOption): void {
    if (option.disabled) return;
    emit("update:modelValue", option.value);
    open.value = false;
}
</script>

<template>
    <VMenu v-model="open" :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: activatorProps }">
            <VBtn
                v-bind="activatorProps"
                variant="outlined"
                class="wl-searchable-picker__activator"
                :aria-label="label"
            >
                <span class="wl-searchable-picker__label">{{ label }}</span>
                <span class="wl-searchable-picker__value">{{ selectedTitle }}</span>
            </VBtn>
        </template>
        <VCard class="wl-searchable-picker" role="dialog" :aria-label="label">
            <VCardText>
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="useRegex"
                    v-model:flags="flags"
                    :label="t('mcserver.picker.search', 'Search options')"
                    :sample="sample"
                />
                <VList v-if="visible.length > 0" role="listbox" :aria-label="label">
                    <VListItem
                        v-for="option in visible"
                        :key="option.value"
                        :title="option.title"
                        :subtitle="option.subtitle"
                        :disabled="option.disabled"
                        :aria-selected="option.value === modelValue"
                        @click="choose(option)"
                    />
                </VList>
                <p v-else class="text-caption text-medium-emphasis" role="status">
                    {{ noMatchText }}
                </p>
            </VCardText>
        </VCard>
    </VMenu>
</template>

<style scoped>
.wl-searchable-picker__activator {
    min-height: 48px;
    justify-content: flex-start;
    gap: 8px;
    text-align: left;
    width: 100%;
}
.wl-searchable-picker__label {
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-searchable-picker__value {
    overflow: hidden;
    text-overflow: ellipsis;
}
.wl-searchable-picker {
    min-width: min(360px, calc(100vw - 32px));
    max-width: calc(100vw - 32px);
}
</style>
