<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VIcon, VMenu } from "vuetify/components";
import { mdiChevronDown } from "@mdi/js";
import MenuSearchList, { type MenuSearchItem } from "../menuSearch/MenuSearchList.vue";
import type { PaletteChoice } from "./paletteItems.js";

const props = withDefaults(
    defineProps<{
        modelValue: string | null;
        options: readonly PaletteChoice[];
        label: string;
        disabled?: boolean;
    }>(),
    { disabled: false },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const { t } = useI18n();
const open = ref(false);

const selected = computed(() => props.options.find((option) => option.id === props.modelValue) ?? null);
const items = computed<readonly MenuSearchItem[]>(() =>
    props.options.map((option) => ({ id: option.id, label: option.label })),
);

function choose(id: string): void {
    emit("update:modelValue", id);
    open.value = false;
}
</script>

<template>
    <v-menu v-model="open" location="bottom end" :close-on-content-click="false">
        <template #activator="{ props: activatorProps }">
            <v-btn
                v-bind="activatorProps"
                class="mb-palette-choice"
                variant="outlined"
                density="compact"
                :disabled="props.disabled"
                :aria-label="props.label"
                :aria-expanded="open ? 'true' : 'false'"
            >
                <span class="mb-palette-choice__value">{{ selected?.label ?? t("palette.choice.none", "Choose") }}</span>
                <v-icon :icon="mdiChevronDown" size="18" aria-hidden="true" />
            </v-btn>
        </template>

        <MenuSearchList
            :items="items"
            :label="t('palette.choice.menuLabel', { title: props.label }, '{title} options')"
            @choose="choose"
        />
    </v-menu>
</template>

<style>
.mb-palette-choice {
    min-width: 190px;
    max-width: 260px;
    justify-content: space-between;
    text-transform: none;
    letter-spacing: normal;
}

.mb-palette-choice__value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
