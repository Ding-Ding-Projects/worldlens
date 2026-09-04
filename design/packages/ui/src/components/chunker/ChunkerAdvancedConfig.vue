<script setup lang="ts">
import { ref } from "vue";
import { VBtn, VSwitch } from "vuetify/components";
import ChunkerValueEditor from "./ChunkerValueEditor.vue";
const props = defineProps<{ modelValue: Record<string, any> }>();
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, any>] }>();
const sections = ['blockMappings', 'worldSettings', 'pruning', 'converterSettings', 'dimensionRegistry', 'dimensionMappings', 'biomeMappings'] as const;
const active = ref<(typeof sections)[number]>('converterSettings');
const presets: Record<string, object> = {
    blockMappings: { identifiers: [{ old_identifier: 'minecraft:stone', new_identifier: 'minecraft:stone', old_state_values: {}, new_state_values: {} }], state_lists: {}, types: {} },
    worldSettings: { LevelName: 'Converted World' },
    pruning: { configs: { 'minecraft:overworld': { include: true, regions: [{ minChunkX: 0, minChunkZ: 0, maxChunkX: 31, maxChunkZ: 31 }] } } },
    converterSettings: { mapConversion: true, lootTableConversion: true, itemConversion: true, blockConnections: true, enableCompact: true, discardEmptyChunks: true, preventYBiomeBlending: false, customIdentifiers: true },
    dimensionRegistry: { mappings: [{ identifier: 'custom:dimension', biomeHeight: 64, fallbackBiome: 'minecraft:plains' }] },
    dimensionMappings: { 'minecraft:overworld': 'minecraft:overworld' },
    biomeMappings: { 'minecraft:plains': 'minecraft:plains' },
};
function update(key: string, value: unknown): void { emit('update:modelValue', { ...props.modelValue, [key]: value }); }
function reset(): void { const next = { ...props.modelValue }; delete next[active.value]; emit('update:modelValue', next); }
function applyTemplate(): void { update(active.value, structuredClone(presets[active.value])); }
</script>
<template>
    <section data-test="chunker-advanced-config">
        <h3>Complete converter configuration</h3>
        <p>Each option is an independently editable structured value. Applying a template creates editable overrides; no template is applied automatically. These advanced values override the earlier guided fields for the same option.</p>
        <div role="tablist" aria-label="Chunker configuration options" class="chunker-config-tabs">
            <VBtn v-for="section in sections" :key="section" role="tab" :aria-selected="active === section" @click="active = section">{{ section }}</VBtn>
        </div>
        <VBtn @click="applyTemplate">Use editable {{ active }} template</VBtn>
        <VBtn @click="reset">Reset this option</VBtn>
        <ChunkerValueEditor :key="active" :label="active" :model-value="modelValue[active] ?? {}" @update:model-value="update(active, $event)" />
        <VSwitch :model-value="modelValue.keepOriginalNBT === true" label="Keep original NBT when the exact source and target format match" @update:model-value="update('keepOriginalNBT', $event === true)" />
        <p>Original NBT preservation requires the converter to identify the exact source format. A different version or unknown input is refused before writing the converted world.</p>
    </section>
</template>
<style scoped>.chunker-config-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 12px; }</style>
