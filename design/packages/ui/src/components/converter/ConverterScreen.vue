<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCancel, mdiFolderOpenOutline, mdiOpenInNew, mdiPause, mdiPlay, mdiRefresh } from "@mdi/js";
import { VAlert, VBtn, VCard, VChip, VDivider, VProgressLinear, VSelect, VTextarea, VTextField } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { converterBridge, type ConverterAdapter, type ConverterInspection, type ConverterQueueRecord } from "./converterBridge.js";

const { t } = useI18n();
const bridge = converterBridge();
const adapters = ref<readonly ConverterAdapter[]>([]);
const queue = ref<ConverterQueueRecord>({ version: 1, items: [], paused: false });
const query = ref("");
const regex = ref(false);
const flags = ref("im");
const source = ref<string | null>(null);
const outputFolder = ref<string | null>(null);
const targetExtension = ref<string | null>(null);
const inspection = ref<ConverterInspection | null>(null);
const history = ref<readonly { readonly source: string; readonly target: string; readonly message: string; readonly at: string }[]>([]);
const status = ref("");
const pdfOperation = ref("inspect");
const pdfOperationSearch = ref("");
const pdfOperationRegex = ref(false);
const pdfOperationFlags = ref("i");
const pdfRotationSearch = ref("");
const pdfRotationRegex = ref(false);
const pdfRotationFlags = ref("i");
const pdfPages = ref("");
const pdfPageCount = ref<number | null>(null);
const pdfResult = ref<{ readonly pageOrder?: readonly number[]; readonly rotations?: readonly number[]; readonly metadata?: Readonly<Record<string, string>>; readonly outputs?: readonly string[] } | null>(null);
const pdfRotation = ref(90);
const pdfOutput = ref("");
const pdfOutputs = ref("");
const pdfOverwriteConfirmed = ref(false);
const pdfTitle = ref("");
const pdfAuthor = ref("");
const pdfSubject = ref("");
const pdfKeywords = ref("");
const pdfCreator = ref("");
const pdfProducer = ref("");
const categories = [
    ["documents-pdf", "Documents / PDF"], ["images", "Images"], ["audio", "Audio"], ["video", "Video"],
    ["archives", "Archives"], ["structured-data", "Structured data / spreadsheets"], ["code-text", "Code / text"], ["binary-encodings", "Binary encodings"],
] as const;
const pdfOperations = ["inspect", "split", "merge", "extract", "reorder", "rotate", "metadata"];
const visibleAdapters = computed(() => adapters.value.filter((item) => { const haystack = `${item.name} ${item.category} ${item.sourceExtensions.join(" ")} ${item.targetExtensions.join(" ")}`; if (!query.value.trim()) return true; try { return regex.value ? new RegExp(query.value, flags.value).test(haystack) : haystack.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()); } catch { return false; } }));
const visiblePdfOperations = computed(() => { const value = pdfOperationSearch.value.trim(); if (!value) return pdfOperations; try { const matcher = pdfOperationRegex.value ? new RegExp(value, pdfOperationFlags.value) : null; return pdfOperations.filter((item) => matcher ? matcher.test(item) : item.includes(value.toLowerCase())); } catch { return []; } });
const visiblePdfRotations = computed(() => { const value = pdfRotationSearch.value.trim(); const items = [0, 90, 180, 270].map((degree) => ({ title: `${degree} degrees`, value: degree })); if (!value) return items; try { const matcher = pdfRotationRegex.value ? new RegExp(value, pdfRotationFlags.value) : null; return items.filter((item) => matcher ? matcher.test(item.title) : item.title.toLowerCase().includes(value.toLowerCase())); } catch { return []; } });
const selectedAdapter = computed(() => inspection.value?.adapter ?? null);
const targetOptions = computed(() => selectedAdapter.value?.targetExtensions ?? []);
const baseName = computed(() => source.value?.split(/[\r\n]+/)[0]?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "converted");
const targetPath = computed(() => outputFolder.value && targetExtension.value ? `${outputFolder.value}/${baseName.value}.${targetExtension.value}` : null);
const isPdfOperation = computed(() => selectedAdapter.value?.id === "pdf-core" || source.value?.toLowerCase().endsWith(".pdf") === true);
const parsedPdfPages = computed(() => pdfPages.value.split(/[\s,]+/).filter(Boolean).map((value) => Number(value) - 1));
const parsedPdfOutputs = computed(() => pdfOutputs.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean));
const selectedPdfPageCount = computed(() => parsedPdfPages.value.length || pdfPageCount.value || 0);
const historyKey = "worldlens.converter.history.v1";
function formatQueueResult(result: Readonly<Record<string, unknown>> | undefined): string { if (!result) return ""; const order = Array.isArray(result.pageOrder) ? result.pageOrder.join(", ") : "not reported"; const rotations = Array.isArray(result.rotations) ? result.rotations.join(", ") : "not reported"; const outputs = Array.isArray(result.outputs) ? result.outputs.join(", ") : "none"; return `Order ${order}; rotations ${rotations}; outputs ${outputs}`; }

function loadHistory(): void { try { const parsed = JSON.parse(localStorage.getItem(historyKey) ?? "[]"); if (Array.isArray(parsed)) history.value = parsed.slice(0, 100); } catch { history.value = []; } }
function saveHistory(entry: { readonly source: string; readonly target: string; readonly message: string }): void { const next = [{ ...entry, at: new Date().toISOString() }, ...history.value].slice(0, 100); history.value = next; localStorage.setItem(historyKey, JSON.stringify(next)); }
async function refresh(): Promise<void> { if (!bridge) { status.value = "This packaged build has no converter bridge."; return; } adapters.value = await bridge.catalog(); queue.value = await bridge.queue(); }
async function pickSource(): Promise<void> { const path = await globalThis.window?.worldlens?.dialog.pickFile({ title: "Choose a file to inspect" }); if (!path || !bridge) return; source.value = path; inspection.value = await bridge.inspect(path); targetExtension.value = inspection.value.adapter?.targetExtensions[0] ?? null; status.value = inspection.value.message; }
async function pickOutput(): Promise<void> { const dialog = globalThis.window?.worldlens?.dialog; outputFolder.value = dialog ? await dialog.pickFolder({ title: "Choose the output folder" }) : null; }
async function pickPdfOutput(): Promise<void> { const dialog = globalThis.window?.worldlens?.dialog; const folder = dialog ? await dialog.pickFolder({ title: "Choose the PDF output folder" }) : null; if (folder) pdfOutput.value = `${folder}/${baseName.value}-output.pdf`; }
async function pickPdfInput(): Promise<void> { const path = await globalThis.window?.worldlens?.dialog.pickFile({ title: "Choose a PDF input", extensions: ["pdf"] }); if (!path || !bridge) return; const current = source.value ? source.value.split(/\r?\n/).filter(Boolean) : []; if (!current.includes(path)) current.push(path); source.value = current.join("\n"); inspection.value = await bridge.inspect(path); const pdf = await bridge.pdf({ operation: "inspect", inputs: [path], output: "inspect-only.pdf", overwrite: false }); pdfPageCount.value = pdf.pages; }
async function runPdf(): Promise<void> { if (!bridge || !source.value) return; const inputs = source.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean); const output = pdfOutput.value || targetPath.value || (pdfOperation.value === "inspect" ? "inspect-only.pdf" : null); if (!output) { status.value = "Choose an output file or output folder first."; return; } if (pdfOperation.value === "split" && (!selectedPdfPageCount.value || parsedPdfOutputs.value.length !== selectedPdfPageCount.value)) { status.value = "Split needs exactly one output path per selected page."; return; } const request = { operation: pdfOperation.value, inputs, output, overwrite: pdfOverwriteConfirmed.value, ...(pdfOverwriteConfirmed.value ? { overwriteConfirmation: "I_UNDERSTAND_OVERWRITE" } : {}), ...(parsedPdfPages.value.length ? { pages: parsedPdfPages.value } : {}), ...(pdfOperation.value === "rotate" ? { rotation: pdfRotation.value } : {}), ...(parsedPdfOutputs.value.length ? { outputs: parsedPdfOutputs.value } : {}), ...(pdfOperation.value === "metadata" ? { metadata: { title: pdfTitle.value, author: pdfAuthor.value, subject: pdfSubject.value, keywords: pdfKeywords.value, creator: pdfCreator.value, producer: pdfProducer.value } } : {}) }; const result = await bridge.enqueue([{ id: `pdf-${Date.now()}`, source: inputs[0]!, target: output, adapterId: "pdf-core", bytes: null, operation: pdfOperation.value, pdfRequest: request }]); status.value = result.ok ? `PDF ${pdfOperation.value} queued with durable progress.` : result.message ?? "The PDF operation could not be queued."; if (result.ok) saveHistory({ source: inputs.join(", "), target: output, message: `PDF ${pdfOperation.value} queued` }); }
async function convert(): Promise<void> { if (!bridge || !source.value || !targetPath.value || !selectedAdapter.value) return; const result = await bridge.enqueue([{ id: `convert-${Date.now()}`, source: source.value, target: targetPath.value, adapterId: selectedAdapter.value.id, bytes: inspection.value?.bytes ?? null }]); if (!result.ok) { status.value = result.message ?? "The conversion could not be queued."; return; } queue.value = result.queue ?? queue.value; status.value = "Conversion queued with durable progress."; saveHistory({ source: source.value, target: targetPath.value, message: "Queued for conversion" }); }
async function openHistory(path: string): Promise<void> { if (!bridge) return; status.value = (await bridge.openInEditor(path)).message; }
let queueTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => { loadHistory(); void refresh(); queueTimer = setInterval(() => { if (bridge) void bridge.queue().then((value) => { queue.value = value; }); }, 1000); });
onBeforeUnmount(() => { if (queueTimer !== null) clearInterval(queueTimer); });
</script>

<template>
    <section class="mb-converter" data-test="converter-screen" aria-labelledby="converter-title">
        <div class="mb-converter__heading"><div><div class="text-overline">{{ t("converter.overline", "Local file tools") }}</div><h1 id="converter-title">{{ t("converter.title", "Convert files safely") }}</h1><p>{{ t("converter.intro", "Choose a source, preview the detected bytes, select a target and keep every result recoverable.") }}</p></div><VBtn :icon="mdiRefresh" variant="tonal" :aria-label="t('converter.refresh', 'Refresh adapter catalog')" @click="refresh" /></div>
        <ConfigSearchField v-model="query" v-model:regex="regex" v-model:flags="flags" class="mt-4" :label="t('converter.search', 'Search converter adapters')" :sample="visibleAdapters.map((item) => item.name).join('\n')" />
        <div class="mb-converter__actions mt-3"><VBtn color="primary" :prepend-icon="mdiFolderOpenOutline" @click="pickSource">{{ t("converter.chooseSource", "Choose source file") }}</VBtn><VBtn variant="tonal" :prepend-icon="mdiFolderOpenOutline" :disabled="!source" @click="pickOutput">{{ t("converter.chooseOutput", "Choose output folder") }}</VBtn></div>
        <VAlert v-if="status" class="mt-3" type="info" variant="tonal">{{ status }}</VAlert>
        <VCard v-if="inspection" class="mt-3 pa-3" variant="outlined"><strong>{{ inspection.adapter?.name ?? "Unknown format" }}</strong><span class="text-caption ml-2">{{ inspection.bytes ?? 0 }} bytes</span><p class="text-body-2 mt-2">{{ inspection.message }}</p><p v-if="inspection.ambiguous" class="text-caption">Several adapters match these bytes. Choose deliberately.</p><div class="mb-converter__targets"><VBtn v-for="option in targetOptions" :key="option" size="small" :variant="targetExtension === option ? 'flat' : 'outlined'" @click="targetExtension = option">{{ option.toUpperCase() }}</VBtn></div><VBtn class="mt-3" color="primary" :disabled="!targetPath || !selectedAdapter?.available" @click="convert">Convert to {{ targetExtension?.toUpperCase() ?? "target" }}</VBtn><p v-if="!selectedAdapter?.available" class="text-caption mt-2">This adapter is unavailable: {{ selectedAdapter?.unavailableReason }}</p></VCard>
        <VCard v-if="isPdfOperation" class="mt-3 pa-3" variant="outlined"><h2>PDF operation</h2><p class="text-caption">Choose the operation, review inputs and outputs, then run the bundled offline PDF engine.</p><VBtn size="small" variant="tonal" :prepend-icon="mdiFolderOpenOutline" @click="pickPdfInput">Add PDF input</VBtn><VTextarea v-model="source" class="mt-2" label="PDF inputs, one path per line" rows="2"/><ConfigSearchField v-model="pdfOperationSearch" v-model:regex="pdfOperationRegex" v-model:flags="pdfOperationFlags" class="mt-2" label="Search PDF operations" :sample="pdfOperations.join('\n')"/><VSelect v-model="pdfOperation" class="mt-2" label="Operation" :items="visiblePdfOperations" no-data-text="No PDF operation matches this search"/><VTextField v-model="pdfPages" label="Pages, one-based, comma or space separated" hint="Leave empty for every page" persistent-hint/><template v-if="pdfOperation === 'rotate'"><ConfigSearchField v-model="pdfRotationSearch" v-model:regex="pdfRotationRegex" v-model:flags="pdfRotationFlags" label="Search rotation choices" sample="0 degrees\n90 degrees\n180 degrees\n270 degrees"/><VSelect v-model="pdfRotation" label="Rotation" :items="visiblePdfRotations" no-data-text="No rotation matches this search"/></template><div class="mb-converter__output-row"><VTextField v-model="pdfOutput" label="Output PDF path" hint="Browse a destination folder or enter a filename" persistent-hint/><VBtn variant="tonal" :prepend-icon="mdiFolderOpenOutline" aria-label="Browse PDF output folder" @click="pickPdfOutput">Browse</VBtn></div><VTextarea v-if="pdfOperation === 'split'" v-model="pdfOutputs" label="Split output paths, one per line" hint="One output is required for each selected page" persistent-hint rows="2"/><div v-if="pdfOperation === 'metadata'" class="mb-converter__metadata"><VTextField v-model="pdfTitle" label="Title"/><VTextField v-model="pdfAuthor" label="Author"/><VTextField v-model="pdfSubject" label="Subject"/><VTextField v-model="pdfKeywords" label="Keywords, comma separated"/><VTextField v-model="pdfCreator" label="Creator"/><VTextField v-model="pdfProducer" label="Producer"/></div><ConfigSuperConfirm title="Confirm PDF overwrite" action="Overwrite the selected PDF output files after atomic validation. Existing output content will be replaced." confirm-label="Overwrite PDF outputs" @confirm="pdfOverwriteConfirmed = true"><template #activator="{ props }"><VBtn v-bind="props" variant="tonal">Open overwrite confirmation</VBtn></template></ConfigSuperConfirm><VChip v-if="pdfOverwriteConfirmed" color="success" class="ml-2">Overwrite authorized</VChip><VBtn color="primary" class="mt-2" :disabled="pdfOperation !== 'inspect' && (!pdfOutput || (pdfOperation === 'split' && (!selectedPdfPageCount || parsedPdfOutputs.length !== selectedPdfPageCount)))" @click="runPdf">Run PDF {{ pdfOperation }}</VBtn><p class="text-caption mt-2">Review: {{ source?.split(/\r?\n/).filter(Boolean).length ?? 0 }} input(s), {{ selectedPdfPageCount || 'unknown' }} selected page(s), output {{ pdfOutput || targetPath || 'not chosen' }}.</p><div v-if="pdfResult" class="mt-2 text-caption">Order: {{ pdfResult.pageOrder?.join(', ') || 'not reported' }} · Rotations: {{ pdfResult.rotations?.join(', ') || 'not reported' }} · Metadata: {{ JSON.stringify(pdfResult.metadata) }} · Outputs: {{ pdfResult.outputs?.join(', ') || 'none' }}</div></VCard>
        <VCard class="mt-4 pa-3" variant="outlined"><div class="d-flex align-center justify-space-between"><strong>Adapter catalog</strong><span class="text-caption">{{ visibleAdapters.length }} visible</span></div><template v-for="category in categories" :key="category[0]"><h2>{{ category[1] }}</h2><div v-for="adapter in visibleAdapters.filter((item) => item.category === category[0])" :key="adapter.id" class="mb-converter__adapter"><div class="d-flex align-center ga-2"><span>{{ adapter.name }}</span><VChip size="small" :color="adapter.available ? 'success' : 'warning'">{{ adapter.available ? "Bundled" : "Unavailable" }}</VChip></div><span class="text-caption">{{ adapter.sourceExtensions.join(", ") || "content detected" }} → {{ adapter.targetExtensions.join(", ") }}</span><span v-if="!adapter.available" class="text-caption">{{ adapter.unavailableReason }}</span></div></template></VCard>
        <VCard class="mt-4 pa-3" variant="tonal"><div class="d-flex align-center justify-space-between"><strong>Queue</strong><span>{{ queue.items.length }} items, {{ queue.paused ? "paused" : "active" }}</span></div><VAlert v-if="queue.corruption" type="error" variant="tonal">{{ queue.corruption }}</VAlert><div class="mb-converter__actions mt-2"><VBtn size="small" :prepend-icon="mdiPause" @click="bridge?.pause">Pause</VBtn><VBtn size="small" :prepend-icon="mdiPlay" @click="bridge?.resume">Resume</VBtn></div><div v-for="item in queue.items" :key="item.id" class="mt-2"><div class="d-flex justify-space-between text-caption"><span>{{ item.source }}</span><span>{{ item.state }} {{ item.progress }}%</span></div><VProgressLinear :model-value="item.progress" :indeterminate="item.state === 'running' && item.progress === 0"/><p v-if="item.result" class="text-caption">{{ formatQueueResult(item.result) }}</p><div class="mb-converter__actions"><VBtn size="small" :prepend-icon="mdiCancel" :disabled="['completed','cancelled','failed'].includes(item.state)" @click="bridge?.cancel(item.id)">Cancel</VBtn><VBtn v-if="['failed','cancelled'].includes(item.state)" size="small" @click="bridge?.retry(item.id)">Retry</VBtn></div></div></VCard>
        <VCard v-if="history.length" class="mt-4 pa-3" variant="outlined"><strong>Result history</strong><div v-for="entry in history" :key="entry.at + entry.target" class="mb-converter__history mt-2"><span class="text-caption">{{ entry.target }} · {{ entry.message }}</span><VBtn size="small" variant="text" :prepend-icon="mdiOpenInNew" @click="openHistory(entry.target)">Open in VS Code</VBtn></div></VCard>
        <VDivider class="my-4" /><p class="text-caption">Adapters are enabled only when bundled proof exists. Known unavailable formats remain listed with reasons, and no PATH or manual installation is used.</p>
    </section>
</template>

<style scoped>
.mb-converter { max-width: 1100px; margin: 0 auto; padding: 24px; }
.mb-converter__heading { display: flex; justify-content: space-between; gap: 24px; }
.mb-converter__actions, .mb-converter__targets, .mb-converter__output-row { display: flex; flex-wrap: wrap; gap: 8px; }
.mb-converter__output-row .v-text-field { flex: 1 1 300px; }
.mb-converter__adapter { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(120px, .7fr) minmax(220px, 2fr); gap: 12px; padding: 10px 0; border-top: 1px solid rgba(var(--v-theme-outline), .2); }
.mb-converter__history { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
@media (max-width: 720px) { .mb-converter { padding: 12px; } .mb-converter__heading { flex-direction: column; } .mb-converter__adapter, .mb-converter__history { grid-template-columns: 1fr; flex-direction: column; align-items: flex-start; } }
</style>
