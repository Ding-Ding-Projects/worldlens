<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VChip,
    VDialog,
    VDivider,
    VList,
    VListItem,
    VRadio,
    VRadioGroup,
    VSelect,
    VSwitch,
    VTextField,
} from "vuetify/components";
import { mdiArrowDown, mdiArrowUp, mdiClose, mdiDelete, mdiDice5, mdiPlus } from "@mdi/js";
import PathField from "../PathField.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import type { CatalogueFlavourId, CatalogueVersionEntry } from "./serverStore.js";
import {
    WORLD_TYPES,
    defaultWorldGenSettings,
    resolveSeedPreview,
    rollRandomSeed,
    validateWorldGenSettings,
    type WorldGenSettings,
} from "./worldgen/worldGenSettings.js";
import {
    addSuperflatLayer,
    moveSuperflatLayer,
    removeSuperflatLayer,
    totalSuperflatDepth,
    updateSuperflatLayer,
} from "./worldgen/superflatLayers.js";
import {
    buildGenerationPlan,
    estimatePregeneration,
    UNWIRED_STEP_KINDS,
    type WorldGenRunner,
} from "./worldgen/worldGenPlan.js";

/**
 * The world-generator wizard: every setting a world can be generated with, chosen
 * through real controls, before anything runs. See `worldgen/worldGenPlan.ts` for what
 * "Preview plan" below actually produces - a reviewable description, never an
 * in-progress generation, because this build does not yet wire the plan's execution
 * steps to a real server or a real GitHub Actions dispatch. That boundary is shown
 * plainly in the banner rather than left for the user to discover from a button that
 * silently does nothing.
 */
const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        /** Real catalogue versions for the chosen flavour, or empty while unknown. */
        versions?: readonly CatalogueVersionEntry[];
        flavours?: readonly CatalogueFlavourId[];
    }>(),
    { versions: () => [], flavours: () => ["vanilla", "paper", "purpur", "fabric"] },
);
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const { t } = useI18n({
    useScope: "local",
    messages: {
        en: {
            title: "Generate a world",
            boundary:
                "This build can build the exact plan below and can create the server jar the normal way. Running the plan end to end - launching, watching for readiness, stopping, and packaging - is not wired up yet.",
            seed: "Seed",
            seedRandom: "Random",
            seedResolved: "Resolves to",
            seedBlank: "A blank seed lets the server choose one at random.",
            worldType: "World type",
            singleBiome: "Biome",
            layers: "Superflat layers",
            layerAdd: "Add layer",
            layerBlock: "Block id",
            layerDepth: "Depth",
            layerTotal: "Total depth",
            advancedString: "Raw preset string (kept in sync)",
            dimensions: "Dimensions to generate",
            overworld: "Overworld",
            nether: "Nether",
            end: "End",
            structures: "Generate structures",
            bonusChest: "Bonus chest",
            border: "World border",
            borderDiameter: "Diameter (blocks)",
            extent: "Pre-generation extent",
            radius: "Radius (blocks)",
            estimate: "ESTIMATE",
            flavour: "Server flavour",
            version: "Minecraft version",
            gamerules: "Gamerules",
            output: "Output",
            outputFolder: "Folder",
            outputZip: "Zip archive",
            destination: "Destination",
            runner: "Where to run",
            runnerLocal: "This computer",
            runnerGithub: "GitHub Actions",
            previewPlan: "Preview plan",
            cancel: "Cancel",
            planTitle: "Generation plan",
            planUnwired: "not yet wired",
        },
        yue: {
            title: "生成世界",
            boundary:
                "呢個版本識砌返出下面成個計劃，亦識用返平時嗰套嘢整伺服器 jar。但係由頭做到尾——開機、等世界搞掂、停機、打包——依家仲未接埋線，唔好以為撳掣就會有世界喎。",
            seed: "種子",
            seedRandom: "隨機",
            seedResolved: "實際數值",
            seedBlank: "留空嘅話，伺服器自己隨機揀一個。",
            worldType: "世界類型",
            singleBiome: "生態域",
            layers: "超平層",
            layerAdd: "加一層",
            layerBlock: "方塊 id",
            layerDepth: "厚度",
            layerTotal: "總厚度",
            advancedString: "原始字串（自動同步）",
            dimensions: "要生成嘅維度",
            overworld: "主世界",
            nether: "地獄",
            end: "終界",
            structures: "生成結構",
            bonusChest: "獎勵箱",
            border: "世界邊界",
            borderDiameter: "直徑（方塊）",
            extent: "預生成範圍",
            radius: "半徑（方塊）",
            estimate: "估計值",
            flavour: "伺服器類型",
            version: "Minecraft 版本",
            gamerules: "遊戲規則",
            output: "輸出",
            outputFolder: "資料夾",
            outputZip: "Zip 壓縮檔",
            destination: "目的地",
            runner: "喺邊度跑",
            runnerLocal: "呢部電腦",
            runnerGithub: "GitHub Actions",
            previewPlan: "預覽計劃",
            cancel: "取消",
            planTitle: "生成計劃",
            planUnwired: "未接線",
        },
    },
});

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const settings = reactive<WorldGenSettings>(defaultWorldGenSettings());
const runnerKind = ref<"local" | "github-actions">("local");
const showPlan = ref(false);

const validation = computed(() => validateWorldGenSettings(settings));
const seedResolved = computed(() => resolveSeedPreview(settings.seedInput));

function rollSeed(): void {
    settings.seedInput = String(rollRandomSeed());
}

// -- superflat layer editor -------------------------------------------------
const layerBlockDraft = ref("minecraft:stone");
const layerDepthDraft = ref(1);

function onAddLayer(): void {
    settings.superflatLayers = addSuperflatLayer(settings.superflatLayers, {
        block: layerBlockDraft.value.trim(),
        depth: Math.max(1, Math.round(layerDepthDraft.value)),
    });
}
function onRemoveLayer(index: number): void {
    settings.superflatLayers = removeSuperflatLayer(settings.superflatLayers, index);
}
function onMoveLayer(index: number, delta: number): void {
    settings.superflatLayers = moveSuperflatLayer(settings.superflatLayers, index, index + delta);
}
function onLayerBlockChange(index: number, value: string): void {
    settings.superflatLayers = updateSuperflatLayer(settings.superflatLayers, index, { block: value });
}
function onLayerDepthChange(index: number, value: number): void {
    settings.superflatLayers = updateSuperflatLayer(settings.superflatLayers, index, {
        depth: Math.max(1, Math.round(value)),
    });
}
const layerTotalDepth = computed(() => totalSuperflatDepth(settings.superflatLayers));

// -- version search -----------------------------------------------------
const versionQuery = ref("");
const versionRegex = ref(false);
const versionFlags = ref("i");
const filteredVersions = computed(() => {
    const matcher = createSettingMatcher(versionQuery.value, versionRegex.value, versionFlags.value);
    return props.versions.filter((entry) => matcher(entry.version));
});

// -- pre-generation estimate ---------------------------------------------
const pregenEstimate = computed(() => estimatePregeneration(settings.pregenerationRadius));

// -- plan preview ----------------------------------------------------------
const runner = computed<WorldGenRunner>(() =>
    runnerKind.value === "local"
        ? { kind: "local" }
        : { kind: "github-actions", repoSlug: "owner/repo", workflowFile: "worldgen.yml" },
);
const plan = computed(() => buildGenerationPlan(settings, runner.value));

function isUnwired(kind: string): boolean {
    return (UNWIRED_STEP_KINDS as readonly string[]).includes(kind);
}

function onPreviewPlan(): void {
    if (!validation.value.ok) return;
    showPlan.value = true;
}
function onClose(): void {
    open.value = false;
    showPlan.value = false;
}
</script>

<template>
    <VDialog v-model="open" max-width="760" persistent scrollable>
        <VCard>
            <VCardTitle class="d-flex align-center justify-space-between">
                <span>{{ t("title") }}</span>
                <VBtn icon variant="text" :icon="mdiClose" variant="text" :aria-label="t('cancel')" @click="onClose" />
            </VCardTitle>
            <VCardText>
                <VAlert type="info" variant="tonal" density="compact" class="mb-4">
                    {{ t("boundary") }}
                </VAlert>

                <!-- Seed -->
                <div class="d-flex align-center ga-2 mb-4">
                    <VTextField v-model="settings.seedInput" :label="t('seed')" density="compact" hide-details clearable />
                    <VBtn :prepend-icon="mdiDice5" variant="tonal" @click="rollSeed">{{ t("seedRandom") }}</VBtn>
                </div>
                <p class="text-caption mb-4">
                    <template v-if="seedResolved !== null">{{ t("seedResolved") }}: {{ seedResolved }}</template>
                    <template v-else>{{ t("seedBlank") }}</template>
                </p>

                <!-- World type -->
                <VRadioGroup v-model="settings.worldType" :label="t('worldType')" density="compact" hide-details class="mb-2">
                    <VRadio v-for="wt in WORLD_TYPES" :key="wt.id" :value="wt.id" :label="`${wt.label} - ${wt.hint}`" />
                </VRadioGroup>

                <div v-if="settings.worldType === 'single_biome_surface'" class="mb-4">
                    <VTextField v-model="settings.singleBiome" :label="t('singleBiome')" density="compact"
                        :error-messages="validation.errors.singleBiome ? [validation.errors.singleBiome] : []" />
                </div>

                <!-- Superflat layer editor -->
                <div v-if="settings.worldType === 'flat'" class="mb-4">
                    <h3 class="text-subtitle-2 mb-2">{{ t("layers") }}</h3>
                    <VList density="compact">
                        <VListItem v-for="(layer, index) in settings.superflatLayers" :key="index">
                            <div class="d-flex align-center ga-2">
                                <VTextField
                                    :model-value="layer.block"
                                    :label="t('layerBlock')"
                                    density="compact"
                                    hide-details
                                    style="max-width: 260px"
                                    @update:model-value="(v) => onLayerBlockChange(index, String(v))"
                                />
                                <VTextField
                                    :model-value="layer.depth"
                                    type="number"
                                    min="1"
                                    :label="t('layerDepth')"
                                    density="compact"
                                    hide-details
                                    style="max-width: 100px"
                                    @update:model-value="(v) => onLayerDepthChange(index, Number(v))"
                                />
                                <VBtn icon variant="text" :icon="mdiArrowUp" size="small" variant="text" :disabled="index === 0"
                                    :aria-label="`Move ${layer.block} up`" @click="onMoveLayer(index, -1)" />
                                <VBtn icon variant="text" :icon="mdiArrowDown" size="small" variant="text"
                                    :disabled="index === settings.superflatLayers.length - 1"
                                    :aria-label="`Move ${layer.block} down`" @click="onMoveLayer(index, 1)" />
                                <VBtn icon variant="text" :icon="mdiDelete" size="small" variant="text"
                                    :aria-label="`Remove ${layer.block}`" @click="onRemoveLayer(index)" />
                            </div>
                        </VListItem>
                    </VList>
                    <div class="d-flex align-center ga-2 mt-2">
                        <VTextField v-model="layerBlockDraft" :label="t('layerBlock')" density="compact" hide-details style="max-width: 260px" />
                        <VTextField v-model.number="layerDepthDraft" type="number" min="1" :label="t('layerDepth')" density="compact" hide-details style="max-width: 100px" />
                        <VBtn :prepend-icon="mdiPlus" variant="tonal" @click="onAddLayer">{{ t("layerAdd") }}</VBtn>
                    </div>
                    <p class="text-caption mt-1">{{ t("layerTotal") }}: {{ layerTotalDepth }}</p>
                    <VAlert v-if="validation.errors.superflatLayers" type="error" variant="tonal" density="compact" class="mt-2">
                        {{ validation.errors.superflatLayers }}
                    </VAlert>
                </div>

                <VDivider class="my-4" />

                <!-- Dimensions -->
                <h3 class="text-subtitle-2 mb-2">{{ t("dimensions") }}</h3>
                <div class="d-flex ga-4 mb-4">
                    <VSwitch :model-value="true" disabled :label="t('overworld')" density="compact" hide-details />
                    <VSwitch v-model="settings.dimensions.nether" :label="t('nether')" density="compact" hide-details />
                    <VSwitch v-model="settings.dimensions.end" :label="t('end')" density="compact" hide-details />
                </div>

                <div class="d-flex ga-4 mb-4">
                    <VSwitch v-model="settings.generateStructures" :label="t('structures')" density="compact" hide-details />
                    <VSwitch v-model="settings.bonusChest" :label="t('bonusChest')" density="compact" hide-details />
                </div>

                <!-- World border -->
                <div class="d-flex align-center ga-2 mb-4">
                    <VSwitch v-model="settings.worldBorderEnabled" :label="t('border')" density="compact" hide-details />
                    <VTextField v-if="settings.worldBorderEnabled" v-model.number="settings.worldBorderDiameter"
                        type="number" :label="t('borderDiameter')" density="compact" hide-details style="max-width: 200px"
                        :error-messages="validation.errors.worldBorderDiameter ? [validation.errors.worldBorderDiameter] : []" />
                </div>

                <!-- Pre-generation extent -->
                <div class="mb-4">
                    <VTextField v-model.number="settings.pregenerationRadius" type="number" min="16" max="20000"
                        :label="`${t('extent')} - ${t('radius')}`" density="compact"
                        :error-messages="validation.errors.pregenerationRadius ? [validation.errors.pregenerationRadius] : []" />
                    <p class="text-caption">
                        {{ t("estimate") }}: {{ pregenEstimate.chunkCount }} chunks, ~{{ (pregenEstimate.estimatedBytes / 1_000_000).toFixed(1) }} MB,
                        ~{{ pregenEstimate.estimatedSeconds }}s
                    </p>
                </div>

                <VDivider class="my-4" />

                <!-- Flavour / version -->
                <div class="d-flex ga-2 mb-2">
                    <VSelect v-model="settings.flavour" :items="props.flavours" :label="t('flavour')" density="compact" hide-details style="max-width: 200px" />
                </div>
                <ConfigSearchField
                    v-model="versionQuery"
                    v-model:regex="versionRegex"
                    v-model:flags="versionFlags"
                    :label="t('version')"
                    :sample="props.versions.map((v) => v.version).join('\n')"
                    :summary="`${filteredVersions.length} / ${props.versions.length}`"
                />
                <VSelect v-model="settings.version" :items="filteredVersions.map((v) => v.version)" :label="t('version')"
                    density="compact" class="mt-2"
                    :error-messages="validation.errors.version ? [validation.errors.version] : []" />

                <VDivider class="my-4" />

                <!-- Gamerules -->
                <h3 class="text-subtitle-2 mb-2">{{ t("gamerules") }}</h3>
                <div class="d-flex flex-wrap ga-4 mb-2">
                    <VSwitch v-model="settings.gamerules.doDaylightCycle" label="doDaylightCycle" density="compact" hide-details />
                    <VSwitch v-model="settings.gamerules.doWeatherCycle" label="doWeatherCycle" density="compact" hide-details />
                    <VSwitch v-model="settings.gamerules.doMobSpawning" label="doMobSpawning" density="compact" hide-details />
                    <VSwitch v-model="settings.gamerules.keepInventory" label="keepInventory" density="compact" hide-details />
                    <VSwitch v-model="settings.gamerules.mobGriefing" label="mobGriefing" density="compact" hide-details />
                </div>
                <VTextField v-model.number="settings.gamerules.randomTickSpeed" type="number" min="0" label="randomTickSpeed"
                    density="compact" style="max-width: 200px"
                    :error-messages="validation.errors.randomTickSpeed ? [validation.errors.randomTickSpeed] : []" />

                <VDivider class="my-4" />

                <!-- Output -->
                <h3 class="text-subtitle-2 mb-2">{{ t("output") }}</h3>
                <VRadioGroup v-model="settings.outputMode" density="compact" hide-details inline class="mb-2">
                    <VRadio value="folder" :label="t('outputFolder')" />
                    <VRadio value="zip" :label="t('outputZip')" />
                </VRadioGroup>
                <PathField
                    v-model="settings.outputDestination"
                    :field="t('destination')"
                    :label="t('destination')"
                    :semantic="settings.outputMode === 'folder' ? 'folder' : 'file'"
                    :extensions="settings.outputMode === 'zip' ? ['zip'] : undefined"
                    :error="validation.errors.outputDestination ?? null"
                />

                <VDivider class="my-4" />

                <!-- Runner -->
                <h3 class="text-subtitle-2 mb-2">{{ t("runner") }}</h3>
                <VRadioGroup v-model="runnerKind" density="compact" hide-details inline class="mb-4">
                    <VRadio value="local" :label="t('runnerLocal')" />
                    <VRadio value="github-actions" :label="t('runnerGithub')" />
                </VRadioGroup>

                <!-- Plan preview -->
                <div v-if="showPlan">
                    <h3 class="text-subtitle-2 mb-2">{{ t("planTitle") }}</h3>
                    <VList density="compact">
                        <VListItem v-for="step in plan.steps" :key="step.kind">
                            <div class="d-flex align-center ga-2">
                                <span>{{ step.description }}</span>
                                <VChip v-if="isUnwired(step.kind)" size="x-small" color="warning" variant="tonal">
                                    {{ t("planUnwired") }}
                                </VChip>
                            </div>
                        </VListItem>
                    </VList>
                </div>
            </VCardText>
            <VCardActions>
                <VBtn variant="text" @click="onClose">{{ t("cancel") }}</VBtn>
                <VBtn color="primary" variant="tonal" :disabled="!validation.ok" @click="onPreviewPlan">
                    {{ t("previewPlan") }}
                </VBtn>
            </VCardActions>
        </VCard>
    </VDialog>
</template>
