<script setup lang="ts">
/**
 * Typed editors for the world generation parts: placement steps with a depth gauge for a
 * placed feature, the vein of an ore feature, the spacing grid of a structure set, and the
 * main numbers of noise settings. Each control patches the part's JSON in place, so fields
 * drawn nowhere here are kept. Design: `design-sources/datapacks-and-chunks/WorldgenParts.dc.html`.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCombobox, VRangeSlider, VSelect, VSlider, VSwitch, VTextField } from "vuetify/components";
import { BLOCK_IDS } from "../mcserver/commandBuilderData.js";
import {
    NEW_PLACEMENT_KINDS,
    NEW_PROCESSOR_KINDS,
    newPoolPiece,
    newProcessor,
    readPool,
    readProcessors,
    writePool,
    writeProcessors,
    type PoolPiece,
    type Processor,
    getAt,
    newPlacement,
    parseObject,
    placedBand,
    readPlaced,
    readSpread,
    setAt,
    spreadProblem,
    writePlaced,
    type NewPlacementKind,
    type PlacementStep,
} from "./worldgenParts.js";

const props = withDefaults(defineProps<{ kind: string; text: string; namespace?: string }>(), { namespace: "my_pack" });
const emit = defineEmits<{ "update:text": [text: string] }>();
const { t } = useI18n();

const doc = computed(() => parseObject(props.text));
const field = (path: string): unknown => (doc.value === null ? undefined : getAt(doc.value, path));
const num = (path: string, fallback: number): number => {
    const v = field(path);
    return typeof v === "number" ? v : fallback;
};
const str = (path: string): string => {
    const v = field(path);
    return typeof v === "string" ? v : "";
};
function set(path: string, value: unknown): void {
    emit("update:text", setAt(props.text, path, value));
}

/* Placed feature */
const placed = computed(() => (props.kind === "placed_feature" ? readPlaced(props.text) : null));
function changeStep(i: number, step: PlacementStep): void {
    if (!placed.value) return;
    const steps = [...placed.value.steps];
    steps[i] = step;
    emit("update:text", writePlaced(props.text, { ...placed.value, steps }));
}
function moveStep(i: number, by: number): void {
    if (!placed.value) return;
    const steps = [...placed.value.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + by, 0, s!);
    emit("update:text", writePlaced(props.text, { ...placed.value, steps }));
}
function removeStep(i: number): void {
    if (!placed.value) return;
    emit("update:text", writePlaced(props.text, { ...placed.value, steps: placed.value.steps.filter((_, k) => k !== i) }));
}
const adding = ref<NewPlacementKind>("rarity_filter");
function addStep(): void {
    if (!placed.value) return;
    emit("update:text", writePlaced(props.text, { ...placed.value, steps: [...placed.value.steps, newPlacement(adding.value)] }));
}
const stepLabel = (kind: string): string =>
    ({
        count: t("datapack.wg.count", "How many tries per chunk"),
        rarity_filter: t("datapack.wg.rarity", "Only in 1 of N chunks"),
        in_square: t("datapack.wg.square", "Spread across the chunk"),
        height_range: t("datapack.wg.height", "Height range"),
        biome: t("datapack.wg.biome", "Only where the biome has it"),
    })[kind] ?? kind;
const addItems = computed(() => NEW_PLACEMENT_KINDS.map((k) => ({ value: k, title: stepLabel(k) })));
const band = computed(() => (placed.value ? placedBand(placed.value) : null));
const yPx = (y: number): number => 20 + ((320 - Math.max(-64, Math.min(320, y))) / 384) * 360;

/* Ore */
const isOre = computed(() => props.kind === "configured_feature" && str("type").replace(/^minecraft:/, "") === "ore");

/* Structure set */
const spread = computed(() => (props.kind === "structure_set" ? readSpread(props.text) : null));
const spreadIssue = computed(() => (spread.value ? spreadProblem(spread.value) : null));
const cells = computed(() => {
    const s = spread.value;
    if (!s) return [];
    const out: { x: number; y: number; inner: number; px: number; py: number }[] = [];
    const w = 64;
    const inner = Math.max(2, (w * Math.max(0, s.spacing - s.separation)) / s.spacing);
    for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
            const r = Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
            const r2 = Math.abs(Math.sin(i * 39.3468 + j * 11.135) * 24634.6345) % 1;
            out.push({ x: i * w, y: j * w, inner, px: i * w + r * inner, py: j * w + r2 * inner });
        }
    return out;
});

const blocks = [...BLOCK_IDS];

/* Jigsaw pool */
const pool = computed(() => (props.kind === "template_pool" ? readPool(props.text) : null));
const poolTotal = computed(() => (pool.value ?? []).reduce((sum, p) => sum + Math.max(0, p.weight), 0));
function changePiece(i: number, patch: Partial<PoolPiece>): void {
    if (!pool.value) return;
    const list = pool.value.map((p, k) => (k === i ? { ...p, ...patch } : p));
    emit("update:text", writePool(props.text, list));
}
function removePiece(i: number): void {
    if (!pool.value) return;
    emit("update:text", writePool(props.text, pool.value.filter((_, k) => k !== i)));
}
function addPiece(): void {
    emit("update:text", writePool(props.text, [...(pool.value ?? []), newPoolPiece(props.namespace)]));
}

/* Processor list */
const processors = computed(() => (props.kind === "processor_list" ? readProcessors(props.text) : null));
function changeProcessor(i: number, next: Processor): void {
    if (!processors.value) return;
    emit("update:text", writeProcessors(props.text, processors.value.map((p, k) => (k === i ? next : p))));
}
function removeProcessor(i: number): void {
    if (!processors.value) return;
    emit("update:text", writeProcessors(props.text, processors.value.filter((_, k) => k !== i)));
}
const addingProcessor = ref<(typeof NEW_PROCESSOR_KINDS)[number]>("block_rot");
function addProcessor(): void {
    emit("update:text", writeProcessors(props.text, [...(processors.value ?? []), newProcessor(addingProcessor.value)]));
}
const processorLabel = (kind: string): string =>
    ({
        block_rot: t("datapack.wg.rot", "Rot (lose some blocks)"),
        gravity: t("datapack.wg.gravity", "Follow the ground"),
        block_ignore: t("datapack.wg.ignore", "Leave these blocks out"),
    })[kind] ?? kind;
const processorItems = computed(() => NEW_PROCESSOR_KINDS.map((k) => ({ value: k, title: processorLabel(k) })));
const HEIGHTMAPS = ["WORLD_SURFACE_WG", "WORLD_SURFACE", "OCEAN_FLOOR_WG", "OCEAN_FLOOR", "MOTION_BLOCKING", "MOTION_BLOCKING_NO_LEAVES"];
</script>

<template>
    <section class="wl-wg" :aria-label="t('datapack.wg.title', 'World generation editor')">
        <p v-if="doc === null" class="wl-wg__note">
            {{ t("datapack.wg.invalid", "Fix the JSON below to edit this here.") }}
        </p>

        <template v-else-if="kind === 'placed_feature'">
            <p v-if="placed === null" class="wl-wg__note">
                {{ t("datapack.wg.noPlacement", "This file has no placement list to edit here.") }}
            </p>
            <div v-else class="wl-wg__split">
                <div class="wl-wg__col">
                    <v-text-field
                        :model-value="placed.feature"
                        :label="t('datapack.wg.feature', 'Configured feature it places')"
                        density="comfortable"
                        variant="outlined"
                        hide-details
                        @update:model-value="(v: string) => placed && emit('update:text', writePlaced(text, { ...placed, feature: v }))"
                    />
                    <ol class="wl-wg__steps">
                        <li v-for="(s, i) in placed.steps" :key="i" class="wl-wg__step">
                            <div class="wl-wg__head">
                                <strong>{{ i + 1 }}. {{ s.kind === "other" ? s.name : stepLabel(s.kind) }}</strong>
                                <span>
                                    <v-btn size="small" variant="text" :disabled="i === 0" :aria-label="t('datapack.mod.up', { n: i + 1 }, 'Move step {n} up')" @click="moveStep(i, -1)">↑</v-btn>
                                    <v-btn size="small" variant="text" :disabled="i === placed.steps.length - 1" :aria-label="t('datapack.mod.down', { n: i + 1 }, 'Move step {n} down')" @click="moveStep(i, 1)">↓</v-btn>
                                    <v-btn size="small" variant="text" color="error" :aria-label="t('datapack.mod.remove', { n: i + 1 }, 'Remove step {n}')" @click="removeStep(i)">{{ t("datapack.remove", "Remove") }}</v-btn>
                                </span>
                            </div>
                            <v-slider
                                v-if="s.kind === 'count'"
                                :model-value="s.count"
                                :min="1"
                                :max="64"
                                :step="1"
                                thumb-label
                                hide-details
                                :label="t('datapack.wg.tries', 'Tries')"
                                @update:model-value="(v: number) => changeStep(i, { kind: 'count', count: v })"
                            />
                            <v-slider
                                v-else-if="s.kind === 'rarity_filter'"
                                :model-value="s.chance"
                                :min="1"
                                :max="256"
                                :step="1"
                                thumb-label
                                hide-details
                                :label="t('datapack.wg.oneIn', 'One in this many chunks')"
                                @update:model-value="(v: number) => changeStep(i, { kind: 'rarity_filter', chance: v })"
                            />
                            <template v-else-if="s.kind === 'height_range'">
                                <v-range-slider
                                    :model-value="[Math.min(s.low, s.high), Math.max(s.low, s.high)]"
                                    :min="-64"
                                    :max="320"
                                    :step="1"
                                    thumb-label
                                    hide-details
                                    :label="t('datapack.wg.yBand', 'Y from and to')"
                                    @update:model-value="(v: number[]) => changeStep(i, { ...s, low: v[0] ?? -64, high: v[1] ?? 320 })"
                                />
                                <v-select
                                    :model-value="s.spread"
                                    :items="[
                                        { value: 'uniform', title: t('datapack.wg.uniform', 'Even through the range') },
                                        { value: 'trapezoid', title: t('datapack.wg.trapezoid', 'Most in the middle') },
                                    ]"
                                    :label="t('datapack.wg.spread', 'Spread')"
                                    density="comfortable"
                                    variant="outlined"
                                    hide-details
                                    @update:model-value="(v: 'uniform' | 'trapezoid') => changeStep(i, { ...s, spread: v })"
                                />
                            </template>
                            <p v-else-if="s.kind === 'other'" class="wl-wg__note">
                                {{ t("datapack.mod.kept", "No editor for this one yet. It is kept exactly as written; change it in the JSON below.") }}
                            </p>
                        </li>
                    </ol>
                    <div class="wl-wg__add">
                        <v-select v-model="adding" :items="addItems" :label="t('datapack.mod.kind', 'New step')" density="comfortable" variant="outlined" hide-details />
                        <v-btn variant="tonal" rounded="pill" @click="addStep">{{ t("datapack.mod.addStep", "Add step") }}</v-btn>
                    </div>
                </div>
                <svg
                    class="wl-wg__gauge"
                    viewBox="0 0 120 400"
                    width="120"
                    role="img"
                    :aria-label="band ? t('datapack.wg.gauge', { low: band.low, high: band.high }, 'Lands between Y {low} and Y {high}') : t('datapack.wg.gaugeAny', 'No height range: any height')"
                >
                    <rect v-if="band" x="30" :y="yPx(band.high)" width="60" :height="Math.max(4, yPx(band.low) - yPx(band.high))" rx="8" class="wl-wg__band" />
                    <line x1="20" :y1="yPx(63)" x2="100" :y2="yPx(63)" class="wl-wg__sea" />
                    <text x="60" y="16" text-anchor="middle">Y 320</text>
                    <text x="60" y="394" text-anchor="middle">Y -64</text>
                </svg>
            </div>
        </template>

        <template v-else-if="isOre">
            <div class="wl-wg__row">
                <v-combobox
                    :model-value="str('config.targets.0.state.Name')"
                    :items="blocks"
                    :label="t('datapack.wg.oreBlock', 'Ore block')"
                    density="comfortable"
                    variant="outlined"
                    hide-details
                    @update:model-value="(v: string | null) => v && set('config.targets.0.state.Name', v.includes(':') ? v : `minecraft:${v}`)"
                />
                <v-slider
                    :model-value="num('config.size', 9)"
                    :min="0"
                    :max="64"
                    :step="1"
                    thumb-label
                    hide-details
                    :label="t('datapack.wg.size', 'Vein size')"
                    @update:model-value="(v: number) => set('config.size', v)"
                />
            </div>
            <v-slider
                :model-value="Math.round(num('config.discard_chance_on_air_exposure', 0) * 100)"
                :min="0"
                :max="100"
                :step="1"
                thumb-label
                hide-details
                :label="t('datapack.wg.air', 'Skip blocks touching air (%)')"
                @update:model-value="(v: number) => set('config.discard_chance_on_air_exposure', v / 100)"
            />
            <p class="wl-wg__note">
                {{ t("datapack.wg.targets", "It replaces what its targets list. The first target's ore block is set here; other targets are kept as written.") }}
            </p>
        </template>

        <template v-else-if="kind === 'structure_set'">
            <p v-if="spread === null" class="wl-wg__note">
                {{ t("datapack.wg.notSpread", "Only a random spread placement has spacing to edit here. This one is kept as written.") }}
            </p>
            <template v-else>
                <div class="wl-wg__row">
                    <v-slider :model-value="spread.spacing" :min="2" :max="128" :step="1" thumb-label hide-details :label="t('datapack.wg.spacing', 'Spacing (chunks)')" @update:model-value="(v: number) => set('placement.spacing', v)" />
                    <v-slider :model-value="spread.separation" :min="0" :max="127" :step="1" thumb-label hide-details :label="t('datapack.wg.separation', 'Separation (chunks)')" @update:model-value="(v: number) => set('placement.separation', v)" />
                </div>
                <svg viewBox="0 0 256 256" width="256" role="img" class="wl-wg__grid" :aria-label="t('datapack.wg.grid', { spacing: spread.spacing }, 'Start cells, each {spacing} chunks across')">
                    <g v-for="(c, k) in cells" :key="k">
                        <rect :x="c.x" :y="c.y" width="64" height="64" class="wl-wg__cell" />
                        <rect :x="c.x" :y="c.y" :width="c.inner" :height="c.inner" class="wl-wg__inner" />
                        <circle :cx="c.px" :cy="c.py" r="4" class="wl-wg__dot" />
                    </g>
                </svg>
                <p class="wl-wg__note" :class="{ 'is-error': spreadIssue }">
                    {{
                        spreadIssue
                            ? t("datapack.wg.spreadBad", "Separation has to be smaller than spacing; the game refuses this.")
                            : t("datapack.wg.spreadNote", { every: spread.spacing * 16, gap: spread.separation * 16 }, "About one every {every} blocks each way, and at least {gap} blocks from the next cell's start area.")
                    }}
                </p>
            </template>
        </template>

        <template v-else-if="kind === 'template_pool'">
            <p v-if="pool === null" class="wl-wg__note">{{ t("datapack.wg.noPool", "This file has no list of pieces to edit here.") }}</p>
            <template v-else>
                <v-text-field
                    :model-value="str('fallback')"
                    :label="t('datapack.wg.fallback', 'Fallback pool when a piece does not fit')"
                    density="comfortable"
                    variant="outlined"
                    hide-details
                    @update:model-value="(v: string) => set('fallback', v)"
                />
                <ol class="wl-wg__steps">
                    <li v-for="(p, i) in pool" :key="i" class="wl-wg__step">
                        <div class="wl-wg__head">
                            <strong>{{ i + 1 }}. {{ p.editable ? p.location : String(p.raw.element_type ?? "") }}</strong>
                            <v-btn size="small" variant="text" color="error" :aria-label="t('datapack.wg.removePiece', { n: i + 1 }, 'Remove piece {n}')" @click="removePiece(i)">{{ t("datapack.remove", "Remove") }}</v-btn>
                        </div>
                        <div class="wl-wg__row">
                            <v-text-field
                                v-if="p.editable"
                                :model-value="p.location"
                                :label="t('datapack.wg.location', 'Structure file (id)')"
                                density="comfortable"
                                variant="outlined"
                                hide-details
                                @update:model-value="(v: string) => changePiece(i, { location: v })"
                            />
                            <v-slider
                                :model-value="p.weight"
                                :min="1"
                                :max="150"
                                :step="1"
                                thumb-label
                                hide-details
                                :label="t('datapack.wg.share', { share: poolTotal ? Math.round((p.weight / poolTotal) * 100) : 0 }, 'Weight ({share}% of picks)')"
                                @update:model-value="(v: number) => changePiece(i, { weight: v })"
                            />
                            <v-select
                                v-if="p.editable"
                                :model-value="p.projection"
                                :items="[
                                    { value: 'rigid', title: t('datapack.wg.rigid', 'Keep its shape') },
                                    { value: 'terrain_matching', title: t('datapack.wg.terrain', 'Follow the terrain') },
                                ]"
                                :label="t('datapack.wg.projection', 'Placement')"
                                density="comfortable"
                                variant="outlined"
                                hide-details
                                @update:model-value="(v: 'rigid' | 'terrain_matching') => changePiece(i, { projection: v })"
                            />
                        </div>
                        <p v-if="!p.editable" class="wl-wg__note">{{ t("datapack.mod.kept", "No editor for this one yet. It is kept exactly as written; change it in the JSON below.") }}</p>
                    </li>
                </ol>
                <div class="wl-wg__add"><v-btn variant="tonal" rounded="pill" @click="addPiece">{{ t("datapack.wg.addPiece", "Add a piece") }}</v-btn></div>
            </template>
        </template>

        <template v-else-if="kind === 'processor_list'">
            <p v-if="processors === null" class="wl-wg__note">{{ t("datapack.wg.noProcessors", "This file has no processor list to edit here.") }}</p>
            <template v-else>
                <ol class="wl-wg__steps">
                    <li v-for="(p, i) in processors" :key="i" class="wl-wg__step">
                        <div class="wl-wg__head">
                            <strong>{{ i + 1 }}. {{ p.kind === "other" ? p.name : processorLabel(p.kind) }}</strong>
                            <v-btn size="small" variant="text" color="error" :aria-label="t('datapack.mod.remove', { n: i + 1 }, 'Remove step {n}')" @click="removeProcessor(i)">{{ t("datapack.remove", "Remove") }}</v-btn>
                        </div>
                        <v-slider
                            v-if="p.kind === 'block_rot'"
                            :model-value="Math.round(p.integrity * 100)"
                            :min="0"
                            :max="100"
                            :step="1"
                            thumb-label
                            hide-details
                            :label="t('datapack.wg.keep', 'Blocks kept (%)')"
                            @update:model-value="(v: number) => changeProcessor(i, { ...p, integrity: v / 100 })"
                        />
                        <div v-else-if="p.kind === 'gravity'" class="wl-wg__row">
                            <v-select :model-value="p.heightmap" :items="HEIGHTMAPS" :label="t('datapack.wg.heightmap', 'Ground it follows')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string) => changeProcessor(i, { ...p, heightmap: v })" />
                            <v-slider :model-value="p.offset" :min="-16" :max="16" :step="1" thumb-label hide-details :label="t('datapack.wg.offset', 'Offset (blocks)')" @update:model-value="(v: number) => changeProcessor(i, { ...p, offset: v })" />
                        </div>
                        <v-combobox
                            v-else-if="p.kind === 'block_ignore'"
                            :model-value="p.blocks"
                            :items="blocks"
                            multiple
                            chips
                            closable-chips
                            :label="t('datapack.wg.ignored', 'Blocks left out')"
                            density="comfortable"
                            variant="outlined"
                            hide-details
                            @update:model-value="(v: string[]) => changeProcessor(i, { ...p, blocks: v })"
                        />
                        <p v-else class="wl-wg__note">{{ t("datapack.mod.kept", "No editor for this one yet. It is kept exactly as written; change it in the JSON below.") }}</p>
                    </li>
                </ol>
                <div class="wl-wg__add">
                    <v-select v-model="addingProcessor" :items="processorItems" :label="t('datapack.wg.newProcessor', 'New processor')" density="comfortable" variant="outlined" hide-details />
                    <v-btn variant="tonal" rounded="pill" @click="addProcessor">{{ t("datapack.mod.addStep", "Add step") }}</v-btn>
                </div>
            </template>
        </template>

        <template v-else-if="kind === 'noise_settings'">
            <v-slider :model-value="num('sea_level', 63)" :min="-64" :max="320" :step="1" thumb-label hide-details :label="t('datapack.wg.sea', 'Sea level')" @update:model-value="(v: number) => set('sea_level', v)" />
            <div class="wl-wg__row">
                <v-select :model-value="num('noise.min_y', -64)" :items="[-128, -64, 0]" :label="t('datapack.wg.minY', 'Bottom (min_y)')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: number) => set('noise.min_y', v)" />
                <v-select :model-value="num('noise.height', 384)" :items="[128, 256, 384, 512]" :label="t('datapack.wg.heightTotal', 'Height')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: number) => set('noise.height', v)" />
            </div>
            <div class="wl-wg__row">
                <v-combobox :model-value="str('default_block.Name')" :items="blocks" :label="t('datapack.wg.fill', 'Filled with')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string | null) => v && set('default_block.Name', v.includes(':') ? v : `minecraft:${v}`)" />
                <v-select :model-value="str('default_fluid.Name')" :items="['minecraft:water', 'minecraft:lava', 'minecraft:air']" :label="t('datapack.wg.fluid', 'Fluid')" density="comfortable" variant="outlined" hide-details @update:model-value="(v: string) => set('default_fluid.Name', v)" />
            </div>
            <v-switch :model-value="field('aquifers_enabled') === true" :label="t('datapack.wg.aquifers', 'Aquifers (underground water and lava pockets)')" color="primary" hide-details density="compact" @update:model-value="(v: boolean | null) => set('aquifers_enabled', v === true)" />
            <v-switch :model-value="field('ore_veins_enabled') === true" :label="t('datapack.wg.veins', 'Large ore veins')" color="primary" hide-details density="compact" @update:model-value="(v: boolean | null) => set('ore_veins_enabled', v === true)" />
            <v-switch :model-value="field('disable_mob_generation') === true" :label="t('datapack.wg.noMobs', 'No mobs placed while generating')" color="primary" hide-details density="compact" @update:model-value="(v: boolean | null) => set('disable_mob_generation', v === true)" />
        </template>
    </section>
</template>

<style scoped>
.wl-wg {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.wl-wg__split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px;
    gap: 16px;
    align-items: start;
}
.wl-wg__col {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.wl-wg__steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.wl-wg__step {
    border-radius: 16px;
    padding: 8px 12px;
    background: rgb(var(--v-theme-surface-container-high, var(--v-theme-surface-variant)));
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wl-wg__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
}
.wl-wg__row,
.wl-wg__add {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
}
.wl-wg__row > *,
.wl-wg__add > :first-child {
    flex: 1 1 14rem;
}
.wl-wg__gauge,
.wl-wg__grid {
    background: rgb(var(--v-theme-surface-container-highest, var(--v-theme-surface-variant)));
    border-radius: 16px;
}
.wl-wg__gauge text {
    fill: rgb(var(--v-theme-on-surface-variant, var(--v-theme-on-surface)));
    font-size: 11px;
}
.wl-wg__band {
    fill: rgb(var(--v-theme-primary));
    opacity: 0.6;
}
.wl-wg__sea {
    stroke: #4a90d9;
    stroke-width: 2;
    stroke-dasharray: 4 3;
}
.wl-wg__cell {
    fill: none;
    stroke: rgb(var(--v-theme-outline-variant, var(--v-theme-outline)));
}
.wl-wg__inner {
    fill: rgb(var(--v-theme-primary));
    opacity: 0.15;
}
.wl-wg__dot {
    fill: rgb(var(--v-theme-tertiary, var(--v-theme-primary)));
}
.wl-wg__note {
    margin: 0;
    color: rgb(var(--v-theme-on-surface-variant, var(--v-theme-on-surface)));
}
.wl-wg__note.is-error {
    color: rgb(var(--v-theme-error));
}
</style>
