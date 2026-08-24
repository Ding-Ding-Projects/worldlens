<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    addCreativeLayer,
    createCreativeDocument,
    createCreativeLayer,
    commitCreativeChange,
    exportCreativeDocument,
    groupCreativeLayers,
    duplicateCreativeLayers,
    ungroupCreativeLayers,
    alignCreativeLayers,
    distributeCreativeLayers,
    setCreativeCanvas,
    setCreativeLogo,
    saveCreativePreset,
    resetCreativeDocument,
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
import { applyCreativeLogoVariant, releaseCreativeLogoOwnership, resetCreativeLogoPipeline, syncCreativeLogoStore, type CreativeLogoVariantInput } from "./creativeLogoPipeline.js";
import { renderCreativeSvg } from "./creativeRenderer.js";
import {
    type CreativeAppearanceCapabilities,
    type CreativeAppearanceDocument,
    type CreativeLayer,
} from "./creativeTypes.js";
import type { TypographySpec } from "../typographySpec.js";

const props = withDefaults(defineProps<{
    modelValue?: CreativeAppearanceDocument;
    targetLabel?: string;
    capabilities?: Partial<CreativeAppearanceCapabilities>;
}>(), {
    targetLabel: "Appearance target",
});
const { t } = useI18n();

const emit = defineEmits<{
    "update:modelValue": [CreativeAppearanceDocument];
    changed: [CreativeAppearanceDocument];
}>();

const document = ref(props.modelValue ? props.modelValue : createCreativeDocument());
const capabilities = computed(() => safeCreativeCapabilities(props.capabilities));
const selected = computed(() => document.value.selectedLayerIds);
const selectedLayer = computed(() => document.value.layers.find((layer) => layer.id === selected.value[0]));
const editableSelection = computed(() => selected.value.length > 0 && selected.value.every((id) => !document.value.layers.find((layer) => layer.id === id)?.locked));
const clipSources = computed(() => selectedLayer.value ? document.value.layers.filter((layer) => layer.id !== selectedLayer.value!.id && layer.parentId === selectedLayer.value!.parentId && layer.kind !== "group") : []);
const query = ref("");
const regexMode = ref(false);
const regexFlags = ref("i");
const fileInput = ref<HTMLInputElement>();
const importError = ref("");
const fieldError = ref("");
const importState = ref<"idle" | "reading" | "ready" | "error">("idle");
const regexSample = ref("");
const regexPattern = ref("");
const presetQuery = ref("");
const presetRegexMode = ref(false);
const presetRegexFlags = ref("i");

watch(() => props.modelValue, (value) => {
    if (!value) return;
    document.value = value;
    try { syncCreativeLogoStore(value); } catch (error) { fieldError.value = error instanceof Error ? error.message : "The saved logo state could not be restored."; }
});
onMounted(() => {
    try { syncCreativeLogoStore(document.value); } catch (error) { fieldError.value = error instanceof Error ? error.message : "The saved logo state could not be restored."; }
});

const visibleLayers = computed(() => {
    const source = (regexMode.value ? regexPattern.value : query.value).trim();
    if (!source) return document.value.layers;
    try {
        const matcher = regexMode.value ? new RegExp(source, regexFlags.value) : undefined;
        return document.value.layers.filter((layer) => matcher ? matcher.test(`${layer.name} ${layer.kind}`) : `${layer.name} ${layer.kind}`.toLocaleLowerCase().includes(source.toLocaleLowerCase()));
    } catch {
        return [];
    }
});

const visiblePresets = computed(() => {
    if (!presetQuery.value) return document.value.presets;
    try {
        const matcher = presetRegexMode.value ? new RegExp(presetQuery.value, presetRegexFlags.value) : null;
        return document.value.presets.filter((preset) => matcher ? matcher.test(preset.name) : preset.name.toLocaleLowerCase().includes(presetQuery.value.toLocaleLowerCase()));
    } catch {
        return [];
    }
});

const regexStatus = computed(() => {
    if (!regexMode.value) return { error: "", matches: 0, captures: [] as string[] };
    try {
        const matcher = new RegExp(regexPattern.value, regexFlags.value.includes("g") ? regexFlags.value : `${regexFlags.value}g`);
        const matches = [...regexSample.value.matchAll(matcher)];
        return { error: "", matches: matches.length, captures: matches.flatMap((match) => match.slice(1).filter((value): value is string => value !== undefined)) };
    } catch (error) {
        return { error: error instanceof Error ? error.message : "Invalid regular expression.", matches: 0, captures: [] as string[] };
    }
});

function publish(next: CreativeAppearanceDocument): void {
    releaseCreativeLogoOwnership(document.value.logo.target, next.logo.target);
    if (JSON.stringify(next.logo) !== JSON.stringify(document.value.logo)) {
        try {
            syncCreativeLogoStore(next);
        } catch (error) {
            fieldError.value = error instanceof Error ? error.message : "The logo history state could not be replayed.";
            return;
        }
    }
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
    if (selectedLayer.value.locked) {
        fieldError.value = "This layer is locked. Unlock it before editing.";
        return;
    }
    fieldError.value = "";
    const incoming = patch as Record<string, unknown>;
    const numericKeys = ["x", "y", "width", "height", "rotation", "scaleX", "scaleY", "opacity", "strokeWidth"] as const;
    for (const key of numericKeys) {
        const value = incoming[key];
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
            fieldError.value = `${key} must be a finite number.`;
            return;
        }
    }
    const normalized = { ...patch } as Record<string, unknown>;
    if (typeof normalized.name === "string") normalized.name = normalized.name.trim().slice(0, 96);
    if (typeof normalized.opacity === "number") normalized.opacity = Math.min(1, Math.max(0, normalized.opacity));
    if (typeof normalized.width === "number") normalized.width = Math.max(1, Math.min(8192, normalized.width));
    if (typeof normalized.height === "number") normalized.height = Math.max(1, Math.min(8192, normalized.height));
    if (typeof normalized.scaleX === "number") normalized.scaleX = Math.max(0.01, Math.min(100, normalized.scaleX));
    if (typeof normalized.scaleY === "number") normalized.scaleY = Math.max(0.01, Math.min(100, normalized.scaleY));
    if (document.value.canvas.grid.snap) {
        if (typeof normalized.x === "number") normalized.x = Math.round(normalized.x / document.value.canvas.grid.size) * document.value.canvas.grid.size;
        if (typeof normalized.y === "number") normalized.y = Math.round(normalized.y / document.value.canvas.grid.size) * document.value.canvas.grid.size;
    }
    publish(updateCreativeLayer(document.value, selectedLayer.value.id, normalized as Partial<CreativeLayer>, action));
}

function updateTypography(patch: Partial<TypographySpec>, action = "adjust typography"): void {
    if (selectedLayer.value?.kind !== "text") return;
    updateSelected({ typography: { ...selectedLayer.value.typography, ...patch } }, action);
}

function updateEffect(patch: Partial<CreativeLayer["effects"]>, action = "adjust effect"): void {
    if (!selectedLayer.value) return;
    updateSelected({ effects: { ...selectedLayer.value.effects, ...patch } }, action);
}

function updateGradientStop(index: number, patch: { color?: string; offset?: number }): void {
    if (selectedLayer.value?.kind !== "gradient") return;
    const stops = selectedLayer.value.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...patch } : stop);
    updateSelected({ stops }, "adjust gradient stop");
}

function inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function inputNumber(event: Event): number {
    const raw = inputValue(event).trim();
    return raw === "" ? Number.NaN : Number(raw);
}

function blendValue(event: Event): CreativeLayer["blendMode"] {
    return inputValue(event) as CreativeLayer["blendMode"];
}

function logoTargetValue(event: Event): "app-logo" | "appearance-target" {
    return inputValue(event) === "app-logo" ? "app-logo" : "appearance-target";
}

function layerRotation(layer: CreativeLayer): number {
    return "rotation" in layer ? layer.rotation : 0;
}

function layerWidth(layer: CreativeLayer): number {
    return "width" in layer ? layer.width : 100;
}

function layerHeight(layer: CreativeLayer): number {
    return "height" in layer ? layer.height : 100;
}

function toggleSelected(): void {
    if (!selectedLayer.value) return;
    updateSelected({ visible: !selectedLayer.value.visible }, "toggle layer visibility");
}

function toggleLayerLock(): void {
    if (!selectedLayer.value) return;
    publish(updateCreativeLayer(document.value, selectedLayer.value.id, { locked: !selectedLayer.value.locked }, "toggle layer lock"));
}

function toggleRegex(): void {
    regexMode.value = !regexMode.value;
    regexPattern.value = regexMode.value ? query.value : "";
}

function addRegexToken(token: string): void {
    regexPattern.value += token;
    query.value = regexPattern.value;
}

function selectLayerByKeyboard(event: KeyboardEvent, layer: CreativeLayer, index: number): void {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectLayer(layer, event.shiftKey || event.ctrlKey || event.metaKey);
        return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = Math.max(0, Math.min(visibleLayers.value.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    const target = visibleLayers.value[next];
    if (target) selectLayer(target, event.shiftKey);
}

function updateCanvasField(patch: Partial<CreativeAppearanceDocument["canvas"]>, action: string): void {
    publish(setCreativeCanvas(document.value, patch, action));
}

function addGuide(axis: "x" | "y"): void {
    const position = axis === "x" ? Math.round(document.value.canvas.width / 2) : Math.round(document.value.canvas.height / 2);
    const guide = { id: `guide-${Date.now().toString(36)}`, axis, position };
    updateCanvasField({ guides: [...document.value.canvas.guides, guide] }, `add ${axis} guide`);
}

function removeGuide(id: string): void {
    updateCanvasField({ guides: document.value.canvas.guides.filter((guide) => guide.id !== id) }, "remove guide");
}

function generateLogoVariants(): void {
    const svg = renderCreativeSvg(document.value);
    const variants = [24, 64, 128, 256, 512].map((size) => {
        const sizedSvg = svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
        return { id: `logo-${size}`, width: size, height: size, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sizedSvg)}` };
    });
    const next = setCreativeLogo(document.value, { enabled: true, target: document.value.logo.target, variants });
    try {
        publish(applyCreativeLogoVariant(next, variants[2]!));
    } catch (error) {
        importError.value = error instanceof Error ? error.message : "The generated logo variant could not be applied.";
        importState.value = "error";
    }
}

function resetLogoPipeline(): void {
    publish(resetCreativeLogoPipeline(document.value));
}

function applyLogoVariant(variant: CreativeLogoVariantInput): void {
    try {
        publish(applyCreativeLogoVariant(document.value, variant));
    } catch (error) {
        importError.value = error instanceof Error ? error.message : "The logo variant could not be applied.";
        importState.value = "error";
    }
}

function updateLogoPresentation(patch: Partial<CreativeAppearanceDocument["logo"]["presentation"]>): void {
    publish(setCreativeLogo(document.value, { presentation: { ...document.value.logo.presentation, ...patch } }));
}

function applyPreset(id: string): void {
    const preset = document.value.presets.find((candidate) => candidate.id === id);
    if (!preset) return;
    publish(commitCreativeChange(document.value, { canvas: structuredClone(preset.canvas), layers: structuredClone(preset.layers), selectedLayerIds: [] }, "apply creative preset"));
}

function renamePreset(id: string, event: Event): void {
    const name = inputValue(event).trim().slice(0, 96);
    if (!name) return;
    publish(commitCreativeChange({ ...document.value, presets: document.value.presets.map((preset) => preset.id === id ? { ...preset, name } : preset) }, { canvas: document.value.canvas, layers: document.value.layers, selectedLayerIds: document.value.selectedLayerIds }, "rename creative preset"));
}

function deletePreset(id: string): void {
    publish(commitCreativeChange({ ...document.value, presets: document.value.presets.filter((preset) => preset.id !== id) }, { canvas: document.value.canvas, layers: document.value.layers, selectedLayerIds: document.value.selectedLayerIds }, "delete creative preset"));
}

function exportPreset(id: string): void {
    const preset = document.value.presets.find((candidate) => candidate.id === id);
    if (!preset) return;
    const blob = new Blob([JSON.stringify({ format: "worldlens-creative-preset", version: 1, preset }, null, 2)], { type: "application/json" });
    const anchor = window.document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${preset.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "creative-preset"}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
}

async function copyRegex(): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.clipboard) await navigator.clipboard.writeText(regexPattern.value);
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
                <p class="mb-creative-studio__eyebrow">{{ t('appearance.creative.eyebrow', 'Creative appearance studio') }}</p>
                <h2>{{ targetLabel }}</h2>
                <p class="mb-creative-studio__subhead">{{ t('appearance.creative.subhead', 'Compose layers, typography, masks and effects locally. The package identity never changes.') }}</p>
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
            <button type="button" :disabled="selected.length < 2 || !editableSelection" @click="publish(groupCreativeLayers(document, selected))">Group selected</button>
            <button type="button" :disabled="selected.length === 0 || !editableSelection" @click="publish(duplicateCreativeLayers(document, selected))">Duplicate</button>
            <button type="button" :disabled="selected.length !== 1 || selectedLayer?.kind !== 'group' || !editableSelection" @click="publish(ungroupCreativeLayers(document, selected[0]!))">Ungroup</button>
            <button type="button" :disabled="selected.length < 2 || !editableSelection" @click="publish(alignCreativeLayers(document, selected, 'left'))">Align left</button>
            <button type="button" :disabled="selected.length < 2 || !editableSelection" @click="publish(alignCreativeLayers(document, selected, 'middle'))">Align middle</button>
            <button type="button" :disabled="selected.length < 2 || !editableSelection" @click="publish(alignCreativeLayers(document, selected, 'right'))">Align right</button>
            <button type="button" :disabled="selected.length < 2 || !editableSelection" @click="publish(alignCreativeLayers(document, selected, 'top'))">Align top</button>
            <button type="button" :disabled="selected.length < 2 || !editableSelection" @click="publish(alignCreativeLayers(document, selected, 'center'))">Align center</button>
            <button type="button" :disabled="selected.length < 2 || !editableSelection" @click="publish(alignCreativeLayers(document, selected, 'bottom'))">Align bottom</button>
            <button type="button" :disabled="selected.length < 3 || !editableSelection" @click="publish(distributeCreativeLayers(document, selected, 'horizontal'))">Distribute horizontal</button>
            <button type="button" :disabled="selected.length < 3 || !editableSelection" @click="publish(distributeCreativeLayers(document, selected, 'vertical'))">Distribute vertical</button>
            <button type="button" :disabled="selected.length === 0 || !editableSelection" @click="publish(removeCreativeLayers(document, selected))">Delete selected</button>
            <button type="button" :disabled="document.historyCursor <= 0" @click="publish(undoCreative(document))">Undo</button>
            <button type="button" :disabled="document.historyCursor >= document.history.length - 1" @click="publish(redoCreative(document))">Redo</button>
            <button type="button" @click="publish(resetCreativeDocument(document))">Reset document</button>
            <button type="button" @click="resetLogoPipeline">Reset logo pipeline</button>
        </div>

        <div class="mb-creative-studio__workbench">
            <aside class="mb-creative-studio__layers" aria-label="Creative layers">
                <div class="mb-creative-studio__search">
                    <input v-model="query" type="search" aria-label="Search creative layers" placeholder="Search layers" />
                    <button type="button" :aria-pressed="regexMode" aria-label="Toggle layer regex builder" @click="toggleRegex">.*</button>
                    <input v-if="regexMode" v-model="regexFlags" class="mb-creative-studio__flags" aria-label="Regex flags" maxlength="8" />
                </div>
                <div v-if="regexMode" class="mb-creative-studio__regex-builder" aria-label="Layer regex builder">
                    <div class="mb-creative-studio__regex-tokens" aria-label="Guided regex tokens">
                        <button v-for="token in ['^', '$', '.*', '[ ]', '( )', '|', '+']" :key="token" type="button" @click="addRegexToken(token)">{{ token }}</button>
                    </div>
                    <input v-model="regexPattern" aria-label="Regex pattern" placeholder="Raw pattern" />
                    <input v-model="regexFlags" aria-label="Regex flags" maxlength="8" placeholder="Flags" />
                    <textarea v-model="regexSample" aria-label="Regex sample text" placeholder="Sample text for matches and captures" />
                    <p v-if="regexStatus.error" class="mb-creative-studio__error" role="alert">{{ regexStatus.error }}</p>
                    <p v-else class="mb-creative-studio__regex-help">{{ regexStatus.matches }} matches, {{ regexStatus.captures.length }} capture values.</p>
                    <button type="button" @click="copyRegex">Copy pattern</button>
                </div>
                <p v-if="regexMode" class="mb-creative-studio__regex-help">Regex mode uses the local JavaScript engine. Invalid patterns show no matches.</p>
                <div class="mb-creative-studio__selection-count" role="status">{{ selected.length }} layer{{ selected.length === 1 ? '' : 's' }} selected</div>
                <ul class="mb-creative-studio__layer-list" role="listbox" aria-multiselectable="true" aria-label="Creative layers">
                    <li v-for="(layer, index) in visibleLayers" :key="layer.id" role="option" :aria-selected="selected.includes(layer.id)" :class="{ 'is-selected': selected.includes(layer.id) }">
                        <button type="button" class="mb-creative-studio__layer-row" :aria-pressed="selected.includes(layer.id)" @keydown="selectLayerByKeyboard($event, layer, index)" @click="selectLayer(layer, $event.ctrlKey || $event.metaKey || $event.shiftKey)">
                            <span class="mb-creative-studio__layer-kind" aria-hidden="true">{{ layer.kind === 'text' ? 'T' : layer.kind === 'vector' ? '◇' : layer.kind === 'gradient' ? '◒' : layer.kind === 'group' ? '▦' : '▧' }}</span>
                            <span class="mb-creative-studio__layer-name">{{ layer.name }}</span>
                            <span class="mb-creative-studio__layer-state">{{ Math.round(layer.opacity * 100) }}%</span>
                        </button>
                        <button type="button" class="mb-creative-studio__visibility" :disabled="layer.locked" :aria-label="`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`" @click.stop="selectLayer(layer); toggleSelected()">{{ layer.visible ? '◉' : '○' }}</button>
                        <button type="button" class="mb-creative-studio__move" :disabled="layer.locked" aria-label="Move layer up" @click.stop="publish(reorderCreativeLayer(document, layer.id, -1))">↑</button>
                        <button type="button" class="mb-creative-studio__move" :disabled="layer.locked" aria-label="Move layer down" @click.stop="publish(reorderCreativeLayer(document, layer.id, 1))">↓</button>
                    </li>
                </ul>
                <p v-if="visibleLayers.length === 0" class="mb-creative-studio__empty">No layer matches this search.</p>
            </aside>

            <main class="mb-creative-studio__canvas-area">
                <details class="mb-creative-studio__canvas-controls" open>
                    <summary>Canvas, crop, guides and logo variants</summary>
                    <div class="mb-creative-studio__control-grid">
                        <label>Width <input :value="document.canvas.width" type="number" min="1" max="4096" @change="updateCanvasField({ width: inputNumber($event) }, 'resize canvas')" /></label>
                        <label>Height <input :value="document.canvas.height" type="number" min="1" max="4096" @change="updateCanvasField({ height: inputNumber($event) }, 'resize canvas')" /></label>
                        <label>Background <input :value="document.canvas.background" type="text" @change="updateCanvasField({ background: inputValue($event) }, 'change canvas background')" /></label>
                        <label class="mb-creative-studio__check"><input :checked="document.canvas.rulers" type="checkbox" @change="updateCanvasField({ rulers: !document.canvas.rulers }, 'toggle rulers')" /> Rulers</label>
                        <label class="mb-creative-studio__check"><input :checked="document.canvas.grid.enabled" type="checkbox" @change="updateCanvasField({ grid: { ...document.canvas.grid, enabled: !document.canvas.grid.enabled } }, 'toggle grid')" /> Grid</label>
                        <label>Grid size <input :value="document.canvas.grid.size" type="number" min="1" max="512" @change="updateCanvasField({ grid: { ...document.canvas.grid, size: inputNumber($event) } }, 'adjust grid')" /></label>
                        <label class="mb-creative-studio__check"><input :checked="document.canvas.grid.snap" type="checkbox" @change="updateCanvasField({ grid: { ...document.canvas.grid, snap: !document.canvas.grid.snap } }, 'toggle snapping')" /> Snap</label>
                        <label>Safe area <input :value="document.canvas.safeArea.inset" type="number" min="0" max="512" @change="updateCanvasField({ safeArea: { ...document.canvas.safeArea, inset: inputNumber($event) } }, 'adjust safe area')" /></label>
                        <label>Crop top <input :value="document.canvas.crop.top" type="number" min="0" @change="updateCanvasField({ crop: { ...document.canvas.crop, top: inputNumber($event) } }, 'crop canvas')" /></label>
                        <label>Crop right <input :value="document.canvas.crop.right" type="number" min="0" @change="updateCanvasField({ crop: { ...document.canvas.crop, right: inputNumber($event) } }, 'crop canvas')" /></label>
                        <label>Crop bottom <input :value="document.canvas.crop.bottom" type="number" min="0" @change="updateCanvasField({ crop: { ...document.canvas.crop, bottom: inputNumber($event) } }, 'crop canvas')" /></label>
                        <label>Crop left <input :value="document.canvas.crop.left" type="number" min="0" @change="updateCanvasField({ crop: { ...document.canvas.crop, left: inputNumber($event) } }, 'crop canvas')" /></label>
                        <div class="mb-creative-studio__guide-actions"><button type="button" @click="addGuide('x')">Add vertical guide</button><button type="button" @click="addGuide('y')">Add horizontal guide</button></div>
                    </div>
                    <div v-if="document.canvas.guides.length" class="mb-creative-studio__guide-list" aria-label="Canvas guides"><span v-for="guide in document.canvas.guides" :key="guide.id">{{ guide.axis }} {{ guide.position }} <button type="button" :aria-label="`Remove guide ${guide.id}`" @click="removeGuide(guide.id)">×</button></span></div>
                    <div class="mb-creative-studio__logo-controls">
                        <label class="mb-creative-studio__check"><input :checked="document.logo.enabled" type="checkbox" @change="publish(setCreativeLogo(document, { enabled: !document.logo.enabled }))" /> Compose as app logo</label>
                        <label>Logo target <input :value="document.logo.target" list="creative-logo-targets" @change="publish(setCreativeLogo(document, { target: logoTargetValue($event) }))" /></label>
                        <datalist id="creative-logo-targets"><option value="app-logo" /><option value="appearance-target" /></datalist>
                        <label>Logo preset <input :value="document.logo.presentation.presetId" @change="updateLogoPresentation({ presetId: inputValue($event) })" /></label>
                        <label>Logo fit <input :value="document.logo.presentation.fit" list="creative-logo-fit" @change="updateLogoPresentation({ fit: inputValue($event) === 'fill' ? 'fill' : 'contain' })" /></label>
                        <datalist id="creative-logo-fit"><option value="fill" /><option value="contain" /></datalist>
                        <label>Focal X <input :value="document.logo.presentation.focalPoint.x" type="number" min="0" max="100" @change="updateLogoPresentation({ focalPoint: { ...document.logo.presentation.focalPoint, x: inputNumber($event) } })" /></label>
                        <label>Focal Y <input :value="document.logo.presentation.focalPoint.y" type="number" min="0" max="100" @change="updateLogoPresentation({ focalPoint: { ...document.logo.presentation.focalPoint, y: inputNumber($event) } })" /></label>
                        <label>Logo background <input :value="document.logo.presentation.background" list="creative-logo-background" @change="updateLogoPresentation({ background: inputValue($event) === 'solid' ? 'solid' : 'transparent' })" /></label>
                        <datalist id="creative-logo-background"><option value="transparent" /><option value="solid" /></datalist>
                        <label>Background colour <input :value="document.logo.presentation.backgroundColor" @change="updateLogoPresentation({ backgroundColor: inputValue($event) })" /></label>
                        <label>Logo crop top <input :value="document.logo.presentation.crop.top" type="number" min="0" max="40" @change="updateLogoPresentation({ crop: { ...document.logo.presentation.crop, top: inputNumber($event) } })" /></label>
                        <label>Logo crop right <input :value="document.logo.presentation.crop.right" type="number" min="0" max="40" @change="updateLogoPresentation({ crop: { ...document.logo.presentation.crop, right: inputNumber($event) } })" /></label>
                        <label>Logo crop bottom <input :value="document.logo.presentation.crop.bottom" type="number" min="0" max="40" @change="updateLogoPresentation({ crop: { ...document.logo.presentation.crop, bottom: inputNumber($event) } })" /></label>
                        <label>Logo crop left <input :value="document.logo.presentation.crop.left" type="number" min="0" max="40" @change="updateLogoPresentation({ crop: { ...document.logo.presentation.crop, left: inputNumber($event) } })" /></label>
                        <button type="button" @click="publish(saveCreativePreset(document, `Logo preset ${document.presets.length + 1}`))">Save preset</button>
                        <button type="button" @click="generateLogoVariants">Generate logo variants</button>
                    </div>
                    <div v-if="document.logo.variants.length" class="mb-creative-studio__logo-variants" aria-label="Logo size previews">
                        <figure v-for="variant in document.logo.variants" :key="variant.id" :class="{ 'is-active': document.logo.activeVariantId === variant.id }"><img :src="variant.dataUrl" :alt="`Logo preview at ${variant.width} by ${variant.height} pixels`" /><figcaption>{{ variant.width }} × {{ variant.height }} px</figcaption><button type="button" @click="applyLogoVariant(variant)">{{ document.logo.activeVariantId === variant.id ? 'Active' : 'Apply' }}</button></figure>
                    </div>
                    <div class="mb-creative-studio__preset-manager" aria-label="Creative preset manager">
                        <div class="mb-creative-studio__preset-search"><input v-model="presetQuery" type="search" aria-label="Search creative presets" /><button type="button" :aria-pressed="presetRegexMode" aria-label="Toggle preset regex builder" @click="presetRegexMode = !presetRegexMode">.*</button><input v-if="presetRegexMode" v-model="presetRegexFlags" aria-label="Preset regex flags" maxlength="8" /></div>
                        <p v-if="visiblePresets.length === 0" class="mb-creative-studio__hint">No saved preset matches this search.</p>
                        <div v-for="preset in visiblePresets" :key="preset.id" class="mb-creative-studio__preset-row">
                            <input :value="preset.name" :aria-label="`Rename preset ${preset.name}`" @change="renamePreset(preset.id, $event)" />
                            <button type="button" @click="applyPreset(preset.id)">Apply</button>
                            <button type="button" @click="exportPreset(preset.id)">Export</button>
                            <button type="button" @click="deletePreset(preset.id)">Delete</button>
                        </div>
                    </div>
                </details>
                <div class="mb-creative-studio__canvas" v-html="renderCreativeSvg(document)" />
                <p class="mb-creative-studio__canvas-caption">Live SVG preview, {{ document.canvas.width }} × {{ document.canvas.height }} px. Every adjustment above changes this preview.</p>
            </main>

            <aside class="mb-creative-studio__properties" aria-label="Selected layer properties">
                <template v-if="selectedLayer">
                    <h3>{{ selectedLayer.name }}</h3>
                    <p v-if="selectedLayer.locked" class="mb-creative-studio__hint">This layer is locked. Unlock it in the layer list before editing.</p>
                    <label class="mb-creative-studio__check"><input :checked="selectedLayer.locked" type="checkbox" @change="toggleLayerLock" /> Lock layer</label>
                    <fieldset :disabled="selectedLayer.locked" class="mb-creative-studio__property-fieldset">
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
                        <label>Scale X <input :value="'scaleX' in selectedLayer ? selectedLayer.scaleX : 1" type="number" min="0.01" max="100" step="0.01" @change="updateSelected({ scaleX: inputNumber($event) }, 'scale layer')" /></label>
                        <label>Scale Y <input :value="'scaleY' in selectedLayer ? selectedLayer.scaleY : 1" type="number" min="0.01" max="100" step="0.01" @change="updateSelected({ scaleY: inputNumber($event) }, 'scale layer')" /></label>
                    </template>
                    <label v-if="selectedLayer.kind === 'raster'" class="mb-creative-studio__check"><input :checked="selectedLayer.flipX" type="checkbox" @change="updateSelected({ flipX: !selectedLayer.flipX }, 'flip layer')" /> Flip horizontal</label>
                    <label v-if="selectedLayer.kind === 'raster'" class="mb-creative-studio__check"><input :checked="selectedLayer.flipY" type="checkbox" @change="updateSelected({ flipY: !selectedLayer.flipY }, 'flip layer')" /> Flip vertical</label>
                    <label class="mb-creative-studio__check"><input :checked="selectedLayer.clipped" type="checkbox" @change="updateSelected({ clipped: !selectedLayer.clipped }, 'toggle clipping mask')" /> Use as clipping mask</label>
                    <label v-if="clipSources.length">Clip source <input :value="selectedLayer.clipSourceId ?? ''" list="creative-clip-sources" aria-label="Search clipping source layers" @change="updateSelected({ clipped: true, clipSourceId: inputValue($event) || null }, 'set clipping source')" /><datalist id="creative-clip-sources"><option v-for="source in clipSources" :key="source.id" :value="source.id">{{ source.name }}</option></datalist></label>
                    <button v-if="selectedLayer.mask === null" type="button" @click="updateSelected({ mask: { enabled: true, kind: 'rectangle', x: 0, y: 0, width: layerWidth(selectedLayer), height: layerHeight(selectedLayer), feather: 0 } }, 'add mask')">Add mask</button>
                    <fieldset class="mb-creative-studio__effect-fields"><legend>Effects</legend>
                        <label>Blur <input :value="selectedLayer.effects.blur" type="range" min="0" max="128" step="1" @input="updateEffect({ blur: inputNumber($event) })" /></label>
                        <label>Brightness <input :value="selectedLayer.effects.brightness" type="range" min="0" max="3" step="0.01" @input="updateEffect({ brightness: inputNumber($event) })" /></label>
                        <label>Contrast <input :value="selectedLayer.effects.contrast" type="range" min="0" max="3" step="0.01" @input="updateEffect({ contrast: inputNumber($event) })" /></label>
                        <label>Saturation <input :value="selectedLayer.effects.saturation" type="range" min="0" max="3" step="0.01" @input="updateEffect({ saturation: inputNumber($event) })" /></label>
                        <label>Hue <input :value="selectedLayer.effects.hue" type="range" min="-360" max="360" step="1" @input="updateEffect({ hue: inputNumber($event) })" /></label>
                        <label>Grayscale <input :value="selectedLayer.effects.grayscale" type="range" min="0" max="1" step="0.01" @input="updateEffect({ grayscale: inputNumber($event) })" /></label>
                        <label>Sepia <input :value="selectedLayer.effects.sepia" type="range" min="0" max="1" step="0.01" @input="updateEffect({ sepia: inputNumber($event) })" /></label>
                        <label>Invert <input :value="selectedLayer.effects.invert" type="range" min="0" max="1" step="0.01" @input="updateEffect({ invert: inputNumber($event) })" /></label>
                        <label>Shadow colour <input :value="selectedLayer.effects.shadow.color" type="text" @change="updateEffect({ shadow: { ...selectedLayer.effects.shadow, color: inputValue($event) } })" /></label>
                        <label>Shadow X <input :value="selectedLayer.effects.shadow.x" type="number" @change="updateEffect({ shadow: { ...selectedLayer.effects.shadow, x: inputNumber($event) } })" /></label>
                        <label>Shadow Y <input :value="selectedLayer.effects.shadow.y" type="number" @change="updateEffect({ shadow: { ...selectedLayer.effects.shadow, y: inputNumber($event) } })" /></label>
                        <label>Shadow blur <input :value="selectedLayer.effects.shadow.blur" type="number" min="0" max="256" @change="updateEffect({ shadow: { ...selectedLayer.effects.shadow, blur: inputNumber($event) } })" /></label>
                        <label>Outer glow radius <input :value="selectedLayer.effects.outerGlow.radius" type="number" min="0" max="256" @change="updateEffect({ outerGlow: { ...selectedLayer.effects.outerGlow, radius: inputNumber($event) } })" /></label>
                        <label>Outer glow colour <input :value="selectedLayer.effects.outerGlow.color" type="text" @change="updateEffect({ outerGlow: { ...selectedLayer.effects.outerGlow, color: inputValue($event) } })" /></label>
                        <label>Inner glow radius <input :value="selectedLayer.effects.innerGlow.radius" type="number" min="0" max="256" @change="updateEffect({ innerGlow: { ...selectedLayer.effects.innerGlow, radius: inputNumber($event) } })" /></label>
                        <label>Inner glow colour <input :value="selectedLayer.effects.innerGlow.color" type="text" @change="updateEffect({ innerGlow: { ...selectedLayer.effects.innerGlow, color: inputValue($event) } })" /></label>
                    </fieldset>
                    <fieldset v-if="selectedLayer.mask" class="mb-creative-studio__effect-fields"><legend>Mask</legend>
                        <label class="mb-creative-studio__check"><input :checked="selectedLayer.mask.enabled" type="checkbox" @change="updateSelected({ mask: { ...selectedLayer.mask, enabled: !selectedLayer.mask.enabled } }, 'toggle mask')" /> Mask enabled</label>
                        <label>Mask width <input :value="selectedLayer.mask.width" type="number" min="1" @change="updateSelected({ mask: { ...selectedLayer.mask, width: inputNumber($event) } }, 'resize mask')" /></label>
                        <label>Mask height <input :value="selectedLayer.mask.height" type="number" min="1" @change="updateSelected({ mask: { ...selectedLayer.mask, height: inputNumber($event) } }, 'resize mask')" /></label>
                        <label>Feather <input :value="selectedLayer.mask.feather" type="number" min="0" max="256" @change="updateSelected({ mask: { ...selectedLayer.mask, feather: inputNumber($event) } }, 'feather mask')" /></label>
                    </fieldset>
                    <label v-if="selectedLayer.kind === 'text'">Text <textarea :value="selectedLayer.text" maxlength="8000" @input="updateSelected({ text: inputValue($event) }, 'edit text')" /></label>
                    <fieldset v-if="selectedLayer.kind === 'text'" class="mb-creative-studio__effect-fields"><legend>Word-depth typography</legend>
                        <label>Font family <input :value="selectedLayer.typography.fontFamily ?? 'Roboto'" @change="updateTypography({ fontFamily: inputValue($event) })" /></label>
                        <label>Font size <input :value="selectedLayer.typography.fontSize ?? 14" type="number" min="1" max="512" @change="updateTypography({ fontSize: inputNumber($event) })" /></label>
                        <label>Weight <input :value="selectedLayer.typography.fontWeight ?? 400" type="number" min="1" max="1000" @change="updateTypography({ fontWeight: inputNumber($event) })" /></label>
                        <label class="mb-creative-studio__check"><input :checked="selectedLayer.typography.bold ?? false" type="checkbox" @change="updateTypography({ bold: !selectedLayer.typography.bold })" /> Bold</label>
                        <label class="mb-creative-studio__check"><input :checked="selectedLayer.typography.smallCaps ?? false" type="checkbox" @change="updateTypography({ smallCaps: !selectedLayer.typography.smallCaps })" /> Small caps</label>
                        <label>Text colour <input :value="selectedLayer.typography.textColor ?? ''" @change="updateTypography({ textColor: inputValue($event) })" /></label>
                        <label>Highlight <input :value="selectedLayer.typography.highlight ?? ''" @change="updateTypography({ highlight: inputValue($event) })" /></label>
                        <label>Letter spacing <input :value="selectedLayer.typography.letterSpacing ?? 0" type="number" min="-20" max="100" step="0.1" @change="updateTypography({ letterSpacing: inputNumber($event) })" /></label>
                        <label>Line height <input :value="selectedLayer.typography.lineHeight ?? 1.5" type="number" min="0.5" max="5" step="0.1" @change="updateTypography({ lineHeight: inputNumber($event) })" /></label>
                    </fieldset>
                    <fieldset v-if="selectedLayer.kind === 'gradient'" class="mb-creative-studio__effect-fields"><legend>Gradient stops</legend>
                        <label>Angle <input :value="selectedLayer.angle" type="number" min="-360" max="360" @change="updateSelected({ angle: inputNumber($event) }, 'rotate gradient')" /></label>
                        <div v-for="(stop, stopIndex) in selectedLayer.stops" :key="`${selectedLayer.id}-stop-${stopIndex}`" class="mb-creative-studio__stop">
                            <input :value="stop.color" aria-label="Gradient stop colour" @change="updateGradientStop(stopIndex, { color: inputValue($event) })" />
                            <input :value="stop.offset" aria-label="Gradient stop position" type="range" min="0" max="1" step="0.01" @input="updateGradientStop(stopIndex, { offset: inputNumber($event) })" />
                        </div>
                    </fieldset>
                    <label v-if="'fill' in selectedLayer">Fill <input :value="selectedLayer.fill" type="text" @change="updateSelected({ fill: inputValue($event) }, 'change fill')" /></label>
                    <p v-if="selectedLayer.kind === 'text'" class="mb-creative-studio__hint">Text layers retain the full Word-depth typography shape for the core editor to compose later.</p>
                    <button type="button" @click="publish(resetCreativeLayer(document, selectedLayer.id))">Reset selected layer</button>
                    </fieldset>
                </template>
                <p v-else class="mb-creative-studio__empty">Select a layer to edit it here.</p>
                <p v-if="importState === 'ready'" class="mb-creative-studio__success" role="status">Import complete. The previous document was replaced only after validation.</p>
                <p v-if="importState === 'error'" class="mb-creative-studio__error" role="alert">{{ importError }}</p>
                <p v-if="fieldError" class="mb-creative-studio__error" role="alert">{{ fieldError }}</p>
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
.mb-creative-studio__toolbar button, .mb-creative-studio__layer-row, .mb-creative-studio__visibility, .mb-creative-studio__move { min-block-size: 48px !important; }
.mb-creative-studio__workbench { display: grid; grid-template-columns: minmax(190px, 250px) minmax(320px, 1fr) minmax(220px, 300px); gap: 12px; min-block-size: 480px; }
.mb-creative-studio__layers, .mb-creative-studio__properties, .mb-creative-studio__canvas-area { min-inline-size: 0; padding: 12px; border: 1px solid rgba(var(--v-theme-on-surface), .16); border-radius: 16px; background: rgb(var(--v-theme-surface)); }
.mb-creative-studio__layers, .mb-creative-studio__properties { overflow: auto; }
.mb-creative-studio__search input[type="search"] { flex: 1 1 120px; min-inline-size: 0; }
.mb-creative-studio__flags { max-inline-size: 56px; }
.mb-creative-studio__regex-help, .mb-creative-studio__hint, .mb-creative-studio__canvas-caption { margin: 6px 0; font-size: .75rem; opacity: .72; }
.mb-creative-studio__regex-builder, .mb-creative-studio__canvas-controls { display: flex; flex-direction: column; gap: 7px; margin-block: 8px; padding: 8px; border: 1px solid rgba(var(--v-theme-on-surface), .16); border-radius: 10px; }
.mb-creative-studio__regex-tokens, .mb-creative-studio__control-grid, .mb-creative-studio__logo-controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mb-creative-studio__control-grid label, .mb-creative-studio__logo-controls label { display: grid; gap: 3px; font-size: .75rem; }
.mb-creative-studio__check { display: flex !important; align-items: center; gap: 6px; }
.mb-creative-studio__selection-count { font-size: .75rem; opacity: .72; padding-block: 4px; }
.mb-creative-studio__effect-fields { display: grid; gap: 7px; border: 1px solid rgba(var(--v-theme-on-surface), .16); border-radius: 8px; padding: 8px; }
.mb-creative-studio__effect-fields legend { padding-inline: 4px; font-size: .75rem; }
.mb-creative-studio__stop { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.mb-creative-studio__logo-variants { display: flex; flex-wrap: wrap; gap: 8px; margin-block-start: 8px; }
.mb-creative-studio__logo-variants figure { display: grid; gap: 4px; place-items: center; margin: 0; font-size: .7rem; }
.mb-creative-studio__logo-variants img { inline-size: 64px; block-size: 64px; object-fit: contain; border: 1px dashed rgba(var(--v-theme-on-surface), .24); border-radius: 8px; background: repeating-conic-gradient(rgba(var(--v-theme-on-surface), .08) 0 25%, transparent 0 50%) 50% / 12px 12px; }
.mb-creative-studio__preset-manager { display: grid; gap: 7px; margin-block-start: 8px; }
.mb-creative-studio__preset-manager > label { display: grid; gap: 4px; font-size: .75rem; }
.mb-creative-studio__preset-search { display: flex; gap: 5px; }
.mb-creative-studio__preset-search input[type="search"] { flex: 1; min-inline-size: 0; }
.mb-creative-studio__preset-row { display: grid; grid-template-columns: minmax(90px, 1fr) repeat(3, auto); gap: 5px; align-items: center; }
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
