<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { VAlert, VBtn, VCard, VCardText, VSelect, VTextField } from "vuetify/components";
import { useI18n } from "vue-i18n";
import { acquireSpatialPicker, blueMapApp } from "../../stores/bluemap.js";
import { addSpatialPoint, spatialGeometry, spatialProblem, type SpatialIdentity, type SpatialKind, type SpatialSelection } from "./spatialSelection.js";
import type { MarkerPosition } from "./markerStudio.js";

const props = defineProps<{ identity: SpatialIdentity }>();
const emit = defineEmits<{ apply: [selection: SpatialSelection, geometry: MarkerPosition[]] }>();
const { locale } = useI18n();
const copy = (en: string, yue: string) => locale.value.startsWith("zh") || locale.value.startsWith("yue") ? yue : locale.value === "bilingual" ? `${en} / ${yue}` : en;
const kind = ref<SpatialKind>("point");
const draft = ref<SpatialSelection>({ identity: { ...props.identity }, kind: "point", vertices: [] });
const picking = ref(false);
const failure = ref("");
const numeric = ref({ x: 0, y: 64, z: 0 });
const redo = ref<MarkerPosition[]>([]);
let release = () => {};
const problem = computed(() => spatialProblem(draft.value));
const items = computed(() => [
    { title: copy("Point", "地點"), value: "point" }, { title: copy("Path", "路線"), value: "path" },
    { title: copy("Polygon", "多邊形"), value: "polygon" }, { title: copy("Rectangle", "長方形"), value: "rectangle" },
    { title: copy("Circle", "圓形"), value: "circle" },
]);
function preview() { blueMapApp.value?.setMapCoordinatePreview?.(spatialGeometry(draft.value)); }
function stop() { release(); picking.value = false; }
function reset() {
    stop(); failure.value = ""; redo.value = [];
    draft.value = { identity: { ...props.identity }, kind: kind.value, vertices: [] };
}
function add(point: MarkerPosition) {
    try { draft.value = addSpatialPoint(draft.value, point, props.identity); redo.value = []; failure.value = ""; preview(); }
    catch (error) { failure.value = error instanceof Error ? error.message : String(error); }
}
function start() { release(); picking.value = true; release = acquireSpatialPicker(add); preview(); }
function undo() { const point = draft.value.vertices.pop(); if (point) redo.value.push(point); preview(); }
function redoPoint() { const point = redo.value.pop(); if (point) { draft.value.vertices.push(point); preview(); } }
function apply() {
    if (problem.value) return;
    const result = { ...draft.value, identity: { ...draft.value.identity }, vertices: draft.value.vertices.map(point => ({ ...point })) };
    stop(); emit("apply", result, spatialGeometry(result));
}
watch(kind, reset);
watch(() => [props.identity.projectId, props.identity.mapId, props.identity.dimension], reset);
watch(blueMapApp, reset);
onBeforeUnmount(stop);
</script>

<template>
    <VCard variant="tonal" class="mb-3" data-test="spatial-picker" @keydown.esc.stop="reset">
        <VCardText>
            <VSelect v-model="kind" :items="items" :label="copy('Map geometry', '地圖形狀')" density="compact" />
            <p class="text-body-2 mb-2">{{ copy('Pick terrain points, or enter coordinates. Rectangle: opposite corners. Circle: centre then radius. Nothing is saved until you apply and save the marker.', '點選地形或輸入座標。長方形：兩個對角；圓形：圓心再選半徑。套用及儲存標記之前不會儲存。') }}</p>
            <div class="d-flex flex-wrap ga-2 mb-2">
                <VBtn variant="tonal" @click="picking ? stop() : start()">{{ picking ? copy('Stop picking', '停止選取') : copy('Pick on map', '在地圖選取') }}</VBtn>
                <VBtn variant="text" :disabled="!draft.vertices.length" @click="undo">{{ copy('Undo', '復原') }}</VBtn>
                <VBtn variant="text" :disabled="!redo.length" @click="redoPoint">{{ copy('Redo', '重做') }}</VBtn>
                <VBtn variant="text" @click="reset">{{ copy('Cancel selection', '取消選取') }}</VBtn>
            </div>
            <div class="d-flex ga-2 flex-wrap">
                <VTextField v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" v-model.number="numeric[axis]" :label="axis.toUpperCase()" type="number" density="compact" style="min-width: 80px; flex: 1" />
                <VBtn variant="tonal" @click="add(numeric)">{{ copy('Add vertex', '加入頂點') }}</VBtn>
            </div>
            <ol class="pl-5 mb-2" aria-live="polite">
                <li v-for="(point, index) in draft.vertices" :key="index">
                    <div class="d-flex ga-2 flex-wrap">
                        <VTextField v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" v-model.number="point[axis]" :label="`${index + 1} ${axis.toUpperCase()}`" type="number" density="compact" style="min-width: 80px; flex: 1" @update:model-value="preview" />
                    </div>
                </li>
            </ol>
            <VAlert v-if="failure" type="warning" variant="tonal" density="compact">{{ failure }}</VAlert>
            <p v-if="problem" role="status" class="text-body-2">{{ problem }}</p>
            <VBtn color="primary" :disabled="!!problem" @click="apply">{{ copy('Use geometry', '套用形狀') }}</VBtn>
        </VCardText>
    </VCard>
</template>
