<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { mdiOpenInNew, mdiPackageDown, mdiPlay, mdiStop } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardActions, VCardText, VCardTitle, VCheckbox, VChip, VIcon, VProgressLinear, VRadio, VRadioGroup, VSelect, VTextField } from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { resolveStaticExportBridge } from "./staticExportBridge.js";
import type { StaticExportBridge, StaticExportCandidate, StaticExportEvent, StaticExportFormat, StaticExportReport } from "./staticExportBridge.js";

const props = withDefaults(defineProps<{ bridge?: StaticExportBridge | null }>(), {});
const bridge = props.bridge === undefined ? resolveStaticExportBridge() : props.bridge;
const candidates = ref<readonly StaticExportCandidate[]>([]);
const selectedRenderId = ref("");
const selectedMaps = ref<string[]>([]);
const destination = ref("exports/worldlens-map");
const basePath = ref("./");
const format = ref<StaticExportFormat>("zip");
const noJekyll = ref(true);
const compression = ref(true);
const exportId = ref<string | null>(null);
const state = ref<"idle" | "loading" | "running" | "cancelled" | "finished" | "failed">("idle");
const phase = ref("Choose a rendered map to begin");
const progress = ref(0);
const completedFiles = ref(0);
const totalFiles = ref(0);
const message = ref<string | null>(null);
const report = ref<StaticExportReport | null>(null);
const ledgerIds = ref<readonly string[]>([]);
const selectedLedgerId = ref("");
const overwritePrompt = ref(false);
const sevenZipLevel = ref(5);
const sevenZipThreads = ref(2);
const sevenZipSolid = ref(true);
const sevenZipDictionaryKb = ref(4096);
let unsubscribe: (() => void) | null = null;

const selectedCandidate = computed(() => candidates.value.find((entry) => entry.renderId === selectedRenderId.value) ?? null);
const mapItems = computed(() => selectedCandidate.value?.maps.map((value) => ({ title: value, value })) ?? []);
const estimatedFiles = computed(() => totalFiles.value > 0 ? totalFiles.value : (selectedCandidate.value?.maps.length ?? 0));
const formatBytes = (bytes: number): string => bytes < 1_000_000 ? `${Math.round(bytes / 1_000)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;

function onExportEvent(event: StaticExportEvent): void {
    if (exportId.value !== null && event.exportId !== exportId.value) return;
    if (event.type === "started") { exportId.value = event.exportId; state.value = "running"; phase.value = "Inspecting the rendered map…"; return; }
    if (event.type === "progress") { state.value = "running"; phase.value = event.phase === "copying" ? "Copying selected map files…" : event.phase === "validating" ? "Validating every referenced file and checksum…" : event.phase === "packing" ? "Packing the selected archive…" : "Finishing the export…"; completedFiles.value = event.done; totalFiles.value = event.total; progress.value = event.total > 0 ? Math.round((event.done / event.total) * 100) : 0; return; }
    if (event.type === "cancelled") { state.value = "cancelled"; phase.value = "Cancelled safely; the staged files and resume ledger were preserved."; exportId.value = null; void (bridge?.ledger().then((ids) => { ledgerIds.value = ids; })); return; }
    if (event.type === "failed") { state.value = "failed"; message.value = event.message; phase.value = "Export stopped before a result was produced."; exportId.value = null; return; }
    report.value = event.report; state.value = "finished"; progress.value = 100; completedFiles.value = event.report.fileCount; totalFiles.value = event.report.fileCount; phase.value = "Export created and its staged files were validated."; exportId.value = null;
}

async function loadRenders(): Promise<void> {
    if (bridge === null) return;
    state.value = "loading";
    const answer = await bridge.listRenders();
    if (!answer.ok) { state.value = "failed"; message.value = answer.message; phase.value = "Rendered maps could not be listed."; return; }
    candidates.value = answer.value; selectedRenderId.value = candidates.value[0]?.renderId ?? ""; state.value = "idle"; phase.value = candidates.value.length > 0 ? "Ready to inspect the selected map" : "No completed rendered maps are available";
    ledgerIds.value = await bridge.ledger();
}

async function startExport(overwrite = false, overwriteToken?: string): Promise<void> {
    if (bridge === null || selectedRenderId.value.length === 0 || destination.value.trim().length === 0) return;
    message.value = null; report.value = null; progress.value = 0; completedFiles.value = 0; totalFiles.value = 0; state.value = "running"; phase.value = "Starting export…";
    const answer = await bridge.exportMap({ renderId: selectedRenderId.value, destination: destination.value.trim(), format: format.value, maps: selectedMaps.value.length > 0 ? selectedMaps.value : undefined, basePath: basePath.value.trim(), noJekyll: noJekyll.value, compression: compression.value, overwrite, ...(overwriteToken === undefined ? {} : { overwriteToken }), ...(format.value === "7z" ? { sevenZipOptions: { level: sevenZipLevel.value, threads: sevenZipThreads.value, solid: sevenZipSolid.value, dictionaryKb: sevenZipDictionaryKb.value } } : {}) });
    if ("ok" in answer && answer.ok === false) { state.value = "failed"; message.value = answer.message; overwritePrompt.value = answer.message.toLowerCase().includes("already exists"); phase.value = "Export stopped before a result was produced."; }
    else if ("exportId" in answer) { report.value = answer; state.value = "finished"; phase.value = "Export created and its staged files were validated."; progress.value = 100; completedFiles.value = answer.fileCount; totalFiles.value = answer.fileCount; }
}

async function confirmOverwrite(): Promise<void> {
    if (bridge === null) return;
    const token = await bridge.issueOverwriteToken();
    overwritePrompt.value = false;
    await startExport(true, token);
}

async function resumeExport(): Promise<void> {
    if (bridge === null || selectedLedgerId.value.length === 0) return;
    state.value = "running";
    phase.value = "Resuming from the preserved export ledger…";
    const answer = await bridge.resume(selectedLedgerId.value);
    if ("ok" in answer && answer.ok === false) { state.value = "failed"; message.value = answer.message; phase.value = "Resume stopped before a result was produced."; }
    else if ("exportId" in answer) { report.value = answer; state.value = "finished"; phase.value = "Resumed export created and its staged files were validated."; progress.value = 100; completedFiles.value = answer.fileCount; totalFiles.value = answer.fileCount; ledgerIds.value = ledgerIds.value.filter((id) => id !== selectedLedgerId.value); selectedLedgerId.value = ""; }
}

async function cancelExport(): Promise<void> { if (bridge !== null && exportId.value !== null) await bridge.cancel(exportId.value); }
function openResult(): void { if (report.value !== null) window.dispatchEvent(new CustomEvent("worldlens:open-static-export", { detail: report.value.destination })); }
onMounted(() => { unsubscribe = bridge?.onEvent(onExportEvent) ?? null; void loadRenders(); });
onBeforeUnmount(() => unsubscribe?.());
</script>

<template>
    <VCard class="mb-4 static-export-card" data-test="static-export-card">
        <VCardTitle class="d-flex align-center ga-2"><VIcon :icon="mdiPackageDown" aria-hidden="true" /><span>Take a rendered map offline</span><VChip size="small" color="secondary">Guided export</VChip></VCardTitle>
        <VCardText>
            <div class="text-body-1 text-medium-emphasis mb-4">Build a self-contained static site, preview the selected scope, and validate every staged file before the result is reported.</div>
            <VAlert v-if="bridge === null" type="info" variant="tonal">The desktop export bridge is unavailable in this build.</VAlert>
            <VAlert v-else-if="state === 'loading'" type="info" variant="tonal">Finding completed rendered maps…</VAlert>
            <VAlert v-else-if="candidates.length === 0" type="info" variant="tonal">No completed rendered maps are available to export.</VAlert>
            <template v-else>
                <div class="static-export-grid"><VSelect v-model="selectedRenderId" :items="candidates" item-title="renderId" item-value="renderId" label="Rendered map" :disabled="state === 'running'" /><VTextField v-model="destination" label="Destination folder or archive" :disabled="state === 'running'" /><VTextField v-model="basePath" label="Viewer base path" hint="Relative path, for example ./ or /atlas/" persistent-hint :disabled="state === 'running'" /><VRadioGroup v-model="format" inline label="Export as" :disabled="state === 'running'"><VRadio value="folder" label="Folder" /><VRadio value="zip" label="ZIP" /><VRadio value="7z" label="7z" /></VRadioGroup></div>
                <div class="d-flex flex-wrap ga-4 mt-2"><VCheckbox v-for="item in mapItems" :key="item.value" v-model="selectedMaps" :label="`Include ${item.title}`" :value="item.value" hide-details :disabled="state === 'running'" /><VCheckbox v-model="noJekyll" label="Write .nojekyll" hide-details :disabled="state === 'running'" /><VCheckbox v-model="compression" label="Compress archive" hide-details :disabled="format === 'folder' || state === 'running'" /></div>
                <div v-if="format === '7z'" class="static-export-grid mt-3"><VSelect v-model="sevenZipLevel" :items="[0, 1, 3, 5, 7, 9]" label="7z compression level" :disabled="state === 'running'" /><VTextField v-model.number="sevenZipThreads" type="number" min="1" max="16" label="7z threads" :disabled="state === 'running'" /><VCheckbox v-model="sevenZipSolid" label="Solid archive" hide-details :disabled="state === 'running'" /><VTextField v-model.number="sevenZipDictionaryKb" type="number" min="64" max="1048576" label="Dictionary (KiB)" :disabled="state === 'running'" /></div>
                <VAlert type="info" variant="tonal" class="mt-4" data-test="static-export-preview"><span class="font-weight-bold">Preview</span><span class="ml-2">{{ selectedMaps.length || mapItems.length }} map scope entries · {{ estimatedFiles || "file count appears during inspection" }} files after inspection · no external CDN or tracking.</span></VAlert>
                <section v-if="state === 'running' || state === 'cancelled' || state === 'finished'" class="static-export-progress mt-4" aria-live="polite" data-test="static-export-progress"><div class="d-flex justify-space-between ga-3 flex-wrap"><span class="font-weight-bold">{{ phase }}</span><span>{{ progress }}% · {{ completedFiles.toLocaleString() }} / {{ totalFiles.toLocaleString() }} files</span></div><VProgressLinear :model-value="progress" color="primary" height="10" rounded class="mt-2" /></section>
                <VAlert v-if="message !== null" type="error" variant="tonal" class="mt-4">{{ message }}</VAlert>
                <VAlert v-if="report !== null" type="success" variant="tonal" class="mt-4" data-test="static-export-result"><span class="font-weight-bold">Export created</span><div class="text-body-2 mt-1">{{ report.fileCount.toLocaleString() }} files · {{ formatBytes(report.bytes) }} · {{ report.format.toUpperCase() }}</div><div class="text-body-2 mt-1">Manifest: <code>worldlens-export-manifest.json</code></div><div class="text-body-2 mt-1">The manifest records per-file SHA-256 checksums, map metadata, engine provenance, and omissions.</div></VAlert>
            </template>
        </VCardText>
        <VCardActions class="flex-wrap ga-2 px-4 pb-4"><VBtn v-if="state !== 'running'" :prepend-icon="mdiPlay" color="primary" variant="flat" :disabled="bridge === null || selectedRenderId.length === 0" data-test="static-export-start" @click="startExport">{{ state === "finished" ? "Export again" : "Start export" }}</VBtn><VBtn v-else :prepend-icon="mdiStop" color="error" variant="tonal" data-test="static-export-cancel" @click="cancelExport">Cancel export</VBtn><VBtn v-if="report !== null" :prepend-icon="mdiOpenInNew" variant="text" data-test="static-export-open" @click="openResult">Open exported folder</VBtn><span class="text-medium-emphasis ml-auto">{{ destination || "Choose a destination" }}</span></VCardActions>
        <ConfigSuperConfirm v-if="overwritePrompt" title="Replace an existing export" action="The selected destination already exists. Replacing it removes that existing export and writes the new staged result." :affected="[destination]" confirm-label="Replace this export" @confirm="confirmOverwrite"><template #activator="{ props: activator }"><VBtn v-bind="activator" variant="tonal" color="error" class="mx-4 mb-4">Replace existing destination</VBtn></template></ConfigSuperConfirm>
        <div v-if="ledgerIds.length > 0" class="px-4 pb-4"><VSelect v-model="selectedLedgerId" :items="ledgerIds" label="Interrupted export ledger" hint="Cancelled exports keep their staged files and can resume here." persistent-hint /><VBtn variant="tonal" :disabled="selectedLedgerId.length === 0" @click="resumeExport">Resume preserved export</VBtn></div>
    </VCard>
</template>

<style scoped>
.static-export-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 720px) { .static-export-grid { grid-template-columns: 1fr; } }
</style>
