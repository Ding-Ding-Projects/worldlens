<script setup lang="ts">
/**
 * "Render only these chunks": a top view of the chunks a world has generated, where the
 * user drags a rectangle, circle or freehand shape (or clicks one chunk) to pick what BlueMap
 * renders. Alt (or the Remove switch) takes chunks away instead. Keyboard: arrows move a
 * cursor, Space toggles the chunk under it.
 *
 * Applying writes chunk-aligned `render-mask` boxes through the caller; nothing is saved here.
 * Design: `design/design-sources/datapacks-and-chunks/ChunkPicker.dc.html`.
 */
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VBtnToggle, VSwitch } from "vuetify/components";
import type { PlainValue } from "@worldlens/config";
import type { NbtEditorBridge } from "../nbteditor/nbtEditorBridge.js";
import {
    applyShape,
    chunksInShape,
    keyOf,
    maskRecordsFor,
    regionFoldersFor,
    regionOf,
    selectionFromMask,
    viewBounds,
    type ChunkSpot,
    type PickShape,
} from "./chunkPickerModel.js";

const props = defineProps<{
    bridge: NbtEditorBridge | null;
    worldFolder: string;
    dimension: string;
    modelValue: readonly PlainValue[];
    spawn?: { x: number; z: number } | null | undefined;
}>();
const emit = defineEmits<{ apply: [records: Record<string, PlainValue>[]]; cancel: [] }>();
const { t } = useI18n();

/** Region files read at most, so a huge world still opens quickly. */
const MAX_REGIONS = 256;

const chunks = shallowRef<ChunkSpot[]>([]);
const present = shallowRef<Set<string>>(new Set());
const selected = ref<Set<string>>(new Set());
const loading = ref(false);
const note = ref<string | null>(null);
const shape = ref<PickShape>("rectangle");
const removing = ref(false);
const colourBy = ref<"saved" | "plain">("saved");
const cursor = ref({ x: 0, z: 0 });
const canvas = ref<HTMLCanvasElement | null>(null);
const dragging = shallowRef<{ x: number; z: number }[] | null>(null);
const dragRemove = ref(false);

const bounds = computed(() => viewBounds(chunks.value));
const cols = computed(() => bounds.value.maxX - bounds.value.minX + 1);
const rows = computed(() => bounds.value.maxZ - bounds.value.minZ + 1);
const cell = computed(() =>
    Math.max(2, Math.min(24, Math.floor(640 / Math.max(cols.value, rows.value)))),
);
const count = computed(() => selected.value.size);
const boxCount = computed(() => maskRecordsFor(selected.value).length);

async function load(): Promise<void> {
    chunks.value = [];
    present.value = new Set();
    note.value = null;
    if (props.bridge === null) {
        note.value = t("chunkPicker.noBridge", "Reading a world's chunks needs the desktop app.");
        return;
    }
    if (props.worldFolder.trim() === "") {
        note.value = t("chunkPicker.noWorld", "Choose a world folder first.");
        return;
    }
    loading.value = true;
    try {
        const listing = await props.bridge.listProject(props.worldFolder);
        if (!listing.ok) throw new Error(listing.message);
        const folders = regionFoldersFor(props.dimension);
        const regions = listing.value.files
            .filter((f) => f.kind === "region")
            .map((f) => ({ file: f, at: regionOf(f.relativePath, folders) }))
            .filter(
                (
                    r,
                ): r is {
                    file: (typeof listing.value.files)[number];
                    at: { x: number; z: number };
                } => r.at !== null,
            );
        const out: ChunkSpot[] = [];
        for (const r of regions.slice(0, MAX_REGIONS)) {
            const sep = props.worldFolder.includes("\\") ? "\\" : "/";
            const path = `${props.worldFolder.replace(/[\\/]+$/, "")}${sep}${r.file.relativePath.replace(/[\\/]/g, sep)}`;
            const listed = await props.bridge.listChunks(path);
            if (!listed.ok) continue;
            for (const c of listed.value.chunks)
                out.push({ x: r.at.x * 32 + c.x, z: r.at.z * 32 + c.z, saved: c.timestamp });
        }
        if (regions.length > MAX_REGIONS) {
            note.value = t(
                "chunkPicker.capped",
                { shown: MAX_REGIONS, total: regions.length },
                "Showing the first {shown} of {total} region files.",
            );
        } else if (out.length === 0) {
            note.value = t("chunkPicker.empty", "This dimension has no generated chunks yet.");
        }
        chunks.value = out;
        present.value = new Set(out.map((c) => keyOf(c.x, c.z)));
        const fromMask = selectionFromMask(props.modelValue);
        selected.value =
            fromMask === null
                ? new Set()
                : new Set([...fromMask].filter((k) => present.value.has(k)));
        if (fromMask === null && props.modelValue.length > 0) {
            note.value = t(
                "chunkPicker.replaces",
                "The current mask has shapes this picker cannot show. Applying replaces it.",
            );
        }
        const first = out[0];
        cursor.value = props.spawn
            ? { x: Math.floor(props.spawn.x / 16), z: Math.floor(props.spawn.z / 16) }
            : first
              ? { x: first.x, z: first.z }
              : { x: 0, z: 0 };
    } catch (error) {
        note.value = error instanceof Error ? error.message : String(error);
    } finally {
        loading.value = false;
    }
}

watch(
    () => [props.worldFolder, props.dimension] as const,
    () => void load(),
);
onMounted(() => void load());

function colourFor(c: ChunkSpot, oldest: number, newest: number): string {
    if (colourBy.value === "plain" || newest <= oldest || c.saved === 0) return "#5f8f4e";
    const f = (c.saved - oldest) / (newest - oldest);
    return `hsl(${Math.round(200 - f * 80)} 45% ${Math.round(32 + f * 24)}%)`;
}

function draw(): void {
    const el = canvas.value;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const s = cell.value;
    el.width = cols.value * s;
    el.height = rows.value * s;
    ctx.clearRect(0, 0, el.width, el.height);
    const times = chunks.value.map((c) => c.saved).filter((v) => v > 0);
    const oldest = times.length ? Math.min(...times) : 0;
    const newest = times.length ? Math.max(...times) : 0;
    const gap = s >= 6 ? 1 : 0;
    const style = getComputedStyle(el);
    const pick = style.getPropertyValue("--wl-pick").trim() || "#8fcdff";
    for (const c of chunks.value) {
        ctx.fillStyle = selected.value.has(keyOf(c.x, c.z)) ? pick : colourFor(c, oldest, newest);
        ctx.fillRect(
            (c.x - bounds.value.minX) * s,
            (c.z - bounds.value.minZ) * s,
            s - gap,
            s - gap,
        );
    }
    const path = dragging.value;
    if (path && path.length > 0) {
        ctx.strokeStyle = pick;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        const px = (p: { x: number; z: number }) =>
            [(p.x - bounds.value.minX) * s, (p.z - bounds.value.minZ) * s] as const;
        const [ax, az] = px(path[0]!);
        const [bx, bz] = px(path[path.length - 1]!);
        ctx.beginPath();
        if (shape.value === "rectangle")
            ctx.rect(Math.min(ax, bx), Math.min(az, bz), Math.abs(bx - ax), Math.abs(bz - az));
        else if (shape.value === "circle")
            ctx.arc(ax, az, Math.hypot(bx - ax, bz - az), 0, Math.PI * 2);
        else if (shape.value === "freehand")
            path.forEach((p, i) => (i === 0 ? ctx.moveTo(...px(p)) : ctx.lineTo(...px(p))));
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(
        (cursor.value.x - bounds.value.minX) * s,
        (cursor.value.z - bounds.value.minZ) * s,
        s,
        s,
    );
}
watch([chunks, selected, dragging, colourBy, cursor, cell], draw, { flush: "post", deep: true });

function at(e: PointerEvent): { x: number; z: number } {
    const el = canvas.value!;
    const r = el.getBoundingClientRect();
    const sx = el.width / (r.width || 1);
    const sz = el.height / (r.height || 1);
    return {
        x: ((e.clientX - r.left) * sx) / cell.value + bounds.value.minX,
        z: ((e.clientY - r.top) * sz) / cell.value + bounds.value.minZ,
    };
}
function down(e: PointerEvent): void {
    canvas.value?.setPointerCapture?.(e.pointerId);
    dragRemove.value = removing.value || e.altKey;
    dragging.value = [at(e)];
}
function move(e: PointerEvent): void {
    if (!dragging.value) return;
    const p = at(e);
    dragging.value = shape.value === "freehand" ? [...dragging.value, p] : [dragging.value[0]!, p];
}
function up(e: PointerEvent): void {
    if (!dragging.value) return;
    const path = [...dragging.value, at(e)];
    dragging.value = null;
    const moved =
        Math.hypot(path[path.length - 1]!.x - path[0]!.x, path[path.length - 1]!.z - path[0]!.z) >=
        0.5;
    const kind: PickShape = moved ? shape.value : "single";
    selected.value = applyShape(
        selected.value,
        chunksInShape(kind, path, present.value),
        dragRemove.value,
    );
}
function key(e: KeyboardEvent): void {
    const d: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
    };
    const step = d[e.key];
    if (step) {
        e.preventDefault();
        const b = bounds.value;
        cursor.value = {
            x: Math.min(b.maxX, Math.max(b.minX, cursor.value.x + step[0])),
            z: Math.min(b.maxZ, Math.max(b.minZ, cursor.value.z + step[1])),
        };
        if (e.shiftKey)
            selected.value = applyShape(
                selected.value,
                chunksInShape("single", [cursor.value], present.value),
                removing.value,
            );
    } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const k = keyOf(cursor.value.x, cursor.value.z);
        if (present.value.has(k))
            selected.value = applyShape(selected.value, [k], selected.value.has(k));
    }
}
const cursorLabel = computed(() => {
    const k = keyOf(cursor.value.x, cursor.value.z);
    const state = !present.value.has(k)
        ? t("chunkPicker.notGenerated", "not generated")
        : selected.value.has(k)
          ? t("chunkPicker.picked", "picked")
          : t("chunkPicker.notPicked", "not picked");
    return t(
        "chunkPicker.cursor",
        { x: cursor.value.x, z: cursor.value.z, state },
        "Chunk {x}, {z}: {state}",
    );
});

function selectAll(): void {
    selected.value = new Set(present.value);
}
function clearAll(): void {
    selected.value = new Set();
}
function aroundSpawn(): void {
    const c = props.spawn ? { x: props.spawn.x / 16, z: props.spawn.z / 16 } : { x: 0, z: 0 };
    selected.value = applyShape(
        selected.value,
        chunksInShape("circle", [c, { x: c.x + 8, z: c.z }], present.value),
        false,
    );
}
</script>

<template>
    <div class="wl-chunk-picker">
        <div class="wl-chunk-picker__bar">
            <v-btn-toggle
                v-model="shape"
                mandatory
                density="comfortable"
                rounded="pill"
                variant="outlined"
                color="secondary"
                :aria-label="t('chunkPicker.shape', 'Shape')"
            >
                <v-btn value="rectangle">{{ t("chunkPicker.rectangle", "Rectangle") }}</v-btn>
                <v-btn value="circle">{{ t("chunkPicker.circle", "Circle") }}</v-btn>
                <v-btn value="freehand">{{ t("chunkPicker.freehand", "Freehand") }}</v-btn>
                <v-btn value="single">{{ t("chunkPicker.single", "Single chunk") }}</v-btn>
            </v-btn-toggle>
            <v-switch
                v-model="removing"
                hide-details
                density="compact"
                color="primary"
                :label="t('chunkPicker.remove', 'Remove instead (or hold Alt)')"
            />
            <v-btn-toggle
                v-model="colourBy"
                mandatory
                density="compact"
                rounded="pill"
                variant="outlined"
                :aria-label="t('chunkPicker.colour', 'Colour chunks by')"
            >
                <v-btn value="saved" size="small">{{
                    t("chunkPicker.bySaved", "Last saved")
                }}</v-btn>
                <v-btn value="plain" size="small">{{ t("chunkPicker.plain", "Plain") }}</v-btn>
            </v-btn-toggle>
        </div>
        <p v-if="note" class="wl-chunk-picker__note" role="status">{{ note }}</p>
        <p v-if="loading" class="wl-chunk-picker__note" role="status">
            {{ t("chunkPicker.loading", "Reading region files…") }}
        </p>
        <div class="wl-chunk-picker__body">
            <div class="wl-chunk-picker__frame">
                <canvas
                    ref="canvas"
                    class="wl-chunk-picker__canvas"
                    tabindex="0"
                    role="application"
                    :aria-label="
                        t(
                            'chunkPicker.canvas',
                            'Top view of generated chunks. Drag to pick, Alt to remove, arrows and Space for the keyboard.',
                        )
                    "
                    aria-describedby="wl-chunk-picker-cursor"
                    @pointerdown="down"
                    @pointermove="move"
                    @pointerup="up"
                    @keydown="key"
                />
                <p id="wl-chunk-picker-cursor" class="wl-chunk-picker__note" aria-live="polite">
                    {{ cursorLabel }}
                </p>
            </div>
            <aside class="wl-chunk-picker__side">
                <div class="wl-chunk-picker__count">{{ count }}</div>
                <p class="wl-chunk-picker__note">
                    {{
                        t(
                            "chunkPicker.summary",
                            { n: count, total: present.size, boxes: boxCount },
                            "{n} of {total} generated chunks picked, written as {boxes} mask box(es).",
                        )
                    }}
                </p>
                <div class="wl-chunk-picker__quick">
                    <v-btn
                        variant="outlined"
                        rounded="pill"
                        size="small"
                        :disabled="present.size === 0"
                        @click="selectAll"
                        >{{ t("chunkPicker.all", "Select all generated") }}</v-btn
                    >
                    <v-btn
                        variant="outlined"
                        rounded="pill"
                        size="small"
                        :disabled="count === 0"
                        @click="clearAll"
                        >{{ t("chunkPicker.clear", "Clear") }}</v-btn
                    >
                    <v-btn
                        variant="outlined"
                        rounded="pill"
                        size="small"
                        :disabled="present.size === 0"
                        @click="aroundSpawn"
                        >{{ t("chunkPicker.spawn", "Around spawn") }}</v-btn
                    >
                </div>
                <p v-if="count === 0" class="wl-chunk-picker__note">
                    {{ t("chunkPicker.needOne", "Pick at least one chunk to apply.") }}
                </p>
                <div class="wl-chunk-picker__quick">
                    <v-btn
                        color="primary"
                        rounded="pill"
                        :disabled="count === 0"
                        @click="emit('apply', maskRecordsFor(selected))"
                        >{{ t("chunkPicker.apply", "Use these chunks as the mask") }}</v-btn
                    >
                    <v-btn variant="text" rounded="pill" @click="emit('cancel')">{{
                        t("chunkPicker.cancel", "Cancel")
                    }}</v-btn>
                </div>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.wl-chunk-picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}
.wl-chunk-picker__bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
}
.wl-chunk-picker__body {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
}
.wl-chunk-picker__frame {
    flex: 3 1 360px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wl-chunk-picker__canvas {
    --wl-pick: rgb(var(--v-theme-primary));
    width: 100%;
    max-width: 640px;
    height: auto;
    image-rendering: pixelated;
    border-radius: 16px;
    background: rgb(var(--v-theme-surface-variant));
    touch-action: none;
    cursor: crosshair;
}
.wl-chunk-picker__canvas:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-chunk-picker__side {
    flex: 1 1 220px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.wl-chunk-picker__count {
    font:
        400 36px/44px Roboto,
        sans-serif;
}
.wl-chunk-picker__quick {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.wl-chunk-picker__note {
    margin: 0;
    font:
        400 13px/18px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
