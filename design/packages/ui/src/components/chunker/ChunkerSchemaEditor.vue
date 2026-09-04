<script setup lang="ts">
import {computed,ref} from 'vue';
import {VBtn,VSwitch,VTextField} from 'vuetify/components';
import GhEntityPicker from '../github/GhEntityPicker.vue';
import ConfigSearchField from '../config/ConfigSearchField.vue';
import {createSettingMatcher} from '../config/regexEngine.js';
defineOptions({name:'ChunkerSchemaEditor'});
interface Schema{kind:string;properties?:Record<string,Schema>;additional?:Schema;keyPattern?:string;item?:Schema;variants?:Schema[];default?:unknown;description?:string}
const props=withDefaults(defineProps<{schema:Schema;modelValue:any;label:string;depth?:number}>(),{depth:0});
const emit=defineEmits<{'update:modelValue':[value:any]}>();
const selected=ref<string|null>(null),dynamicKey=ref(''),query=ref(''),regex=ref(false),flags=ref('i');
const matcher=computed(()=>createSettingMatcher(query.value,regex.value,flags.value));
const objectRows=computed(()=>Object.entries(props.modelValue??{}).filter(([key])=>matcher.value.test(key)));
const choices=computed(()=>Object.entries(props.schema.properties??{}).filter(([key])=>!Object.hasOwn(props.modelValue??{},key)).map(([key,schema])=>({title:`${key} (${schema.kind})`,value:key})));
const keyValid=computed(()=>dynamicKey.value.trim().length>0&&!['__proto__','prototype','constructor'].includes(dynamicKey.value)&&(!props.schema.keyPattern||new RegExp(props.schema.keyPattern).test(dynamicKey.value)));
const activeVariant=computed(()=>props.schema.variants?.find(schema=>schema.kind==='array'?Array.isArray(props.modelValue):schema.kind==='integer'?typeof props.modelValue==='number':schema.kind===typeof props.modelValue)??props.schema.variants?.[0]);
function initial(schema:Schema){return structuredClone(schema.default??(schema.kind==='array'?[]:schema.kind==='object'?{}:schema.kind==='boolean'?false:schema.kind==='integer'||schema.kind==='number'?0:''));}
function put(key:string,value:unknown){emit('update:modelValue',{...(props.modelValue??{}),[key]:value});}
function remove(key:string){const value={...props.modelValue};delete value[key];emit('update:modelValue',value);}
function add(){const key=props.schema.additional?dynamicKey.value.trim():selected.value;const schema=props.schema.additional??(key?props.schema.properties?.[key]:undefined);if(!key||!schema||Object.hasOwn(props.modelValue??{},key)||(props.schema.additional&&!keyValid.value))return;put(key,initial(schema));selected.value=null;dynamicKey.value='';}
function setItem(index:number,value:unknown){const items=[...(props.modelValue??[])];items[index]=value;emit('update:modelValue',items);}
function setVariant(kind:string|null){const variant=props.schema.variants?.find(entry=>entry.kind===kind);if(variant)emit('update:modelValue',initial(variant));}
</script>
<template>
    <fieldset class="chunker-schema"><legend>{{label}}</legend><p v-if="schema.description">{{schema.description}}</p>
        <template v-if="schema.kind==='object'">
            <ConfigSearchField v-model="query" v-model:regex="regex" v-model:flags="flags" :label="`Search ${label}`" :sample="Object.keys(modelValue??{}).join('\n')" :summary="`${objectRows.length} overrides`" />
            <div v-for="[key,value] in objectRows" :key="key">
                <ChunkerSchemaEditor v-if="schema.properties?.[key]||schema.additional" :schema="schema.properties?.[key]??schema.additional!" :model-value="value" :label="key" :depth="depth+1" @update:model-value="put(key,$event)" />
                <p v-else role="alert">{{key}} is not supported by this schema. Remove it before conversion.</p>
                <VBtn size="small" :aria-label="`Remove override ${key}`" @click="remove(key)">Remove override</VBtn>
            </div>
            <GhEntityPicker v-if="schema.properties" v-model="selected" :items="choices" :data-test-base="`chunker-schema-field-${depth}`" search-label="Search supported fields" select-label="Supported field to override" selected-label="Selected field" empty-message="All supported fields already have overrides." no-match-message="No matching field" />
            <VTextField v-if="schema.additional" v-model="dynamicKey" :label="schema.keyPattern?'Namespaced identifier':'Mapping or state name'" :hint="schema.keyPattern?'Use namespace:name. This is a dynamic key accepted by the converter.':'This dictionary accepts user-defined mapping or state names.'" persistent-hint :error="dynamicKey!==''&&!keyValid" />
            <VBtn :disabled="schema.additional?!keyValid:!selected" @click="add">Add supported override</VBtn>
        </template>
        <template v-else-if="schema.kind==='array'">
            <div v-for="(entry,index) in (modelValue??[])" :key="index"><ChunkerSchemaEditor :schema="schema.item!" :model-value="entry" :label="`${label} ${index+1}`" :depth="depth+1" @update:model-value="setItem(index,$event)" /><VBtn size="small" @click="emit('update:modelValue',modelValue.filter((_:unknown,i:number)=>i!==index))">Remove item {{index+1}}</VBtn></div>
            <VBtn @click="emit('update:modelValue',[...(modelValue??[]),initial(schema.item!)])">Add {{label}} item</VBtn>
        </template>
        <template v-else-if="schema.kind==='union'">
            <GhEntityPicker :model-value="activeVariant?.kind" :items="schema.variants!.map(entry=>({title:entry.kind,value:entry.kind}))" :data-test-base="`chunker-schema-type-${depth}`" search-label="Search supported representations" select-label="Supported value representation" selected-label="Selected representation" empty-message="No representation is available" no-match-message="No matching representation" @update:model-value="setVariant" />
            <ChunkerSchemaEditor v-if="activeVariant" :schema="activeVariant" :model-value="modelValue" :label="label" :depth="depth+1" @update:model-value="emit('update:modelValue',$event)" />
        </template>
        <VSwitch v-else-if="schema.kind==='boolean'" :model-value="modelValue===true" :label="label" @update:model-value="emit('update:modelValue',$event===true)" />
        <VTextField v-else :model-value="modelValue" :label="label" :type="['integer','number'].includes(schema.kind)?'number':'text'" :hint="schema.kind==='int64'?'Exact signed 64-bit decimal integer. No rounding.':schema.kind==='identifier'?'Use namespace:name.':''" persistent-hint @update:model-value="emit('update:modelValue',['integer','number'].includes(schema.kind)?Number($event):$event)" />
    </fieldset>
</template>
<style scoped>.chunker-schema{min-width:0;max-width:100%;border:1px solid rgb(var(--v-theme-outline));border-radius:16px;padding:12px;margin-block:8px;overflow-wrap:anywhere;}</style>
