<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VIcon } from "vuetify/components";
import { mdiCubeOutline, mdiTrayArrowUp } from "@mdi/js";

import { dropSummary, type AcceptedDrop, type DropSummary } from "./dropModel.js";

/**
 * A place to drag a structure or schematic straight onto, instead of hunting for the render
 * page first.
 *
 * ## Why a whole zone, and not just a button
 *
 * Dragging a file onto a window somebody already has open is the fastest route from "I have
 * this file" to "it is rendering" - no navigating to find the right page first, no file dialog
 * to click through. But drag-and-drop is invisible to anyone who cannot use a mouse the way a
 * drag gesture needs, so the zone always keeps an ordinary button beside it that does exactly
 * the same thing. A feature reachable only by dragging is a feature half the people who could
 * use this cannot reach at all.
 *
 * ## Nothing is dropped silently
 *
 * `classifyDroppedFile` runs on every file in the drop before anything else happens, and every
 * result - accepted or refused - is shown. A drop of four files where one was a `.png` never
 * quietly renders the other three and says nothing about the fourth; the person sees "3
 * accepted, 1 refused" and why, every time.
 */

const props = withDefaults(
    defineProps<{
        /** Disables the zone while a render is already running, without hiding it. */
        disabled?: boolean;
    }>(),
    { disabled: false },
);

const emit = defineEmits<{
    /** Fired once per drop, carrying only the files that passed classification. */
    render: [files: { name: string; kind: string }[]];
    /** The keyboard/pointer alternative to dragging a file in. */
    browse: [];
}>();

const { t } = useI18n();

/**
 * True only while a drag that is actually holding files is over this exact zone. A plain
 * `dragenter` fires for text and links too, so this only lights up for a real file drag,
 * and it drops back to false the instant the pointer leaves - `dragleave` fires once per
 * descendant boundary crossed, so a counter (rather than a boolean flip) is what keeps the
 * highlight from flickering off while the pointer is still over a child element.
 */
const dragDepth = ref(0);
const isDragActive = computed(() => dragDepth.value > 0);

const lastSummary = ref<DropSummary | null>(null);

function hasFiles(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    if (types === undefined || types === null) return false;
    return Array.from(types).includes("Files");
}

function onDragEnter(event: DragEvent): void {
    if (props.disabled || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth.value += 1;
}

function onDragOver(event: DragEvent): void {
    if (props.disabled || !hasFiles(event)) return;
    // Without this, the browser's default is to refuse the drop outright regardless of what
    // `drop` itself does.
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
}

function onDragLeave(event: DragEvent): void {
    if (props.disabled || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth.value = Math.max(0, dragDepth.value - 1);
}

function filesFromTransfer(dataTransfer: DataTransfer | null): { name: string; size: number }[] {
    if (dataTransfer === null) return [];
    // A real `FileList` and the plain array jsdom tests stand in for one both support
    // `Array.from`, so this works against either without the component needing to know which
    // one it was handed.
    return Array.from(dataTransfer.files).map((file) => ({ name: file.name, size: file.size }));
}

function onDrop(event: DragEvent): void {
    event.preventDefault();
    dragDepth.value = 0;
    if (props.disabled) return;

    const files = filesFromTransfer(event.dataTransfer ?? null);
    if (files.length === 0) return;

    const summary = dropSummary(files);
    lastSummary.value = summary;

    if (summary.accepted.length > 0) {
        emit(
            "render",
            summary.accepted.map((accepted: AcceptedDrop) => ({ name: accepted.name, kind: accepted.kind })),
        );
    }
}

function onBrowseClick(): void {
    if (props.disabled) return;
    emit("browse");
}

const zoneLabel = computed(() =>
    t("dropRender.zoneLabel", "Drop a structure or schematic file here to render it"),
);

// Built by hand rather than through the i18n interpolation helper: the app has no locale
// catalogue wired up for this key yet, so `t()`'s default-message fallback would render the
// unresolved "{count}" placeholder literally. Once a real catalogue exists this can move back
// to a translated, pluralised message.
const acceptedMessage = computed(() => {
    const count = lastSummary.value?.accepted.length ?? 0;
    return t("dropRender.accepted", `${count} file(s) accepted and rendering started.`);
});
</script>

<template>
    <div
        class="drop-render-zone"
        :class="{ 'drop-render-zone--active': isDragActive, 'drop-render-zone--disabled': disabled }"
        role="region"
        :aria-label="zoneLabel"
        data-test="drop-render-zone"
        @dragenter="onDragEnter"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
    >
        <slot />

        <div v-if="isDragActive" class="drop-render-zone__overlay" data-test="drop-render-overlay">
            <VIcon :icon="mdiTrayArrowUp" size="40" />
            <p>{{ t("dropRender.dropHint", "Drop to start a render") }}</p>
        </div>

        <div class="drop-render-zone__controls">
            <VBtn
                variant="tonal"
                :prepend-icon="mdiCubeOutline"
                :disabled="props.disabled ?? false"
                data-test="drop-render-browse"
                @click="onBrowseClick"
            >
                {{ t("dropRender.browseButton", "Choose a structure or schematic file…") }}
            </VBtn>

            <!--
                Live region so a screen reader hears the outcome without the person having to
                go hunting for it after the drop lands. `polite` rather than `assertive`: a
                render starting is worth announcing, not worth interrupting whatever else is
                being read.
            -->
            <div aria-live="polite" class="drop-render-zone__status">
                <VAlert
                    v-if="lastSummary !== null && lastSummary.accepted.length > 0"
                    type="success"
                    variant="tonal"
                    density="compact"
                >
                    <span data-test="drop-render-accepted-count">
                        {{ acceptedMessage }}
                    </span>
                </VAlert>

                <VAlert
                    v-if="lastSummary !== null && lastSummary.rejected.length > 0"
                    type="warning"
                    variant="tonal"
                    density="compact"
                >
                    <ul data-test="drop-render-rejected-list">
                        <li v-for="rejected in lastSummary.rejected" :key="rejected.name">
                            {{ rejected.reason }}
                        </li>
                    </ul>
                </VAlert>
            </div>
        </div>
    </div>
</template>

<style scoped>
.drop-render-zone {
    position: relative;
}

.drop-render-zone--active {
    outline: 2px dashed rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.drop-render-zone--disabled {
    pointer-events: none;
    opacity: 0.6;
}

.drop-render-zone__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(var(--v-theme-primary), 0.08);
    pointer-events: none;
    z-index: 10;
}

.drop-render-zone__controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.drop-render-zone__status ul {
    margin: 0;
    padding-inline-start: 20px;
}
</style>
