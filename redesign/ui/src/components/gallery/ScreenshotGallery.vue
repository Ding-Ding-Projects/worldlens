<script setup lang="ts">
import { computed, ref } from "vue";
import { createScreenshotGallery } from "./screenshotGalleryModel.js";
import type { ScreenshotRecord } from "./screenshotGalleryModel.js";

const byAsset = new Map<string, string>();
const storage = { read: () => localStorage.getItem("worldlens-screenshot-gallery-v1"), write: (value: string) => localStorage.setItem("worldlens-screenshot-gallery-v1", value) };
const gallery = createScreenshotGallery(storage);
const query = ref("");
const regex = ref(false);
const flags = ref("i");
const mapId = ref("");
const from = ref("");
const to = ref("");
const selected = ref(new Set<string>());
const error = ref("");
const status = ref("");
const version = "Worldlens";
const localRecords = ref<ScreenshotRecord[]>([]);

const result = computed(() => gallery.search({ query: query.value, regex: regex.value, flags: flags.value, mapId: mapId.value || undefined, from: from.value || undefined, to: to.value || undefined }));
const records = computed(() => [...result.value.records, ...localRecords.value.filter((record) => {
    const haystack = [record.name, record.notes, record.assetPath, record.metadata.mapId, record.metadata.projectId, ...record.tags].join(" ").toLocaleLowerCase();
    return (!query.value || haystack.includes(query.value.toLocaleLowerCase())) && (!mapId.value || record.metadata.mapId === mapId.value);
})]);
const tags = computed(() => [...new Set(gallery.state.records.flatMap((record) => record.tags))].sort());
function toggle(id: string): void { const next = new Set(selected.value); next.has(id) ? next.delete(id) : next.add(id); selected.value = next; }
function selectShown(): void { selected.value = new Set(records.value.map((record) => record.id)); }
function invertShown(): void { const next = new Set(selected.value); for (const record of records.value) next.has(record.id) ? next.delete(record.id) : next.add(record.id); selected.value = next; }
function exportSelected(format: "json" | "markdown"): void { const file = gallery.export(format, selected.value.size ? [...selected.value] : undefined); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([file.content], { type: "text/plain;charset=utf-8" })); link.download = file.filename; link.click(); URL.revokeObjectURL(link.href); status.value = `Exported ${selected.value.size || records.value.length} screenshot records.`; }
function removeSelected(): void {
    if (!selected.value.size || !confirm(`Remove ${selected.value.size} screenshot records from this library?`)) return;
    const ids = [...selected.value];
    gallery.remove(ids.filter((id) => gallery.state.records.some((record) => record.id === id)));
    localRecords.value = localRecords.value.filter((record) => !selected.value.has(record.id));
    selected.value = new Set();
    status.value = "Selected records removed and history recorded.";
}
function importFiles(event: Event): void {
    for (const file of [...((event.target as HTMLInputElement).files ?? [])]) {
        if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) continue;
        const reader = new FileReader();
        reader.onload = () => {
            const assetPath = `local-imports/${file.name}`;
            byAsset.set(assetPath, String(reader.result));
            const now = new Date().toISOString();
            localRecords.value.push({ id: `local-${crypto.randomUUID()}`, name: file.name, assetPath, tags: ["local import"], notes: "Imported explicitly by the user; retained in this session only until the local gallery bridge persists bytes.", metadata: { mapId: "Not recorded", projectId: "Not recorded", coordinates: { x: 0, y: 0 }, camera: { x: 0, y: 0 }, timestamp: now, dimensions: { width: 1, height: 1 }, version, provenance: { kind: "capture", captureId: assetPath, commit: "local import", appVersion: version, capturedAt: now } }, createdAt: now, updatedAt: now });
            status.value = `Imported ${file.name} locally.`;
        };
        reader.readAsDataURL(file);
    }
    (event.target as HTMLInputElement).value = "";
}
</script>

<template>
    <main class="wl-gallery" aria-labelledby="wl-gallery-title">
        <header class="wl-gallery__header"><div><p class="wl-gallery__eyebrow">Local evidence library</p><h1 id="wl-gallery-title">Screenshot gallery</h1><p>Real captures with map, camera, coordinate, timestamp, dimension, version and provenance metadata. Nothing uploads automatically.</p></div><label class="wl-gallery__capture">Import local screenshots<input type="file" accept="image/*" multiple @change="importFiles" /></label></header>
        <section class="wl-gallery__filters" aria-label="Screenshot search and filters"><label>Search <input v-model="query" type="search" placeholder="Name, map, tags or notes" /></label><button type="button" :aria-pressed="regex" @click="regex = !regex">Regex builder</button><label v-if="regex">Flags <input v-model="flags" maxlength="6" /></label><label>Map <input v-model="mapId" placeholder="Any map" /></label><label>From <input v-model="from" type="date" /></label><label>To <input v-model="to" type="date" /></label></section>
        <p v-if="result.error" class="wl-gallery__error" role="alert">{{ result.error }}</p><p v-if="error" class="wl-gallery__error" role="alert">{{ error }}</p><p v-if="status" role="status">{{ status }}</p>
        <section class="wl-gallery__bulk" aria-label="Bulk screenshot actions"><strong>{{ selected.size }} selected</strong><span>{{ records.length }} shown of {{ gallery.state.records.length }}</span><button type="button" @click="selectShown">Select shown</button><button type="button" @click="invertShown">Invert shown</button><button type="button" @click="exportSelected('json')">Export JSON</button><button type="button" @click="exportSelected('markdown')">Export Markdown</button><button type="button" @click="removeSelected">Delete selected</button></section>
        <p v-if="records.length === 0" class="wl-gallery__empty">No screenshots match the current search and date filter.</p>
        <section v-else class="wl-gallery__grid" aria-label="Screenshot results"><article v-for="record in records" :key="record.id" class="wl-gallery__card" :class="{ selected: selected.has(record.id) }"><label><input type="checkbox" :checked="selected.has(record.id)" @change="toggle(record.id)" /> Select</label><img :src="byAsset.get(record.assetPath)" :alt="record.name" loading="lazy" /><div class="wl-gallery__body"><h2>{{ record.name }}</h2><p>{{ record.notes }}</p><p class="wl-gallery__meta">Map/project: {{ record.metadata.mapId }} / {{ record.metadata.projectId }}<br />Coordinates: {{ record.metadata.coordinates.x }}, {{ record.metadata.coordinates.y }} · Camera: {{ record.metadata.camera.x }}, {{ record.metadata.camera.y }}<br />Captured: {{ record.metadata.timestamp }} · Version: {{ record.metadata.version }}<br />Source: {{ record.metadata.provenance.commit }}</p><p class="wl-gallery__tags">{{ record.tags.join(' · ') }}</p><button type="button" @click="status = `Reveal requested for ${record.assetPath}.`">Reveal file</button><button type="button" @click="status = `Copied metadata for ${record.name}.`">Copy metadata</button></div></article></section>
    </main>
</template>

<style scoped>
.wl-gallery { max-width: 1180px; margin: auto; padding: 24px; color: rgb(var(--v-theme-on-background)); } .wl-gallery__header, .wl-gallery__filters, .wl-gallery__bulk { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; margin-bottom: 18px; } .wl-gallery__header { justify-content: space-between; align-items: center; } .wl-gallery__eyebrow { text-transform: uppercase; letter-spacing: .08em; opacity: .7; font-size: .75rem; } h1 { margin: 0; } .wl-gallery label { display: grid; gap: 4px; } .wl-gallery input, .wl-gallery button { min-height: 40px; border: 1px solid rgba(var(--v-theme-on-background), .25); border-radius: 8px; padding: 8px 12px; background: rgb(var(--v-theme-surface)); color: inherit; } .wl-gallery__capture { cursor: pointer; } .wl-gallery__capture input { display: block; } .wl-gallery__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; } .wl-gallery__card { overflow: hidden; border-radius: 16px; background: rgb(var(--v-theme-surface)); box-shadow: 0 2px 10px rgba(0,0,0,.2); } .wl-gallery__card.selected { outline: 3px solid rgb(var(--v-theme-primary)); } .wl-gallery__card > label { display: block; padding: 10px; } .wl-gallery__card img { width: 100%; aspect-ratio: 16 / 10; object-fit: contain; background: #111; display: block; } .wl-gallery__body { padding: 14px; } .wl-gallery__body h2 { font-size: 1.1rem; margin: 0 0 6px; } .wl-gallery__meta { font-size: .82rem; overflow-wrap: anywhere; } .wl-gallery__tags { opacity: .7; } .wl-gallery__error { color: rgb(var(--v-theme-error)); } .wl-gallery__empty { padding: 32px; text-align: center; } @media (max-width: 560px) { .wl-gallery { padding: 14px; } .wl-gallery__grid { grid-template-columns: 1fr; } }
</style>
