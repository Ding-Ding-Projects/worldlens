<script setup lang="ts">
import { computed, reactive, ref, onUnmounted } from "vue";
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
import {
    SYNTHETIC_TERRAIN_NOTICE,
    WORLD_GEN_ENGINES,
    ignoredSettingsFor,
    type WorldGenEngineId,
} from "./worldgen/worldGenEngine.js";
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
import { generateSyntheticWorld, syntheticWorldStatus, cancelSyntheticWorld, type SyntheticWorldResult } from "./mcserverBridge.js";

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
const emit = defineEmits<{
    "update:modelValue": [value: boolean];
    generate: [settings: WorldGenSettings];
}>();

const { t } = useI18n({
    useScope: "local",
    messages: {
        en: {
            generationFailed: "The generator did not return a result. Check the operation and retry.",
            measuredTarget: "Minimum world bytes (decimal)",
            resume: "Resume the existing generated world",
            measuredNotice: "Generates valid Java 1.20.4 Anvil chunks until level.dat and region files meet the byte target. No padding. Resume requires the same seed, name and target and verifies every region hash.",
            paused: "Paused. Valid generated content is retained. Enable Resume with the same inputs to continue.",
            stopGeneration: "Stop and preserve progress",
            measuredProgress: "Measured {bytes} / {target} bytes, {chunks} chunks",
            measuredResult: "Measured {bytes} bytes, {chunks} chunks, overshoot {overshoot} bytes. Folder: {folder}",
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
            engine: "Generated by",
            engineIgnores: "This engine ignores these choices:",
            engineNotAvailable: "This engine is not available in this build; the plan below is what it would do.",
        },
        yue: {
            generationFailed: "生成器冇傳返結果。請檢查操作再試。",
            measuredTarget: "世界最少位元組數（十進制）",
            resume: "繼續生成現有世界",
            measuredNotice: "持續生成有效 Java 1.20.4 Anvil 區塊，直到 level.dat 同區域檔案達到指定大小，唔會塞填充資料。繼續時要用相同種子、名稱同目標，並核對每個區域嘅雜湊。",
            paused: "已暫停，有效內容已保留。保持原有設定並啟用繼續生成即可接住做。",
            stopGeneration: "停止並保留進度",
            measuredProgress: "已量度 {bytes} / {target} 位元組，{chunks} 個區塊",
            measuredResult: "已量度 {bytes} 位元組，{chunks} 個區塊，超出目標 {overshoot} 位元組。資料夾：{folder}",
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
            engine: "邊個引擎生成",
            engineIgnores: "呢個引擎唔會理以下嘅選擇：",
            engineNotAvailable: "呢個引擎喺呢個版本仲未用得，下面淨係佢會做啲乜嘅計劃。",
        },
    },
});

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

// Mutable within this dialog: the pure model type is all-readonly, but the wizard
// edits these fields directly rather than rebuilding the whole object each time.
type MutableWorldGenSettings = { -readonly [K in keyof WorldGenSettings]: WorldGenSettings[K] };
const settings = reactive<MutableWorldGenSettings>(defaultWorldGenSettings());
const runnerKind = ref<"local" | "github-actions">("local");
// The engine that actually writes the world. Defaults to the one that works today
// rather than the one that honours every setting, so the dialog's default state is
// something a user can actually run to completion.
const engineId = ref<WorldGenEngineId>("synthetic");
const showPlan = ref(false);
const generating = ref(false);
const generated = ref<SyntheticWorldResult | null>(null);
const targetBytes = ref<number | null>(null);
const resumeGeneration = ref(false);
const generationProgress = ref<{ bytes: number; targetBytes: number; chunkCount: number } | null>(null);
let progressTimer: ReturnType<typeof setTimeout> | undefined;
async function pollGeneration(): Promise<void> {
    const result = await syntheticWorldStatus();
    if (result.ok) generationProgress.value = result.value ?? null;
    if (generating.value) progressTimer = setTimeout(() => void pollGeneration(), 1000);
}
onUnmounted(() => {
    clearTimeout(progressTimer);
    if (generating.value) {
        generating.value = false;
        void cancelSyntheticWorld();
    }
});
async function stopGeneration(): Promise<void> {
    const result = await cancelSyntheticWorld();
    if (!result.ok) generationError.value = result.failure?.message ?? t("generationFailed");
}
const generationError = ref<string | null>(null);

const validation = computed(() => validateWorldGenSettings(settings));
const canGenerate = computed(() => engineId.value !== "synthetic" ? validation.value.ok :
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(settings.worldName.trim()) && settings.outputDestination.trim() !== "" &&
    Number.isSafeInteger(resolveSeedPreview(settings.seedInput) ?? 0) &&
    Number.isFinite(settings.pregenerationRadius) && settings.pregenerationRadius >= 16 && settings.pregenerationRadius <= 20_000 &&
    (targetBytes.value === null || (Number.isSafeInteger(targetBytes.value) && targetBytes.value > 0 && targetBytes.value <= 100_000_000_000)));
const selectedEngine = computed(
    () => WORLD_GEN_ENGINES.find((engine) => engine.id === engineId.value) ?? WORLD_GEN_ENGINES[0]!,
);
const ignoredSettings = computed(() => ignoredSettingsFor(engineId.value, settings));
const seedResolved = computed(() => resolveSeedPreview(settings.seedInput));

function rollSeed(): void {
    settings.seedInput = String(rollRandomSeed());
}

// -- superflat layer editor -------------------------------------------------
const layerBlockDraft = ref("minecraft:stone");
const layerDepthDraft = ref(1);

function onAddLayer(): void {
    settings.superflatLayers = [...addSuperflatLayer(settings.superflatLayers, {
        block: layerBlockDraft.value.trim(),
        depth: Math.max(1, Math.round(layerDepthDraft.value)),
    })];
}
function onRemoveLayer(index: number): void {
    settings.superflatLayers = [...removeSuperflatLayer(settings.superflatLayers, index)];
}
function onMoveLayer(index: number, delta: number): void {
    settings.superflatLayers = [...moveSuperflatLayer(settings.superflatLayers, index, index + delta)];
}
function onLayerBlockChange(index: number, value: string): void {
    settings.superflatLayers = [...updateSuperflatLayer(settings.superflatLayers, index, { block: value })];
}
function onLayerDepthChange(index: number, value: number): void {
    settings.superflatLayers = [...updateSuperflatLayer(settings.superflatLayers, index, {
        depth: Math.max(1, Math.round(value)),
    })];
}
const layerTotalDepth = computed(() => totalSuperflatDepth(settings.superflatLayers));

// -- version search -----------------------------------------------------
const versionQuery = ref("");
const versionRegex = ref(false);
const versionFlags = ref("i");
const filteredVersions = computed(() => {
    const matcher = createSettingMatcher(versionQuery.value, versionRegex.value, versionFlags.value);
    return props.versions.filter((entry) => matcher.test(entry.version));
});

// -- pre-generation estimate ---------------------------------------------
const pregenEstimate = computed(() => estimatePregeneration(settings.pregenerationRadius));

// -- plan preview ----------------------------------------------------------
const runner = computed<WorldGenRunner>(() =>
    runnerKind.value === "local"
        ? { kind: "local" }
        : { kind: "github-actions", repoSlug: "owner/repo", workflowFile: "worldgen.yml" },
);
const plan = computed(() => buildGenerationPlan(settings, runner.value, engineId.value));

function isUnwired(kind: string): boolean {
    return (UNWIRED_STEP_KINDS as readonly string[]).includes(kind);
}

function onPreviewPlan(): void {
    if (!validation.value.ok) return;
    showPlan.value = true;
}
async function onGenerate(): Promise<void> {
    if (!canGenerate.value || generating.value) return;
    if (engineId.value !== "synthetic") {
        emit("generate", { ...settings, dimensions: { ...settings.dimensions }, gamerules: { ...settings.gamerules } });
        return;
    }
    generating.value = true;
    generationError.value = null;
    generated.value = null;
    generationProgress.value = null;
    const resolvedSeed = resolveSeedPreview(settings.seedInput) ?? rollRandomSeed();
    settings.seedInput = String(resolvedSeed);
    if (targetBytes.value !== null) progressTimer = setTimeout(() => void pollGeneration(), 500);
    const answer = await generateSyntheticWorld({
        seed: resolvedSeed,
        size: Math.max(16, Math.trunc(settings.pregenerationRadius) * 2),
        worldName: settings.worldName.trim(),
        destination: settings.outputDestination.trim(),
        outputMode: "folder",
        ...(targetBytes.value === null ? {} : { targetBytes: targetBytes.value, resume: resumeGeneration.value }),
    });
    generating.value = false;
    clearTimeout(progressTimer);
    if (!answer.ok || answer.value === undefined) { generationError.value = answer.failure?.message ?? t("generationFailed"); return; }
    generated.value = answer.value;
    if (answer.value.cancelled) resumeGeneration.value = true;
}
function onClose(): void {
    if (generating.value) return;
    open.value = false;
    showPlan.value = false;
}
</script>

<template>
    <VDialog v-model="open" max-width="760" persistent scrollable>
        <VCard>
            <VCardTitle class="d-flex align-center justify-space-between">
                <span>{{ t("title") }}</span>
                <VBtn variant="text" :icon="mdiClose" :disabled="generating" :aria-label="t('cancel')" @click="onClose" />
            </VCardTitle>
            <VCardText>
                <VAlert v-if="engineId !== 'synthetic'" type="info" variant="tonal" density="compact" class="mb-4">
                    {{ t("boundary") }}
                </VAlert>

                <!--
                  Which engine writes the world, and what that costs. The warning below is
                  deliberately at the top rather than beside the Generate button: a person
                  choosing a world type needs to know their choice will be ignored while
                  they are making it, not after they have made every other one too.
                -->
                <div class="text-subtitle-2 mb-2">{{ t("engine") }}</div>
                <VRadioGroup v-model="engineId" density="compact" hide-details class="mb-2">
                    <VRadio v-for="engine in WORLD_GEN_ENGINES" :key="engine.id" :value="engine.id" :label="engine.label" />
                </VRadioGroup>
                <div class="text-caption text-medium-emphasis mb-2">{{ selectedEngine.summary }}</div>

                <VAlert
                    v-if="engineId === 'synthetic'"
                    type="warning"
                    variant="tonal"
                    density="compact"
                    class="mb-4"
                >
                    <div class="mb-0">{{ SYNTHETIC_TERRAIN_NOTICE }}</div>
                    <template v-if="ignoredSettings.length > 0">
                        <div class="mt-2 mb-1 font-weight-medium">{{ t("engineIgnores") }}</div>
                        <ul class="ps-4 mb-0">
                            <li v-for="ignored in ignoredSettings" :key="ignored.field" class="text-caption">
                                <span class="font-weight-medium">{{ ignored.label }}</span> &mdash; {{ ignored.reason }}
                            </li>
                        </ul>
                    </template>
                </VAlert>

                <VAlert v-else type="info" variant="tonal" density="compact" class="mb-4">
                    {{ t("engineNotAvailable") }}
                </VAlert>

                <!-- Seed -->
                <div class="d-flex align-center ga-2 mb-4">
                    <VTextField v-model="settings.seedInput" :label="t('seed')" density="compact" hide-details clearable />
                    <VBtn :prepend-icon="mdiDice5" variant="tonal" @click="rollSeed">{{ t("seedRandom") }}</VBtn>
                </div>
                <div class="text-caption mb-4">
                    <template v-if="seedResolved !== null">{{ t("seedResolved") }}: {{ seedResolved }}</template>
                    <template v-else>{{ t("seedBlank") }}</template>
                </div>

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
                    <div class="text-subtitle-2 mb-2">{{ t("layers") }}</div>
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
                                <VBtn variant="text" :icon="mdiArrowUp" size="small" :disabled="index === 0"
                                    :aria-label="`Move ${layer.block} up`" @click="onMoveLayer(index, -1)" />
                                <VBtn variant="text" :icon="mdiArrowDown" size="small"
                                    :disabled="index === settings.superflatLayers.length - 1"
                                    :aria-label="`Move ${layer.block} down`" @click="onMoveLayer(index, 1)" />
                                <VBtn variant="text" :icon="mdiDelete" size="small"
                                    :aria-label="`Remove ${layer.block}`" @click="onRemoveLayer(index)" />
                            </div>
                        </VListItem>
                    </VList>
                    <div class="d-flex align-center ga-2 mt-2">
                        <VTextField v-model="layerBlockDraft" :label="t('layerBlock')" density="compact" hide-details style="max-width: 260px" />
                        <VTextField v-model.number="layerDepthDraft" type="number" min="1" :label="t('layerDepth')" density="compact" hide-details style="max-width: 100px" />
                        <VBtn :prepend-icon="mdiPlus" variant="tonal" @click="onAddLayer">{{ t("layerAdd") }}</VBtn>
                    </div>
                    <div class="text-caption mt-1">{{ t("layerTotal") }}: {{ layerTotalDepth }}</div>
                    <VAlert v-if="validation.errors.superflatLayers" type="error" variant="tonal" density="compact" class="mt-2">
                        {{ validation.errors.superflatLayers }}
                    </VAlert>
                </div>

                <VDivider class="my-4" />

                <!-- Dimensions -->
                <div class="text-subtitle-2 mb-2">{{ t("dimensions") }}</div>
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
                    <div class="text-caption">
                        {{ t("estimate") }}: {{ pregenEstimate.chunkCount }} chunks, ~{{ (pregenEstimate.estimatedBytes / 1_000_000).toFixed(1) }} MB,
                        ~{{ pregenEstimate.estimatedSeconds }}s
                    </div>
                    <div v-if="engineId === 'synthetic'" class="d-flex flex-wrap ga-2 mt-2" aria-label="Large deterministic world targets">
                        <VBtn size="small" variant="tonal" :disabled="generating" @click="targetBytes = 1_000_000_000">1 GB (1,000,000,000 bytes)</VBtn>
                        <VBtn size="small" variant="tonal" :disabled="generating" @click="targetBytes = 10_000_000_000">10 GB (10,000,000,000 bytes)</VBtn>
                    </div>
                    <div v-if="engineId === 'synthetic'" class="text-caption mt-1">
                        {{ t('measuredNotice') }}
                    </div>
                    <VTextField v-if="engineId === 'synthetic'" v-model.number="targetBytes" type="number" min="1" max="100000000000" :disabled="generating" :label="t('measuredTarget')" clearable />
                    <VSwitch v-if="engineId === 'synthetic' && targetBytes !== null" v-model="resumeGeneration" :disabled="generating" :label="t('resume')" />
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
                <div class="text-subtitle-2 mb-2">{{ t("gamerules") }}</div>
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
                <div class="text-subtitle-2 mb-2">{{ t("output") }}</div>
                <VRadioGroup v-model="settings.outputMode" density="compact" hide-details inline class="mb-2">
                    <VRadio value="folder" :label="t('outputFolder')" />
                    <VRadio value="zip" :disabled="engineId === 'synthetic'" :label="t('outputZip')" />
                </VRadioGroup>
                <PathField
                    v-model="settings.outputDestination"
                    :field="t('destination')"
                    :label="t('destination')"
                    :semantic="settings.outputMode === 'folder' ? 'folder' : 'file'"
                    v-bind="settings.outputMode === 'zip' ? { extensions: ['zip'] } : {}"
                    :error="validation.errors.outputDestination ?? null"
                />

                <VDivider class="my-4" />

                <!-- Runner -->
                <div class="text-subtitle-2 mb-2">{{ t("runner") }}</div>
                <VRadioGroup v-model="runnerKind" density="compact" hide-details inline class="mb-4">
                    <VRadio value="local" :label="t('runnerLocal')" />
                    <VRadio value="github-actions" :disabled="engineId === 'synthetic'" :label="t('runnerGithub')" />
                </VRadioGroup>

                <!-- Plan preview -->
                <div v-if="showPlan">
                    <div class="text-subtitle-2 mb-2">{{ t("planTitle") }}</div>
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
                <VAlert v-if="generationError !== null" type="error" variant="tonal" density="compact" class="mt-3">
                    {{ generationError }}
                </VAlert>
                <div v-if="generationProgress" role="status" aria-live="polite">
                    {{ t('measuredProgress', { bytes: generationProgress.bytes, target: generationProgress.targetBytes, chunks: generationProgress.chunkCount }) }}
                    <progress :value="generationProgress.bytes" :max="generationProgress.targetBytes" :aria-label="t('measuredTarget')" />
                </div>
                <VAlert v-if="generated !== null" :type="generated.cancelled ? 'info' : 'success'" variant="tonal" density="compact" class="mt-3">
                    <div v-if="generated.cancelled">{{ t('paused') }}</div>
                    {{ t('measuredResult', { bytes: generated.bytes, chunks: generated.chunkCount, overshoot: generated.overshootBytes ?? 0, folder: generated.worldFolder }) }}
                </VAlert>
            </VCardText>
            <VCardActions>
                <VBtn v-if="generating && targetBytes !== null" variant="text" @click="stopGeneration">{{ t('stopGeneration') }}</VBtn>
                <VBtn v-else variant="text" :disabled="generating" @click="onClose">{{ t("cancel") }}</VBtn>
                <VBtn color="primary" variant="flat" :loading="generating" :disabled="!canGenerate || generating" @click="onGenerate">
                    {{ generating ? 'Generating…' : 'Generate' }}
                </VBtn>
                <VBtn color="primary" variant="tonal" :disabled="!validation.ok" @click="onPreviewPlan">
                    {{ t("previewPlan") }}
                </VBtn>
            </VCardActions>
        </VCard>
    </VDialog>
</template>
