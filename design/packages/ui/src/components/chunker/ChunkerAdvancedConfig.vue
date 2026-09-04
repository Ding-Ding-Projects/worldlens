<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from 'vue-i18n';
import { VBtn, VSwitch } from "vuetify/components";
import ChunkerValueEditor from "./ChunkerValueEditor.vue";
const props = defineProps<{ modelValue: Record<string, any>; sourceWorld: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, any>] }>();
const {t}=useI18n();
const sections = ['blockMappings', 'worldSettings', 'pruning', 'converterSettings', 'dimensionRegistry', 'dimensionMappings', 'biomeMappings'] as const;
const active = ref<(typeof sections)[number]>('converterSettings');
const loading=ref(false); const inspectionMessage=ref('');
async function loadSourceSettings():Promise<void>{
    if(loading.value)return;loading.value=true;
    try {
        const answer=await (globalThis as any).worldlens?.bedrock?.inspectOptions?.(props.sourceWorld);
        if(!answer?.ok)throw Error(answer?.message ?? 'The selected converter cannot inspect source settings.');
        const groups=answer.value.settings as Record<string,{name:string;value:unknown}[]>;
        const values=Object.fromEntries(Object.values(groups).flat().map(entry=>[entry.name,entry.value]));
        update('worldSettings',values);active.value='worldSettings';
        inspectionMessage.value=`Loaded ${Object.keys(values).length} actual source settings from ${answer.value.sourceFormat}.`;
    }catch(error){inspectionMessage.value=error instanceof Error?error.message:String(error);}finally{loading.value=false;}
}
const presets: Record<string, object> = {
    blockMappings: { identifiers: [{ old_identifier: 'minecraft:stone', new_identifier: 'minecraft:stone', old_state_values: {}, new_state_values: {} }], state_lists: {}, types: {} },
    worldSettings: { LevelName: 'Converted World' },
    pruning: { configs: { 'minecraft:overworld': { include: true, regions: [{ minChunkX: 0, minChunkZ: 0, maxChunkX: 31, maxChunkZ: 31 }] } } },
    converterSettings: { mapConversion: true, lootTableConversion: true, itemConversion: true, blockConnections: true, enableCompact: true, discardEmptyChunks: false, preventYBiomeBlending: false, customIdentifiers: true },
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
        <h3>{{t('chunker.advanced.title','Complete converter configuration')}}</h3>
        <VBtn :disabled="loading || !sourceWorld" :loading="loading" @click="loadSourceSettings">{{t('chunker.advanced.load','Load every setting from the source world')}}</VBtn>
        <p role="status">{{inspectionMessage}}</p>
        <p>{{t('chunker.advanced.explain','Each option is independently editable. Templates create editable overrides and are never applied automatically. Advanced values override earlier guided fields for the same option.')}}</p>
        <div role="tablist" aria-label="Chunker configuration options" class="chunker-config-tabs">
            <VBtn v-for="section in sections" :key="section" role="tab" :aria-selected="active === section" @click="active = section">{{ section }}</VBtn>
        </div>
        <VBtn @click="applyTemplate">{{t('chunker.advanced.template','Use editable template')}}: {{ active }}</VBtn>
        <VBtn @click="reset">{{t('chunker.advanced.reset','Reset this option')}}</VBtn>
        <ChunkerValueEditor :key="active" :label="active" :model-value="modelValue[active] ?? {}" @update:model-value="update(active, $event)" />
        <VSwitch :model-value="modelValue.keepOriginalNBT === true" :label="t('chunker.advanced.nbt','Keep original NBT when the exact source and target format match')" @update:model-value="update('keepOriginalNBT', $event === true)" />
        <p>{{t('chunker.advanced.nbtHelp','Original NBT preservation requires the converter to identify the exact source format. A different version or unknown input is refused before writing the converted world.')}}</p>
    </section>
</template>
<style scoped>.chunker-config-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 12px; }</style>
