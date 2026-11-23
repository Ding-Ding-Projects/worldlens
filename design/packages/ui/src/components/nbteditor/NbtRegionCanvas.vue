<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VBtnToggle } from "vuetify/components";
import type { RegionChunk } from "./nbtEditorBridge.js";
import {
    compressionName,
    formatSaved,
    formatSize,
    legend,
    moveFocus,
    regionCells,
    type RegionMetric,
} from "./nbtRegionModel.js";

/**
 * A region file as a picture: 32 by 32 chunk slots, shaded by stored size, last save or
 * compression. Picking a chunk shows its facts; Open opens its NBT in the tree or form.
 *
 * The grid is one tab stop with arrow-key movement inside it (Home and End jump along a row), and
 * every cell is a button named with its chunk and the fact being shown, so the picture is not the
 * only way to read it. Colour is never the only signal: empty slots are outlined, unopenable ones
 * hatched, and the facts card repeats everything in words.
 *
 * Design: `design/design-sources/nbt-editor-full/Region.dc.html`.
 */
const props = defineProps<{
    path: string;
    chunks: readonly RegionChunk[];
    openIndex: number | null;
}>();
const emit = defineEmits<{ open: [index: number] }>();
const { t } = useI18n();

const metric = ref<RegionMetric>("size");
const cells = computed(() => regionCells(props.chunks, metric.value));
const ends = computed(() => legend(props.chunks, metric.value));
const focus = ref(0);
const picked = ref<number | null>(null);
const grid = ref<HTMLElement | null>(null);

const pickedCell = computed(() =>
    picked.value === null ? null : (cells.value[picked.value] ?? null),
);
const unopenable = computed(() => props.chunks.filter((c) => !c.readable).length);

function shade(level: number | null): string {
    if (level === null) return "transparent";
    const pct = Math.round(18 + level * 72);
    return `color-mix(in srgb, rgb(var(--v-theme-primary)) ${pct}%, rgb(var(--v-theme-surface-container-highest, var(--v-theme-surface))))`;
}

async function onKey(event: KeyboardEvent): Promise<void> {
    const next = moveFocus(focus.value, event.key);
    if (next === null) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            picked.value = focus.value;
        }
        return;
    }
    event.preventDefault();
    focus.value = next;
    await nextTick();
    grid.value?.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus();
}

function pick(index: number): void {
    focus.value = index;
    picked.value = index;
}
</script>

<template>
    <div class="wl-region">
        <div class="wl-region__bar">
            <span class="wl-region__label">{{ t("nbt.region.colourBy", "Colour by") }}</span>
            <v-btn-toggle
                v-model="metric"
                mandatory
                density="comfortable"
                rounded="pill"
                variant="outlined"
                color="secondary"
                :aria-label="t('nbt.region.colourBy', 'Colour by')"
            >
                <v-btn value="size">{{ t("nbt.region.size", "Stored size") }}</v-btn>
                <v-btn value="saved">{{ t("nbt.region.saved", "Last saved") }}</v-btn>
                <v-btn value="compression">{{ t("nbt.region.compression", "Compression") }}</v-btn>
            </v-btn-toggle>
            <span class="wl-region__count" role="status">
                {{
                    t(
                        "nbt.region.count",
                        { count: chunks.length },
                        "{count} of 1,024 chunks stored",
                    )
                }}
                <template v-if="unopenable > 0">{{
                    t(
                        "nbt.region.unopenable",
                        { count: unopenable },
                        ", {count} cannot be opened here",
                    )
                }}</template>
            </span>
        </div>

        <div class="wl-region__body">
            <div
                ref="grid"
                class="wl-region__grid"
                role="grid"
                :aria-label="
                    t(
                        'nbt.region.grid',
                        { name: path },
                        'Chunks of {name}, west to east and north to south',
                    )
                "
                @keydown="onKey"
            >
                <button
                    v-for="(cell, i) in cells"
                    :key="i"
                    type="button"
                    role="gridcell"
                    class="wl-region__cell"
                    :class="[
                        `is-${cell.state}`,
                        {
                            'is-picked': picked === i,
                            'is-open': cell.chunk !== null && cell.chunk.index === openIndex,
                        },
                    ]"
                    :style="{
                        background: cell.state === 'present' ? shade(cell.level) : undefined,
                    }"
                    :data-cell="i"
                    :tabindex="focus === i ? 0 : -1"
                    :aria-label="cell.label"
                    :aria-selected="picked === i ? 'true' : 'false'"
                    @click="pick(i)"
                    @dblclick="cell.chunk && cell.chunk.readable && emit('open', cell.chunk.index)"
                />
            </div>

            <aside class="wl-region__card" :aria-label="t('nbt.region.picked', 'Picked chunk')">
                <template v-if="pickedCell && pickedCell.chunk">
                    <h3 class="wl-region__title">
                        {{
                            t(
                                "nbt.region.chunk",
                                { x: pickedCell.chunk.x, z: pickedCell.chunk.z },
                                "Chunk {x}, {z}",
                            )
                        }}
                    </h3>
                    <p class="wl-region__mono">
                        {{
                            t(
                                "nbt.region.blocks",
                                {
                                    x1: pickedCell.chunk.x * 16,
                                    x2: pickedCell.chunk.x * 16 + 15,
                                    z1: pickedCell.chunk.z * 16,
                                    z2: pickedCell.chunk.z * 16 + 15,
                                },
                                "Blocks x {x1} to {x2}, z {z1} to {z2}",
                            )
                        }}
                    </p>
                    <dl class="wl-region__facts">
                        <div>
                            <dt>{{ t("nbt.region.size", "Stored size") }}</dt>
                            <dd>{{ formatSize(pickedCell.chunk.size) }}</dd>
                        </div>
                        <div>
                            <dt>{{ t("nbt.region.saved", "Last saved") }}</dt>
                            <dd>{{ formatSaved(pickedCell.chunk.timestamp) }}</dd>
                        </div>
                        <div>
                            <dt>{{ t("nbt.region.compression", "Compression") }}</dt>
                            <dd>{{ compressionName(pickedCell.chunk.compressionType) }}</dd>
                        </div>
                    </dl>
                    <p v-if="!pickedCell.chunk.readable" class="wl-region__warn" role="note">
                        {{
                            pickedCell.chunk.unsupported ??
                            t("nbt.region.cannotOpen", "This chunk cannot be opened here.")
                        }}
                    </p>
                    <v-btn
                        color="primary"
                        variant="flat"
                        rounded="pill"
                        :disabled="!pickedCell.chunk.readable"
                        @click="emit('open', pickedCell.chunk.index)"
                    >
                        {{ t("nbt.region.open", "Open this chunk") }}
                    </v-btn>
                </template>
                <template v-else-if="pickedCell">
                    <h3 class="wl-region__title">
                        {{
                            t(
                                "nbt.region.slot",
                                { x: pickedCell.lx, z: pickedCell.lz },
                                "Slot {x}, {z}",
                            )
                        }}
                    </h3>
                    <p class="wl-region__mono">
                        {{
                            t(
                                "nbt.region.empty",
                                "No chunk is stored here. The game generates it the first time a player comes near.",
                            )
                        }}
                    </p>
                </template>
                <p v-else class="wl-region__mono">
                    {{
                        t(
                            "nbt.region.hint",
                            "Pick a chunk to see its facts. Double-click, or Open, to edit it.",
                        )
                    }}
                </p>
            </aside>
        </div>

        <div class="wl-region__legend" aria-hidden="true">
            <span>{{ ends[0] }}</span>
            <span class="wl-region__ramp" />
            <span>{{ ends[1] }}</span>
            <span class="wl-region__key"
                ><span class="wl-region__swatch is-missing" />{{
                    t("nbt.region.keyMissing", "No chunk")
                }}</span
            >
            <span class="wl-region__key"
                ><span class="wl-region__swatch is-unsupported" />{{
                    t("nbt.region.keyUnsupported", "Cannot be opened here")
                }}</span
            >
        </div>
    </div>
</template>

<style scoped>
.wl-region {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: auto;
    padding: 4px 2px 16px;
}
.wl-region__bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}
.wl-region__label {
    font:
        500 14px Roboto,
        sans-serif;
}
.wl-region__count {
    font:
        400 13px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-region__body {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
}
.wl-region__grid {
    flex: 3 1 360px;
    max-width: 640px;
    display: grid;
    grid-template-columns: repeat(32, minmax(0, 1fr));
    gap: 2px;
    aspect-ratio: 1;
}
.wl-region__cell {
    border: 0;
    padding: 0;
    border-radius: 2px;
    min-width: 0;
    aspect-ratio: 1;
    cursor: pointer;
}
.wl-region__cell.is-missing {
    background: transparent;
    box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.12);
}
.wl-region__cell.is-unsupported {
    background: repeating-linear-gradient(
        45deg,
        rgba(var(--v-theme-error), 0.55) 0 2px,
        transparent 2px 4px
    );
}
.wl-region__cell.is-picked,
.wl-region__cell.is-open {
    outline: 2px solid rgb(var(--v-theme-on-surface));
    outline-offset: 1px;
}
.wl-region__cell:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
    position: relative;
    z-index: 1;
}
.wl-region__card {
    flex: 2 1 260px;
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border-radius: 24px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.wl-region__title {
    margin: 0;
    font:
        400 20px/28px Roboto,
        sans-serif;
}
.wl-region__mono {
    margin: 0;
    font:
        400 13px/18px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-region__facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
}
.wl-region__facts dt {
    font:
        400 12px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-region__facts dd {
    margin: 0;
    font:
        400 15px Roboto,
        sans-serif;
}
.wl-region__warn {
    margin: 0;
    font:
        400 13px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-error));
}
.wl-region__legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font:
        400 12px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-region__ramp {
    width: 160px;
    height: 10px;
    border-radius: 5px;
    background: linear-gradient(
        90deg,
        color-mix(in srgb, rgb(var(--v-theme-primary)) 18%, rgb(var(--v-theme-surface))),
        rgb(var(--v-theme-primary))
    );
}
.wl-region__key {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
}
.wl-region__swatch {
    width: 12px;
    height: 12px;
    border-radius: 2px;
}
.wl-region__swatch.is-missing {
    box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.4);
}
.wl-region__swatch.is-unsupported {
    background: repeating-linear-gradient(
        45deg,
        rgba(var(--v-theme-error), 0.7) 0 2px,
        transparent 2px 4px
    );
}
</style>
