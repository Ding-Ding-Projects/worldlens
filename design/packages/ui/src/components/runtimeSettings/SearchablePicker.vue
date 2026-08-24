<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";

const props = defineProps<{
    modelValue: string;
    label: string;
    options: readonly { id: string; label: string }[];
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const query = ref("");
const regex = ref(false);
const flags = ref("im");
const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));
const visible = computed(() =>
    props.options.filter(
        (option) => !matcher.value.active || matcher.value.test(`${option.id}\n${option.label}`),
    ),
);
const open = ref(false);
const activeIndex = ref(0);
const trigger = ref<HTMLButtonElement | null>(null);
function close(): void {
    open.value = false;
    void nextTick(() => trigger.value?.focus());
}
function choose(id: string): void {
    emit("update:modelValue", id);
    close();
}
function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
    }
    if (event.key === "ArrowDown") {
        event.preventDefault();
        activeIndex.value = Math.min(activeIndex.value + 1, Math.max(0, visible.value.length - 1));
    }
    if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIndex.value = Math.max(0, activeIndex.value - 1);
    }
    if (event.key === "Enter" && visible.value[activeIndex.value] !== undefined) {
        event.preventDefault();
        choose(visible.value[activeIndex.value]!.id);
    }
}
</script>
<template>
    <div class="mb-runtime-picker">
        <ConfigSearchField
            v-model="query"
            v-model:regex="regex"
            v-model:flags="flags"
            :label="`Find ${props.label}`"
            :sample="props.options.map((option) => `${option.id} ${option.label}`).join('\n')"
            :summary="matcher.error === null ? `${visible.length} option(s)` : 'Invalid pattern'"
        />
        <label
            >{{ props.label }}
            <button
                ref="trigger"
                type="button"
                aria-haspopup="listbox"
                :aria-expanded="open"
                @click="open = !open"
            >
                {{
                    props.options.find((option) => option.id === props.modelValue)?.label ??
                    "Choose automatically"
                }}
            </button>
        </label>
        <div
            v-if="open"
            class="mb-runtime-picker__list"
            role="listbox"
            :aria-label="props.label"
            tabindex="0"
            @keydown="keydown"
        >
            <button
                v-for="(option, index) in visible"
                :key="option.id"
                type="button"
                role="option"
                :aria-selected="option.id === props.modelValue"
                :class="{ active: index === activeIndex }"
                @click="choose(option.id)"
            >
                {{ option.label }}
            </button>
            <p v-if="visible.length === 0">No matching option</p>
        </div>
    </div>
</template>

<style scoped>
.mb-runtime-picker {
    display: grid;
    gap: 6px;
    min-width: 0;
}
.mb-runtime-picker label {
    display: grid;
    gap: 5px;
}
.mb-runtime-picker label > button,
.mb-runtime-picker__list button {
    min-block-size: 44px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.35);
    border-radius: 8px;
    padding: 8px 10px;
    background: rgb(var(--v-theme-surface));
    color: inherit;
    text-align: start;
}
.mb-runtime-picker__list {
    max-block-size: 16rem;
    overflow: auto;
    display: grid;
    gap: 4px;
    padding: 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.35);
    border-radius: 10px;
    background: rgb(var(--v-theme-surface));
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
}
.mb-runtime-picker__list button.active,
.mb-runtime-picker__list button:hover {
    background: rgba(var(--v-theme-primary), 0.14);
}
.mb-runtime-picker__list p {
    margin: 8px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
button:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
</style>
