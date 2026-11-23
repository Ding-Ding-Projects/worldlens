<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VBtnToggle } from "vuetify/components";
import type { DocumentInfo, NbtEditorBridge, NodeView } from "./nbtEditorBridge.js";
import { readableResource } from "./nbtFieldCatalogue.js";
import {
    blockColour,
    blocksSnbt,
    indexBlocks,
    paint,
    paletteCounts,
    parseBlocks,
    parsePalette,
    type PaletteEntry,
    type StructureBlock,
} from "./nbtStructureModel.js";

/**
 * A structure file as layers you paint, with an isometric preview of the whole build.
 *
 * One layer (a height) at a time is drawn as a grid, west to east and north to south. Paint puts
 * the chosen palette entry in each cell you drag over, Pick takes the cell's entry, and the
 * layer stepper moves up and down. When the stroke ends the whole block list goes back as one
 * `replaceSnbt` edit, so it is one undo step with ordinary history; each block's own data (a
 * chest's items, a sign's text) is carried through untouched.
 *
 * Keyboard: the grid is one tab stop; arrows move, Space paints, P picks, Page Up and Page Down
 * change the layer.
 *
 * Design: `design/design-sources/nbt-editor-full/Structure.dc.html`.
 */
const props = defineProps<{
    bridge: NbtEditorBridge;
    doc: DocumentInfo;
    revision: number;
    disabled?: boolean | undefined;
}>();
const emit = defineEmits<{ replace: [id: number, snbt: string] }>();
const { t } = useI18n();

const MAX_SIDE = 96;
const size = ref<[number, number, number]>([0, 0, 0]);
const palette = shallowRef<PaletteEntry[]>([]);
const blocks = shallowRef<StructureBlock[]>([]);
const blocksNode = shallowRef<NodeView | null>(null);
const failure = ref<string | null>(null);
const layer = ref(0);
const brush = ref(0);
const tool = ref<"paint" | "pick">("paint");
const focus = ref(0);
const tick = ref(0);
const grid = ref<HTMLElement | null>(null);
const iso = ref<HTMLCanvasElement | null>(null);
let index = new Map<string, StructureBlock>();

async function kids(id: number): Promise<readonly NodeView[]> {
    const page = await props.bridge.children(props.doc.docId, id, 0, 500);
    if (!page.ok) throw new Error(page.message);
    return page.value.nodes;
}

async function snbtOf(id: number): Promise<string> {
    const answer = await props.bridge.snbt(props.doc.docId, id, false);
    if (!answer.ok) throw new Error(answer.message);
    if (answer.value.truncated)
        throw new Error(
            t(
                "nbt.structure.tooLarge",
                "This structure is too large to draw; the tree still edits it.",
            ),
        );
    return answer.value.text;
}

async function load(): Promise<void> {
    failure.value = null;
    try {
        const top = await kids(props.doc.root.id);
        const sizeNode = top.find((n) => n.name === "size" && n.kind === "list");
        const paletteNode = top.find((n) => n.name === "palette" && n.kind === "list");
        const list = top.find((n) => n.name === "blocks" && n.kind === "list") ?? null;
        if (sizeNode === undefined || paletteNode === undefined || list === null)
            throw new Error(
                t(
                    "nbt.structure.notOne",
                    "This is not a structure file (no size, palette and blocks).",
                ),
            );
        const dims = (await kids(sizeNode.id)).map((n) => Number(n.text));
        size.value = [dims[0] ?? 0, dims[1] ?? 0, dims[2] ?? 0];
        if (size.value[0] > MAX_SIDE || size.value[2] > MAX_SIDE)
            throw new Error(
                t(
                    "nbt.structure.tooWide",
                    "This structure is wider than the canvas draws; the tree still edits it.",
                ),
            );
        blocksNode.value = list;
        palette.value = parsePalette(await snbtOf(paletteNode.id));
        blocks.value = parseBlocks(await snbtOf(list.id));
        index = indexBlocks(blocks.value);
        layer.value = Math.min(layer.value, Math.max(0, size.value[1] - 1));
        tick.value++;
        await nextTick();
        drawIso();
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    }
}
watch(
    () => [props.doc.docId, props.revision] as const,
    () => void load(),
);
onMounted(() => void load());

const counts = computed(() => (tick.value, paletteCounts(blocks.value, palette.value.length)));
const cells = computed(() => {
    void tick.value;
    const [sx, , sz] = size.value;
    const out: { x: number; z: number; state: number | null; colour: string; label: string }[] = [];
    for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
            const b = index.get(`${x},${layer.value},${z}`);
            const entry = b === undefined ? null : palette.value[b.state];
            out.push({
                x,
                z,
                state: b?.state ?? null,
                colour: entry ? blockColour(entry.name) : "transparent",
                label: `x ${x}, z ${z}: ${entry ? readableResource(entry.name) : t("nbt.structure.nothing", "nothing (structure void)")}`,
            });
        }
    }
    return out;
});

/* Painting ------------------------------------------------------------------------------- */

let painting = false;
let changed = false;

function act(i: number): void {
    const cell = cells.value[i];
    if (cell === undefined) return;
    if (tool.value === "pick") {
        if (cell.state !== null) brush.value = cell.state;
        return;
    }
    if (paint(blocks.value, index, cell.x, layer.value, cell.z, brush.value)) {
        changed = true;
        tick.value++;
    }
}

function down(i: number): void {
    if (props.disabled) return;
    focus.value = i;
    painting = true;
    changed = false;
    act(i);
}
function enter(i: number): void {
    if (painting && tool.value === "paint") act(i);
}
function up(): void {
    if (!painting) return;
    painting = false;
    send();
}
function send(): void {
    if (!changed || blocksNode.value === null) return;
    changed = false;
    emit("replace", blocksNode.value.id, blocksSnbt(blocks.value));
    drawIso();
}

async function onKey(event: KeyboardEvent): Promise<void> {
    const w = size.value[0];
    const total = cells.value.length;
    const moves: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -w,
        ArrowDown: w,
    };
    if (event.key in moves) {
        event.preventDefault();
        const next = focus.value + moves[event.key]!;
        const sameRow =
            event.key === "ArrowLeft" || event.key === "ArrowRight"
                ? Math.floor(next / w) === Math.floor(focus.value / w)
                : true;
        if (next >= 0 && next < total && sameRow) focus.value = next;
        await nextTick();
        grid.value?.querySelector<HTMLElement>(`[data-cell="${focus.value}"]`)?.focus();
    } else if (event.key === " " && !props.disabled) {
        event.preventDefault();
        changed = false;
        act(focus.value);
        send();
    } else if (event.key === "p" || event.key === "P") {
        const keep = tool.value;
        tool.value = "pick";
        act(focus.value);
        tool.value = keep;
    } else if (event.key === "PageUp") {
        event.preventDefault();
        layerUp();
    } else if (event.key === "PageDown") {
        event.preventDefault();
        layerDown();
    }
}

function layerUp(): void {
    layer.value = Math.min(size.value[1] - 1, layer.value + 1);
    drawIso();
}
function layerDown(): void {
    layer.value = Math.max(0, layer.value - 1);
    drawIso();
}

/* Isometric preview ----------------------------------------------------------------------------- */

function drawIso(): void {
    const el = iso.value;
    const ctx = el?.getContext("2d") ?? null;
    if (el === null || el === undefined || ctx === null) return;
    const [sx, sy, sz] = size.value;
    const cell = Math.max(
        2,
        Math.floor(Math.min(el.width / (sx + sz + 1), el.height / ((sx + sz) / 2 + sy + 1))),
    );
    ctx.clearRect(0, 0, el.width, el.height);
    const ox = el.width / 2 + ((sz - sx) * cell) / 2;
    const oy = el.height - cell * 2 - (sx + sz) * (cell / 2);
    const sorted = [...blocks.value].sort((a, b) => a.y - b.y || a.x + a.z - (b.x + b.z));
    for (const b of sorted) {
        const entry = palette.value[b.state];
        if (entry === undefined) continue;
        const colour = blockColour(entry.name);
        if (colour === "transparent") continue;
        const px = ox + (b.x - b.z) * cell;
        const py = oy + (b.x + b.z) * (cell / 2) - b.y * cell + sy * cell - (sy - 1) * cell;
        ctx.globalAlpha = b.y === layer.value ? 1 : b.y > layer.value ? 0.25 : 0.85;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + cell, py + cell / 2);
        ctx.lineTo(px, py + cell);
        ctx.lineTo(px - cell, py + cell / 2);
        ctx.closePath();
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}
</script>

<template>
    <div class="wl-struct">
        <p v-if="failure" class="wl-struct__note wl-struct__note--error" role="alert">
            {{ failure }}
        </p>
        <div v-else class="wl-struct__body">
            <section
                class="wl-struct__card wl-struct__main"
                :aria-label="t('nbt.structure.layer', 'Layer')"
            >
                <div class="wl-struct__bar">
                    <v-btn-toggle
                        v-model="tool"
                        mandatory
                        density="comfortable"
                        rounded="pill"
                        variant="outlined"
                        color="secondary"
                        :aria-label="t('nbt.structure.tools', 'Tools')"
                    >
                        <v-btn value="paint">{{ t("nbt.structure.paint", "Paint") }}</v-btn>
                        <v-btn value="pick">{{ t("nbt.structure.pick", "Pick") }}</v-btn>
                    </v-btn-toggle>
                    <span class="wl-struct__spacer" />
                    <div
                        class="wl-struct__stepper"
                        role="group"
                        :aria-label="t('nbt.structure.height', 'Height')"
                    >
                        <v-btn
                            variant="outlined"
                            rounded="lg"
                            :disabled="layer <= 0"
                            :aria-label="t('nbt.structure.down', 'Layer down')"
                            @click="layerDown"
                            >&darr;</v-btn
                        >
                        <output aria-live="polite">{{
                            t("nbt.structure.y", { y: layer, of: size[1] - 1 }, "y {y} of {of}")
                        }}</output>
                        <v-btn
                            variant="outlined"
                            rounded="lg"
                            :disabled="layer >= size[1] - 1"
                            :aria-label="t('nbt.structure.up', 'Layer up')"
                            @click="layerUp"
                            >&uarr;</v-btn
                        >
                    </div>
                </div>
                <div class="wl-struct__layout">
                    <div
                        ref="grid"
                        class="wl-struct__grid"
                        role="grid"
                        :style="{ gridTemplateColumns: `repeat(${size[0]}, minmax(0, 1fr))` }"
                        :aria-label="
                            t(
                                'nbt.structure.grid',
                                { y: layer },
                                'Layer y {y}, west to east and north to south. Arrows move, Space paints, P picks, Page Up and Down change the layer.',
                            )
                        "
                        @keydown="onKey"
                        @pointerup="up"
                        @pointerleave="up"
                    >
                        <button
                            v-for="(c, i) in cells"
                            :key="i"
                            type="button"
                            role="gridcell"
                            class="wl-struct__cell"
                            :class="{ 'is-empty': c.state === null }"
                            :style="{
                                background: c.colour === 'transparent' ? undefined : c.colour,
                            }"
                            :data-cell="i"
                            :tabindex="focus === i ? 0 : -1"
                            :aria-label="c.label"
                            @pointerdown.prevent="down(i)"
                            @pointerenter="enter(i)"
                        />
                    </div>
                    <figure class="wl-struct__iso">
                        <canvas
                            ref="iso"
                            width="360"
                            height="300"
                            role="img"
                            :aria-label="
                                t(
                                    'nbt.structure.iso',
                                    'Isometric preview of the whole structure; the current layer is drawn solid.',
                                )
                            "
                        />
                        <figcaption class="wl-struct__note">
                            {{
                                t(
                                    "nbt.structure.isoNote",
                                    "Layers above the current one are faint.",
                                )
                            }}
                        </figcaption>
                    </figure>
                </div>
            </section>
            <section
                class="wl-struct__card wl-struct__side"
                :aria-label="t('nbt.structure.palette', 'Palette')"
            >
                <h3 class="wl-struct__title">{{ t("nbt.structure.palette", "Palette") }}</h3>
                <div
                    role="radiogroup"
                    class="wl-struct__palette"
                    :aria-label="t('nbt.structure.palette', 'Palette')"
                >
                    <button
                        v-for="(p, i) in palette"
                        :key="i"
                        type="button"
                        role="radio"
                        class="wl-struct__entry"
                        :aria-checked="brush === i ? 'true' : 'false'"
                        :class="{ 'is-on': brush === i }"
                        @click="brush = i"
                    >
                        <span
                            class="wl-struct__swatch"
                            :style="{
                                background:
                                    blockColour(p.name) === 'transparent'
                                        ? undefined
                                        : blockColour(p.name),
                            }"
                            aria-hidden="true"
                        />
                        <span class="wl-struct__entry-name"
                            >{{ readableResource(p.name)
                            }}<small v-if="Object.keys(p.properties).length">{{
                                Object.entries(p.properties)
                                    .map(([k, v]) => `${k} ${v}`)
                                    .join(", ")
                            }}</small></span
                        >
                        <span class="wl-struct__entry-count">{{ counts[i] }}</span>
                    </button>
                </div>
                <p class="wl-struct__note">
                    {{
                        t(
                            "nbt.structure.paletteNote",
                            "Block states and block data stay as they are; change them in the tree.",
                        )
                    }}
                </p>
            </section>
        </div>
    </div>
</template>

<style scoped>
.wl-struct {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: auto;
    padding: 4px 2px 16px;
}
.wl-struct__body {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
}
.wl-struct__card {
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border-radius: 24px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}
.wl-struct__main {
    flex: 3 1 480px;
}
.wl-struct__side {
    flex: 1 1 260px;
}
.wl-struct__bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}
.wl-struct__spacer {
    flex: 1;
}
.wl-struct__stepper {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font:
        500 14px "Roboto Mono",
        monospace;
}
.wl-struct__layout {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
}
.wl-struct__grid {
    flex: 1 1 320px;
    max-width: 480px;
    display: grid;
    gap: 1px;
    aspect-ratio: 1;
    touch-action: none;
}
.wl-struct__cell {
    border: 0;
    padding: 0;
    min-width: 0;
    aspect-ratio: 1;
    border-radius: 2px;
    cursor: crosshair;
    background: rgba(var(--v-theme-on-surface), 0.06);
}
.wl-struct__cell.is-empty {
    background: transparent;
    box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.08);
}
.wl-struct__cell:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
    position: relative;
    z-index: 1;
}
.wl-struct__iso {
    flex: 1 1 240px;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.wl-struct__iso canvas {
    width: 100%;
    max-width: 360px;
    height: auto;
    border-radius: 12px;
    background: rgba(var(--v-theme-on-surface), 0.04);
}
.wl-struct__title {
    margin: 0;
    font:
        500 15px/22px Roboto,
        sans-serif;
}
.wl-struct__palette {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 420px;
    overflow: auto;
}
.wl-struct__entry {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 4px 8px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: rgb(var(--v-theme-on-surface));
    text-align: left;
    cursor: pointer;
}
.wl-struct__entry.is-on {
    background: rgb(var(--v-theme-secondary-container, var(--v-theme-surface)));
}
.wl-struct__entry:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-struct__swatch {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    flex: 0 0 20px;
    box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.2);
}
.wl-struct__entry-name {
    flex: 1;
    min-width: 0;
    font:
        400 13px Roboto,
        sans-serif;
    display: flex;
    flex-direction: column;
}
.wl-struct__entry-name small {
    font-size: 11px;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-struct__entry-count {
    font:
        500 12px "Roboto Mono",
        monospace;
}
.wl-struct__note {
    margin: 0;
    font:
        400 12px/16px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-struct__note--error {
    color: rgb(var(--v-theme-error));
    font-size: 13px;
}
</style>
