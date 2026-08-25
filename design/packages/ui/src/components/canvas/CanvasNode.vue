<script setup lang="ts">
/**
 * One box on the project canvas.
 *
 * A node is a window onto a slice of the shared wizard model, never a place answers are kept. It
 * reads what it needs from that model and writes straight back to it, so the canvas and the linear
 * wizard cannot drift apart: switching modes half way through a project is a rendering decision,
 * not a migration.
 *
 * Two things this file deliberately does not do:
 *
 * It does not decide whether its own answers are complete. That question already has an answer in
 * `problemsFor(step)`, so the badge below asks the model rather than reimplementing validation that
 * would then disagree with the wizard's.
 *
 * It does not write markup for individual settings. `ConfigField` renders a `FieldMeta` through the
 * right control for its declared `Control` kind - one of thirteen, covering switches, numbers,
 * sliders, paths, selects, colours, vectors, lists, key-value tables and the rest - so an option
 * cannot quietly degrade into a text box somebody has to guess the format of. A hand-written row
 * here would be exactly that regression, and it would only show up on whichever option was
 * forgotten.
 */

import { computed } from "vue";
import { useI18n } from "vue-i18n";

import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigField from "../config/ConfigField.vue";
import type { EditableConfigFile, FieldMeta, PlainValue } from "@worldlens/config";
import { NODE_HEIGHT, NODE_WIDTH, type NodeKind, STEP_FOR_NODE } from "./canvasModel.js";
import type { StepProblem } from "../world/wizardModel.js";

const props = withDefaults(
    defineProps<{
        kind: NodeKind;
        /** Canvas coordinates of the node's top-left corner. */
        x: number;
        z: number;
        selected?: boolean;
        /** Straight from the shared model, never recomputed here. */
        problems?: readonly StepProblem[];
        /** Present only on the options node; every other kind renders its own summary rows. */
        fields?: readonly FieldMeta[];
        file?: EditableConfigFile | null;
        summary?: string;
    }>(),
    { selected: false, problems: () => [], fields: () => [], file: null, summary: "" },
);

const emit = defineEmits<{
    select: [kind: NodeKind];
    "start-drag": [kind: NodeKind, event: PointerEvent];
    set: [field: FieldMeta, value: PlainValue];
    clear: [field: FieldMeta];
}>();

const { t } = useI18n();

/**
 * Node names are facts about the project's shape, so they stay exact at every funny level in the
 * same way a field label does. The surrounding copy is free to be playful; "which box is this" is
 * not.
 */
const TITLES: Readonly<Record<NodeKind, string>> = {
    world: "World source",
    dimension: "Dimension",
    identity: "Map identity",
    options: "Map options",
    storage: "Storage",
    render: "Render",
};

const title = computed(() => t(`canvas.node.${props.kind}`, TITLES[props.kind]));
const step = computed(() => STEP_FOR_NODE[props.kind]);
const hasProblems = computed(() => props.problems.length > 0);

const style = computed(() => ({
    transform: `translate(${props.x}px, ${props.z}px)`,
    width: `${NODE_WIDTH}px`,
    minHeight: `${NODE_HEIGHT}px`,
}));

function onPointerDown(event: PointerEvent): void {
    emit("select", props.kind);
    emit("start-drag", props.kind, event);
}
</script>

<template>
    <!--
        Every node is an appearance target, which is what gives it both "Edit appearance..." and the
        toy-lock commands without this file implementing either. The id is stable across re-renders
        because it is keyed on the node kind rather than on its position.
    -->
    <AppearanceTarget
        :id="`canvas.node.${kind}`"
        :label="title"
        as="div"
        class="mb-canvas-node"
        :class="{ 'mb-canvas-node--selected': selected, 'mb-canvas-node--problem': hasProblems }"
        :style="style"
        :data-test="`canvas-node-${kind}`"
    >
        <header class="mb-canvas-node__head" @pointerdown="onPointerDown">
            <h3 class="mb-canvas-node__title">{{ title }}</h3>
            <!--
                The badge counts what the shared model reported for this node's step. It is a link
                to the reason, not a decoration: the exact problem text is the model's own words.
            -->
            <span
                v-if="hasProblems"
                class="mb-canvas-node__badge"
                :data-test="`canvas-node-${kind}-problems`"
                :title="problems.map((problem) => problem.text).join('\n')"
            >
                {{ problems.length }}
            </span>
        </header>

        <div class="mb-canvas-node__body">
            <p v-if="summary" class="mb-canvas-node__summary">{{ summary }}</p>

            <!--
                Options render through ConfigField, one row per FieldMeta. Never hand-written.
            -->
            <template v-if="fields.length > 0 && file">
                <ConfigField
                    v-for="field in fields"
                    :key="field.path"
                    :field="field"
                    :file="file"
                    @set="(meta, value) => emit('set', meta, value)"
                    @clear="(meta) => emit('clear', meta)"
                />
            </template>

            <slot />
        </div>

        <footer class="mb-canvas-node__foot">
            <span class="mb-canvas-node__step">{{ step }}</span>
        </footer>
    </AppearanceTarget>
</template>

<style scoped lang="scss">
.mb-canvas-node {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 12px;
    box-shadow: var(--md-sys-elevation-shadow-level3);
    overflow: hidden;
}

.mb-canvas-node--selected {
    border-color: rgb(var(--v-theme-primary));
    box-shadow: var(--md-sys-elevation-shadow-level4);
}

.mb-canvas-node--problem {
    border-color: rgb(var(--v-theme-error));
}

.mb-canvas-node__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(var(--v-theme-on-surface), 0.04);
    cursor: grab;
    touch-action: none;
}

.mb-canvas-node__title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
}

/* Colour is never the only signal: the badge carries the count, and its title carries the words. */
.mb-canvas-node__badge {
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    background: rgb(var(--v-theme-error));
    color: rgb(var(--v-theme-on-error));
    font-size: 0.75rem;
    line-height: 22px;
    text-align: center;
}

.mb-canvas-node__body {
    flex: 1 1 auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-canvas-node__summary {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-canvas-node__foot {
    padding: 6px 12px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
</style>
