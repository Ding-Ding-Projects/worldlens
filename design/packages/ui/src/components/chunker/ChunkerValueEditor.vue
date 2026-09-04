<script setup lang="ts">
import { computed, ref } from "vue";
import { VBtn, VSwitch, VTextField } from "vuetify/components";
import GhEntityPicker from "../github/GhEntityPicker.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
defineOptions({ name: "ChunkerValueEditor" });
const props = withDefaults(defineProps<{ modelValue: any; label: string; depth?: number }>(), { depth: 0 });
const emit = defineEmits<{ 'update:modelValue': [value: any] }>();
const query = ref(''); const regex = ref(false); const flags = ref('i');
const key = ref(''); const kind = ref<string | null>('string');
const entries = computed(() => Object.entries(props.modelValue ?? {}));
const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));
const visible = computed(() => entries.value.filter(([name, value]) => matcher.value.test(`${name} ${JSON.stringify(value)}`)));
function set(name: string, value: unknown): void {
    const copy = Array.isArray(props.modelValue) ? [...props.modelValue] : { ...props.modelValue };
    copy[name as any] = value;
    emit('update:modelValue', copy);
}
function remove(name: string): void {
    const copy = Array.isArray(props.modelValue) ? [...props.modelValue] : { ...props.modelValue };
    if (Array.isArray(copy)) copy.splice(Number(name), 1); else delete copy[name];
    emit('update:modelValue', copy);
}
function add(): void {
    const name = Array.isArray(props.modelValue) ? String(props.modelValue.length) : key.value.trim();
    if (!name || ['__proto__', 'constructor', 'prototype'].includes(name) || Object.hasOwn(props.modelValue, name)) return;
    const value = kind.value === 'object' ? {} : kind.value === 'array' ? [] : kind.value === 'boolean' ? false : kind.value === 'number' ? 0 : '';
    set(name, value); key.value = '';
}
</script>
<template>
    <fieldset class="chunker-value-editor">
        <legend>{{ label }}</legend>
        <ConfigSearchField v-model="query" v-model:regex="regex" v-model:flags="flags" :label="`Search ${label}`" :sample="entries.map(([name]) => name).join('\n')" :summary="`${visible.length} / ${entries.length}`" />
        <div v-for="[name, value] in visible" :key="name" class="chunker-value-row">
            <ChunkerValueEditor v-if="value !== null && typeof value === 'object' && depth < 12" :model-value="value" :label="name" :depth="depth + 1" @update:model-value="set(name, $event)" />
            <VSwitch v-else-if="typeof value === 'boolean'" :model-value="value" :label="name" @update:model-value="set(name, $event === true)" />
            <VTextField v-else :model-value="value" :type="typeof value === 'number' ? 'number' : 'text'" :label="name" @update:model-value="set(name, typeof value === 'number' ? Number($event) : $event)" />
            <VBtn size="small" :aria-label="`Remove ${name}`" @click="remove(name)">Remove entry</VBtn>
        </div>
        <p v-if="entries.length === 0">No overrides. The converter's existing settings remain in effect.</p>
        <div v-if="depth < 12">
            <VTextField v-if="!Array.isArray(modelValue)" v-model="key" label="Property name" />
            <GhEntityPicker v-model="kind" :items="['string', 'number', 'boolean', 'object', 'array'].map(value => ({ title: value, value }))" :data-test-base="`chunker-value-type-${depth}`" search-label="Search value types" select-label="Value type" selected-label="Selected type" empty-message="No types available" no-match-message="No matching type" />
            <VBtn size="small" @click="add">Add {{ Array.isArray(modelValue) ? 'item' : 'property' }}</VBtn>
        </div>
    </fieldset>
</template>
<style scoped>
.chunker-value-editor { min-width: 0; max-width: 100%; border: 1px solid rgb(var(--v-theme-outline)); border-radius: 16px; padding: 12px; margin-block: 8px; }
.chunker-value-row { min-width: 0; padding-block: 8px; }
</style>
