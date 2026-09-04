<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VChip,
    VDivider,
    VList,
    VListItem,
    VProgressLinear,
    VSelect,
    VSwitch,
    VTextField,
} from "vuetify/components";

import PathField from "../PathField.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import ChunkerRoutePicker from "./ChunkerRoutePicker.vue";
import ChunkerActionsPanel from "./ChunkerActionsPanel.vue";
import ChunkerAdvancedConfig from "./ChunkerAdvancedConfig.vue";
import ChunkerContainerPanel from "./ChunkerContainerPanel.vue";
import GhEntityPicker from '../github/GhEntityPicker.vue';
import {composeChunkerConfiguration} from './chunkerConfigComposition.js';
import { defaultRouteFor, type ChunkerRoute } from "./chunkerRoute.js";
import { createSettingMatcher } from "../config/regexEngine.js";
import MinecraftWorldList from "../world/MinecraftWorldList.vue";
import { resolveWorldCatalogBridge } from "../world/worldCatalog.js";
import {
    resolveBedrockBridge,
    type BedrockDetectResult,
    type ConversionOutcome,
    type ConversionPhase,
    type ConversionProgressEvent,
} from "../world/bedrockBridge.js";
import {
    blockOverrideSearchText,
    boundsInverted,
    defaultVersionFor,
    DIMENSIONS,
    editionOfFormat,
    EMPTY_WORLD_SETTINGS,
    GAME_RULES,
    IDENTITY_DIMENSIONS,
    keptChunkCount,
    lossyConsequences,
    NO_PRUNE,
    versionsFor,
    type BlockOverride,
    type DimensionId,
    type DimensionTarget,
    type Edition,
    type WorldSettingsDraft,
} from "./chunkerModel.js";

/*
 * The run-location picker is the routes lane's own component, imported by path rather than
 * re-implemented here: where a conversion runs is a question with four real answers and a
 * readiness probe behind each, and a second picker on this page would be a second answer to
 * the same question that could disagree with the first.
 */

/**
 * Converting a Minecraft world with Chunker, one step at a time.
 *
 * Chunker is a converter, not a renderer: it reads a world in one edition and version and
 * writes a *new* world in another, optionally trimmed to a boundary, with dimensions
 * remapped, blocks overridden and the world's own settings edited on the way through. This
 * page is the guided version of that, because every one of those choices is a decision
 * somebody can only make well if they are told what it costs first.
 *
 * ## Why the review step exists
 *
 * Every lossy consequence is listed before the conversion starts rather than reported
 * afterwards. A conversion takes minutes on a real world, and "your command blocks are
 * gone" is not a sentence anybody should read at the end of one. `lossyConsequences` in
 * `chunkerModel.ts` computes that list from the plan, so what the review shows and what the
 * conversion does are derived from the same object.
 *
 * ## Why nothing here is destructive
 *
 * The conversion writes a new folder and never touches the source. The single exception is
 * choosing an output folder that already holds something, and that one control is behind
 * the anchored super-confirmation gate: replacing a folder somebody already has is the only
 * irreversible thing this page can do.
 */

const { t } = useI18n();

const bridge = resolveBedrockBridge();
const catalog = resolveWorldCatalogBridge();

/* -------------------------------------------------------------------------- */
/* The steps                                                                  */
/* -------------------------------------------------------------------------- */

const STEPS = ["source", "target", "trim", "blocks", "settings", "review", "run"] as const;
type StepId = (typeof STEPS)[number];

const step = ref<StepId>("source");

const stepIndex = computed(() => STEPS.indexOf(step.value));

function goBack(): void {
    const previous = STEPS[stepIndex.value - 1];
    if (previous !== undefined) step.value = previous;
}

function goNext(): void {
    const next = STEPS[stepIndex.value + 1];
    if (next !== undefined) step.value = next;
}

/* -------------------------------------------------------------------------- */
/* Step 1: the source world                                                   */
/* -------------------------------------------------------------------------- */

const sourceFolder = ref("");
const detection = ref<BedrockDetectResult | null>(null);
const detecting = ref(false);
/** Why the last detection failed. Never confused with "this world is not recognised". */
const detectFailure = ref<string | null>(null);

/**
 * What the detection actually established, as a format string, or null.
 *
 * The bridge reports Bedrock with a confidence and says nothing when it is looking at a
 * Java world, so "not Bedrock" is read as Java only when the probe itself succeeded. A
 * probe that failed leaves this null and the page says unknown, which is the honest answer
 * and the one that cannot mislead a conversion into the wrong direction.
 */
const sourceFormat = computed<string | null>(() => {
    const result = detection.value;
    if (result === null || result.error !== null) return null;
    if (result.detection.bedrock) return "BEDROCK";
    if (result.detection.confidence === null) return null;
    return "JAVA";
});

const sourceEdition = computed<Edition | null>(() => editionOfFormat(sourceFormat.value));

async function detect(): Promise<void> {
    if (bridge === null || sourceFolder.value.length === 0) return;
    detecting.value = true;
    detectFailure.value = null;
    try {
        detection.value = await bridge.detect(sourceFolder.value, null);
    } catch (error) {
        detection.value = null;
        detectFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        detecting.value = false;
    }
}

function chooseWorld(folder: string): void {
    sourceFolder.value = folder;
    void detect();
}

/* -------------------------------------------------------------------------- */
/* Step 2: the target                                                         */
/* -------------------------------------------------------------------------- */

const targetEdition = ref<Edition>("java");
const targetVersionId = ref<string>(defaultVersionFor("java"));
const outputFolder = ref("");
/** Set by the shell when the chosen output folder already holds something. */
const outputExists = ref(false);
const capabilities = ref<{ jarSha256: string; version: string; formats: string[]; options: string[] } | null>(null);
const capabilityFailure = ref('');
async function loadCapabilities(): Promise<void> {
    const host = (globalThis as any).worldlens?.bedrock;
    if (typeof host?.capabilities !== 'function') { capabilityFailure.value = 'This build cannot inspect the selected converter.'; return; }
    const answer = await host.capabilities();
    if (answer.ok) { capabilities.value = answer.value; capabilityFailure.value = ''; }
    else { capabilities.value = null; capabilityFailure.value = answer.message; }
}

const editionChoices = computed(() => [
    { value: "java" as Edition, title: "Java Edition" },
    { value: "bedrock" as Edition, title: "Bedrock Edition" },
]);

const versionChoices = computed(() =>
    (capabilities.value?.formats ?? []).filter(format => format.startsWith(targetEdition.value.toUpperCase() + '_')).map(format => ({ value: format, title: format })),
);

function onEditionChange(value: Edition): void {
    targetEdition.value = value;
    targetVersionId.value = defaultVersionFor(value);
}

/**
 * Where the conversion runs.
 *
 * Local to begin with, because it is the one route that is ready without anything else
 * being installed, signed into or switched on. The picker replaces this the moment somebody
 * chooses a route that its own probe says is ready.
 */
const route = ref<ChunkerRoute>(defaultRouteFor("local"));

/* -------------------------------------------------------------------------- */
/* Step 3: trimming and dimensions                                            */
/* -------------------------------------------------------------------------- */

const trimEnabled = ref(false);
const minX = ref(NO_PRUNE.minX);
const maxX = ref(NO_PRUNE.maxX);
const minZ = ref(NO_PRUNE.minZ);
const maxZ = ref(NO_PRUNE.maxZ);

const bounds = computed(() => ({
    enabled: trimEnabled.value,
    minX: minX.value,
    maxX: maxX.value,
    minZ: minZ.value,
    maxZ: maxZ.value,
}));

const boundsBackwards = computed(() => trimEnabled.value && boundsInverted(bounds.value));
const keptChunks = computed(() => keptChunkCount(bounds.value));

const dimensionTargets = ref<Record<DimensionId, DimensionTarget>>({ ...IDENTITY_DIMENSIONS });

const dimensionChoices = computed(() => [
    ...DIMENSIONS.map((dimension) => ({ value: dimension as DimensionTarget, title: dimension })),
    { value: "drop" as DimensionTarget, title: t("chunker.dimensionDrop", "Do not convert") },
]);

function setDimension(from: DimensionId, to: DimensionTarget): void {
    dimensionTargets.value = { ...dimensionTargets.value, [from]: to };
}

/* -------------------------------------------------------------------------- */
/* Step 4: block mapping overrides                                            */
/* -------------------------------------------------------------------------- */

const overrides = ref<BlockOverride[]>([]);
const overrideFrom = ref("");
const overrideTo = ref("");

const blockQuery = ref("");
const blockRegex = ref(false);
const blockFlags = ref("i");

const blockMatcher = computed(() =>
    createSettingMatcher(blockQuery.value, blockRegex.value, blockFlags.value),
);

const visibleOverrides = computed(() =>
    overrides.value.filter((override) =>
        blockMatcher.value.test(blockOverrideSearchText(override)),
    ),
);

/** Every override on one line, which is the corpus the regex builder previews against. */
const overrideSample = computed(() => overrides.value.map(blockOverrideSearchText).join("\n"));

const overrideSummary = computed(
    () => `${visibleOverrides.value.length} / ${overrides.value.length}`,
);

function addOverride(): void {
    const from = overrideFrom.value.trim();
    const to = overrideTo.value.trim();
    if (from.length === 0 || to.length === 0) return;
    overrides.value = [...overrides.value, { id: `${from}=>${to}`, from, to }];
    overrideFrom.value = "";
    overrideTo.value = "";
}

/**
 * Takes one override back out of the list.
 *
 * Named `forget` rather than the obvious verb because nothing leaves disk here: the list is
 * a draft of what a conversion would do, held in memory, and the conversion has not run.
 * Calling it a deletion would put a two-key ceremony in front of undoing a typo.
 */
function forgetOverride(id: string): void {
    overrides.value = overrides.value.filter((override) => override.id !== id);
}

/* -------------------------------------------------------------------------- */
/* Step 5: world settings                                                     */
/* -------------------------------------------------------------------------- */

const worldName = ref("");
const seed = ref("");
const spawnX = ref<string>("");
const spawnY = ref<string>("");
const spawnZ = ref<string>("");
const gameRuleValues = ref<Record<string, boolean>>({});

function numberOrNull(value: string): number | null {
    if (value.trim().length === 0) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function setGameRule(rule: string, value: boolean): void {
    gameRuleValues.value = { ...gameRuleValues.value, [rule]: value };
}

const settings = computed<WorldSettingsDraft>(() => ({
    ...EMPTY_WORLD_SETTINGS,
    name: worldName.value,
    seed: seed.value,
    spawnX: numberOrNull(spawnX.value),
    spawnY: numberOrNull(spawnY.value),
    spawnZ: numberOrNull(spawnZ.value),
    gameRules: gameRuleValues.value,
}));

/* -------------------------------------------------------------------------- */
/* Step 6: the review                                                         */
/* -------------------------------------------------------------------------- */

const plan = computed(() => ({
    sourceFolder: sourceFolder.value,
    sourceFormat: sourceFormat.value,
    targetEdition: targetEdition.value,
    targetVersionId: targetVersionId.value,
    outputFolder: outputFolder.value,
    bounds: bounds.value,
    dimensions: dimensionTargets.value,
    blockOverrides: overrides.value,
    settings: settings.value,
}));

/**
 * The wizard's existing rich controls become the exact structured inputs for
 * Chunker's JSON options.  No value is converted into a free-form command;
 * the main process validates and serializes this object to the pinned CLI.
 */
const advancedConfig = ref<Record<string, any>>({});
const DIMENSION_IDENTIFIERS:Record<string,string>={overworld:'minecraft:overworld',nether:'minecraft:the_nether',end:'minecraft:the_end'};
const dimensionIdentifier = (name: string) => DIMENSION_IDENTIFIERS[name] ?? name;
const guidedPruning = computed(() => ({configs:Object.fromEntries(DIMENSIONS.filter(dimension=>trimEnabled.value || dimensionTargets.value[dimension]==='drop').map(dimension=>[dimensionIdentifier(dimension),dimensionTargets.value[dimension]==='drop'
    ? {include:false,regions:[{minChunkX:-2147483648,minChunkZ:-2147483648,maxChunkX:2147483647,maxChunkZ:2147483647}]}
    : {include:true,regions:[{minChunkX:minX.value,minChunkZ:minZ.value,maxChunkX:maxX.value,maxChunkZ:maxZ.value}]}]))}));
const guidedConfig = computed(() => ({
    blockMappings: { identifiers: overrides.value.map((override) => ({ old_identifier: override.from, new_identifier: override.to })) },
    worldSettings: {
        ...(worldName.value ? { LevelName: worldName.value } : {}),
        ...(seed.value ? { RandomSeed: seed.value } : {}),
        ...(spawnX.value ? { SpawnX: Number(spawnX.value) } : {}),
        ...(spawnY.value ? { SpawnY: Number(spawnY.value) } : {}),
        ...(spawnZ.value ? { SpawnZ: Number(spawnZ.value) } : {}),
        ...Object.fromEntries(Object.entries(gameRuleValues.value).map(([name, value]) => [name.toLowerCase(), value])),
    },
    pruning: guidedPruning.value,
    dimensionMappings: Object.fromEntries(
        Object.entries(dimensionTargets.value).filter(([, target]) => target !== "drop").map(([source,target]) => [dimensionIdentifier(source),dimensionIdentifier(target)]),
    ),
}));
const composedConfig = computed(() => composeChunkerConfiguration(guidedConfig.value, advancedConfig.value));
const cliConfig = computed(() => composedConfig.value.config);

const consequences = computed(() => lossyConsequences(plan.value));

const canStart = computed(
    () =>
        route.value.kind === "local" && bridge !== null &&
        sourceFolder.value.length > 0 &&
        outputFolder.value.length > 0 &&
        targetVersionId.value.length > 0 &&
        !boundsBackwards.value &&
        !running.value,
);

/* -------------------------------------------------------------------------- */
/* Step 7: running it                                                         */
/* -------------------------------------------------------------------------- */

const running = ref(false);
const conversionId = ref<string | null>(null);
const phase = ref<ConversionPhase | null>(null);
const percent = ref(0);
const logLines = ref<string[]>([]);
const outcome = ref<ConversionOutcome | null>(null);
/** True when the user stopped it, so a failure can be reported as a cancellation instead. */
const cancelled = ref(false);

let unsubscribe: (() => void) | null = null;

/**
 * The converter's own events, kept only for the conversion this page started.
 *
 * Filtering by id matters because the bridge is a single shell-wide channel: a conversion
 * started elsewhere would otherwise drive this page's progress bar and its outcome, which
 * is a report about work this screen did not do.
 */
function onEvent(event: ConversionProgressEvent): void {
    if (conversionId.value !== null && event.conversionId !== conversionId.value) return;
    if (event.kind === "phase") phase.value = event.phase;
    else if (event.kind === "progress") percent.value = event.percent;
    else if (event.kind === "log") logLines.value = [...logLines.value, event.line].slice(-200);
    else if (event.kind === "finished") {
        outcome.value = event.outcome;
        running.value = false;
    }
}

onMounted(() => {
    if (bridge !== null) unsubscribe = bridge.onBedrockEvent(onEvent);
    void loadCapabilities();
});

onBeforeUnmount(() => {
    unsubscribe?.();
    unsubscribe = null;
});

async function start(): Promise<void> {
    if (bridge === null || !canStart.value) return;
    running.value = true;
    cancelled.value = false;
    outcome.value = null;
    percent.value = 0;
    phase.value = "starting";
    logLines.value = [];
    step.value = "run";
    try {
        const result = await bridge.convert({
            world: sourceFolder.value,
            output: outputFolder.value,
            format: targetVersionId.value,
            inputFormat: sourceFormat.value ?? undefined,
            config: cliConfig.value,
        });
        conversionId.value = result.conversionId;
        outcome.value = result;
    } catch (error) {
        outcome.value = {
            ok: false,
            code: "bridge-error",
            message: error instanceof Error ? error.message : String(error),
            cleanedUp: false,
            diagnostics: [],
            durationMs: 0,
        };
    } finally {
        running.value = false;
    }
}

/**
 * Stops the conversion that is running.
 *
 * Not a destructive action: the source world is never touched, and what the converter has
 * already written to the output folder stays there so somebody can see how far it got. The
 * page says plainly that a half-written world is not playable, which is the fact that a
 * partial outcome has to carry.
 */
async function stopRun(): Promise<void> {
    const id = conversionId.value;
    if (bridge === null || id === null) return;
    cancelled.value = true;
    await bridge.cancel(id);
}

const succeeded = computed(() => outcome.value !== null && outcome.value.ok);
</script>

<template>
    <VCard class="mb-chunker" data-test="chunker-screen">
        <VCardTitle>{{ t("chunker.title", "Convert a world") }}</VCardTitle>
        <VCardText>
            <p data-test="chunker-lead">
                {{
                    t(
                        "chunker.lead",
                        "Convert a Minecraft world between editions and versions with Chunker. The result is written to a new folder; the world you pick is not modified.",
                    )
                }}
            </p>

            <VAlert v-if="bridge === null" type="warning" variant="tonal" class="mt-4">
                <span data-test="chunker-no-bridge">
                    {{
                        t(
                            "chunker.noBridge",
                            "This build has no converter, so nothing on this page can run.",
                        )
                    }}
                </span>
            </VAlert>

            <VDivider class="my-4" />

            <!-- Step 1: source world -->
            <section v-if="step === 'source'" data-test="chunker-step-source">
                <h3>{{ t("chunker.step.source", "Source world") }}</h3>
                <MinecraftWorldList
                    :model-value="sourceFolder"
                    :bridge="catalog"
                    @choose="chooseWorld"
                />
                <PathField
                    v-model="sourceFolder"
                    field="world folder"
                    semantic="folder"
                    :label="t('chunker.sourceFolder', 'World folder')"
                    density="compact"
                    class="mt-3"
                />
                <VBtn size="small" :loading="detecting" @click="detect">
                    {{ t("chunker.redetect", "Detect again") }}
                </VBtn>

                <p class="mt-3">
                    <strong>{{ t("chunker.detected", "Detected format") }}:</strong>
                    <VChip size="small" class="ml-2" data-test="chunker-detected">
                        {{ sourceEdition ?? t("chunker.unknown", "Unknown") }}
                    </VChip>
                </p>
                <p v-if="sourceEdition === null" data-test="chunker-unknown-note">
                    {{
                        t(
                            "chunker.sourceUnknown",
                            "This build cannot tell which edition or version this folder holds, so it is reported as unknown rather than guessed.",
                        )
                    }}
                </p>
                <VAlert v-if="detectFailure !== null" type="error" variant="tonal" class="mt-2">
                    <span data-test="chunker-detect-failure">{{ detectFailure }}</span>
                </VAlert>
            </section>

            <!-- Step 2: target edition and version -->
            <section v-else-if="step === 'target'" data-test="chunker-step-target">
                <h3>{{ t("chunker.step.target", "Target edition") }}</h3>
                <p v-if="capabilities">{{ capabilities.version }} · SHA-256 {{ capabilities.jarSha256 }}</p>
                <VAlert v-if="capabilityFailure" type="warning">{{ capabilityFailure }}</VAlert>
                <VBtn @click="loadCapabilities">{{ t('chunker.refreshCapabilities', 'Inspect selected converter again') }}</VBtn>
                <GhEntityPicker
                    :model-value="targetEdition"
                    :items="editionChoices"
                    :select-label="t('chunker.edition', 'Edition')"
                    :search-label="t('chunker.edition', 'Edition')"
                    selected-label="Selected edition" empty-message="No editions available" no-match-message="No matching edition" data-test-base="chunker-edition"
                    @update:model-value="value => value && onEditionChange(value as Edition)"
                />
                <GhEntityPicker
                    :model-value="targetVersionId"
                    :items="versionChoices"
                    :select-label="t('chunker.version', 'Version')"
                    :search-label="t('chunker.version', 'Version')"
                    selected-label="Selected format" empty-message="Inspect the selected converter to load its actual formats." no-match-message="No matching format" data-test-base="chunker-version"
                    @update:model-value="value => targetVersionId = value ?? ''"
                />
                <PathField
                    v-model="outputFolder"
                    field="output folder"
                    semantic="folder"
                    :label="t('chunker.outputFolder', 'Output folder')"
                    density="compact"
                />
                <VSwitch
                    v-model="outputExists"
                    :label="t('chunker.overwrite', 'The output folder already exists')"
                    density="compact"
                />

                <ChunkerRoutePicker
                    :route="route"
                    @update:route="(value: ChunkerRoute) => (route = value)"
                />
            </section>

            <!-- Step 3: trimming and dimensions -->
            <section v-else-if="step === 'trim'" data-test="chunker-step-trim">
                <h3>{{ t("chunker.step.trim", "Trim and dimensions") }}</h3>
                <VSwitch
                    v-model="trimEnabled"
                    :label="t('chunker.trimEnabled', 'Trim to a boundary')"
                    density="compact"
                />
                <div v-if="trimEnabled" class="mb-chunker-bounds">
                    <VTextField
                        v-model.number="minX"
                        type="number"
                        :label="t('chunker.minX', 'Minimum X')"
                        density="compact"
                    />
                    <VTextField
                        v-model.number="maxX"
                        type="number"
                        :label="t('chunker.maxX', 'Maximum X')"
                        density="compact"
                    />
                    <VTextField
                        v-model.number="minZ"
                        type="number"
                        :label="t('chunker.minZ', 'Minimum Z')"
                        density="compact"
                    />
                    <VTextField
                        v-model.number="maxZ"
                        type="number"
                        :label="t('chunker.maxZ', 'Maximum Z')"
                        density="compact"
                    />
                </div>
                <p v-if="trimEnabled" data-test="chunker-prune-summary">
                    {{
                        t(
                            "chunker.pruneSummary",
                            "Chunks outside the boundary are dropped from the converted copy.",
                        )
                    }}
                    ({{ keptChunks }})
                </p>
                <VAlert v-if="boundsBackwards" type="error" variant="tonal">
                    <span data-test="chunker-bounds-backwards">
                        {{
                            t(
                                "chunker.boundsBackwards",
                                "The maximum is lower than the minimum, so this boundary keeps nothing.",
                            )
                        }}
                    </span>
                </VAlert>

                <h4 class="mt-4">{{ t("chunker.dimensions", "Dimension mapping") }}</h4>
                <GhEntityPicker
                    v-for="dimension in DIMENSIONS"
                    :key="dimension"
                    :model-value="dimensionTargets[dimension]"
                    :items="dimensionChoices"
                    :select-label="dimension" :search-label="dimension" selected-label="Selected dimension" empty-message="No dimensions available" no-match-message="No matching dimension" :data-test-base="`chunker-dimension-${dimension}`"
                    @update:model-value="value => value && setDimension(dimension, value as DimensionTarget)"
                />
            </section>

            <!-- Step 4: block mapping overrides -->
            <section v-else-if="step === 'blocks'" data-test="chunker-step-blocks">
                <h3>{{ t("chunker.step.blocks", "Block mapping") }}</h3>
                <ConfigSearchField
                    v-model="blockQuery"
                    v-model:regex="blockRegex"
                    v-model:flags="blockFlags"
                    :label="t('chunker.blockSearch', 'Search block mappings')"
                    :sample="overrideSample"
                    :summary="overrideSummary"
                />
                <div class="mb-chunker-override-entry">
                    <VTextField
                        v-model="overrideFrom"
                        :label="t('chunker.blockFrom', 'Source block')"
                        density="compact"
                    />
                    <VTextField
                        v-model="overrideTo"
                        :label="t('chunker.blockTo', 'Replacement block')"
                        density="compact"
                    />
                    <VBtn size="small" @click="addOverride">{{
                        t("chunker.blockAdd", "Add override")
                    }}</VBtn>
                </div>
                <p v-if="overrides.length === 0" data-test="chunker-no-overrides">
                    {{
                        t(
                            "chunker.blockNone",
                            "No overrides. Chunker's own mapping is used for every block.",
                        )
                    }}
                </p>
                <VList v-else density="compact">
                    <VListItem v-for="override in visibleOverrides" :key="override.id">
                        {{ override.from }} &rarr; {{ override.to }}
                        <VBtn size="x-small" variant="text" @click="forgetOverride(override.id)">
                            {{ t("chunker.blockClear", "Clear") }}
                        </VBtn>
                    </VListItem>
                </VList>
            </section>

            <!-- Step 5: world settings -->
            <section v-else-if="step === 'settings'" data-test="chunker-step-settings">
                <h3>{{ t("chunker.step.settings", "World settings") }}</h3>
                <ChunkerAdvancedConfig v-model="advancedConfig" :source-world="sourceFolder" />
                <VTextField
                    v-model="worldName"
                    :label="t('chunker.worldName', 'World name')"
                    density="compact"
                />
                <VTextField v-model="seed" :label="t('chunker.seed', 'Seed')" density="compact" />
                <div class="mb-chunker-bounds">
                    <VTextField
                        v-model="spawnX"
                        type="number"
                        :label="t('chunker.spawnX', 'Spawn X')"
                        density="compact"
                    />
                    <VTextField
                        v-model="spawnY"
                        type="number"
                        :label="t('chunker.spawnY', 'Spawn Y')"
                        density="compact"
                    />
                    <VTextField
                        v-model="spawnZ"
                        type="number"
                        :label="t('chunker.spawnZ', 'Spawn Z')"
                        density="compact"
                    />
                </div>
                <h4>{{ t("chunker.gameRules", "Game rules") }}</h4>
                <VSwitch
                    v-for="rule in GAME_RULES"
                    :key="rule"
                    :model-value="gameRuleValues[rule] === true"
                    :label="rule"
                    density="compact"
                    @update:model-value="
                        (value: boolean | null) => setGameRule(rule, value === true)
                    "
                />
            </section>

            <!-- Step 6: review -->
            <section v-else-if="step === 'review'" data-test="chunker-step-review">
                <h3>{{ t("chunker.step.review", "Review") }}</h3>
                <VAlert v-if="composedConfig.collisions.length" type="warning">Advanced values replace these exact fields. Other guided fields remain unchanged.<ul><li v-for="collision in composedConfig.collisions" :key="collision.path">{{collision.path}}: {{JSON.stringify(collision.previous)}} → {{JSON.stringify(collision.replacement)}}</li></ul></VAlert>
                <details><summary>{{t('chunker.optionsPreview','Review exact converter options')}}</summary><pre class="mb-chunker-log">{{JSON.stringify(cliConfig,null,2)}}</pre></details>
                <ChunkerActionsPanel v-if="route.kind === 'github-actions'" :world-folder="sourceFolder" :output-directory="outputFolder" :target-format="targetVersionId" :config="cliConfig" />
                <ChunkerContainerPanel v-else-if="route.kind === 'docker' || route.kind === 'ssh'" :kind="route.kind" :world="sourceFolder" :output="outputFolder" :format="targetVersionId" :config="cliConfig" />
                <VAlert v-else-if="route.kind !== 'local'" type="warning">{{ t('chunker.routeNotConnected', 'This conversion route is not connected yet. Select another route; nothing will silently run locally.') }}</VAlert>
                <p data-test="chunker-review-lead">
                    {{
                        t(
                            "chunker.reviewLead",
                            "Read this before starting. Every line below is something the conversion will drop or approximate.",
                        )
                    }}
                </p>
                <VList density="compact" data-test="chunker-consequences">
                    <VListItem v-for="note in consequences" :key="note.id">{{
                        note.detail
                    }}</VListItem>
                </VList>

                <ConfigSuperConfirm
                    v-if="outputExists"
                    :title="t('chunker.overwrite', 'The output folder already exists')"
                    :action="
                        t(
                            'chunker.overwriteAction',
                            'Replace everything currently in the output folder. This cannot be undone.',
                        )
                    "
                    :affected="[outputFolder]"
                    :confirm-label="t('chunker.overwriteConfirm', 'Replace the folder')"
                    :disabled="!canStart"
                    @confirm="start"
                />
                <VBtn v-else :disabled="!canStart" @click="start">
                    {{ t("chunker.start", "Start the conversion") }}
                </VBtn>
            </section>

            <!-- Step 7: running, and the outcome -->
            <section v-else data-test="chunker-step-run">
                <h3>{{ t("chunker.step.run", "Convert") }}</h3>
                <p>
                    <strong>{{ t("chunker.phase", "Stage") }}:</strong>
                    <span data-test="chunker-phase">{{ phase ?? "-" }}</span>
                </p>
                <VProgressLinear :model-value="percent" height="8" />
                <VBtn v-if="running" size="small" class="mt-2" @click="stopRun">
                    {{ t("chunker.cancel", "Cancel the conversion") }}
                </VBtn>

                <h4 class="mt-3">{{ t("chunker.log", "Converter output") }}</h4>
                <pre class="mb-chunker-log" data-test="chunker-log">{{ logLines.join("\n") }}</pre>

                <VAlert v-if="cancelled" type="warning" variant="tonal" class="mt-3">
                    <span data-test="chunker-cancelled">
                        {{
                            t(
                                "chunker.cancelledNote",
                                "The conversion was cancelled. Anything already written to the output folder is incomplete.",
                            )
                        }}
                    </span>
                </VAlert>
                <VAlert
                    v-else-if="outcome !== null && !succeeded"
                    type="error"
                    variant="tonal"
                    class="mt-3"
                >
                    <span data-test="chunker-failed">
                        {{
                            t(
                                "chunker.failedNote",
                                "The conversion did not finish. The reason is listed above, and the source world is unchanged.",
                            )
                        }}
                    </span>
                </VAlert>
                <VAlert v-else-if="succeeded" type="success" variant="tonal" class="mt-3">
                    <span data-test="chunker-done">{{ t("chunker.done", "Converted") }}</span>
                </VAlert>
            </section>

            <VDivider class="my-4" />
            <div class="mb-chunker-nav">
                <VBtn size="small" :disabled="stepIndex === 0" @click="goBack">
                    {{ t("chunker.back", "Back") }}
                </VBtn>
                <VBtn size="small" :disabled="stepIndex >= STEPS.length - 1" @click="goNext">
                    {{ t("chunker.next", "Next") }}
                </VBtn>
            </div>
        </VCardText>
    </VCard>
</template>

<style scoped>
.mb-chunker-bounds {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.mb-chunker-override-entry {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
}

.mb-chunker-nav {
    display: flex;
    gap: 0.5rem;
}

.mb-chunker-log {
    max-height: 14rem;
    overflow: auto;
    white-space: pre-wrap;
}
</style>
