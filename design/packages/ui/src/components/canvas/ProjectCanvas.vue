<script setup lang="ts">
/**
 * The node-graph presentation of map creation.
 *
 * This is a second way to look at the same project, not a second project. Every answer is read
 * from and written to the `MapWizard` handed in as a prop, which is the identical object the linear
 * wizard drives, so somebody can build half a project here, switch to the wizard, and carry on
 * without anything being migrated or lost. That is the whole reason the canvas keeps only layout of
 * its own.
 *
 * What the canvas adds over the wizard is shape. A wizard can only ever show one step at a time, so
 * "this world feeds these dimensions, and options hang off the map rather than off the world" is
 * something a person has to hold in their head. Here it is drawn.
 */

import { computed, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";

import CanvasNode from "./CanvasNode.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    ALLOWED_EDGES,
    type CanvasLayout,
    NODE_HEIGHT,
    NODE_WIDTH,
    type NodeKind,
    STEP_FOR_NODE,
    canConnect,
    createLayout,
    moveNode,
    nodeAt,
    panView,
    pixelDeltaToWorld,
    pointerToWorld,
    selectNode,
    worldToPixel,
    zoomView,
} from "./canvasModel.js";
import type { MapWizard } from "../world/wizardModel.js";
import { optionFields } from "../world/wizardSteps.js";
import type { FieldMeta, PlainValue } from "@worldlens/config";

const props = defineProps<{
    /** The shared model. The canvas never copies it. */
    wizard: MapWizard;
}>();

const emit = defineEmits<{
    /** Raised when a refused wire needs saying out loud, rather than failing silently. */
    refused: [reason: string];
}>();

const { t } = useI18n();

const layout = ref<CanvasLayout>(createLayout());
const surface = shallowRef<HTMLElement | null>(null);

const query = ref("");
const regex = ref(false);
const flags = ref("i");

/** Node search filters which boxes are highlighted, never which exist: hiding a node would hide a
 * project's own shape, and the shape is what this surface is for. */
const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));

const NODE_SEARCH_TEXT: Readonly<Record<NodeKind, string>> = {
    world: "world source folder minecraft region files",
    dimension: "dimension overworld nether end extra dimensions",
    identity: "map identity display name id sorting order",
    options: "map options settings render appearance",
    storage: "storage directory output tiles where written",
    render: "render run start threads force fix edges metrics",
};

const matched = computed<ReadonlySet<NodeKind>>(() => {
    if (!query.value) return new Set();
    const hits = new Set<NodeKind>();
    for (const node of layout.value.nodes) {
        if (matcher.value.test(NODE_SEARCH_TEXT[node.kind])) hits.add(node.kind);
    }
    return hits;
});

const searchSummary = computed(() =>
    query.value ? t("canvas.search.summary", `Showing ${matched.value.size} of ${layout.value.nodes.length}`) : "",
);

/** Every option field, rendered by the options node through ConfigField. Never hand-written here. */
const fields = computed<readonly FieldMeta[]>(() => optionFields());

/**
 * Summaries come from the shared model, so a node says what the project actually holds rather than
 * what this component last remembered.
 */
function summaryFor(kind: NodeKind): string {
    const wizard = props.wizard;
    switch (kind) {
        case "world":
            return wizard.worldPath.value || t("canvas.summary.noWorld", "No world folder chosen yet");
        case "dimension":
            return wizard.dimension.value?.label ?? t("canvas.summary.noDimension", "No dimension chosen yet");
        case "identity":
            return wizard.mapId.value || t("canvas.summary.noId", "No map id yet");
        case "options":
            return t("canvas.summary.options", `${wizard.changes.value.length} changed`);
        case "storage":
            return wizard.storageDirectory.value || wizard.storageDefault.value;
        case "render":
            return wizard.run.value.renderThreads === null
                ? t("canvas.summary.threadsAuto", "Threads: automatic")
                : t("canvas.summary.threads", `Threads: ${wizard.run.value.renderThreads}`);
        default:
            return "";
    }
}

function problemsFor(kind: NodeKind) {
    return props.wizard.problemsFor(STEP_FOR_NODE[kind]);
}

/** Wires, in pixels, recomputed from the same allowed-edge list the model validates against. */
const wires = computed(() => {
    const rect = surface.value?.getBoundingClientRect();
    if (!rect) return [];
    const at = (kind: NodeKind) => layout.value.nodes.find((node) => node.kind === kind);
    return ALLOWED_EDGES.flatMap(([from, to]) => {
        const a = at(from);
        const b = at(to);
        if (!a || !b) return [];
        const start = worldToPixel({ x: a.x + NODE_WIDTH, z: a.z + NODE_HEIGHT / 2 }, rect, layout.value.view);
        const end = worldToPixel({ x: b.x, z: b.z + NODE_HEIGHT / 2 }, rect, layout.value.view);
        const bend = (start.x + end.x) / 2;
        return [{ key: `${from}-${to}`, d: `M ${start.x} ${start.y} C ${bend} ${start.y} ${bend} ${end.y} ${end.x} ${end.y}` }];
    });
});

const nodeStyle = computed(() => (kind: NodeKind): { readonly x: number; readonly y: number } => {
    const rect = surface.value?.getBoundingClientRect();
    const node = layout.value.nodes.find((entry) => entry.kind === kind);
    if (!rect || !node) return { x: 0, y: 0 };
    return worldToPixel({ x: node.x, z: node.z }, rect, layout.value.view);
});

let dragging: NodeKind | null = null;
let lastPointer: { x: number; y: number } | null = null;

function startDrag(kind: NodeKind, event: PointerEvent): void {
    dragging = kind;
    lastPointer = { x: event.clientX, y: event.clientY };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
    if (!lastPointer) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    const delta = pixelDeltaToWorld(dx, dy, layout.value.view);
    if (dragging) {
        const node = layout.value.nodes.find((entry) => entry.kind === dragging);
        if (node) layout.value = moveNode(layout.value, dragging, node.x + delta.x, node.z + delta.z);
        return;
    }
    layout.value = { ...layout.value, view: panView(layout.value.view, dx, dy) };
}

function endDrag(): void {
    dragging = null;
    lastPointer = null;
}

function onSurfacePointerDown(event: PointerEvent): void {
    const rect = surface.value?.getBoundingClientRect();
    if (!rect) return;
    const point = pointerToWorld(event.clientX, event.clientY, rect, layout.value.view);
    const hit = nodeAt(layout.value, point.x, point.z);
    layout.value = selectNode(layout.value, hit);
    if (!hit) lastPointer = { x: event.clientX, y: event.clientY };
}

function onWheel(event: WheelEvent): void {
    event.preventDefault();
    layout.value = { ...layout.value, view: zoomView(layout.value.view, event.deltaY > 0 ? 1.1 : 1 / 1.1) };
}

/**
 * Keyboard equivalents, because a canvas that only answers to a pointer is a canvas somebody who
 * cannot use one is locked out of. Arrow keys nudge the selected node; the same move a drag makes.
 */
function onKeydown(event: KeyboardEvent): void {
    const selected = layout.value.selected;
    if (!selected) return;
    const step = event.shiftKey ? 50 : 10;
    const moves: Readonly<Record<string, readonly [number, number]>> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const node = layout.value.nodes.find((entry) => entry.kind === selected);
    if (node) layout.value = moveNode(layout.value, selected, node.x + move[0], node.z + move[1]);
}

/** Exposed so a caller can report a refusal in its own surface rather than this one guessing. */
function tryConnect(from: NodeKind, to: NodeKind): boolean {
    const verdict = canConnect(from, to);
    if (!verdict.allowed) emit("refused", verdict.reason);
    return verdict.allowed;
}

function onSet(field: FieldMeta, value: PlainValue): void {
    props.wizard.setOption(field, value);
}

function onClear(field: FieldMeta): void {
    props.wizard.clearOption(field);
}

defineExpose({ tryConnect, layout });
</script>

<template>
    <section class="mb-project-canvas" data-test="project-canvas">
        <header class="mb-project-canvas__bar">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regex"
                v-model:flags="flags"
                :label="t('canvas.search.label', 'Find a node')"
                :summary="searchSummary"
                :sample="Object.values(NODE_SEARCH_TEXT).join('\n')"
                density="compact"
                data-test="canvas-search"
            />
        </header>

        <div
            ref="surface"
            class="mb-project-canvas__surface"
            tabindex="0"
            role="application"
            :aria-label="t('canvas.surface.label', 'Project canvas. Arrow keys move the selected node.')"
            @pointerdown="onSurfacePointerDown"
            @pointermove="onPointerMove"
            @pointerup="endDrag"
            @pointercancel="endDrag"
            @wheel="onWheel"
            @keydown="onKeydown"
        >
            <svg class="mb-project-canvas__wires" aria-hidden="true">
                <path v-for="wire in wires" :key="wire.key" :d="wire.d" class="mb-project-canvas__wire" />
            </svg>

            <CanvasNode
                v-for="node in layout.nodes"
                :key="node.kind"
                :kind="node.kind"
                :x="nodeStyle(node.kind).x"
                :z="nodeStyle(node.kind).y"
                :selected="layout.selected === node.kind"
                :class="{ 'mb-canvas-node--match': matched.has(node.kind) }"
                :problems="problemsFor(node.kind)"
                :summary="summaryFor(node.kind)"
                :fields="node.kind === 'options' ? fields : []"
                :file="node.kind === 'options' ? wizard.file.value : null"
                @select="(kind) => (layout = selectNode(layout, kind))"
                @start-drag="startDrag"
                @set="onSet"
                @clear="onClear"
            />
        </div>
    </section>
</template>

<style scoped lang="scss">
.mb-project-canvas {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}

.mb-project-canvas__bar {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.mb-project-canvas__surface {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    background:
        radial-gradient(circle, rgba(var(--v-theme-on-surface), 0.14) 1px, transparent 1px) 0 0 / 24px 24px;
    touch-action: none;
}

.mb-project-canvas__surface:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-project-canvas__wires {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.mb-project-canvas__wire {
    fill: none;
    stroke: rgba(var(--v-theme-on-surface), 0.45);
    stroke-width: 2;
}

/* A search hit is marked, never hidden: hiding a node would hide the project's shape. */
:deep(.mb-canvas-node--match) {
    outline: 2px solid rgb(var(--v-theme-secondary));
    outline-offset: 2px;
}
</style>
