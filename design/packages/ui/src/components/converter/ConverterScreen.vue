<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCancel, mdiFolderOpenOutline, mdiOpenInNew, mdiPause, mdiPlay, mdiRefresh } from "@mdi/js";
import { VAlert, VBtn, VCard, VChip, VDivider, VProgressLinear } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
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
const categories = [
    ["documents-pdf", "Documents / PDF"], ["images", "Images"], ["audio", "Audio"], ["video", "Video"],
    ["archives", "Archives"], ["structured-data", "Structured data / spreadsheets"], ["code-text", "Code / text"], ["binary-encodings", "Binary encodings"],
] as const;
const categoryLabel = (id: string): string => categories.find(([key]) => key === id)?.[1] ?? id;
const matches = (item: ConverterAdapter): boolean => { const haystack = `${item.name} ${item.category} ${item.sourceExtensions.join(" ")} ${item.targetExtensions.join(" ")}`; if (!query.value.trim()) return true; try { return regex.value ? new RegExp(query.value, flags.value).test(haystack) : haystack.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()); } catch { return false; } };
const visibleAdapters = computed(() => adapters.value.filter(matches));
const selectedAdapter = computed(() => inspection.value?.adapter ?? null);
const targetOptions = computed(() => selectedAdapter.value?.targetExtensions ?? []);
const baseName = computed(() => source.value?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "converted");
const targetPath = computed(() => outputFolder.value && targetExtension.value ? `${outputFolder.value}/${baseName.value}.${targetExtension.value}` : null);
const historyKey = "worldlens.converter.history.v1";

function loadHistory(): void { try { const parsed = JSON.parse(localStorage.getItem(historyKey) ?? "[]"); if (Array.isArray(parsed)) history.value = parsed.slice(0, 100); } catch { history.value = []; } }
function saveHistory(entry: { readonly source: string; readonly target: string; readonly message: string }): void { const next = [{ ...entry, at: new Date().toISOString() }, ...history.value].slice(0, 100); history.value = next; localStorage.setItem(historyKey, JSON.stringify(next)); }
async function refresh(): Promise<void> { if (!bridge) { status.value = "This packaged build has no converter bridge."; return; } adapters.value = await bridge.catalog(); queue.value = await bridge.queue(); }
async function pickSource(): Promise<void> { const path = await globalThis.window?.worldlens?.dialog.pickFile({ title: "Choose a file to inspect" }); if (!path || !bridge) return; source.value = path; inspection.value = await bridge.inspect(path); targetExtension.value = inspection.value.adapter?.targetExtensions[0] ?? null; status.value = inspection.value.message; }
async function pickOutput(): Promise<void> { const dialog = globalThis.window?.worldlens?.dialog; outputFolder.value = dialog ? await dialog.pickFolder({ title: "Choose the output folder" }) : null; }
async function convert(): Promise<void> { if (!bridge || !source.value || !targetPath.value || !selectedAdapter.value) return; const result = await bridge.enqueue([{ id: `convert-${Date.now()}`, source: source.value, target: targetPath.value, adapterId: selectedAdapter.value.id, bytes: inspection.value?.bytes ?? null }]); if (!result.ok) { status.value = result.message ?? "The conversion could not be queued."; return; } queue.value = result.queue ?? queue.value; status.value = "Conversion queued with durable progress."; saveHistory({ source: source.value, target: targetPath.value, message: "Queued for conversion" }); }
async function openHistory(path: string): Promise<void> { if (!bridge) return; const result = await bridge.openInEditor(path); status.value = result.message; }
onMounted(() => { loadHistory(); void refresh(); });
</script>

<template>
    <section class="mb-converter" data-test="converter-screen" aria-labelledby="converter-title">
        <div class="mb-converter__heading"><div><div class="text-overline">{{ t("converter.overline", "Local file tools") }}</div><h1 id="converter-title">{{ t("converter.title", "Convert files safely") }}</h1><p>{{ t("converter.intro", "Choose a source, preview the detected bytes, select a target and keep every result recoverable.") }}</p></div><VBtn :icon="mdiRefresh" variant="tonal" :aria-label="t('converter.refresh', 'Refresh adapter catalog')" @click="refresh" /></div>
        <ConfigSearchField v-model="query" v-model:regex="regex" v-model:flags="flags" class="mt-4" :label="t('converter.search', 'Search converter adapters')" :sample="visibleAdapters.map((item) => item.name).join('\n')" />
        <div class="mb-converter__actions mt-3"><VBtn color="primary" :prepend-icon="mdiFolderOpenOutline" @click="pickSource">{{ t("converter.chooseSource", "Choose source file") }}</VBtn><VBtn variant="tonal" :prepend-icon="mdiFolderOpenOutline" :disabled="!source" @click="pickOutput">{{ t("converter.chooseOutput", "Choose output folder") }}</VBtn></div>
        <VAlert v-if="status" class="mt-3" type="info" variant="tonal">{{ status }}</VAlert>
        <VCard v-if="inspection" class="mt-3 pa-3" variant="outlined"><strong>{{ inspection.adapter?.name ?? "Unknown format" }}</strong><span class="text-caption ml-2">{{ inspection.bytes ?? 0 }} bytes</span><p class="text-body-2 mt-2">{{ inspection.message }}</p><p v-if="selectedAdapter" class="text-caption">Loss handling: {{ selectedAdapter.lossiness }}. The source remains untouched.</p><div class="mb-converter__targets"><VBtn v-for="option in targetOptions" :key="option" size="small" :variant="targetExtension === option ? 'flat' : 'outlined'" :color="targetExtension === option ? 'primary' : undefined" @click="targetExtension = option">{{ option.toUpperCase() }}</VBtn></div><VBtn class="mt-3" color="primary" :disabled="!targetPath || !selectedAdapter?.available" @click="convert">Convert to {{ targetExtension?.toUpperCase() ?? "target" }}</VBtn><p v-if="!selectedAdapter?.available" class="text-caption mt-2">This adapter is unavailable: {{ selectedAdapter?.unavailableReason }}</p><p v-else-if="targetPath" class="text-caption mt-2">Output: {{ targetPath }}</p></VCard>
        <VCard class="mt-4 pa-3" variant="outlined"><div class="d-flex align-center justify-space-between"><strong>Adapter catalog</strong><span class="text-caption">{{ visibleAdapters.length }} visible</span></div><template v-for="category in categories" :key="category[0]"><h2>{{ category[1] }}</h2><div v-for="adapter in visibleAdapters.filter((item) => item.category === category[0])" :key="adapter.id" class="mb-converter__adapter"><div class="d-flex align-center ga-2"><span>{{ adapter.name }}</span><VChip size="small" :color="adapter.available ? 'success' : 'warning'">{{ adapter.available ? "Bundled" : "Unavailable" }}</VChip></div><span class="text-caption">{{ adapter.sourceExtensions.join(", ") || "content detected" }} → {{ adapter.targetExtensions.join(", ") }}</span><span v-if="!adapter.available" class="text-caption">{{ adapter.unavailableReason }}</span></div></template></VCard>
        <VCard class="mt-4 pa-3" variant="tonal"><div class="d-flex align-center justify-space-between"><strong>Queue</strong><span>{{ queue.items.length }} items, {{ queue.paused ? "paused" : "active" }}</span></div><div class="mb-converter__actions mt-2"><VBtn size="small" :prepend-icon="mdiPause" @click="bridge?.pause">Pause</VBtn><VBtn size="small" :prepend-icon="mdiPlay" @click="bridge?.resume">Resume</VBtn><VBtn size="small" :prepend-icon="mdiCancel" @click="queue.items.find((item) => item.state === 'queued' || item.state === 'running') && bridge?.cancel(queue.items.find((item) => item.state === 'queued' || item.state === 'running')!.id)">Cancel next</VBtn></div><div v-for="item in queue.items" :key="item.id" class="mt-2"><div class="d-flex justify-space-between text-caption"><span>{{ item.source }}</span><span>{{ item.state }}</span></div><VProgressLinear :model-value="item.progress" :indeterminate="item.state === 'running' && item.progress === 0" /></div></VCard>
        <VCard v-if="history.length" class="mt-4 pa-3" variant="outlined"><strong>Result history</strong><div v-for="entry in history" :key="entry.at + entry.target" class="mb-converter__history mt-2"><span class="text-caption">{{ entry.target }} · {{ entry.message }}</span><VBtn size="small" variant="text" :prepend-icon="mdiOpenInNew" @click="openHistory(entry.target)">Open in VS Code</VBtn></div></VCard>
        <VDivider class="my-4" /><p class="text-caption">Adapters are enabled only when bundled proof exists. Known unavailable formats remain listed with reasons, and no PATH or manual installation is used.</p>
    </section>
</template>

<style scoped>
.mb-converter { max-width: 1100px; margin: 0 auto; padding: 24px; }
.mb-converter__heading { display: flex; justify-content: space-between; gap: 24px; }
.mb-converter__heading h1 { font-size: clamp(1.5rem, 3vw, 2.3rem); line-height: 1.12; }
.mb-converter__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.mb-converter__targets { display: flex; flex-wrap: wrap; gap: 8px; }
.mb-converter__adapter { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(120px, .7fr) minmax(220px, 2fr); gap: 12px; padding: 10px 0; border-top: 1px solid rgba(var(--v-theme-outline), .2); }
.mb-converter__history { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
@media (max-width: 720px) { .mb-converter { padding: 12px; } .mb-converter__heading { flex-direction: column; } .mb-converter__adapter { grid-template-columns: 1fr; } .mb-converter__history { flex-direction: column; align-items: flex-start; } }
</style>
