<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { VBtn, VSwitch, VTextField, VProgressLinear } from 'vuetify/components';
import GhEntityPicker from '../github/GhEntityPicker.vue';
import { loadTargets } from '../remote/remoteTargets.js';
const props=defineProps<{kind:'docker'|'ssh';world:string;output:string;format:string;config:object}>();
const {t}=useI18n();
const host=(globalThis as any).worldlens?.bedrock;
const images=ref<string[]>([]); const image=ref<string|null>(null); const targetId=ref<string|null>(null);
const targets=ref(loadTargets()); const memory=ref(6); const acknowledged=ref(false); const state=ref<any>(null);
const busy=ref(false); const message=ref('');
const target=computed(()=>targets.value.find(entry=>entry.id===targetId.value));
async function refresh():Promise<void>{
    targets.value=loadTargets();
    const result=await host?.containerImages?.();
    if(result?.ok){images.value=result.value;image.value=images.value[0]??null;}
    else message.value=result?.message ?? 'Container execution is unavailable in this build.';
}
async function run(action:'containerStart'|'containerState'|'containerCancel'):Promise<void>{
    if(busy.value)return;busy.value=true;
    try{
        const payload=action==='containerStart'?{...props,image:image.value,target:target.value,memoryGiB:Number(memory.value),acknowledgeTransfer:acknowledged.value}:state.value?.id;
        const result=await host?.[action]?.(payload);
        if(!result?.ok)throw Error(result?.message ?? 'This execution bridge is unavailable.');
        state.value=result.value;message.value=result.value?.message ?? 'No active conversion was found.';
    }catch(error){message.value=error instanceof Error?error.message:String(error);}finally{busy.value=false;}
}
onMounted(()=>void refresh());

const timer=setInterval(()=>{if(state.value&&!state.value.complete&&!busy.value)void run('containerState');},1500);
onBeforeUnmount(()=>clearInterval(timer));
</script>
<template>
    <section class="mb-chunker-container__panel" data-test="chunker-container-panel">
        <h3>{{kind==='ssh'?t('chunker.container.ssh','Convert on an SSH host'):t('chunker.container.local','Convert in a local container')}}</h3>
        <p>{{t('chunker.container.explain','The container reads the source without modifying it, has no network, and writes only its task staging directory. The whole-world JVM uses the memory limit below. Output is installed only after conversion and structural checks finish.')}}</p>
        <GhEntityPicker v-model="image" :items="images.map(value=>({title:value,value}))" data-test-base="chunker-container-image" search-label="Search approved runtimes" select-label="Approved Java runtime" selected-label="Selected runtime" empty-message="No approved runtime is available in this build." no-match-message="No matching runtime" />
        <p>The official runtime is resolved from its canonical registry before transfer, then mounted only by its verified immutable digest.</p>
        <GhEntityPicker v-if="kind==='ssh'" v-model="targetId" :items="targets.map(entry=>({title:`${entry.label} (${entry.user}@${entry.host})`,value:entry.id}))" data-test-base="chunker-container-target" search-label="Search saved hosts" select-label="SSH host" selected-label="Selected host" empty-message="Add a host and verify its key in Remote settings first." no-match-message="No matching host" />
        <p v-if="target">{{target.image}} · {{target.workDir}}</p>
        <div class="mb-chunker-container__actions">
            <VBtn :disabled="busy" @click="refresh">{{t('chunker.container.refresh','Refresh available choices')}}</VBtn>
        </div>
        <VTextField v-model.number="memory" type="number" min="2" max="64" :label="t('chunker.container.memory','Container memory limit (GiB)')" />
        <VSwitch v-model="acknowledged" :label="kind==='ssh'?t('chunker.container.authorizeSsh','I authorize transferring this world to the selected host'):t('chunker.container.authorizeLocal','I authorize the selected container to read this world')" />
        <div class="mb-chunker-container__actions">
            <VBtn :disabled="busy || (state && !state.complete) || !acknowledged || (kind==='ssh'?!target:!image)" @click="run('containerStart')">{{t('chunker.container.start','Start conversion on this route')}}</VBtn>
        </div>
        <p role="status">{{message}}</p>
        <section v-if="state">
            <p>{{state.phase}} · {{state.percent}}%</p>
            <p v-if="state.runtimeImage">{{state.runtimeImage}}</p>
            <VProgressLinear :model-value="state.percent" :indeterminate="!state.complete && state.phase!=='converting'" />
            <VBtn :disabled="busy" @click="run('containerState')">{{t('chunker.container.check','Check conversion progress')}}</VBtn>
            <VBtn :disabled="busy || state.complete" @click="run('containerCancel')">{{t('chunker.container.cancel','Cancel conversion')}}</VBtn>
            <pre style="max-height:20rem;overflow:auto;white-space:pre-wrap">{{state.logs.join('\n')}}</pre>
        </section>
    </section>
</template>

<style scoped>
/*
 * One vertical rhythm for the whole panel, rather than each control being left to whatever
 * margin it happens to carry.
 *
 * The reported defect was a real overlap: a bare `VBtn` is inline-flex, so it sits in an
 * anonymous line box with no block margin under it, and the outlined field that followed
 * began immediately below - close enough that the field's floating label, which is
 * translated up above the field's own top edge, was painted straight over the words on the
 * button. Nothing was mis-sized; there was simply no space between the two, and a button
 * with a label written across it reads as a rendering fault rather than as a layout one.
 *
 * A flex column with a Material Design 3 spacing step between children fixes it at the
 * container rather than one gap at a time, so a control added here later inherits the space
 * instead of re-earning the same defect. `--md-sys-spacing-4` is the 16px step this design
 * system publishes; the literal is the documented fallback used elsewhere in this package.
 */
.mb-chunker-container__panel {
    display: flex;
    flex-direction: column;
    gap: var(--md-sys-spacing-4, 16px);
    align-items: stretch;
}

/*
 * The button row is its own flex line so the button keeps its intrinsic width instead of
 * being stretched across the panel, and so a second action can join it later without
 * needing a second rule.
 */
.mb-chunker-container__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--md-sys-spacing-2, 8px);
}
</style>
