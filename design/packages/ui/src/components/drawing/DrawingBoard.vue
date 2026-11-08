<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiBrush,
    mdiChevronLeft,
    mdiDraw,
    mdiEraser,
    mdiFileImageOutline,
    mdiFountainPenTip,
    mdiFormatColorHighlight,
    mdiContentPaste,
    mdiMarker,
    mdiPen,
    mdiPencil,
    mdiRedo,
    mdiTrashCanOutline,
    mdiUndo,
    mdiDownload,
    mdiCheckboxBlankOutline,
} from "@mdi/js";
import { VBtn, VIcon, VMenu, VSlider, VTooltip } from "vuetify/components";
import ColorField from "../appearance/ColorField.vue";
import InfoButton from "../info/InfoButton.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import MenuSearchList, { type MenuSearchItem } from "../menuSearch/MenuSearchList.vue";
import { editorBridge, openTextInVsCode } from "../editors/editorBridge.js";
import {
    DrawingHistory,
    ERASER_KEY,
    PENS,
    STORAGE_KEY,
    appendPoint,
    eraseAt,
    lockedLine,
    parseSaved,
    strokeSegments,
    toSvg,
    type PenId,
    type Point,
    type Stroke,
    type ToolId,
} from "./drawingModel.js";

/**
 * The drawing board: seven pens and a partial eraser on a picture or a blank board, with
 * Shift-locked lines, undo and redo that survive a restart, a guarded clear, and SVG and PNG
 * exports drawn from the same segments as the screen.
 *
 * Every pen and action has a key, shown in its tooltip and in the board's right-click menu
 * from the same table the key handler reads. Strokes stay on this computer.
 */

const { t } = useI18n();

const ICONS: Readonly<Record<ToolId, string>> = {
    pencil: mdiPencil,
    pen: mdiPen,
    fineliner: mdiDraw,
    marker: mdiMarker,
    highlighter: mdiFormatColorHighlight,
    brush: mdiBrush,
    fountain: mdiFountainPenTip,
    eraser: mdiEraser,
};

/** Stroke colours are data, not chrome: a fixed set that reads on light and dark pictures. */
const SWATCHES = ["#1f1f1f", "#ffffff", "#d93025", "#f29900", "#188038", "#1a73e8", "#9334e6"] as const;

const toolLabel = (id: ToolId): string =>
    ({
        pencil: t("draw.pen.pencil", "Pencil"),
        pen: t("draw.pen.pen", "Pen"),
        fineliner: t("draw.pen.fineliner", "Fineliner"),
        marker: t("draw.pen.marker", "Marker"),
        highlighter: t("draw.pen.highlighter", "Highlighter"),
        brush: t("draw.pen.brush", "Brush"),
        fountain: t("draw.pen.fountain", "Fountain pen"),
        eraser: t("draw.eraser", "Eraser"),
    })[id];

const toolKey = (id: ToolId): string => (id === "eraser" ? ERASER_KEY : PENS.find((p) => p.id === id)!.key);
const TOOLS: readonly ToolId[] = [...PENS.map((p) => p.id), "eraser"];

const tool = ref<ToolId>("pen");
const color = ref<string>(SWATCHES[0]);
const scale = ref(1);
const minimised = ref(false);
const width = ref(1200);
const height = ref(800);
const background = ref<string | null>(null);
const history = new DrawingHistory();
const strokes = ref<readonly Stroke[]>([]);
const canUndo = ref(false);
const canRedo = ref(false);
const notice = ref<string | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const board = ref<HTMLElement | null>(null);
let backgroundImage: HTMLImageElement | null = null;
let idCounter = 0;
const newId = (): string => `s${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/* ---------------- Persistence ---------------- */

function sync(): void {
    strokes.value = history.current;
    canUndo.value = history.canUndo;
    canRedo.value = history.canRedo;
    save();
    draw();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        const full = { version: 1, strokes: history.current, past: history.past.slice(-100), future: history.future.slice(-100), background: background.value, width: width.value, height: height.value };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
        } catch {
            // A large picture can exceed browser storage: keep the strokes and say so.
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...full, background: null }));
                notice.value = t("draw.notice.pictureNotKept", "The strokes are saved; the picture is too large to keep and will need opening again after a restart.");
            } catch {
                notice.value = t("draw.notice.notSaved", "This window cannot save the drawing, so it lasts until the window closes.");
            }
        }
    }, 250);
}

function restore(): void {
    let saved = null;
    try {
        saved = parseSaved(localStorage.getItem(STORAGE_KEY));
    } catch {
        saved = null;
    }
    if (!saved) return;
    history.current = saved.strokes.slice();
    history.past = saved.past.map((b) => b.slice());
    history.future = saved.future.map((b) => b.slice());
    width.value = saved.width;
    height.value = saved.height;
    if (saved.background) setBackground(saved.background, false);
}

/* ---------------- Drawing ---------------- */

function draw(working: readonly Stroke[] = strokes.value): void {
    const el = canvas.value;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const ratio = globalThis.devicePixelRatio || 1;
    if (el.width !== Math.round(width.value * ratio)) el.width = Math.round(width.value * ratio);
    if (el.height !== Math.round(height.value * ratio)) el.height = Math.round(height.value * ratio);
    paint(ctx, ratio, working);
}

function paint(ctx: CanvasRenderingContext2D, ratio: number, working: readonly Stroke[]): void {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width.value, height.value);
    if (backgroundImage) ctx.drawImage(backgroundImage, 0, 0, width.value, height.value);
    else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width.value, height.value);
    }
    for (const stroke of working) {
        const segments = strokeSegments(stroke);
        const opacity = segments[0]?.opacity ?? 1;
        // A see-through pen is drawn whole onto its own layer and then laid down once, the way
        // the SVG export's group opacity composites it, so overlapping segments never darken.
        const target = opacity < 1 ? layerFor(ctx.canvas.width, ctx.canvas.height, ratio) : ctx;
        target.lineCap = "round";
        target.lineJoin = "round";
        for (const s of segments) {
            target.strokeStyle = s.color;
            target.lineWidth = s.width;
            target.beginPath();
            target.moveTo(s.x1, s.y1);
            target.lineTo(s.x2, s.y2);
            target.stroke();
        }
        if (target !== ctx) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = opacity;
            ctx.drawImage(target.canvas, 0, 0);
            ctx.restore();
        }
    }
}

let layer: CanvasRenderingContext2D | null = null;
function layerFor(w: number, h: number, ratio: number): CanvasRenderingContext2D {
    if (!layer || layer.canvas.width !== w || layer.canvas.height !== h) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        layer = c.getContext("2d");
    }
    const l = layer!;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, w, h);
    l.setTransform(ratio, 0, 0, ratio, 0, 0);
    return l;
}

let active: { start: Point; points: Point[]; began: number; working: Stroke[] } | null = null;

function boardPoint(event: PointerEvent, began: number): Point {
    const rect = canvas.value!.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / rect.width) * width.value,
        y: ((event.clientY - rect.top) / rect.height) * height.value,
        t: event.timeStamp - began,
    };
}

function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    canvas.value?.setPointerCapture?.(event.pointerId);
    const began = event.timeStamp;
    const start = boardPoint(event, began);
    active = { start, points: [start], began, working: strokes.value.slice() };
    if (tool.value === "eraser") active.working = eraseAt(active.working, start, eraserRadius.value, newId);
    else active.working.push(current(active.points));
    draw(active.working);
}

const eraserRadius = computed(() => 10 * scale.value);

function current(points: readonly Point[]): Stroke {
    return { id: "live", pen: tool.value as PenId, color: color.value, scale: scale.value, points };
}

function onPointerMove(event: PointerEvent): void {
    if (!active) return;
    const p = boardPoint(event, active.began);
    if (tool.value === "eraser") {
        active.working = eraseAt(active.working, p, eraserRadius.value, newId);
    } else {
        active.points = event.shiftKey ? lockedLine(active.start, p) : appendPoint(active.points, p);
        active.working[active.working.length - 1] = current(active.points);
    }
    draw(active.working);
}

function onPointerUp(): void {
    if (!active) return;
    const done = active.working.map((s) => (s.id === "live" ? { ...s, id: newId() } : s));
    active = null;
    const changed = done.length !== strokes.value.length || done.some((s, i) => s !== strokes.value[i]);
    if (changed) {
        history.change(done);
        sync();
    } else draw();
}

/* ---------------- Actions ---------------- */

function undo(): void {
    if (history.undo()) sync();
}
function redo(): void {
    if (history.redo()) sync();
}
function clearBoard(): void {
    if (strokes.value.length === 0) return;
    history.change([]);
    sync();
    notice.value = t("draw.notice.cleared", "Cleared. Undo brings the strokes back.");
}

function setBackground(dataUrl: string, record = true): void {
    const img = new Image();
    img.onload = () => {
        backgroundImage = img;
        background.value = dataUrl;
        // Fit within 2400 pixels on the long side so exports stay a sensible size.
        const fit = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
        width.value = Math.max(1, Math.round(img.naturalWidth * fit));
        height.value = Math.max(1, Math.round(img.naturalHeight * fit));
        if (record) save();
        void nextTick(() => draw());
    };
    img.onerror = () => {
        notice.value = t("draw.notice.badPicture", "That file could not be read as a picture.");
    };
    img.src = dataUrl;
}

function blankBoard(): void {
    backgroundImage = null;
    background.value = null;
    width.value = 1200;
    height.value = 800;
    save();
    void nextTick(() => draw());
}

const fileInput = ref<HTMLInputElement | null>(null);
async function readFile(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
        notice.value = t("draw.notice.notPicture", "Choose a PNG, JPEG, WebP or GIF picture.");
        return;
    }
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && setBackground(reader.result);
    reader.readAsDataURL(file);
}
function onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void readFile(file);
    (event.target as HTMLInputElement).value = "";
}
async function pastePicture(): Promise<void> {
    try {
        for (const item of await navigator.clipboard.read()) {
            const type = item.types.find((x) => x.startsWith("image/"));
            if (type) {
                await readFile(new File([await item.getType(type)], "pasted", { type }));
                return;
            }
        }
        notice.value = t("draw.notice.noPicture", "The clipboard has no picture.");
    } catch {
        notice.value = t("draw.notice.clipboard", "The clipboard is not available here. Press Ctrl+V on the board instead.");
    }
}
function onPaste(event: ClipboardEvent): void {
    const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
    if (file) {
        event.preventDefault();
        void readFile(file);
    }
}

function download(name: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = (): string => new Date().toISOString().slice(0, 19).replace(/[:T]/gu, "-");

function exportSvg(): void {
    const svg = toSvg(strokes.value, { width: width.value, height: height.value, background: background.value, fill: background.value ? null : "#ffffff" });
    download(`drawing-${stamp()}.svg`, new Blob([svg], { type: "image/svg+xml" }));
    notice.value = t("draw.notice.exported", "Exported.");
}

const canOpenEditor = editorBridge() !== null;
async function svgInVsCode(): Promise<void> {
    const svg = toSvg(strokes.value, { width: width.value, height: height.value, background: background.value, fill: background.value ? null : "#ffffff" });
    const answer = await openTextInVsCode(`drawing-${stamp()}.svg`, svg);
    notice.value = answer.message + (answer.downloadUrl ? ` ${answer.downloadUrl}` : "");
}

function exportPng(ratio: 1 | 2 | 3): void {
    const off = document.createElement("canvas");
    off.width = width.value * ratio;
    off.height = height.value * ratio;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    paint(ctx, ratio, strokes.value);
    off.toBlob((blob) => {
        if (blob) download(`drawing-${stamp()}@${ratio}x.png`, blob);
    }, "image/png");
    notice.value = t("draw.notice.exported", "Exported.");
}

/* ---------------- Keys and the context menu ---------------- */

interface Command {
    readonly id: string;
    readonly label: string;
    readonly shortcut: string | null;
    readonly run: () => void;
    readonly disabled?: boolean;
}

const commands = computed<readonly Command[]>(() => [
    ...TOOLS.map((id) => ({ id: `tool:${id}`, label: toolLabel(id), shortcut: toolKey(id), run: () => (tool.value = id) })),
    { id: "undo", label: t("draw.undo", "Undo"), shortcut: "Ctrl+Z", run: undo, disabled: !canUndo.value },
    { id: "redo", label: t("draw.redo", "Redo"), shortcut: "Ctrl+Shift+Z", run: redo, disabled: !canRedo.value },
    { id: "svg", label: t("draw.exportSvg", "Export SVG"), shortcut: "Ctrl+Shift+S", run: exportSvg },
    { id: "png", label: t("draw.exportPng", "Export PNG at 2x"), shortcut: "Ctrl+Shift+E", run: () => exportPng(2) },
    { id: "minimise", label: minimised.value ? t("draw.expand", "Show the toolbar") : t("draw.minimise", "Minimise the toolbar"), shortcut: "Ctrl+.", run: () => (minimised.value = !minimised.value) },
]);

const menuItems = computed<readonly MenuSearchItem[]>(() =>
    commands.value.map((c) => ({ id: c.id, label: c.label, shortcut: c.shortcut, ...(c.disabled ? { disabled: true, reason: t("draw.nothing", "Nothing to step through yet.") } : {}) })),
);

function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    const pressed = `${ctrl ? "Ctrl+" : ""}${event.shiftKey && ctrl ? "Shift+" : ""}${key === "." ? "." : key}`;
    const hit = commands.value.find((c) => c.shortcut === pressed) ?? (ctrl && !event.shiftKey && key === "Y" ? commands.value.find((c) => c.id === "redo") : undefined);
    if (!hit || hit.disabled) return;
    event.preventDefault();
    hit.run();
}

const menu = ref(false);
const menuTarget = ref<[number, number]>([0, 0]);
function onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    menuTarget.value = [event.clientX, event.clientY];
    menu.value = true;
}
function choose(id: string): void {
    menu.value = false;
    commands.value.find((c) => c.id === id)?.run();
}

const toolbarPrefs = "worldlens.drawing.toolbar.v1";
watch([minimised, tool, color, scale], () => {
    try {
        localStorage.setItem(toolbarPrefs, JSON.stringify({ minimised: minimised.value, tool: tool.value, color: color.value, scale: scale.value }));
    } catch {
        // Preferences are a convenience; the board works without them.
    }
});

onMounted(() => {
    try {
        const prefs = JSON.parse(localStorage.getItem(toolbarPrefs) ?? "null") as { minimised?: boolean; tool?: ToolId; color?: string; scale?: number } | null;
        if (prefs) {
            minimised.value = prefs.minimised === true;
            if (prefs.tool && TOOLS.includes(prefs.tool)) tool.value = prefs.tool;
            if (typeof prefs.color === "string") color.value = prefs.color;
            if (typeof prefs.scale === "number") scale.value = prefs.scale;
        }
    } catch {
        // Start with the defaults.
    }
    restore();
    sync();
});
onBeforeUnmount(() => {
    if (saveTimer) clearTimeout(saveTimer);
});

defineExpose({ strokes, tool, undo, redo, exportSvg });
</script>

<template>
    <section ref="board" class="wl-draw" data-test="drawing-board" :aria-label="t('draw.title', 'Drawing board')" tabindex="0" @keydown="onKeydown" @paste="onPaste" @contextmenu="onContextMenu">
        <header class="wl-draw__head">
            <div>
                <h1>{{ t("draw.title", "Drawing board") }}</h1>
                <p>{{ t("draw.intro", "Draw on a picture or a blank board. Strokes stay on this computer. Hold Shift for a straight line; right-click for every tool and its key.") }}</p>
            </div>
            <div class="wl-draw__actions">
                <VBtn variant="text" :prepend-icon="mdiFileImageOutline" @click="fileInput?.click()">{{ t("draw.open", "Open picture") }}</VBtn>
                <VBtn variant="text" :prepend-icon="mdiContentPaste" @click="pastePicture">{{ t("draw.paste", "Paste picture") }}</VBtn>
                <VBtn variant="text" :prepend-icon="mdiCheckboxBlankOutline" :disabled="!background" @click="blankBoard">{{ t("draw.blank", "Blank board") }}</VBtn>
                <VBtn variant="tonal" :prepend-icon="mdiDownload" @click="exportSvg">{{ t("draw.exportSvg", "Export SVG") }}</VBtn>
                <VMenu location="bottom end">
                    <template #activator="{ props }">
                        <VBtn v-bind="props" color="primary" :prepend-icon="mdiDownload">{{ t("draw.exportPngShort", "Export PNG") }}</VBtn>
                    </template>
                    <div class="wl-draw__menu">
                        <VBtn v-for="r in ([1, 2, 3] as const)" :key="r" variant="text" block @click="exportPng(r)">{{ t("draw.pngAt", { ratio: r }, "PNG at {ratio}x") }}</VBtn>
                        <VBtn v-if="canOpenEditor" variant="text" block @click="svgInVsCode">{{ t("draw.svgInVsCode", "SVG in VS Code") }}</VBtn>
                    </div>
                </VMenu>
                <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden :aria-label="t('draw.open', 'Open picture')" @change="onFile" />
            </div>
        </header>

        <p v-if="notice" class="wl-draw__notice" role="status">{{ notice }}</p>

        <div class="wl-draw__stage">
            <div class="wl-draw__toolbar" :class="{ 'is-min': minimised }" role="toolbar" :aria-label="t('draw.toolbar', 'Drawing tools')">
                <template v-if="!minimised">
                    <div class="wl-draw__tools">
                        <VTooltip v-for="id in TOOLS" :key="id" location="end" :text="`${toolLabel(id)} (${toolKey(id)})`">
                            <template #activator="{ props }">
                                <VBtn
                                    v-bind="props"
                                    icon
                                    size="small"
                                    :variant="tool === id ? 'flat' : 'text'"
                                    :color="tool === id ? 'primary' : undefined"
                                    :aria-label="`${toolLabel(id)} (${toolKey(id)})`"
                                    :aria-pressed="tool === id"
                                    :aria-keyshortcuts="toolKey(id)"
                                    :data-tool="id"
                                    @click="tool = id"
                                >
                                    <VIcon :icon="ICONS[id]" />
                                </VBtn>
                            </template>
                        </VTooltip>
                    </div>
                    <div class="wl-draw__swatches" role="radiogroup" :aria-label="t('draw.colour', 'Colour')">
                        <button
                            v-for="c in SWATCHES"
                            :key="c"
                            type="button"
                            role="radio"
                            class="wl-draw__swatch"
                            :aria-checked="color === c"
                            :aria-label="c"
                            :style="{ background: c }"
                            @click="color = c"
                        />
                    </div>
                    <ColorField v-model="color" :label="t('draw.customColour', 'Any colour')" />
                    <div class="wl-draw__row">
                        <VSlider v-model="scale" :min="0.5" :max="3" :step="0.25" :label="t('draw.size', 'Size')" density="compact" hide-details thumb-label />
                        <InfoButton
                            :control="t('draw.size', 'Size')"
                            :guide="{
                                purpose: t('draw.guide.size.purpose', 'How thick the pen and the eraser are.'),
                                choices: t('draw.guide.size.choices', 'Half to three times each pen\'s own width, in quarter steps.'),
                                defaultValue: t('draw.guide.size.default', 'One times.'),
                                effect: t('draw.guide.size.effect', 'Applies to the next stroke; strokes already drawn keep their size.'),
                            }"
                            resettable
                            @reset="scale = 1"
                        />
                    </div>
                    <div class="wl-draw__row">
                        <VBtn icon size="small" variant="text" :disabled="!canUndo" :aria-label="t('draw.undo', 'Undo') + ' (Ctrl+Z)'" aria-keyshortcuts="Control+Z" @click="undo"><VIcon :icon="mdiUndo" /></VBtn>
                        <VBtn icon size="small" variant="text" :disabled="!canRedo" :aria-label="t('draw.redo', 'Redo') + ' (Ctrl+Shift+Z)'" aria-keyshortcuts="Control+Shift+Z" @click="redo"><VIcon :icon="mdiRedo" /></VBtn>
                        <ConfigSuperConfirm
                            :title="t('draw.clearTitle', 'Clear the board?')"
                            :action="t('draw.clearAction', { count: strokes.length }, 'Removes all {count} strokes from this board. Undo can bring them back until the history is cleared.')"
                            :affected="[t('draw.title', 'Drawing board')]"
                            :confirm-label="t('draw.clear', 'Clear')"
                            :disabled="strokes.length === 0"
                            @confirm="clearBoard"
                        >
                            <template #activator="{ props }">
                                <VBtn v-bind="props" icon size="small" variant="text" color="error" :disabled="strokes.length === 0" :aria-label="t('draw.clear', 'Clear')"><VIcon :icon="mdiTrashCanOutline" /></VBtn>
                            </template>
                        </ConfigSuperConfirm>
                    </div>
                    <p v-if="strokes.length === 0" class="wl-draw__hint">{{ t("draw.clearReason", "Clear is available once there is a stroke.") }}</p>
                </template>
                <VBtn
                    class="wl-draw__disc"
                    :icon="minimised ? ICONS[tool] : mdiChevronLeft"
                    size="small"
                    :variant="minimised ? 'flat' : 'text'"
                    :color="minimised ? 'primary' : undefined"
                    :aria-label="minimised ? t('draw.expand', 'Show the toolbar') + ` · ${toolLabel(tool)}` : t('draw.minimise', 'Minimise the toolbar')"
                    :aria-expanded="!minimised"
                    aria-keyshortcuts="Control+."
                    @click="minimised = !minimised"
                />
            </div>

            <div class="wl-draw__surface" :style="{ aspectRatio: `${width} / ${height}` }">
                <canvas
                    ref="canvas"
                    class="wl-draw__canvas"
                    :class="{ 'is-eraser': tool === 'eraser' }"
                    role="img"
                    :aria-label="t('draw.canvas', { count: strokes.length }, 'Drawing with {count} strokes')"
                    @pointerdown="onPointerDown"
                    @pointermove="onPointerMove"
                    @pointerup="onPointerUp"
                    @pointercancel="onPointerUp"
                />
            </div>
        </div>

        <VMenu v-model="menu" :target="menuTarget" location="end" :close-on-content-click="false">
            <div class="wl-draw__menu">
                <MenuSearchList :items="menuItems" :label="t('draw.menu', 'Drawing commands')" :filter-label="t('draw.menuFilter', 'Filter tools')" @choose="choose" />
            </div>
        </VMenu>
    </section>
</template>

<style scoped>
.wl-draw { display: flex; flex-direction: column; gap: 12px; padding: 24px; min-height: 100%; outline: none; }
.wl-draw:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
.wl-draw__head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: flex-start; }
.wl-draw__head h1 { margin: 0; font-size: var(--md-sys-typescale-headline-small-size, 24px); }
.wl-draw__head p { margin: 4px 0 0; color: rgb(var(--v-theme-on-surface-variant)); max-width: 60ch; }
.wl-draw__actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.wl-draw__notice { margin: 0; padding: 8px 12px; border-radius: 12px; background: rgb(var(--v-theme-secondary-container, var(--v-theme-surface-variant))); }
.wl-draw__stage { display: flex; gap: 16px; align-items: flex-start; }
.wl-draw__toolbar {
    display: flex; flex-direction: column; gap: 12px; width: 232px; flex: none; padding: 12px;
    border-radius: 28px; background: rgb(var(--v-theme-surface-container, var(--v-theme-surface))); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
    transition: width 220ms cubic-bezier(0.2, 0, 0, 1), border-radius 220ms cubic-bezier(0.2, 0, 0, 1);
}
.wl-draw__toolbar.is-min { width: 56px; border-radius: 28px; align-items: center; }
.wl-draw__tools { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.wl-draw__swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.wl-draw__swatch { width: 28px; height: 28px; border-radius: 50%; border: 2px solid rgba(var(--v-theme-on-surface), 0.25); cursor: pointer; }
.wl-draw__swatch[aria-checked="true"] { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-draw__swatch:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-draw__row { display: flex; gap: 4px; }
.wl-draw__hint { margin: 0; font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-draw__disc { align-self: flex-end; }
.wl-draw__toolbar.is-min .wl-draw__disc { align-self: center; }
.wl-draw__surface { flex: 1; min-width: 0; max-height: calc(100vh - 220px); border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2); background: #fff; }
.wl-draw__canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
.wl-draw__canvas.is-eraser { cursor: cell; }
.wl-draw__menu { background: rgb(var(--v-theme-surface)); border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); padding: 4px; max-height: 70vh; overflow: auto; }
@media (max-width: 720px) {
    .wl-draw__stage { flex-direction: column; }
    .wl-draw__toolbar { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
    .wl-draw__toolbar { transition: none; }
}
</style>
