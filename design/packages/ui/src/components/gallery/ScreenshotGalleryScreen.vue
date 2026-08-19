<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { blueMapApp } from "../../stores/bluemap.js";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";

interface GalleryRecord {
    id: string;
    title: string;
    source: string;
    image: string;
    capturedAt: string;
    map: string;
    coordinates: string;
    camera: string;
    version: string;
    tags: string[];
    notes: string;
    imported: boolean;
}

const records = ref<GalleryRecord[]>([]);
const query = ref("");
const regexMode = ref(false);
const regexFlags = ref("i");
const category = ref("all");
const selected = ref(new Set<string>());
const editing = ref<GalleryRecord | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const status = ref("");

const galleryHost = (globalThis as { worldlens?: { gallery?: { list?: () => Promise<{ records: GalleryRecord[] }>; readAsset?: (id: string) => Promise<{ mime: string; bytes: Uint8Array }>; add?: (draft: unknown) => Promise<GalleryRecord>; update?: (id: string, changes: Partial<GalleryRecord>) => Promise<GalleryRecord>; export?: (format: "json" | "markdown") => Promise<{ filename: string; content: string }>; delete?: (ids: string[]) => Promise<number> } } }).worldlens?.gallery;
const assetUrls = ref(new Map<string, string>());
function revokeAssets(): void { for (const url of assetUrls.value.values()) URL.revokeObjectURL(url); assetUrls.value.clear(); }
async function hydrateAssets(items: readonly GalleryRecord[]): Promise<void> {
    revokeAssets();
    if (galleryHost?.readAsset === undefined) return;
    await Promise.all(items.map(async (record) => { try { const asset = await galleryHost.readAsset(record.id); assetUrls.value.set(record.id, URL.createObjectURL(new Blob([asset.bytes], { type: asset.mime }))); } catch { status.value = "One or more gallery images could not be read; metadata remains available."; } }));
}
function bridgeRecord(record: GalleryRecord): GalleryRecord {
    const value = record as unknown as { id: string; name: string; asset: string; tags: string[]; notes: string; metadata: { timestamp: string; mapId: string; projectId: string; version: string; coordinates: Record<string, number>; camera: Record<string, number> } };
    return { id: value.id, title: value.name, source: value.asset, image: "", capturedAt: value.metadata.timestamp, map: `${value.metadata.mapId} / ${value.metadata.projectId}`, coordinates: JSON.stringify(value.metadata.coordinates), camera: JSON.stringify(value.metadata.camera), version: value.metadata.version, tags: value.tags, notes: value.notes, imported: true };
}

const categories = computed(() => ["all", ...new Set(records.value.flatMap((record) => record.tags))]);
const filtered = computed(() => {
    let matcher: RegExp | null = null;
    if (regexMode.value && query.value.length > 0) {
        try {
            matcher = new RegExp(query.value, regexFlags.value);
        } catch {
            return [];
        }
    }
    const needle = query.value.toLocaleLowerCase();
    return records.value.filter((record) => {
        if (category.value !== "all" && !record.tags.includes(category.value)) return false;
        const haystack = [record.title, record.source, record.map, record.coordinates, record.camera, record.version, record.tags.join(" "), record.notes].join(" ");
        return matcher === null ? haystack.toLocaleLowerCase().includes(needle) : matcher.test(haystack);
    });
});

function toggle(id: string): void {
    const next = new Set(selected.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    selected.value = next;
}
function selectVisible(): void { selected.value = new Set(filtered.value.map((record) => record.id)); }
function invertVisible(): void {
    const next = new Set(selected.value);
    for (const record of filtered.value) next.has(record.id) ? next.delete(record.id) : next.add(record.id);
    selected.value = next;
}
function exportRecords(format: "json" | "csv" | "md"): void {
    const chosen = records.value.filter((record) => selected.value.size === 0 || selected.value.has(record.id));
    if (galleryHost?.export === undefined || (format !== "json" && format !== "md")) { status.value = "The gallery bridge is unavailable; no export was written."; return; }
    void galleryHost.export(format === "md" ? "markdown" : "json").then((file) => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([file.content], { type: "text/plain;charset=utf-8" })); link.download = file.filename; link.click(); URL.revokeObjectURL(link.href); status.value = `Exported ${chosen.length} record${chosen.length === 1 ? "" : "s"}.`; }).catch(() => { status.value = "The gallery bridge refused the export; no file was written."; });
}
function removeSelected(): void {
    if (!selected.value.size || galleryHost?.delete === undefined) { status.value = "Deletion is unavailable until the gallery bridge and shared confirmation surface are present."; return; }
    void galleryHost.delete([...selected.value]).then(async () => { records.value = records.value.filter((record) => !selected.value.has(record.id)); selected.value = new Set(); await hydrateAssets(records.value); status.value = "Selected records removed and history recorded."; }).catch(() => { status.value = "The gallery bridge refused deletion; no records changed."; });
}
function saveEdit(): void { if (editing.value !== null && galleryHost?.update !== undefined) { const record = editing.value; void galleryHost.update(record.id, { name: record.title, tags: record.tags, notes: record.notes }).then(() => { editing.value = null; status.value = "Metadata saved to local history."; }); } }
function importFiles(event: Event): void {
    const files = [...((event.target as HTMLInputElement).files ?? [])];
    for (const file of files) {
        if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) continue;
        if (galleryHost?.add === undefined) { status.value = "The gallery bridge is unavailable; this file was not stored."; continue; }
            void Promise.all([file.arrayBuffer(), createImageBitmap(file)]).then(([buffer, bitmap]) => { const metadata = { mapId: "Not recorded", projectId: "Not recorded", coordinates: { x: 0, y: 0 }, camera: { x: 0, y: 0 }, timestamp: new Date().toISOString(), dimensions: { width: bitmap.width, height: bitmap.height }, version: "User import", provenance: { kind: "user-import" as const, captureId: file.name, commit: "local import", appVersion: "Worldlens", capturedAt: new Date().toISOString() } }; bitmap.close(); return galleryHost.add({ name: file.name, assetName: file.name, bytes: new Uint8Array(buffer), tags: ["imported"], notes: "Imported locally; no upload is performed.", metadata }); }).then(async (record) => { records.value.push(bridgeRecord(record)); await hydrateAssets(records.value); status.value = `Imported ${file.name} locally.`; }).catch(() => { status.value = "The gallery bridge rejected the import; no record was added."; });
    }
    (event.target as HTMLInputElement).value = "";
}
onMounted(() => { void galleryHost?.list?.().then(async (items) => { records.value = items.records.map(bridgeRecord); await hydrateAssets(records.value); }).catch(() => { status.value = "The gallery library is unavailable; showing its honest empty state."; }); });
onUnmounted(revokeAssets);
function captureCurrentView(): void {
    const app = blueMapApp.value;
    if (app === null || typeof app.takeScreenshot !== "function") {
        status.value = "The map view is not mounted; open a map before requesting a capture.";
        return;
    }
    app.takeScreenshot();
    status.value = "Capture requested through the existing map action, but it returned no bytes to this library; nothing was added.";
}
</script>

<template>
    <section class="mb-screenshot-gallery" aria-labelledby="screenshot-gallery-title">
        <header class="mb-screenshot-gallery__header">
            <div><p class="mb-eyebrow">Evidence library</p><h1 id="screenshot-gallery-title">Screenshot gallery</h1><p>Organize real map captures and local imports. Nothing is uploaded automatically.</p></div>
            <div class="mb-screenshot-gallery__header-actions"><button class="mb-button" type="button" @click="captureCurrentView">Capture current map view</button><button class="mb-button mb-button--primary" type="button" @click="importInput?.click()">Import screenshots</button></div>
            <input ref="importInput" class="mb-visually-hidden" type="file" accept="image/*" multiple @change="importFiles" />
        </header>
        <div class="mb-screenshot-gallery__toolbar" role="search">
            <label for="screenshot-gallery-search">Search captures</label>
            <input id="screenshot-gallery-search" v-model="query" type="search" placeholder="Title, map, tags, coordinates…" />
            <button type="button" :aria-expanded="regexMode" @click="regexMode = !regexMode">Regex builder</button>
            <select v-model="category" aria-label="Filter by tag"><option v-for="item in categories" :key="item" :value="item">{{ item === "all" ? "All tags" : item }}</option></select>
        </div>
        <div v-if="regexMode" class="mb-screenshot-gallery__regex" role="region" aria-label="Anchored regex builder">
            <label>Pattern <input v-model="query" aria-label="Regular expression pattern" /></label>
            <label>Flags <input v-model="regexFlags" maxlength="6" aria-label="Regular expression flags" /></label>
            <span v-if="query" class="mb-screenshot-gallery__hint">{{ filtered.length }} matching captures</span>
        </div>
        <div class="mb-screenshot-gallery__bulk" aria-label="Bulk actions">
            <span>{{ selected.size }} selected · {{ filtered.length }} shown</span>
            <button type="button" @click="selectVisible">Select shown</button><button type="button" @click="invertVisible">Invert shown</button>
            <button type="button" @click="exportRecords('json')">Export JSON</button><button type="button" @click="exportRecords('csv')">Export CSV</button><button type="button" @click="exportRecords('md')">Export Markdown</button><ConfigSuperConfirm title="Delete screenshots" action="Delete the selected screenshot records from the local gallery. This cannot be undone here." :affected="filtered.filter((record) => selected.has(record.id)).map((record) => record.title)" confirm-label="Delete selected screenshots" :disabled="selected.size === 0" @confirm="removeSelected" />
        </div>
        <p v-if="status" class="mb-screenshot-gallery__status" role="status">{{ status }}</p>
        <p v-if="filtered.length === 0" class="mb-screenshot-gallery__empty">No captures match this search and filter.</p>
        <div v-else class="mb-screenshot-gallery__grid">
            <article v-for="record in filtered" :key="record.id" class="mb-screenshot-gallery__card" :class="{ 'is-selected': selected.has(record.id) }">
                <label class="mb-screenshot-gallery__select"><input type="checkbox" :checked="selected.has(record.id)" @change="toggle(record.id)" /> Select</label>
                <img v-if="assetUrls.get(record.id)" :src="assetUrls.get(record.id)" :alt="record.title" loading="lazy" /><p v-else class="mb-screenshot-gallery__missing">Image bytes are unavailable; metadata is still preserved.</p>
                <div class="mb-screenshot-gallery__card-body"><h2>{{ record.title }}</h2><p>{{ record.notes }}</p><dl><dt>Source</dt><dd>{{ record.source }}</dd><dt>Captured</dt><dd>{{ record.capturedAt }}</dd><dt>Map</dt><dd>{{ record.map }} · {{ record.coordinates }}</dd><dt>Camera</dt><dd>{{ record.camera }}</dd><dt>Version</dt><dd>{{ record.version }}</dd></dl><p class="mb-screenshot-gallery__tags">{{ record.tags.join(" · ") }}</p><button type="button" @click="editing = record">Edit metadata</button></div>
            </article>
        </div>
        <div v-if="editing" class="mb-screenshot-gallery__editor" role="dialog" aria-modal="true" aria-label="Edit screenshot metadata"><h2>Edit metadata</h2><label>Name <input v-model="editing.title" /></label><label>Tags <input :value="editing.tags.join(', ')" @input="editing.tags = ($event.target as HTMLInputElement).value.split(',').map((tag) => tag.trim()).filter(Boolean)" /></label><label>Notes <textarea v-model="editing.notes" /></label><button type="button" @click="saveEdit">Save</button><button type="button" @click="editing = null">Cancel</button></div>
    </section>
</template>

<style scoped>
.mb-screenshot-gallery { max-width: 1200px; margin: 0 auto; padding: 24px; color: rgb(var(--v-theme-on-background)); }
.mb-screenshot-gallery__header, .mb-screenshot-gallery__toolbar, .mb-screenshot-gallery__bulk { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 18px; }
.mb-screenshot-gallery__header { justify-content: space-between; } .mb-screenshot-gallery__header-actions { display: flex; gap: 10px; flex-wrap: wrap; } h1 { margin: 0; } .mb-eyebrow { text-transform: uppercase; letter-spacing: .08em; opacity: .7; font-size: .75rem; }
.mb-screenshot-gallery__toolbar label { display: grid; gap: 4px; flex: 1 1 260px; } input, select, textarea, button { min-height: 40px; border-radius: 8px; border: 1px solid rgba(var(--v-theme-on-background), .25); padding: 8px 12px; background: rgb(var(--v-theme-surface)); color: inherit; }
.mb-screenshot-gallery__regex { display: flex; gap: 12px; padding: 12px; margin-bottom: 16px; border-radius: 12px; background: rgba(var(--v-theme-primary), .1); } .mb-screenshot-gallery__regex label { display: grid; gap: 4px; }
.mb-screenshot-gallery__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; } .mb-screenshot-gallery__card { overflow: hidden; border-radius: 16px; background: rgb(var(--v-theme-surface)); box-shadow: 0 2px 10px rgba(0,0,0,.18); } .mb-screenshot-gallery__card.is-selected { outline: 3px solid rgb(var(--v-theme-primary)); }
.mb-screenshot-gallery__card img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: contain; background: #111; } .mb-screenshot-gallery__select { display: block; padding: 10px; } .mb-screenshot-gallery__card-body { padding: 14px; } .mb-screenshot-gallery__card-body h2 { font-size: 1.1rem; margin: 0 0 6px; } dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 10px; font-size: .82rem; } dt { font-weight: 700; } dd { margin: 0; overflow-wrap: anywhere; } .mb-screenshot-gallery__tags { opacity: .75; }
.mb-screenshot-gallery__editor { position: fixed; inset: 10% auto auto 50%; transform: translateX(-50%); z-index: 20; width: min(520px, calc(100vw - 32px)); padding: 20px; display: grid; gap: 12px; border-radius: 16px; background: rgb(var(--v-theme-surface)); box-shadow: 0 8px 40px rgba(0,0,0,.35); } .mb-screenshot-gallery__editor label { display: grid; gap: 4px; } .mb-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 560px) { .mb-screenshot-gallery { padding: 14px; } .mb-screenshot-gallery__regex { flex-direction: column; } .mb-screenshot-gallery__grid { grid-template-columns: 1fr; } }
</style>
