<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { mdiFileConvertOutline, mdiRefresh, mdiRobotOutline, mdiPause, mdiPlay, mdiCancel, mdiFolderOpenOutline } from "@mdi/js";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { resolveConverterBridge, type ConverterAdapter, type ConverterQueueRecord } from "./converterBridge.js";
import { resolveOllamaBridge, type OllamaCatalogSnapshot, type OllamaTag } from "./ollamaBridge.js";

const converter = resolveConverterBridge();
const ollama = resolveOllamaBridge();
const tab = ref("converter");
const converterSearch = ref("");
const converterRegex = ref(false);
const converterFlags = ref("im");
const ollamaSearch = ref("");
const ollamaRegex = ref(false);
const ollamaFlags = ref("im");
const adapters = ref<readonly ConverterAdapter[]>([]);
const queue = ref<ConverterQueueRecord>({ version: 1, items: [], paused: false });
const inspected = ref<string | null>(null);
const inspectionMessage = ref("");
const health = ref("Not checked");
const modelTags = ref<readonly OllamaTag[]>([]);
const catalog = ref<OllamaCatalogSnapshot | null>(null);
const selectedModel = ref("");
const prompt = ref("");
const chatOutput = ref("");

const categories = [
    ["documents-pdf", "Documents / PDF"], ["images", "Images"], ["audio", "Audio"], ["video", "Video"],
    ["archives", "Archives"], ["structured-data", "Structured data / spreadsheets"], ["code-text", "Code / text"], ["binary-encodings", "Binary encodings"],
] as const;
const categoryLabel = (id: string): string => categories.find(([key]) => key === id)?.[1] ?? id;
const filterText = (value: string, query: string, regex: boolean, flags: string): boolean => {
    if (!query.trim()) return true;
    try { return regex ? new RegExp(query, flags).test(value) : value.toLocaleLowerCase().includes(query.toLocaleLowerCase()); } catch { return false; }
};
const visibleAdapters = computed(() => adapters.value.filter((item) => filterText(`${item.name} ${item.category} ${item.sourceExtensions.join(" ")} ${item.targetExtensions.join(" ")}`, converterSearch.value, converterRegex.value, converterFlags.value)));
const visibleModels = computed(() => modelTags.value.filter((item) => filterText(item.name, ollamaSearch.value, ollamaRegex.value, ollamaFlags.value)));

async function loadConverter(): Promise<void> { if (converter === null) return; adapters.value = await converter.catalog(); queue.value = await converter.queue(); }
async function inspectFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    const path = (file as File & { path?: string } | undefined)?.path;
    if (!path || converter === null) { inspectionMessage.value = "Choose a local file through the native picker."; return; }
    const result = await converter.inspect(path); inspected.value = path; inspectionMessage.value = result.message;
}
async function loadOllama(): Promise<void> {
    if (ollama === null) { health.value = "This build has no local Ollama bridge."; return; }
    const answer = await ollama.health(); health.value = answer.ok ? `Ready${answer.version ? `, ${answer.version}` : ""}` : answer.message;
    const tags = await ollama.tags(); modelTags.value = tags.models ?? [];
    catalog.value = await ollama.catalog();
    selectedModel.value ||= modelTags.value[0]?.name ?? catalog.value?.variants[0]?.name ?? "";
}
async function pullSelected(): Promise<void> { if (!ollama || !selectedModel.value) return; await ollama.pull(selectedModel.value); await loadOllama(); }
async function sendChat(): Promise<void> { if (!ollama || !selectedModel.value || !prompt.value.trim()) return; const answer = await ollama.chat({ model: selectedModel.value, messages: [{ role: "user", content: prompt.value }], stream: false }); chatOutput.value = answer.map((line) => typeof line.response === "string" ? line.response : typeof line.message === "object" && line.message !== null && "content" in line.message ? String((line.message as { content: unknown }).content) : line.error ? String(line.error) : "").join(""); }
onMounted(() => { void loadConverter(); void loadOllama(); });
</script>

<template>
    <section class="mb-converter-ollama" aria-labelledby="converter-ollama-title">
        <div class="mb-converter-ollama__heading">
            <div><div class="text-overline">Local tools</div><h1 id="converter-ollama-title">Convert files and run local models</h1><p>Every adapter and model state is visible, bounded and reversible. Missing dependencies stay disabled with the exact reason.</p></div>
            <v-btn icon variant="tonal" :aria-label="tab === 'converter' ? 'Refresh converter catalog' : 'Refresh Ollama state'" @click="tab === 'converter' ? loadConverter() : loadOllama"><v-icon :icon="mdiRefresh" /></v-btn>
        </div>
        <v-tabs v-model="tab" color="primary" aria-label="Local tools tabs"><v-tab value="converter"><v-icon start :icon="mdiFileConvertOutline" />Converter</v-tab><v-tab value="ollama"><v-icon start :icon="mdiRobotOutline" />Ollama</v-tab></v-tabs>
        <v-window v-model="tab" class="mt-4">
            <v-window-item value="converter">
                <ConfigSearchField v-model="converterSearch" v-model:regex="converterRegex" v-model:flags="converterFlags" label="Search converter adapters" :sample="visibleAdapters.map((item) => item.name).join('\n')" />
                <v-file-input class="mt-3" label="Choose a file to inspect" accept="*/*" prepend-icon="" :prepend-inner-icon="mdiFolderOpenOutline" @change="inspectFile" />
                <v-alert v-if="inspectionMessage" class="mt-2" type="info" variant="tonal">{{ inspectionMessage }}<div v-if="inspected" class="text-caption">{{ inspected }}</div></v-alert>
                <div v-for="category in categories" :key="category[0]" class="mb-converter-category">
                    <h2>{{ category[1] }}</h2>
                    <v-card v-for="adapter in visibleAdapters.filter((item) => item.category === category[0])" :key="adapter.id" variant="outlined" class="mb-2 pa-3">
                        <div class="d-flex align-center ga-3"><div class="font-weight-medium">{{ adapter.name }}</div><v-chip size="small" :color="adapter.available ? 'success' : 'warning'">{{ adapter.available ? 'Bundled' : 'Unavailable' }}</v-chip><span class="text-caption">{{ adapter.sourceExtensions.join(', ') }} → {{ adapter.targetExtensions.join(', ') }}</span></div>
                        <div v-if="!adapter.available" class="text-caption mt-2">{{ adapter.unavailableReason }}</div>
                        <div v-else class="text-caption mt-2">{{ adapter.lossiness }} output. Bounded and validated before it is offered.</div>
                    </v-card>
                </div>
                <v-card variant="tonal" class="mt-4 pa-3"><div class="d-flex align-center justify-space-between"><strong>Queue</strong><span>{{ queue.items.length }} items, {{ queue.paused ? 'paused' : 'running or idle' }}</span></div><div class="d-flex ga-2 mt-2"><v-btn size="small" :prepend-icon="mdiPause" @click="converter?.pause">Pause</v-btn><v-btn size="small" :prepend-icon="mdiPlay" @click="converter?.resume">Resume</v-btn><v-btn size="small" :prepend-icon="mdiCancel" @click="queue.items.find((item) => item.state === 'running' || item.state === 'queued') && converter?.cancel(queue.items.find((item) => item.state === 'running' || item.state === 'queued')!.id)">Cancel next</v-btn></div></v-card>
            </v-window-item>
            <v-window-item value="ollama">
                <ConfigSearchField v-model="ollamaSearch" v-model:regex="ollamaRegex" v-model:flags="ollamaFlags" label="Search local models" :sample="visibleModels.map((model) => model.name).join('\n')" />
                <v-alert class="mt-3" :type="health.startsWith('Ready') ? 'success' : 'warning'" variant="tonal">Local service: {{ health }}<span v-if="catalog"> Catalog: {{ catalog.complete ? `${catalog.variants.length} variants across ${catalog.pages} pages` : 'no verified exhaustive refresh' }}{{ catalog.stale ? ' (stale)' : '' }}.</span></v-alert>
                <v-select v-model="selectedModel" class="mt-3" label="Model or variant" :items="visibleModels" item-title="name" item-value="name" :disabled="visibleModels.length === 0" />
                <div class="d-flex ga-2"><v-btn color="primary" :disabled="!selectedModel" @click="pullSelected">Pull selected model</v-btn><v-btn variant="tonal" @click="loadOllama">Refresh local state</v-btn></div>
                <v-card class="mt-4 pa-3" variant="outlined"><h2>Local chat</h2><v-textarea v-model="prompt" label="Message" rows="3" /><v-btn color="primary" :disabled="!selectedModel || !prompt.trim()" @click="sendChat">Send to local model</v-btn><pre v-if="chatOutput" class="mt-3 mb-converter-ollama__output">{{ chatOutput }}</pre></v-card>
                <p class="text-caption mt-4">Only the documented local Ollama API is used. There is no payment, cloud account or arbitrary shell command, and a missing runtime is handled by the application's automatic acquisition path.</p>
            </v-window-item>
        </v-window>
    </section>
</template>

<style scoped>
.mb-converter-ollama { max-width: 1100px; margin: 0 auto; padding: 24px; }
.mb-converter-ollama__heading { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
.mb-converter-ollama h1 { font-size: clamp(1.4rem, 3vw, 2.2rem); line-height: 1.15; }
.mb-converter-ollama h2 { font-size: 1rem; margin: 18px 0 8px; }
.mb-converter-category { margin-top: 20px; }
.mb-converter-ollama__output { white-space: pre-wrap; max-height: 320px; overflow: auto; }
@media (max-width: 720px) { .mb-converter-ollama { padding: 12px; } .mb-converter-ollama__heading { flex-direction: column; } }
</style>
