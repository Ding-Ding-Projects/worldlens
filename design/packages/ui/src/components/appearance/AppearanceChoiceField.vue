<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VMenu } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";

export interface AppearanceChoice {
    title: string;
    value: string;
}

const props = withDefaults(
    defineProps<{
        modelValue: string;
        items: readonly AppearanceChoice[];
        label: string;
        summary?: string;
    }>(),
    { summary: "" },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const { t } = useI18n();
const open = ref(false);
const query = ref("");
const regex = ref(false);
const flags = ref("i");
const anchor = ref<HTMLElement | null>(null);
const menuContent = ref<HTMLElement | null>(null);
const active = ref(0);
const uid = useId();
const listId = `${uid}-listbox`;
const searchInputId = `${uid}-search`;

const corpus = computed(() => props.items.map((item) => `${item.title} ${item.value}`).join("\n"));
const visible = computed(() => {
    const matcher = createSettingMatcher(query.value, regex.value, flags.value);
    return props.items.filter((item) => matcher.test(`${item.title} ${item.value}`));
});
const activeOption = computed(() => visible.value[active.value]);
const currentTitle = computed(
    () => props.items.find((item) => item.value === props.modelValue)?.title ?? props.modelValue,
);

watch(open, async (value) => {
    if (!value) return;
    query.value = "";
    regex.value = false;
    flags.value = "i";
    active.value = Math.max(
        0,
        visible.value.findIndex((item) => item.value === props.modelValue),
    );
    await nextTick();
    menuContent.value?.querySelector<HTMLInputElement>("input")?.focus();
});

watch(visible, (items) => {
    active.value = Math.min(Math.max(items.length - 1, 0), active.value);
});

function choose(item: AppearanceChoice): void {
    emit("update:modelValue", item.value);
    open.value = false;
    void nextTick(() => anchor.value?.focus());
}

function onKeydown(event: KeyboardEvent): void {
    if (!open.value) return;
    if (event.key === "ArrowDown") {
        event.preventDefault();
        active.value = Math.min(Math.max(visible.value.length - 1, 0), active.value + 1);
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        active.value = Math.max(0, active.value - 1);
    } else if (event.key === "Enter") {
        event.preventDefault();
        const item = visible.value[active.value];
        if (item !== undefined) choose(item);
    } else if (event.key === "Escape") {
        event.preventDefault();
        open.value = false;
        void nextTick(() => anchor.value?.focus());
    }
}
</script>

<template>
    <div ref="anchor" class="mb-appearance-choice">
        <v-btn
            class="mb-appearance-choice__button"
            variant="outlined"
            density="compact"
            :aria-label="label"
            aria-haspopup="listbox"
            :aria-expanded="open ? 'true' : 'false'"
            :aria-controls="open ? listId : undefined"
            @click="open = !open"
            @keydown="onKeydown"
        >
            <span class="mb-appearance-choice__label">{{ label }}</span>
            <span class="mb-appearance-choice__value">{{ currentTitle }}</span>
        </v-btn>
        <v-menu v-model="open" :close-on-content-click="false" location="bottom start" offset="6">
            <div ref="menuContent" class="mb-appearance-choice__menu" @keydown="onKeydown">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regex"
                    v-model:flags="flags"
                    :input-id="searchInputId"
                    :input-aria-activedescendant="
                        activeOption ? `${uid}-option-${activeOption.value}` : undefined
                    "
                    :input-aria-controls="listId"
                    :label="t('appearance.choice.search', { label }, 'Search {label}')"
                    :sample="corpus"
                    :summary="
                        summary ||
                        t(
                            'appearance.choice.summary',
                            { shown: visible.length, total: items.length },
                            'Showing {shown} of {total} choices.',
                        )
                    "
                />
                <ul
                    :id="listId"
                    role="listbox"
                    :aria-label="label"
                    :aria-activedescendant="
                        activeOption ? `${uid}-option-${activeOption.value}` : undefined
                    "
                    class="mb-appearance-choice__list"
                >
                    <li
                        v-for="(item, index) in visible"
                        :id="`${uid}-option-${item.value}`"
                        :key="item.value"
                        role="option"
                        :aria-selected="item.value === modelValue ? 'true' : 'false'"
                    >
                        <button
                            type="button"
                            class="mb-appearance-choice__item"
                            :class="{ 'mb-appearance-choice__item--active': index === active }"
                            @click="choose(item)"
                        >
                            <span>{{ item.title }}</span>
                            <code>{{ item.value }}</code>
                        </button>
                    </li>
                </ul>
                <p v-if="visible.length === 0" class="mb-appearance-choice__empty">
                    {{ t("appearance.choice.noMatch", "No choice matches that search.") }}
                </p>
            </div>
        </v-menu>
    </div>
</template>

<style>
.mb-appearance-choice {
    min-inline-size: 0;
}
.mb-appearance-choice__button {
    display: flex;
    justify-content: space-between;
    inline-size: 100%;
    text-transform: none;
}
.mb-appearance-choice__label {
    overflow: hidden;
    text-overflow: ellipsis;
}
.mb-appearance-choice__value {
    margin-inline-start: 8px;
    font-weight: 500;
}
.mb-appearance-choice__menu {
    inline-size: min(360px, 90vw);
    max-block-size: min(60vh, 480px);
    overflow: auto;
    padding: 10px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    border-radius: 12px;
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: var(--md-sys-elevation-shadow-level3);
}
.mb-appearance-choice__list {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
}
.mb-appearance-choice__item {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    inline-size: 100%;
    min-block-size: 40px;
    padding: 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    text-align: start;
}
.mb-appearance-choice__item:hover,
.mb-appearance-choice__item--active {
    background: rgba(var(--v-theme-primary), 0.12);
}
.mb-appearance-choice__item code {
    opacity: 0.7;
}
.mb-appearance-choice__empty {
    margin: 8px 0 0;
    opacity: 0.75;
}
</style>
