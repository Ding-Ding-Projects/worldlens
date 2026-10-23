<script setup lang="ts">
import { computed, ref } from "vue";
import { VBtn, VSelect, VSwitch, VTextField, VTable } from "vuetify/components";
import { workflowText as text } from "../mcserver/workflowText.js";
const props = withDefaults(
    defineProps<{
        modelValue: unknown;
        label: string;
        disabled?: boolean;
        depth?: number;
        recordTemplate?: Record<string, unknown>;
    }>(),
    { disabled: false },
);
const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();
const newKey = ref("");
const newType = ref("string");
const depth = computed(() => props.depth ?? 0);
const object = computed(() =>
    props.modelValue !== null &&
    typeof props.modelValue === "object" &&
    !Array.isArray(props.modelValue)
        ? (props.modelValue as Record<string, unknown>)
        : null,
);
const array = computed(() =>
    Array.isArray(props.modelValue) ? (props.modelValue as unknown[]) : null,
);
const records = computed(
    () =>
        array.value !== null &&
        (array.value.length > 0 || !!props.recordTemplate) &&
        array.value.every((v) => v !== null && typeof v === "object" && !Array.isArray(v)),
);
const columns = computed(() => [
    ...new Set([
        ...Object.keys(props.recordTemplate ?? {}),
        ...(records.value ? array.value! : []).flatMap((row) => Object.keys(row as object)),
    ]),
]);
const kinds = computed(() => [
    { title: text("Text", "文字"), value: "string" },
    { title: text("Number", "數值"), value: "number" },
    { title: text("Boolean", "開關"), value: "boolean" },
    { title: text("List", "清單"), value: "array" },
    { title: text("Object", "物件"), value: "object" },
    { title: text("Null", "空值"), value: "null" },
]);
function blank(kind: string): unknown {
    return kind === "number"
        ? 0
        : kind === "boolean"
          ? false
          : kind === "array"
            ? []
            : kind === "object"
              ? {}
              : kind === "null"
                ? null
                : "";
}
function child(key: string | number, value: unknown): void {
    if (array.value) {
        const copy = [...array.value];
        copy[Number(key)] = value;
        emit("update:modelValue", copy);
    } else if (object.value) emit("update:modelValue", { ...object.value, [key]: value });
}
function cell(index: number, key: string, value: unknown): void {
    child(index, { ...(array.value![index] as object), [key]: value });
}
function remove(key: string | number): void {
    if (array.value)
        emit(
            "update:modelValue",
            array.value.filter((_, index) => index !== key),
        );
    else if (object.value)
        emit(
            "update:modelValue",
            Object.fromEntries(Object.entries(object.value).filter(([name]) => name !== key)),
        );
}
function add(): void {
    if (array.value)
        emit("update:modelValue", [
            ...array.value,
            props.recordTemplate
                ? JSON.parse(JSON.stringify(props.recordTemplate))
                : blank(newType.value),
        ]);
    else if (
        object.value &&
        newKey.value &&
        !Object.hasOwn(object.value, newKey.value) &&
        !["__proto__", "constructor", "prototype"].includes(newKey.value)
    ) {
        child(newKey.value, blank(newType.value));
        newKey.value = "";
    }
}
function number(value: string): void {
    if (value.trim() !== "" && Number.isFinite(Number(value)))
        emit("update:modelValue", Number(value));
}
</script>
<template>
    <div class="typed-value">
        <template v-if="(array || object) && depth < 32">
            <div class="text-subtitle-2">{{ label }}</div>
            <VTable v-if="records" density="compact" class="record-table">
                <thead>
                    <tr>
                        <th v-for="key in columns" :key="key" scope="col">{{ key }}</th>
                        <th scope="col">{{ text("Actions", "操作") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(row, index) in array" :key="index">
                        <td v-for="key in columns" :key="key">
                            <RecursiveValueEditor
                                :model-value="(row as Record<string, unknown>)[key] ?? null"
                                :label="`${label} ${index + 1}: ${key}`"
                                :depth="depth + 1"
                                :disabled="disabled === true"
                                @update:model-value="cell(index, key, $event)"
                            />
                        </td>
                        <td>
                            <VBtn
                                :disabled="props.disabled === true"
                                variant="text"
                                @click="remove(index)"
                                >{{ text("Remove row", "移除記錄") }}</VBtn
                            >
                        </td>
                    </tr>
                </tbody>
            </VTable>
            <template v-else>
                <div v-for="(value, key) in array ?? object" :key="String(key)" class="typed-child">
                    <RecursiveValueEditor
                        :model-value="value"
                        :label="String(key)"
                        :depth="depth + 1"
                        :disabled="disabled === true"
                        @update:model-value="child(key, $event)"
                    />
                    <VBtn
                        :disabled="props.disabled === true"
                        variant="text"
                        :aria-label="`${text('Remove', '移除')} ${key}`"
                        @click="remove(key)"
                        >{{ text("Remove", "移除") }}</VBtn
                    >
                </div>
            </template>
            <div class="typed-add">
                <VTextField
                    v-if="object"
                    v-model="newKey"
                    :label="text('New key', '新增欄位名稱')"
                    :disabled="props.disabled === true"
                    hide-details
                />
                <VSelect
                    v-if="!recordTemplate"
                    v-model="newType"
                    :items="kinds"
                    :label="text('Value type', '數值類型')"
                    :disabled="props.disabled === true"
                    hide-details
                />
                <VBtn :disabled="props.disabled === true || (!!object && !newKey)" @click="add">{{
                    text("Add", "新增")
                }}</VBtn>
            </div>
        </template>
        <VSwitch
            v-else-if="typeof modelValue === 'boolean'"
            :model-value="modelValue"
            :label="label"
            :disabled="props.disabled === true"
            hide-details
            @update:model-value="emit('update:modelValue', $event === true)"
        />
        <VTextField
            v-else-if="typeof modelValue === 'number'"
            :model-value="modelValue"
            type="number"
            :label="label"
            :disabled="props.disabled === true"
            @update:model-value="number"
        />
        <VSelect
            v-else-if="modelValue === null || modelValue === undefined"
            :model-value="'null'"
            :items="kinds"
            :label="label"
            :disabled="props.disabled === true"
            @update:model-value="emit('update:modelValue', blank($event))"
        />
        <VTextField
            v-else-if="typeof modelValue === 'string'"
            :model-value="modelValue"
            :label="label"
            :disabled="props.disabled === true"
            @update:model-value="emit('update:modelValue', $event)"
        />
        <p v-else role="status">
            {{
                text(
                    "This value exceeds the supported nesting depth.",
                    "此數值超出支援的巢狀深度。",
                )
            }}
        </p>
    </div>
</template>
<style scoped>
.typed-value {
    min-width: 0;
    width: 100%;
    white-space: pre-line;
}
.typed-child,
.typed-add {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-block: 8px;
}
.typed-child {
    padding-inline-start: 12px;
    border-inline-start: 2px solid rgb(var(--v-theme-outline-variant));
}
.typed-child > :first-child {
    flex: 1 1 200px;
}
.typed-add > :not(button) {
    flex: 1 1 160px;
}
.record-table {
    max-width: 100%;
    overflow: auto;
}
.record-table td {
    min-width: 180px;
}
</style>
