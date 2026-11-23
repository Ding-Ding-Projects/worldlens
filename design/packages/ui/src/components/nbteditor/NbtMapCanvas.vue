<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VBtnToggle } from "vuetify/components";
import NbtValueEditor from "./NbtValueEditor.vue";
import type { DocumentInfo, NbtEditorBridge, NodeView } from "./nbtEditorBridge.js";
import { fieldInfo } from "./nbtFieldCatalogue.js";
import {
    MAP_BASE_COLORS,
    MAP_PIXELS,
    MAP_SIZE,
    SHADE_NAMES,
    colorId,
    colorsSnbt,
    floodFill,
    imageToColors,
    linePixels,
    mapRgba,
    rgbaForColorId,
    signedByte,
} from "./nbtMapModel.js";

/**
 * A map item as a pixel canvas: paint with the map's own colours, import a picture, export a PNG.
 *
 * The 16,384 colour bytes are read once, edited locally while a stroke is drawn, and sent as one
 * `replaceSnbt` edit when the stroke ends, so each stroke is one undo step in the same history as
 * the tree. The map's own settings (scale, dimension, centre, locked, tracking) sit beside it with
 * their tailored controls.
 *
 * Keyboard: the canvas is focusable; the arrow keys move a cursor pixel, Space paints or fills at
 * it with the current tool, and P picks its colour.
 *
 * Design: `design/design-sources/nbt-editor-full/MapArt.dc.html`.
 */
const props = defineProps<{
    bridge: NbtEditorBridge;
    doc: DocumentInfo;
    revision: number;
    disabled?: boolean | undefined;
}>();
const emit = defineEmits<{
    replace: [id: number, snbt: string];
    commit: [id: number, text: string];
    flip: [id: number, on: boolean];
}>();
const { t } = useI18n();

const canvas = ref<HTMLCanvasElement | null>(null);
const colorsNode = shallowRef<NodeView | null>(null);
const settings = shallowRef<{ node: NodeView; path: string[] }[]>([]);
const colors = ref<number[]>([]);
const failure = ref<string | null>(null);
const tool = ref<"pen" | "line" | "fill" | "pick">("pen");
const base = ref(1);
const shade = ref(2);
const cursor = ref({ x: 0, y: 0 });
const importInput = ref<HTMLInputElement | null>(null);

const current = computed(() => colorId(base.value, shade.value));
const swatches = computed(() =>
    MAP_BASE_COLORS.map((entry, i) => {
        const [r, g, b] = rgbaForColorId(colorId(i, shade.value));
        return { base: i, name: entry[0], css: i === 0 ? "transparent" : `rgb(${r}, ${g}, ${b})` };
    }),
);

async function childrenOf(id: number): Promise<readonly NodeView[]> {
    const page = await props.bridge.children(props.doc.docId, id, 0, 500);
    if (!page.ok) throw new Error(page.message);
    return page.value.nodes;
}

async function load(): Promise<void> {
    failure.value = null;
    try {
        const top = await childrenOf(props.doc.root.id);
        const data = top.find((n) => n.kind === "compound" && n.name === "data");
        const members = data === undefined ? top : await childrenOf(data.id);
        const node = members.find((n) => n.name === "colors" && n.kind === "byteArray") ?? null;
        colorsNode.value = node;
        settings.value = members
            .filter(
                (n) => !["compound", "list", "byteArray", "intArray", "longArray"].includes(n.kind),
            )
            .map((n) => ({ node: n, path: data ? ["data"] : [] }));
        if (node === null)
            throw new Error(t("nbt.map.noColors", "This file has no map colours (data.colors)."));
        const values: number[] = [];
        while (values.length < MAP_PIXELS) {
            const page = await props.bridge.arrayPage(
                props.doc.docId,
                node.id,
                values.length,
                2048,
            );
            if (!page.ok) throw new Error(page.message);
            if (page.value.values.length === 0) break;
            values.push(...page.value.values.map(Number));
        }
        while (values.length < MAP_PIXELS) values.push(0);
        colors.value = values.slice(0, MAP_PIXELS);
        await nextTick();
        draw();
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    }
}

function draw(): void {
    const ctx = canvas.value?.getContext("2d") ?? null;
    if (ctx === null) return;
    ctx.putImageData(new ImageData(mapRgba(colors.value), MAP_SIZE, MAP_SIZE), 0, 0);
}

watch(
    () => [props.doc.docId, props.revision] as const,
    () => void load(),
);
onMounted(() => void load());

/* Painting ------------------------------------------------------------------------------- */

let stroke: {
    last: { x: number; y: number };
    start: { x: number; y: number };
    before: number[];
} | null = null;

function pixelAt(event: PointerEvent): { x: number; y: number } | null {
    const el = canvas.value;
    if (el === null) return null;
    const box = el.getBoundingClientRect();
    if (box.width === 0) return null;
    const x = Math.floor(((event.clientX - box.left) / box.width) * MAP_SIZE);
    const y = Math.floor(((event.clientY - box.top) / box.height) * MAP_SIZE);
    return x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE ? null : { x, y };
}

function plot(x: number, y: number): void {
    colors.value[y * MAP_SIZE + x] = signedByte(current.value);
}

function apply(at: { x: number; y: number }, from: { x: number; y: number } | null): void {
    if (tool.value === "pick") {
        const id = (colors.value[at.y * MAP_SIZE + at.x] ?? 0) & 0xff;
        base.value = id >> 2;
        shade.value = id & 3;
        return;
    }
    if (tool.value === "fill") floodFill(colors.value, at.x, at.y, signedByte(current.value));
    else for (const [x, y] of linePixels(from?.x ?? at.x, from?.y ?? at.y, at.x, at.y)) plot(x, y);
    draw();
}

function onDown(event: PointerEvent): void {
    if (props.disabled || colorsNode.value === null) return;
    const at = pixelAt(event);
    if (at === null) return;
    cursor.value = at;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    stroke = { last: at, start: at, before: [...colors.value] };
    if (tool.value !== "line") apply(at, null);
}

function onMove(event: PointerEvent): void {
    if (stroke === null || tool.value === "fill" || tool.value === "pick") return;
    const at = pixelAt(event);
    if (at === null) return;
    if (tool.value === "line") {
        colors.value = [...stroke.before];
        apply(at, stroke.start);
    } else {
        apply(at, stroke.last);
    }
    stroke.last = at;
}

function onUp(): void {
    if (stroke === null) return;
    stroke = null;
    send();
}

function send(): void {
    if (colorsNode.value === null || tool.value === "pick") return;
    emit("replace", colorsNode.value.id, colorsSnbt(colors.value));
}

function onKey(event: KeyboardEvent): void {
    const moves: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    if (move !== undefined) {
        event.preventDefault();
        cursor.value = {
            x: Math.min(MAP_SIZE - 1, Math.max(0, cursor.value.x + move[0])),
            y: Math.min(MAP_SIZE - 1, Math.max(0, cursor.value.y + move[1])),
        };
        return;
    }
    if (event.key === " " && !props.disabled) {
        event.preventDefault();
        apply(cursor.value, null);
        send();
    } else if (event.key === "p" || event.key === "P") {
        const keep = tool.value;
        tool.value = "pick";
        apply(cursor.value, null);
        tool.value = keep;
    }
}

const cursorStyle = computed(() => ({
    left: `${(cursor.value.x / MAP_SIZE) * 100}%`,
    top: `${(cursor.value.y / MAP_SIZE) * 100}%`,
    width: `${100 / MAP_SIZE}%`,
    height: `${100 / MAP_SIZE}%`,
}));

/* Import and export ---------------------------------------------------------------------------- */

async function onImport(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file === undefined || colorsNode.value === null) return;
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (bitmap === null) {
        failure.value = t("nbt.map.badImage", "That picture could not be read.");
        return;
    }
    const scratch = document.createElement("canvas");
    scratch.width = MAP_SIZE;
    scratch.height = MAP_SIZE;
    const ctx = scratch.getContext("2d");
    if (ctx === null) return;
    ctx.drawImage(bitmap, 0, 0, MAP_SIZE, MAP_SIZE);
    colors.value = imageToColors(ctx.getImageData(0, 0, MAP_SIZE, MAP_SIZE).data);
    draw();
    send();
    (event.target as HTMLInputElement).value = "";
}

function exportPng(): void {
    const el = canvas.value;
    if (el === null) return;
    const a = document.createElement("a");
    a.href = el.toDataURL("image/png");
    a.download = `${props.doc.title.replace(/\.dat$/i, "")}.png`;
    a.click();
}

const tools = computed(() => [
    { value: "pen", label: t("nbt.map.pen", "Pen") },
    { value: "line", label: t("nbt.map.line", "Line") },
    { value: "fill", label: t("nbt.map.fill", "Fill") },
    { value: "pick", label: t("nbt.map.pick", "Pick colour") },
]);
</script>

<template>
    <div class="wl-map">
        <p v-if="failure" class="wl-map__note wl-map__note--error" role="alert">{{ failure }}</p>
        <div class="wl-map__body">
            <section
                class="wl-map__card wl-map__paint"
                :aria-label="t('nbt.map.pixels', 'Map pixels')"
            >
                <div class="wl-map__bar">
                    <v-btn-toggle
                        v-model="tool"
                        mandatory
                        density="comfortable"
                        rounded="pill"
                        variant="outlined"
                        color="secondary"
                        :aria-label="t('nbt.map.tools', 'Tools')"
                    >
                        <v-btn v-for="tl in tools" :key="tl.value" :value="tl.value">{{
                            tl.label
                        }}</v-btn>
                    </v-btn-toggle>
                    <span class="wl-map__spacer" />
                    <v-btn
                        variant="tonal"
                        rounded="pill"
                        :disabled="disabled || colorsNode === null"
                        @click="importInput?.click()"
                        >{{ t("nbt.map.import", "Import picture") }}</v-btn
                    >
                    <v-btn
                        variant="tonal"
                        rounded="pill"
                        :disabled="colorsNode === null"
                        @click="exportPng"
                        >{{ t("nbt.map.export", "Export PNG") }}</v-btn
                    >
                    <input
                        ref="importInput"
                        type="file"
                        accept="image/*"
                        class="wl-map__file"
                        :aria-label="t('nbt.map.import', 'Import picture')"
                        @change="onImport"
                    />
                </div>
                <div class="wl-map__frame">
                    <canvas
                        ref="canvas"
                        class="wl-map__canvas"
                        :width="MAP_SIZE"
                        :height="MAP_SIZE"
                        tabindex="0"
                        role="img"
                        :aria-label="
                            t(
                                'nbt.map.canvas',
                                { x: cursor.x, y: cursor.y },
                                'Map picture, 128 by 128. Cursor at {x}, {y}. Arrow keys move, Space paints, P picks.',
                            )
                        "
                        @pointerdown="onDown"
                        @pointermove="onMove"
                        @pointerup="onUp"
                        @pointercancel="onUp"
                        @keydown="onKey"
                    />
                    <span class="wl-map__cursor" :style="cursorStyle" aria-hidden="true" />
                </div>
                <p class="wl-map__note">
                    {{
                        t(
                            "nbt.map.hint",
                            "Each stroke is one undo step. Importing a picture matches every pixel to the nearest colour a map can show.",
                        )
                    }}
                </p>
            </section>

            <section class="wl-map__card wl-map__side" :aria-label="t('nbt.map.colour', 'Colour')">
                <h3 class="wl-map__title">
                    {{ t("nbt.map.colour", "Colour") }}: {{ MAP_BASE_COLORS[base]?.[0] }},
                    {{ SHADE_NAMES[shade] }}
                </h3>
                <div
                    class="wl-map__swatches"
                    role="radiogroup"
                    :aria-label="t('nbt.map.colour', 'Colour')"
                >
                    <button
                        v-for="sw in swatches.slice(1)"
                        :key="sw.base"
                        type="button"
                        role="radio"
                        class="wl-map__swatch"
                        :class="{ 'is-on': sw.base === base }"
                        :aria-checked="sw.base === base ? 'true' : 'false'"
                        :aria-label="sw.name"
                        :title="sw.name"
                        :style="{ background: sw.css }"
                        @click="base = sw.base"
                    />
                </div>
                <v-btn-toggle
                    v-model="shade"
                    mandatory
                    density="comfortable"
                    rounded="pill"
                    variant="outlined"
                    color="secondary"
                    :aria-label="t('nbt.map.shade', 'Shade')"
                >
                    <v-btn v-for="(name, i) in SHADE_NAMES" :key="name" :value="i">{{
                        name
                    }}</v-btn>
                </v-btn-toggle>
                <h3 class="wl-map__title">{{ t("nbt.map.settings", "Map settings") }}</h3>
                <div v-for="s in settings" :key="s.node.id" class="wl-map__row">
                    <span class="wl-map__label">{{ fieldInfo(s.node, s.path).label }}</span>
                    <NbtValueEditor
                        :node="s.node"
                        :label="fieldInfo(s.node, s.path).label"
                        :info="fieldInfo(s.node, s.path)"
                        :disabled="disabled"
                        @commit="(text: string) => emit('commit', s.node.id, text)"
                        @flip="(on: boolean) => emit('flip', s.node.id, on)"
                    />
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
.wl-map {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: auto;
    padding: 4px 2px 16px;
}
.wl-map__body {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
}
.wl-map__card {
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border-radius: 24px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}
.wl-map__paint {
    flex: 3 1 420px;
}
.wl-map__side {
    flex: 2 1 280px;
}
.wl-map__bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}
.wl-map__spacer {
    flex: 1;
}
.wl-map__file {
    display: none;
}
.wl-map__frame {
    position: relative;
    width: 100%;
    max-width: 512px;
    aspect-ratio: 1;
    background: repeating-conic-gradient(
            rgba(var(--v-theme-on-surface), 0.08) 0 25%,
            transparent 0 50%
        )
        0 0 / 16px 16px;
    border-radius: 8px;
    overflow: hidden;
}
.wl-map__canvas {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    touch-action: none;
    cursor: crosshair;
    display: block;
}
.wl-map__canvas:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-map__cursor {
    position: absolute;
    box-shadow:
        0 0 0 1px #fff,
        0 0 0 2px #000;
    pointer-events: none;
}
.wl-map__note {
    margin: 0;
    font:
        400 12px/16px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-map__note--error {
    color: rgb(var(--v-theme-error));
    font-size: 13px;
}
.wl-map__title {
    margin: 0;
    font:
        500 15px/22px Roboto,
        sans-serif;
}
.wl-map__swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
    gap: 4px;
}
.wl-map__swatch {
    height: 28px;
    border-radius: 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
    cursor: pointer;
    padding: 0;
}
.wl-map__swatch.is-on {
    outline: 3px solid rgb(var(--v-theme-on-surface));
    outline-offset: 1px;
}
.wl-map__swatch:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-map__row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
}
.wl-map__label {
    flex: 1 1 120px;
    font:
        400 14px Roboto,
        sans-serif;
}
@media (max-width: 720px) {
    .wl-map__swatch {
        height: 44px;
    }
}
</style>
