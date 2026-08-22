<script setup lang="ts">
import { computed } from "vue";
import { VBtn, VTable } from "vuetify/components";
import type { PlainValue, RecordTableControl } from "@worldlens/config";
import ConfigControl from "./ConfigControl.vue";

const props = withDefaults(defineProps<{
    control: RecordTableControl;
    modelValue: readonly PlainValue[];
    label: string;
    disabled?: boolean;
}>(), { disabled: false });

const emit = defineEmits<{ "update:modelValue": [value: PlainValue[]] }>();
const rows = computed(() => props.modelValue.filter((row): row is Record<string, PlainValue> => typeof row === "object" && row !== null && !Array.isArray(row)));

function update(index: number, key: string, value: PlainValue): void {
    const next = rows.value.map((row) => ({ ...row }));
    next[index] = { ...(next[index] ?? {}), [key]: value };
    emit("update:modelValue", next);
}

function add(): void {
    const row: Record<string, PlainValue> = {};
    for (const column of props.control.columns) row[column.key] = column.control.kind === "switch" ? false : column.control.kind === "number" ? (column.control.min ?? 0) : "";
    emit("update:modelValue", [...rows.value, row]);
}

function remove(index: number): void { emit("update:modelValue", rows.value.filter((_, i) => i !== index)); }
</script>

<template>
    <div class="mb-config-record-table" role="group" :aria-label="label">
        <VTable density="compact">
            <thead><tr><th v-for="column in control.columns" :key="column.key">{{ column.label }}</th><th>Actions</th></tr></thead>
            <tbody>
                <tr v-for="(row, index) in rows" :key="index">
                    <td v-for="column in control.columns" :key="column.key">
                        <ConfigControl :control="column.control" :model-value="row[column.key]" :label="`${column.label} ${index + 1}`" :disabled="disabled" @update:model-value="(value) => update(index, column.key, value)" />
                    </td>
                    <td><VBtn size="small" variant="text" :disabled="disabled" @click="remove(index)">Remove</VBtn></td>
                </tr>
            </tbody>
        </VTable>
        <VBtn size="small" variant="tonal" :disabled="disabled" @click="add">Add record</VBtn>
    </div>
</template>
