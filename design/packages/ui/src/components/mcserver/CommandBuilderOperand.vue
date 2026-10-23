<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { VAlert, VBtn, VSelect, VTextField } from "vuetify/components";
import { initialOperand, operandRegistry, type ParserControl, type RegistryData, type TypedOperand } from "./commandBuilderOperands.js";
const props = defineProps<{ modelValue: unknown; parser: ParserControl; registries?: RegistryData; player?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: TypedOperand] }>();
const value = computed(() => props.modelValue && typeof props.modelValue === "object" ? props.modelValue as TypedOperand : initialOperand(props.parser.control, props.player));
function patch(fields: Record<string, unknown>) { emit("update:modelValue", { ...value.value, ...fields }); }
const entityMode = ref(value.value.uuid ? "uuid" : "player");
const selectorVariable = ref("p");
const filters = ref<{ key: string; value: string | number }[]>([]);
const registry = computed(() => operandRegistry(props.parser));
const options = computed(() => props.registries?.values[registry.value] ?? []);
const blockProperties = computed(() => props.registries?.blocks[String(value.value.id)]?.properties ?? {});
function blockProperty(key: string, entry: string) { patch({ properties: { ...(value.value.properties as Record<string, string> ?? {}), [key]: entry } }); }
function selector() { emit("update:modelValue", { kind: "entity", selector: { variable: selectorVariable.value, filters: filters.value.map(filter => ({ ...filter })) } }); }
watch([selectorVariable, filters], () => { if (entityMode.value === "selector") selector(); }, { deep: true });
watch(entityMode, mode => { if (mode === "selector") selector(); else emit("update:modelValue", { kind: "entity", [mode]: mode === "player" ? props.player ?? "" : "" }); });
</script>
<template>
    <div class="my-2" data-test="typed-command-operand">
        <template v-if="parser.control === 'entity'">
            <VSelect v-model="entityMode" :items="['player', 'uuid', 'selector']" label="Target kind" density="compact" />
            <template v-if="entityMode === 'selector'">
                <VSelect v-model="selectorVariable" :items="[{title:'Nearest player',value:'p'},{title:'All players',value:'a'},{title:'Random player',value:'r'},{title:'Executing entity',value:'s'},{title:'All entities',value:'e'},{title:'Nearest entity',value:'n'}]" label="Selector" density="compact" />
                <div v-for="(filter, index) in filters" :key="index" class="d-flex ga-2">
                    <VSelect v-model="filter.key" :items="['name','team','tag','x','y','z','dx','dy','dz','limit','sort']" label="Filter" />
                    <VSelect v-if="filter.key === 'sort'" :model-value="String(filter.value)" :items="['nearest','furthest','random','arbitrary']" label="Order" @update:model-value="filter.value = $event" />
                    <VTextField v-else :model-value="filter.value" :type="['x','y','z','dx','dy','dz','limit'].includes(filter.key) ? 'number' : 'text'" label="Value" @update:model-value="entry => filter.value = ['x','y','z','dx','dy','dz','limit'].includes(filter.key) ? Number(entry) : entry" />
                    <VBtn variant="text" @click="filters.splice(index, 1)">Remove</VBtn>
                </div>
                <VBtn variant="tonal" @click="filters.push({key:'name',value:''})">Add filter</VBtn>
            </template>
            <VTextField v-else :model-value="String(value[entityMode] ?? '')" :label="entityMode === 'uuid' ? 'Player UUID' : 'Player name'" @update:model-value="entry => patch({[entityMode]:entry})" />
        </template>
        <template v-else-if="['block','item','resource'].includes(parser.control)">
            <VAlert v-if="!registries || !registry" type="warning" variant="tonal">Exact version registry data is unavailable. This argument cannot be verified.</VAlert>
            <VSelect :model-value="String(value.id ?? '')" :items="options" :label="registry || parser.control" :disabled="!registries || !registry" @update:model-value="entry => patch({id:entry, ...(parser.control === 'block' ? {properties:{}} : {})})" />
            <VSelect v-for="(entries, key) in blockProperties" :key="key" :model-value="(value.properties as Record<string,string> | undefined)?.[key]" :items="entries" :label="String(key)" clearable @update:model-value="entry => blockProperty(String(key), entry)" />
        </template>
        <template v-else-if="parser.control === 'range'">
            <VTextField :model-value="value.min" type="number" label="Minimum (optional)" @update:model-value="entry => patch({min:entry === '' ? undefined : Number(entry)})" />
            <VTextField :model-value="value.max" type="number" label="Maximum (optional)" @update:model-value="entry => patch({max:entry === '' ? undefined : Number(entry)})" />
        </template>
        <template v-else-if="parser.control === 'rotation'">
            <VTextField :model-value="value.yaw" type="number" label="Yaw" @update:model-value="entry => patch({yaw:Number(entry)})" />
            <VTextField :model-value="value.pitch" type="number" label="Pitch" @update:model-value="entry => patch({pitch:Number(entry)})" />
        </template>
    </div>
</template>
