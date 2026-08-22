<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDelete, mdiDice5, mdiPlus } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VCheckbox,
    VChip,
    VDialog,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VMenu,
    VProgressLinear,
    VRadioGroup,
    VRadio,
    VSelect,
    VSwitch,
    VTextField,
} from "vuetify/components";
import PathField from "../PathField.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    FLAVOUR_IDS,
    WORLD_TYPES,
    defaultWorldGenerationSettings,
    describeRunner,
    estimateGeneration,
    formatEstimatedBytes,
    formatEstimatedSeconds,
    runnerKey,
    validateWorldGenerationSettings,
    type FlavourId,
    type RunnerChoice,
    type SuperflatLayer,
    type WorldGenerationSettings,
    type WorldType,
} from "./worldgenModel.js";

/**
 * A world generation wizard: every setting is a real control, chosen before generation
 * starts, and nothing here fabricates a version - the version list comes from the live
 * flavour/version catalogue, passed in by the host screen (which already owns the fetch,
 * cache, and staleness logic in `mcserver/flavours/catalogue.ts`), never invented here.
 *
 * This dialog only builds and validates a `WorldGenerationSettings` object and emits it
 * on `generate` for the host screen to turn into a real job (see the header of
 * `packages/app/src/main/worldgen/plan.ts` for exactly which part of that is real today
 * and which part still needs a runner wired up to carry it out).
 */
const props = defineProps<{
    modelValue: boolean;
    /** Every version this flavour has, from the live catalogue. Empty while loading. */
    versionsByFlavour: Readonly<Record<FlavourId, readonly string[]>>;
    runners: readonly RunnerChoice[];
    busy?: boolean;
}>();
const emit = defineEmits<{
    "update:modelValue": [value: boolean];
    generate: [settings: WorldGenerationSettings, runner: RunnerChoice];
}>();

const { t } = useI18n();

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const settings = reactive<WorldGenerationSettings>(defaultWorldGenerationSettings());
const selectedRunnerKey = ref<string>(props.runners[0] ? runnerKey(props.runners[0]) : "");

const runnerOptions = computed(() =>
    props.runners.map((runner) => ({ title: describeRunner(runner), value: runnerKey(runner), runner })),
);

const versionOptions = computed<readonly string[]>(() => props.versionsByFlavour[settings.flavour] ?? []);

const errors = computed(() => validateWorldGenerationSettings(settings));
function errorFor(field: string): string | null {
    return errors.value.find((e) => e.field === field)?.message ?? null;
}
const hasErrors = computed(() => errors.value.length > 0);

const dimensionCount = computed(
    () => Number(settings.dimensions.overworld) + Number(settings.dimensions.nether) + Number(settings.dimensions.end),
);
const estimate = computed(() => estimateGeneration(settings.extent, dimensionCount.value));

// ---- Seed ------------------------------------------------------------------------
function randomizeSeed(): void {
    settings.seed = { mode: "random", text: "" };
}
function chooseSeedText(value: string): void {
    settings.seed = { mode: "chosen", text: value };
}

// ---- Superflat layer editor --------------------------------------------------------
function addLayer(): void {
    settings.superflatLayers = [...settings.superflatLayers, { block: "minecraft:stone", depth: 1 }];
}
function removeLayer(index: number): void {
    settings.superflatLayers = settings.superflatLayers.filter((_, i) => i !== index);
}
function moveLayer(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= settings.superflatLayers.length) return;
    const next = [...settings.superflatLayers];
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    settings.superflatLayers = next;
}
function setLayerBlock(index: number, block: string): void {
    settings.superflatLayers = settings.superflatLayers.map((layer, i) => (i === index ? { ...layer, block } : layer));
}
function setLayerDepth(index: number, depth: number): void {
    settings.superflatLayers = settings.superflatLayers.map((layer, i) =>
        i === index ? { ...layer, depth: Number.isFinite(depth) ? depth : layer.depth } : layer,
    );
}
const layerSearchQuery = ref("");
const layerSearchRegex = ref(false);
const layerSearchFlags = ref("i");
const layerMatcher = computed(() => createSettingMatcher(layerSearchQuery.value, layerSearchRegex.value, layerSearchFlags.value));
const visibleLayers = computed<readonly { readonly layer: SuperflatLayer; readonly index: number }[]>(() =>
    settings.superflatLayers
        .map((layer, index) => ({ layer, index }))
        .filter(({ layer }) => layerMatcher.value(layer.block)),
);

// ---- Output ----------------------------------------------------------------------
function suggestedDestination(kind: "folder" | "zip"): void {
    const base = settings.worldName.trim().length > 0 ? settings.worldName.trim() : "New World";
    settings.output = { kind, destination: kind === "zip" ? `${base}.zip` : base };
}

function submit(): void {
    const runner = props.runners.find((r) => runnerKey(r) === selectedRunnerKey.value);
    if (!runner || hasErrors.value) return;
    emit("generate", { ...settings }, runner);
}
</script>

<template>
    <VDialog v-model="open" max-width="820" persistent>
        <VCard>
            <VCardTitle>{{ t("worldgen.wizard.title", "Generate a new world") }}</VCardTitle>
            <VCardText>
                <VAlert v-if="hasErrors" type="warning" density="compact" class="mb-4" variant="tonal">
                    {{ t("worldgen.wizard.fixErrors", "Fix the highlighted settings before generating.") }}
                </VAlert>

                <VTextField
                    v-model="settings.worldName"
                    :label="t('worldgen.wizard.worldName', 'World name')"
                    :error-messages="errorFor('worldName') ? [errorFor('worldName')!] : []"
                    density="compact"
                    class="mb-3"
                />

                <div class="d-flex align-center ga-2 mb-3">
                    <VRadioGroup v-model="settings.seed.mode" inline density="compact" hide-details class="flex-shrink-0">
                        <VRadio :label="t('worldgen.wizard.seedRandom', 'Random seed')" value="random" @click="randomizeSeed" />
                        <VRadio :label="t('worldgen.wizard.seedChosen', 'Chosen seed')" value="chosen" />
                    </VRadioGroup>
                    <VTextField
                        v-if="settings.seed.mode === 'chosen'"
                        :model-value="settings.seed.text"
                        @update:model-value="chooseSeedText"
                        :label="t('worldgen.wizard.seedText', 'Seed text or number')"
                        :error-messages="errorFor('seed') ? [errorFor('seed')!] : []"
                        density="compact"
                        hide-details="auto"
                    />
                    <VBtn v-else icon :prepend-icon="mdiDice5" variant="text" @click="randomizeSeed" :aria-label="t('worldgen.wizard.rerollSeed', 'Roll a new random seed')">
                        <VIcon :icon="mdiDice5" />
                    </VBtn>
                </div>

                <VSelect
                    v-model="settings.worldType"
                    :items="WORLD_TYPES.map((w) => ({ title: w, value: w }))"
                    :label="t('worldgen.wizard.worldType', 'World type / generator')"
                    density="compact"
                    class="mb-3"
                />

                <template v-if="(settings.worldType as WorldType) === 'flat'">
                    <VCardTitle class="px-0 text-subtitle-1">{{ t("worldgen.wizard.superflatLayers", "Superflat layers (bottom to top)") }}</VCardTitle>
                    <ConfigSearchField
                        v-model="layerSearchQuery"
                        v-model:regex="layerSearchRegex"
                        v-model:flags="layerSearchFlags"
                        :label="t('worldgen.wizard.searchLayers', 'Search layers')"
                        class="mb-2"
                    />
                    <VList density="compact" class="mb-2">
                        <VListItem v-for="{ layer, index } in visibleLayers" :key="index">
                            <div class="d-flex align-center ga-2">
                                <VTextField
                                    :model-value="layer.block"
                                    @update:model-value="(v: string) => setLayerBlock(index, v)"
                                    :label="t('worldgen.wizard.layerBlock', 'Block id')"
                                    density="compact"
                                    hide-details="auto"
                                />
                                <VTextField
                                    type="number"
                                    :model-value="layer.depth"
                                    @update:model-value="(v: string) => setLayerDepth(index, Number(v))"
                                    :label="t('worldgen.wizard.layerDepth', 'Depth')"
                                    density="compact"
                                    hide-details="auto"
                                    style="max-width: 100px"
                                />
                                <VBtn icon variant="text" density="compact" @click="moveLayer(index, -1)" :aria-label="t('worldgen.wizard.moveLayerUp', 'Move layer up')">↑</VBtn>
                                <VBtn icon variant="text" density="compact" @click="moveLayer(index, 1)" :aria-label="t('worldgen.wizard.moveLayerDown', 'Move layer down')">↓</VBtn>
                                <VBtn icon variant="text" density="compact" @click="removeLayer(index)" :aria-label="t('worldgen.wizard.removeLayer', 'Remove layer')">
                                    <VIcon :icon="mdiDelete" />
                                </VBtn>
                            </div>
                        </VListItem>
                    </VList>
                    <VBtn variant="tonal" :prepend-icon="mdiPlus" @click="addLayer">{{ t("worldgen.wizard.addLayer", "Add layer") }}</VBtn>
                </template>

                <VTextField
                    v-else-if="(settings.worldType as WorldType) === 'single_biome_surface'"
                    v-model="settings.singleBiome"
                    :label="t('worldgen.wizard.singleBiome', 'Biome id')"
                    :error-messages="errorFor('singleBiome') ? [errorFor('singleBiome')!] : []"
                    density="compact"
                    class="mb-3"
                />

                <VDivider class="my-4" />

                <div class="d-flex ga-4 mb-3">
                    <VSwitch v-model="settings.dimensions.overworld" :label="t('worldgen.wizard.overworld', 'Overworld')" density="compact" hide-details />
                    <VSwitch v-model="settings.dimensions.nether" :label="t('worldgen.wizard.nether', 'The Nether')" density="compact" hide-details />
                    <VSwitch v-model="settings.dimensions.end" :label="t('worldgen.wizard.end', 'The End')" density="compact" hide-details />
                </div>
                <VAlert v-if="errorFor('dimensions')" type="error" density="compact" variant="tonal" class="mb-3">{{ errorFor("dimensions") }}</VAlert>

                <div class="d-flex ga-4 mb-3">
                    <VSwitch v-model="settings.generateStructures" :label="t('worldgen.wizard.generateStructures', 'Generate structures')" density="compact" hide-details />
                    <VSwitch v-model="settings.bonusChest" :label="t('worldgen.wizard.bonusChest', 'Bonus chest')" density="compact" hide-details />
                </div>

                <div class="d-flex align-center ga-2 mb-3">
                    <VSwitch v-model="settings.worldBorder.enabled" :label="t('worldgen.wizard.worldBorder', 'World border')" density="compact" hide-details />
                    <VTextField
                        v-if="settings.worldBorder.enabled"
                        type="number"
                        v-model.number="settings.worldBorder.diameterBlocks"
                        :label="t('worldgen.wizard.borderDiameter', 'Diameter (blocks)')"
                        :error-messages="errorFor('worldBorder.diameterBlocks') ? [errorFor('worldBorder.diameterBlocks')!] : []"
                        density="compact"
                        hide-details="auto"
                    />
                </div>

                <VDivider class="my-4" />

                <VCardTitle class="px-0 text-subtitle-1">{{ t("worldgen.wizard.extent", "Pre-generation extent") }}</VCardTitle>
                <VRadioGroup v-model="settings.extent.kind" inline density="compact" hide-details class="mb-2">
                    <VRadio :label="t('worldgen.wizard.extentRadius', 'Radius')" value="radius" />
                    <VRadio :label="t('worldgen.wizard.extentBounds', 'Explicit chunk bounds')" value="bounds" />
                </VRadioGroup>
                <template v-if="settings.extent.kind === 'radius'">
                    <VTextField
                        type="number"
                        v-model.number="settings.extent.radiusChunks"
                        :label="t('worldgen.wizard.radiusChunks', 'Radius (chunks)')"
                        :error-messages="errorFor('extent.radiusChunks') ? [errorFor('extent.radiusChunks')!] : []"
                        density="compact"
                        class="mb-2"
                        style="max-width: 200px"
                    />
                </template>
                <div v-else class="d-flex ga-2 mb-2 flex-wrap">
                    <VTextField type="number" v-model.number="settings.extent.minChunkX" label="Min X" density="compact" hide-details="auto" style="max-width: 120px" />
                    <VTextField type="number" v-model.number="settings.extent.minChunkZ" label="Min Z" density="compact" hide-details="auto" style="max-width: 120px" />
                    <VTextField type="number" v-model.number="settings.extent.maxChunkX" label="Max X" density="compact" hide-details="auto" style="max-width: 120px" />
                    <VTextField type="number" v-model.number="settings.extent.maxChunkZ" label="Max Z" density="compact" hide-details="auto" style="max-width: 120px" />
                </div>

                <VAlert type="info" variant="tonal" density="compact" class="mb-3">
                    {{
                        t(
                            "worldgen.wizard.estimate",
                            "Estimated (not exact): {chunks} chunks, about {bytes} on disk, about {time}.",
                            { chunks: estimate.chunkCount, bytes: formatEstimatedBytes(estimate.estimatedBytes), time: formatEstimatedSeconds(estimate.estimatedSeconds) },
                        )
                    }}
                </VAlert>

                <VDivider class="my-4" />

                <div class="d-flex ga-2 mb-3">
                    <VSelect
                        v-model="settings.flavour"
                        :items="FLAVOUR_IDS.map((f) => ({ title: f, value: f }))"
                        :label="t('worldgen.wizard.flavour', 'Server flavour')"
                        density="compact"
                        style="max-width: 200px"
                    />
                    <VSelect
                        v-model="settings.version"
                        :items="versionOptions"
                        :label="t('worldgen.wizard.version', 'Version')"
                        :error-messages="errorFor('version') ? [errorFor('version')!] : []"
                        density="compact"
                        :no-data-text="t('worldgen.wizard.noVersions', 'No versions loaded from the catalogue yet.')"
                    />
                </div>

                <VSelect
                    v-model="selectedRunnerKey"
                    :items="runnerOptions"
                    :label="t('worldgen.wizard.runner', 'Run generation on')"
                    density="compact"
                    class="mb-3"
                />

                <VRadioGroup v-model="settings.output.kind" inline density="compact" hide-details class="mb-1">
                    <VRadio :label="t('worldgen.wizard.outputFolder', 'Folder')" value="folder" @click="suggestedDestination('folder')" />
                    <VRadio :label="t('worldgen.wizard.outputZip', 'Zip file')" value="zip" @click="suggestedDestination('zip')" />
                </VRadioGroup>
                <PathField
                    v-model="settings.output.destination"
                    :field="settings.output.kind === 'zip' ? t('worldgen.wizard.zipFile', 'the world zip file') : t('worldgen.wizard.worldFolder', 'the destination folder')"
                    :label="t('worldgen.wizard.destination', 'Destination')"
                    :semantic="settings.output.kind === 'zip' ? 'file' : 'folder'"
                    :error="errorFor('output.destination')"
                />

                <VProgressLinear v-if="busy" indeterminate class="mt-4" :aria-label="t('worldgen.wizard.working', 'Generating…')" />
            </VCardText>
            <VCardActions>
                <VBtn variant="text" @click="open = false" :disabled="busy">{{ t("common.cancel", "Cancel") }}</VBtn>
                <VBtn color="primary" variant="flat" :disabled="hasErrors || busy" @click="submit">
                    {{ t("worldgen.wizard.generate", "Generate world") }}
                </VBtn>
            </VCardActions>
        </VCard>
    </VDialog>
</template>
