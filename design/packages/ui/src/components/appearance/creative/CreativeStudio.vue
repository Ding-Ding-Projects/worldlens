<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
    addCreativeLayer,
    createCreativeDocument,
    createCreativeLayer,
    exportCreativeDocument,
    groupCreativeLayers,
    importCreativeAsset,
    importCreativeDocument,
    removeCreativeLayers,
    reorderCreativeLayer,
    resetCreativeLayer,
    safeCreativeCapabilities,
    undoCreative,
    redoCreative,
    updateCreativeLayer,
    CREATIVE_BLEND_MODES,
} from "./creativeDocument.js";
import { renderCreativeSvg } from "./creativeRenderer.js";
import {
    type CreativeAppearanceCapabilities,
    type CreativeAppearanceDocument,
    type CreativeLayer,
} from "./creativeTypes.js";

const props = withDefaults(defineProps<{
    modelValue?: CreativeAppearanceDocument;
    targetLabel?: string;
    capabilities?: Partial<CreativeAppearanceCapabilities>;
}>(), {
    targetLabel: "Appearance target",
});

const emit = defineEmits<{
    "update:modelValue": [CreativeAppearanceDocument];
    changed: [CreativeAppearanceDocument];
}>();

const document = ref(props.modelValue ? props.modelValue : createCreativeDocument());
const capabilities = computed(() => safeCreativeCapabilities(props.capabilities));
const selected = computed(() => document.value.selectedLayerIds);
const selectedLayer = computed(() => document.value.layers.find((layer) => layer.id === selected.value[0]));
const query = ref("");
const regexMode = ref(false);
const regexFlags = ref("i");
const fileInput = ref<HTMLInputElement>();
const importError = ref("");
const importState = ref<"idle" | "reading" | "ready" | "error">("idle");

watch(() => props.modelValue, (value) => { if (value) document.value = value; });

const visibleLayers = computed(() => {
    const source = query.value.trim();
    if (!source) return document.value.layers;
    try {
        const matcher = regexMode.value ? new RegExp(source, regexFlags.value) : undefined;
        return document.value.layers.filter((layer) => matcher ? matcher.test(`${layer.name} ${layer.kind}`) : `${layer.name} ${layer.kind}`.toLocaleLowerCase().includes(source.toLocaleLowerCase()));
    } catch {
        return [];
    }
});

function publish(next: CreativeAppearanceDocument): void {
    document.value = next;
    emit("update:modelValue", next);
    emit("changed", next);
}

function selectLayer(layer: CreativeLayer, additive = false): void {
    const next = additive
        ? selected.value.includes(layer.id) ? selected.value.filter((id) => id !== layer.id) : [...selected.value, layer.id]
        : [layer.id];
    publish({ ...document.value, selectedLayerIds: next });
}

function add(kind: "text" | "vector" | "gradient" | "group"): void {
    const capability = kind === "text" ? "text" : kind === "vector" ? "vector" : kind === "gradient" ? "gradient" : "vector";
    if (!capabilities.value[capability]) return;
    publish(addCreativeLayer(document.value, createCreativeLayer(kind), `add ${kind} layer`));
}

function updateSelected(patch: Partial<CreativeLayer>, action = "adjust layer"): void {
    if (!selectedLayer.value) return;
    publish(updateCreativeLayer(document.value, selectedLayer.value.id, patch, action));
}

function inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function inputNumber(event: Event): number {
    return Number(inputValue(event));
}

function blendValue(event: Event): CreativeLayer["blendMode"] {
    return inputValue(event) as CreativeLayer["blendMode"];
}

function layerRotation(layer: CreativeLayer): number {
    return "rotation" in layer ? layer.rotation : 0;
}

function toggleSelected(): void {
    if (!selectedLayer.value) return;
    updateSelected({ visible: !selectedLayer.value.visible }, "toggle layer visibility");
}

function toggleRegex(): void {
    regexMode.value = !regexMode.value;
}

function exportDocument(): void {
    const blob = new Blob([exportCreativeDocument(document.value)], { type: "application/json" });
    const anchor = window.document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "worldlens-creative-appearance.json";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
}

function openImport(): void { fileInput.value?.click(); }

async function onImport(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    importError.value = "";
    importState.value = "reading";
    try {
        const text = await file.text();
        publish(importCreativeDocument(text).document);
        importState.value = "ready";
    } catch (error) {
        importError.value = error instanceof Error ? error.message : "The creative document could not be imported.";
        importState.value = "error";
    }
    (event.target as HTMLInputElement).value = "";
}

async function onAssetImport(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    importError.value = "";
    importState.value = "reading";
    try {
        publish(await importCreativeAsset(file, document.value));
        importState.value = "ready";
    } catch (error) {
        importError.value = error instanceof Error ? error.message : "The image could not be imported.";
        importState.value = "error";
    }
    (event.target as HTMLInputElement).value = "";
}
</script>

<template>
    <section class="mb-creative-studio" :aria-label="`Creative appearance studio for ${targetLabel}`">
        <header class="mb-creative-studio__header">
            <div>
                <p class="mb-creative-studio__eyebrow">Creative appearance studio</p>
                <h2>{{ targetLabel }}</h2>
                <p class="mb-creative-studio__subhead">Compose layers, typography, masks and effects locally. The package identity never changes.</p>
            </div>
            <div class="mb-creative-studio__actions">
                <button type="button" @click="exportDocument">Export</button>
                <button type="button" @click="openImport">Import document</button>
                <input ref="fileInput" class="mb-creative-studio__file" type="file" accept="application/json" aria-label="Import creative document" @change="onImport" />
                <label class="mb-creative-studio__asset-button">Import image
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label="Import image layer" @change="onAssetImport" />
                </label>
            </div>
        </header>

        <div class="mb-creative-studio__toolbar" role="toolbar" aria-label="Creative layer actions">
            <button type="button" @click="add('text')">Add text</button>
            <button type="button" @click="add('vector')">Add shape</button>
            <button type="button" @click="add('gradient')">Add gradient</button>
            <button type="button" @click="add('group')">Add group</button>
            <button type="button" :disabled="selected.length < 2" @click="publish(groupCreativeLayers(document, selected))">Group selected</button>
            <button type="button" :disabled="selected.length === 0" @click="publish(removeCreativeLayers(document, selected))">Delete selected</button>
            <button type="button" :disabled="document.historyCursor <= 0" @click="publish(undoCreative(document))">Undo</button>
            <button type="button" :disabled="document.historyCursor >= document.history.length - 1" @click="publish(redoCreative(document))">Redo</button>
        </div>

        <div class="mb-creative-studio__workbench">
            <aside class="mb-creative-studio__layers" aria-label="Creative layers">
                <div class="mb-creative-studio__search">
                    <input v-model="query" type="search" aria-label="Search creative layers" placeholder="Search layers" />
                    <button type="button" :aria-pressed="regexMode" aria-label="Toggle layer regex builder" @click="toggleRegex">.*</button>
                    <input v-if="regexMode" v-model="regexFlags" class="mb-creative-studio__flags" aria-label="Regex flags" maxlength="8" />
                </div>
                <p v-if="regexMode" class="mb-creative-studio__regex-help">Regex mode uses the local JavaScript engine. Invalid patterns show no matches.</p>
                <ul class="mb-creative-studio__layer-list">
                    <li v-for="layer in visibleLayers" :key="layer.id" :class="{ 'is-selected': selected.includes(layer.id) }">
                        <button type="button" class="mb-creative-studio__layer-row" :aria-pressed="selected.includes(layer.id)" @click="selectLayer(layer, $event.ctrlKey || $event.metaKey)">
                            <span class="mb-creative-studio__layer-kind" aria-hidden="true">{{ layer.kind === 'text' ? 'T' : layer.kind === 'vector' ? '◇' : layer.kind === 'gradient' ? '◒' : layer.kind === 'group' ? '▦' : '▧' }}</span>
                            <span class="mb-creative-studio__layer-name">{{ layer.name }}</span>
                            <span class="mb-creative-studio__layer-state">{{ Math.round(layer.opacity * 100) }}%</span>
                        </button>
                        <button type="button" class="mb-creative-studio__visibility" :aria-label="`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`" @click.stop="selectLayer(layer); toggleSelected()">{{ layer.visible ? '◉' : '○' }}</button>
                        <button type="button" class="mb-creative-studio__move" aria-label="Move layer up" @click.stop="publish(reorderCreativeLayer(document, layer.id, -1))">↑</button>
                        <button type="button" class="mb-creative-studio__move" aria-label="Move layer down" @click.stop="publish(reorderCreativeLayer(document, layer.id, 1))">↓</button>
                    </li>
                </ul>
                <p v-if="visibleLayers.length === 0" class="mb-creative-studio__empty">No layer matches this search.</p>
            </aside>

            <main class="mb-creative-studio__canvas-area">
                <div class="mb-creative-studio__canvas" v-html="renderCreativeSvg(document)" />
                <p class="mb-creative-studio__canvas-caption">Live SVG preview, {{ document.canvas.width }} × {{ document.canvas.height }} px. Every adjustment above changes this preview.</p>
            </main>

            <aside class="mb-creative-studio__properties" aria-label="Selected layer properties">
                <template v-if="selectedLayer">
                    <h3>{{ selectedLayer.name }}</h3>
                    <label>Name <input :value="selectedLayer.name" maxlength="96" @change="updateSelected({ name: inputValue($event) }, 'rename layer')" /></label>
                    <label>Opacity <input :value="selectedLayer.opacity" type="range" min="0" max="1" step="0.01" @input="updateSelected({ opacity: inputNumber($event) }, 'adjust opacity')" /></label>
                    <label>Blend mode
                        <input :value="selectedLayer.blendMode" list="creative-blend-modes" aria-label="Blend mode with local search" @change="updateSelected({ blendMode: blendValue($event) }, 'change blend mode')" />
                        <datalist id="creative-blend-modes"><option v-for="mode in CREATIVE_BLEND_MODES" :key="mode" :value="mode" /></datalist>
                    </label>
                    <template v-if="selectedLayer.kind !== 'group'">
                        <label>X <input :value="selectedLayer.x" type="number" @change="updateSelected({ x: inputNumber($event) }, 'adjust position')" /></label>
                        <label>Y <input :value="selectedLayer.y" type="number" @change="updateSelected({ y: inputNumber($event) }, 'adjust position')" /></label>
                        <label>Width <input :value="selectedLayer.width" type="number" min="1" @change="updateSelected({ width: inputNumber($event) }, 'adjust width')" /></label>
                        <label>Height <input :value="selectedLayer.height" type="number" min="1" @change="updateSelected({ height: inputNumber($event) }, 'adjust height')" /></label>
                        <label>Rotation <input :value="layerRotation(selectedLayer)" type="number" min="-360" max="360" @change="updateSelected({ rotation: inputNumber($event) }, 'rotate layer')" /></label>
                    </template>
                    <label v-if="selectedLayer.kind === 'text'">Text <textarea :value="selectedLayer.text" maxlength="8000" @input="updateSelected({ text: inputValue($event) }, 'edit text')" /></label>
                    <label v-if="'fill' in selectedLayer">Fill <input :value="selectedLayer.fill" type="text" @change="updateSelected({ fill: inputValue($event) }, 'change fill')" /></label>
                    <p v-if="selectedLayer.kind === 'text'" class="mb-creative-studio__hint">Text layers retain the full Word-depth typography shape for the core editor to compose later.</p>
                    <button type="button" @click="publish(resetCreativeLayer(document, selectedLayer.id))">Reset selected layer</button>
                </template>
                <p v-else class="mb-creative-studio__empty">Select a layer to edit it here.</p>
                <p v-if="importState === 'ready'" class="mb-creative-studio__success" role="status">Import complete. The previous document was replaced only after validation.</p>
                <p v-if="importState === 'error'" class="mb-creative-studio__error" role="alert">{{ importError }}</p>
                <p v-if="!capabilities.masks" class="mb-creative-studio__hint">Masks remain visible but unavailable: {{ capabilities.reasonByCapability.masks ?? 'this renderer does not support them yet.' }}</p>
            </aside>
        </div>
    </section>
</template>

<style scoped>
.mb-creative-studio { display: flex; flex-direction: column; gap: 12px; min-inline-size: 0; color: rgb(var(--v-theme-on-surface)); }
.mb-creative-studio__header, .mb-creative-studio__toolbar, .mb-creative-studio__search { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mb-creative-studio__header { justify-content: space-between; padding: 16px; border: 1px solid rgba(var(--v-theme-on-surface), .16); border-radius: 16px; background: rgb(var(--v-theme-surface)); }
.mb-creative-studio__header h2, .mb-creative-studio__header p { margin: 0; }
.mb-creative-studio__eyebrow { font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; opacity: .7; }
.mb-creative-studio__subhead { max-inline-size: 66ch; margin-block-start: 4px !important; opacity: .78; }
.mb-creative-studio button, .mb-creative-studio input, .mb-creative-studio textarea { min-block-size: 36px; border: 1px solid rgba(var(--v-theme-on-surface), .24); border-radius: 8px; background: rgb(var(--v-theme-surface)); color: inherit; padding: 6px 9px; font: inherit; }
.mb-creative-studio button { cursor: pointer; }
.mb-creative-studio button:disabled { opacity: .45; cursor: not-allowed; }
.mb-creative-studio__file, .mb-creative-studio__asset-button input { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.mb-creative-studio__asset-button { display: inline-flex; align-items: center; min-block-size: 36px; padding: 6px 9px; border: 1px solid rgba(var(--v-theme-on-surface), .24); border-radius: 8px; cursor: pointer; }
.mb-creative-studio__toolbar { padding: 8px; overflow-x: auto; }
.mb-creative-studio__workbench { display: grid; grid-template-columns: minmax(190px, 250px) minmax(320px, 1fr) minmax(220px, 300px); gap: 12px; min-block-size: 480px; }
.mb-creative-studio__layers, .mb-creative-studio__properties, .mb-creative-studio__canvas-area { min-inline-size: 0; padding: 12px; border: 1px solid rgba(var(--v-theme-on-surface), .16); border-radius: 16px; background: rgb(var(--v-theme-surface)); }
.mb-creative-studio__layers, .mb-creative-studio__properties { overflow: auto; }
.mb-creative-studio__search input[type="search"] { flex: 1 1 120px; min-inline-size: 0; }
.mb-creative-studio__flags { max-inline-size: 56px; }
.mb-creative-studio__regex-help, .mb-creative-studio__hint, .mb-creative-studio__canvas-caption { margin: 6px 0; font-size: .75rem; opacity: .72; }
.mb-creative-studio__layer-list { display: flex; flex-direction: column; gap: 4px; padding: 0; margin: 10px 0 0; list-style: none; }
.mb-creative-studio__layer-list li { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 2px; border-radius: 8px; }
.mb-creative-studio__layer-list li.is-selected { background: rgba(var(--v-theme-primary), .16); }
.mb-creative-studio__layer-row { display: flex; align-items: center; gap: 6px; text-align: start; border: 0 !important; min-inline-size: 0; }
.mb-creative-studio__layer-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mb-creative-studio__layer-state { font-size: .72rem; opacity: .68; }
.mb-creative-studio__visibility, .mb-creative-studio__move { min-block-size: 30px !important; padding: 2px 5px !important; border: 0 !important; }
.mb-creative-studio__canvas-area { display: flex; flex-direction: column; justify-content: center; min-block-size: 420px; background: repeating-conic-gradient(rgba(var(--v-theme-on-surface), .06) 0 25%, transparent 0 50%) 50% / 24px 24px; }
.mb-creative-studio__canvas { display: grid; place-items: center; min-block-size: 320px; overflow: auto; }
.mb-creative-studio__canvas :deep(svg) { display: block; inline-size: min(100%, 820px); max-block-size: 68vh; block-size: auto; border-radius: 8px; box-shadow: 0 10px 30px rgba(0, 0, 0, .24); }
.mb-creative-studio__properties { display: flex; flex-direction: column; gap: 9px; }
.mb-creative-studio__properties h3 { margin: 0 0 4px; }
.mb-creative-studio__properties label { display: grid; gap: 4px; font-size: .78rem; }
.mb-creative-studio__properties textarea { min-block-size: 72px; resize: vertical; }
.mb-creative-studio__error { color: rgb(var(--v-theme-error)); }
.mb-creative-studio__success { color: rgb(var(--v-theme-success)); }
.mb-creative-studio input:focus-visible, .mb-creative-studio textarea:focus-visible, .mb-creative-studio button:focus-visible, .mb-creative-studio__asset-button:focus-within { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
@media (max-width: 980px) { .mb-creative-studio__workbench { grid-template-columns: minmax(170px, 220px) minmax(260px, 1fr); } .mb-creative-studio__properties { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); } .mb-creative-studio__properties h3, .mb-creative-studio__properties .mb-creative-studio__hint { grid-column: 1 / -1; } }
@media (max-width: 640px) { .mb-creative-studio__workbench { display: flex; flex-direction: column; } .mb-creative-studio__canvas-area { order: -1; } .mb-creative-studio__canvas { min-block-size: 230px; } }
@media (prefers-reduced-motion: reduce) { .mb-creative-studio * { scroll-behavior: auto !important; transition: none !important; } }
</style>
