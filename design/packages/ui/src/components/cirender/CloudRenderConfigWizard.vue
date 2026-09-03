<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowLeft,
    mdiArrowRight,
    mdiCheckCircleOutline,
    mdiCloudSyncOutline,
    mdiFolderSearchOutline,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckbox,
    VChip,
    VDivider,
    VSelect,
    VSwitch,
    VTextField,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { mapIdProblem, worldLeaf } from "../project/index.js";
import type { CiCloudRenderConfigInput } from "./ciRenderBridge.js";

/**
 * Cloud-first project creation is deliberately a renderer-only guide. It collects the
 * values that change the portable project contract, then returns a complete generated
 * project to the existing project host. No Java process, client download, or local render
 * is involved here; the parent owns the atomic/history-backed write and the next preflight.
 */
const props = withDefaults(
    defineProps<{
        world: string;
        separator?: string;
        /**
         * True while the parent is writing the project.
         *
         * The write happens outside this component, and so did its only visible sign of
         * life - which is behind the dialog's own scrim, where nobody can read it. Pressing
         * the button therefore looked exactly like pressing a dead one. It arrives as a prop
         * so the state that actually decides the outcome is the state the button renders.
         */
        busy?: boolean;
        /** The parent's refusal, shown here because a dialog covers wherever else it went. */
        failure?: string | null;
    }>(),
    { separator: "/", busy: false, failure: null },
);

const emit = defineEmits<{
    save: [config: CiCloudRenderConfigInput];
    cancel: [];
}>();

const { t } = useI18n();

type Step = "map" | "storage" | "render" | "review";
const steps: readonly { id: Step; label: string; labelKey: string; number: number }[] = [
    { id: "map", label: "Map", labelKey: "cirender.cloudConfig.step.map", number: 1 },
    { id: "storage", label: "Storage", labelKey: "cirender.cloudConfig.step.storage", number: 2 },
    { id: "render", label: "Cloud render", labelKey: "cirender.cloudConfig.step.render", number: 3 },
    { id: "review", label: "Review", labelKey: "cirender.cloudConfig.step.review", number: 4 },
];

const step = ref<Step>("map");
const query = ref("");
const regexMode = ref(false);
const regexFlags = ref("im");

const projectName = ref(worldLeaf(props.world));
const mapName = ref("Overworld");
const mapId = ref("overworld");
const selectedDimension = ref("minecraft:overworld");
const sorting = ref(0);
const enabledMapIds = ref<string[]>(["overworld", "nether", "end"]);

const dataFolder = ref("data");
const webroot = ref("web");
const outputFolder = ref("");
const threads = ref<number | null>(null);
const force = ref(false);
const fixEdges = ref(false);
const metrics = ref(false);

const dimensions = [
    {
        value: "minecraft:overworld",
        title: "Overworld",
        subtitle: "The generated vanilla surface; default primary map.",
        id: "overworld",
        sorting: 0,
    },
    {
        value: "minecraft:the_nether",
        title: "The Nether",
        subtitle: "The generated Nether dimension; selected only when you choose it.",
        id: "nether",
        sorting: 100,
    },
    {
        value: "minecraft:the_end",
        title: "The End",
        subtitle: "The generated End dimension; selected only when you choose it.",
        id: "end",
        sorting: 200,
    },
] as const;

const threadItems = [
    { value: null, title: "Automatic", subtitle: "Let the cloud runner choose its safe default." },
    { value: 1, title: "1 thread", subtitle: "Slowest, smallest parallel footprint." },
    { value: 2, title: "2 threads", subtitle: "Balanced for most cloud runners." },
    { value: 3, title: "3 threads", subtitle: "Fastest shipped preset; uses more memory." },
] as const;

const activeFields = computed(() => {
    const fields = [
        [t("cirender.cloudConfig.projectName", "Project name"), projectName.value],
        [t("cirender.cloudConfig.mapName", "Primary map name"), mapName.value],
        [t("cirender.cloudConfig.mapId", "Primary map id"), mapId.value],
        [t("cirender.cloudConfig.primaryDimension", "Primary dimension"), selectedDimension.value],
        [t("cirender.cloudConfig.sorting", "Sort order"), String(sorting.value)],
        [t("cirender.cloudConfig.dataFolder", "Runtime data folder"), dataFolder.value],
        [t("cirender.cloudConfig.webroot", "Web root"), webroot.value],
        [t("cirender.cloudConfig.outputFolder", "Cloud output folder (optional)"), outputFolder.value],
        [t("cirender.cloudConfig.threads", "Render threads"), threads.value === null ? t("cirender.cloudConfig.automatic", "Automatic") : String(threads.value)],
        [t("cirender.cloudConfig.force", "Render all chunks even when they look unchanged"), String(force.value)],
        [t("cirender.cloudConfig.fixEdges", "Repair map edges while rendering"), String(fixEdges.value)],
        [t("cirender.cloudConfig.metrics", "Allow the upstream anonymous metrics option"), String(metrics.value)],
        [t("cirender.cloudConfig.route", "Render route"), "github-actions"],
    ] as const;
    const needle = query.value.trim().toLocaleLowerCase();
    if (needle === "") return fields;
    if (!regexMode.value) return fields.filter(([label, text]) => `${label} ${text}`.toLocaleLowerCase().includes(needle));
    try {
        const pattern = new RegExp(query.value, regexFlags.value);
        return fields.filter(([label, text]) => pattern.test(`${label} ${text}`));
    } catch {
        return [];
    }
});

const selectedDimensionMeta = computed(
    () => dimensions.find((item) => item.value === selectedDimension.value) ?? dimensions[0],
);

const mapIdProblemText = computed(() => {
    const problem = mapIdProblem(mapId.value.trim());
    if (problem !== null) return t(problem.key, problem.vars ?? {}, problem.fallback);
    if (mapId.value.trim() === "nether" || mapId.value.trim() === "end") {
        return t(
            "cirender.cloudConfig.mapIdTaken",
            { id: mapId.value.trim() },
            "The map id {id} is reserved by another generated dimension.",
        );
    }
    return "";
});

const sortingProblem = computed(() =>
    Number.isInteger(sorting.value)
        ? ""
        : t("cirender.cloudConfig.sortingInvalid", "Sort order must be a whole number."),
);

const problem = computed<string | null>(() => {
    if (projectName.value.trim() === "") return t("cirender.cloudConfig.projectNameRequired", "Name this project before continuing.");
    if (mapName.value.trim() === "") return t("cirender.cloudConfig.mapNameRequired", "Give the primary map a name before continuing.");
    if (mapIdProblemText.value !== "") return mapIdProblemText.value;
    if (sortingProblem.value !== "") return sortingProblem.value;
    if (enabledMapIds.value.length === 0) return t("cirender.cloudConfig.mapRequired", "Keep at least one map enabled for the cloud render.");
    if (dataFolder.value.trim() === "") return t("cirender.cloudConfig.dataRequired", "Choose a data folder, or keep the generated data default.");
    if (webroot.value.trim() === "") return t("cirender.cloudConfig.webRequired", "Choose a web root, or keep the generated web default.");
    return null;
});

const filteredSteps = computed(() => {
    const labels: Record<Step, string[]> = {
        map: [
            t("cirender.cloudConfig.projectName", "Project name"),
            t("cirender.cloudConfig.mapName", "Primary map name"),
            t("cirender.cloudConfig.mapId", "Primary map id"),
            t("cirender.cloudConfig.primaryDimension", "Primary dimension"),
            t("cirender.cloudConfig.sorting", "Sort order"),
        ],
        storage: [
            t("cirender.cloudConfig.dataFolder", "Runtime data folder"),
            t("cirender.cloudConfig.webroot", "Web root"),
            t("cirender.cloudConfig.outputFolder", "Cloud output folder (optional)"),
        ],
        render: [
            t("cirender.cloudConfig.threads", "Render threads"),
            t("cirender.cloudConfig.force", "Render all chunks even when they look unchanged"),
            t("cirender.cloudConfig.fixEdges", "Repair map edges while rendering"),
            t("cirender.cloudConfig.metrics", "Allow the upstream anonymous metrics option"),
            t("cirender.cloudConfig.route", "Render route"),
        ],
        review: [],
    };
    return steps.map((item) => ({
        ...item,
        visible:
            query.value.trim() === "" ||
            item.id === "review" ||
            t(item.labelKey, item.label)
                .toLocaleLowerCase()
                .includes(query.value.trim().toLocaleLowerCase()) ||
            activeFields.value.some(([label]) => labels[item.id].includes(label)),
    }));
});

function chooseDimension(value: unknown): void {
    if (typeof value !== "string") return;
    const choice = dimensions.find((item) => item.value === value);
    if (choice === undefined) return;
    selectedDimension.value = choice.value;
    sorting.value = choice.sorting;
    mapId.value = choice.id;
    mapName.value = choice.title;
}

function toggleMap(id: string): void {
    enabledMapIds.value = enabledMapIds.value.includes(id)
        ? enabledMapIds.value.filter((current) => current !== id)
        : [...enabledMapIds.value, id];
}

async function browseOutputFolder(): Promise<void> {
    const pickFolder = (
        globalThis as { worldlens?: { dialog?: { pickFolder?: (options: { title: string; startIn?: string }) => Promise<string | null> } } }
    ).worldlens?.dialog?.pickFolder;
    if (typeof pickFolder !== "function") return;
    const chosen = await pickFolder({
        title: t("cirender.cloudConfig.outputPick", "Choose the cloud render output folder"),
        ...(outputFolder.value.trim() === "" ? {} : { startIn: outputFolder.value.trim() }),
    });
    if (chosen !== null) outputFolder.value = chosen;
}

function next(): void {
    if (problem.value !== null && step.value !== "review") return;
    const index = steps.findIndex((item) => item.id === step.value);
    const following = steps[index + 1];
    if (following !== undefined) step.value = following.id;
}

function back(): void {
    const index = steps.findIndex((item) => item.id === step.value);
    const previous = steps[index - 1];
    if (previous !== undefined) step.value = previous.id;
}

function save(): void {
    if (problem.value !== null) return;
    const enabledMapIdsForMain = enabledMapIds.value.map((id) =>
        id === "overworld" ? mapId.value.trim() : id,
    );
    emit("save", {
        projectName: projectName.value.trim(),
        mapId: mapId.value.trim(),
        mapName: mapName.value.trim(),
        dimension: selectedDimension.value,
        sorting: sorting.value,
        enabledMapIds: enabledMapIdsForMain,
        dataFolder: dataFolder.value.trim(),
        webroot: webroot.value.trim(),
        outputFolder: outputFolder.value.trim() === "" ? null : outputFolder.value.trim(),
        threads: threads.value,
        force: force.value,
        fixEdges: fixEdges.value,
        metrics: metrics.value,
    });
}

watch(selectedDimension, (value) => {
    const choice = dimensions.find((item) => item.value === value);
    if (choice === undefined) return;
    if (mapId.value === "" || dimensions.some((item) => item.id === mapId.value)) mapId.value = choice.id;
    if (mapName.value === "" || dimensions.some((item) => item.title === mapName.value)) mapName.value = choice.title;
});
</script>

<template>
    <VCard class="cloud-config-wizard" data-test="cloud-config-wizard" role="dialog" aria-modal="true">
        <VCardTitle class="d-flex align-center ga-2 flex-wrap">
            <v-icon :icon="mdiCloudSyncOutline" aria-hidden="true" />
            <span>{{ t("cirender.cloudConfig.title", "Create cloud render configuration") }}</span>
            <VChip size="small" color="primary" variant="tonal">
                {{ t("cirender.cloudConfig.noLocalRender", "Cloud-first · no local render") }}
            </VChip>
        </VCardTitle>
        <VCardText>
            <p class="cloud-config-wizard__intro">
                {{ t("cirender.cloudConfig.intro", "Answer the portable project settings below. The app writes the complete project file through local history, then returns to this exact cloud preflight with your world, account and repository choices intact. Java is not started and nothing is rendered locally.") }}
            </p>

            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="regexFlags"
                :label="t('cirender.cloudConfig.search', 'Search configuration fields')"
                :placeholder="t('cirender.cloudConfig.searchHint', 'map, storage, threads, output...')"
                :sample="activeFields.map(([label, value]) => `${label}: ${value}`).join('\n')"
                density="compact"
                class="mb-3"
            />

            <nav class="cloud-config-wizard__steps" :aria-label="t('cirender.cloudConfig.steps', 'Cloud configuration steps')">
                <VBtn
                    v-for="item in filteredSteps"
                    :key="item.id"
                    :variant="step === item.id ? 'tonal' : 'text'"
                    :color="step === item.id ? 'primary' : undefined"
                    :aria-current="step === item.id ? 'step' : undefined"
                    size="small"
                    :disabled="!item.visible"
                    @click="step = item.id"
                >
                    <span class="cloud-config-wizard__step-number">{{ item.number }}</span>
                    {{ t(`cirender.cloudConfig.step.${item.id}`, item.label) }}
                </VBtn>
            </nav>

            <VDivider class="mb-4" />

            <section v-if="step === 'map'" aria-labelledby="cloud-config-map-title">
                <h3 id="cloud-config-map-title">{{ t("cirender.cloudConfig.mapTitle", "Choose the maps and primary map") }}</h3>
                <p class="cloud-config-wizard__hint">
                    {{ t("cirender.cloudConfig.mapHint", "These are BlueMap's generated map presets. Their names, dimensions and sorting are written into the normal maps/*.conf files; the generated defaults remain available in the project editor afterwards.") }}
                </p>
                <div class="cloud-config-wizard__grid">
                    <VTextField v-model="projectName" :label="t('cirender.cloudConfig.projectName', 'Project name')" :hint="t('cirender.cloudConfig.projectNameProvenance', 'Suggested from the selected world folder name.')" persistent-hint variant="outlined" density="compact" autocomplete="off" />
                    <VSelect :model-value="selectedDimension" :items="dimensions" item-title="title" item-value="value" :label="t('cirender.cloudConfig.primaryDimension', 'Primary dimension')" :hint="t('cirender.cloudConfig.primaryDimensionProvenance', 'Default: Overworld, the first generated map.')" persistent-hint variant="outlined" density="compact" @update:model-value="chooseDimension" />
                    <VTextField v-model="mapName" :label="t('cirender.cloudConfig.mapName', 'Primary map name')" :hint="t('cirender.cloudConfig.mapNameProvenance', 'Written to the selected map config; the generated preset supplies the other values.')" persistent-hint variant="outlined" density="compact" autocomplete="off" />
                    <VTextField v-model="mapId" :label="t('cirender.cloudConfig.mapId', 'Primary map id')" :error-messages="mapIdProblemText" :hint="t('cirender.cloudConfig.mapIdProvenance', 'Lower-case id used as the maps folder and URL segment.')" persistent-hint variant="outlined" density="compact" spellcheck="false" autocomplete="off" />
                    <VTextField v-model.number="sorting" type="number" :label="t('cirender.cloudConfig.sorting', 'Sort order')" :error-messages="sortingProblem" :hint="t('cirender.cloudConfig.sortingProvenance', 'Default follows the selected dimension preset.')" persistent-hint variant="outlined" density="compact" />
                </div>
                <h4 class="mt-4">{{ t("cirender.cloudConfig.mapListTitle", "Maps included in the cloud render") }}</h4>
                <p class="cloud-config-wizard__hint">{{ t("cirender.cloudConfig.mapListHint", "Each generated map is listed as a real checkbox. Keep at least one enabled; disabled maps remain in the project for later editing.") }}</p>
                <VCheckbox v-for="item in dimensions" :key="item.id" :model-value="enabledMapIds.includes(item.id)" :label="`${item.title} · ${item.value}`" density="compact" hide-details @update:model-value="toggleMap(item.id)" />
            </section>

            <section v-else-if="step === 'storage'" aria-labelledby="cloud-config-storage-title">
                <h3 id="cloud-config-storage-title">{{ t("cirender.cloudConfig.storageTitle", "Choose storage paths") }}</h3>
                <p class="cloud-config-wizard__hint">{{ t("cirender.cloudConfig.storageHint", "These are portable paths inside the generated project contract. They do not start a renderer or create folders now; the cloud workflow resolves them when it runs.") }}</p>
                <div class="cloud-config-wizard__grid">
                    <VTextField v-model="dataFolder" :label="t('cirender.cloudConfig.dataFolder', 'Runtime data folder')" :hint="t('cirender.cloudConfig.dataProvenance', 'Generated default: data.')" persistent-hint variant="outlined" density="compact" spellcheck="false" />
                    <VTextField v-model="webroot" :label="t('cirender.cloudConfig.webroot', 'Web root')" :hint="t('cirender.cloudConfig.webProvenance', 'Generated default: web.')" persistent-hint variant="outlined" density="compact" spellcheck="false" />
                    <VTextField v-model="outputFolder" :label="t('cirender.cloudConfig.outputFolder', 'Cloud output folder (optional)')" :hint="t('cirender.cloudConfig.outputProvenance', 'Empty keeps the generated project default; a chosen path is recorded in render.outputFolder.')" persistent-hint variant="outlined" density="compact" spellcheck="false">
                        <template #append-inner><VBtn :prepend-icon="mdiFolderSearchOutline" size="small" variant="text" :aria-label="t('cirender.cloudConfig.outputBrowse', 'Browse for cloud output folder')" @click="browseOutputFolder">{{ t("cirender.cloudConfig.browse", "Browse") }}</VBtn></template>
                    </VTextField>
                </div>
                <VAlert type="info" variant="tonal" density="compact" class="mt-4" role="note">
                    {{ t("cirender.cloudConfig.storageProvenance", "Generated defaults are shown in each field. Nothing is silently inherited from a prior local render because this flow starts from a fresh project schema.") }}
                </VAlert>
            </section>

            <section v-else-if="step === 'render'" aria-labelledby="cloud-config-render-title">
                <h3 id="cloud-config-render-title">{{ t("cirender.cloudConfig.renderTitle", "Choose cloud render behaviour") }}</h3>
                <p class="cloud-config-wizard__hint">{{ t("cirender.cloudConfig.renderHint", "The route is fixed to GitHub Actions for this guide. These values are saved in the project and can be edited later; they do not run Java or begin a local render now.") }}</p>
                <div class="cloud-config-wizard__grid">
                    <VSelect v-model="threads" :items="threadItems" item-title="title" item-value="value" :label="t('cirender.cloudConfig.threads', 'Render threads')" :hint="t('cirender.cloudConfig.threadsProvenance', 'Default: automatic, so the cloud runner chooses a safe value.')" persistent-hint variant="outlined" density="compact" />
                    <VTextField :model-value="'github-actions'" readonly :label="t('cirender.cloudConfig.route', 'Render route')" :hint="t('cirender.cloudConfig.routeProvenance', 'Fixed by this cloud-first guide; preflight still checks the actual route before upload.')" persistent-hint variant="outlined" density="compact" />
                </div>
                <VSwitch v-model="force" :label="t('cirender.cloudConfig.force', 'Render all chunks even when they look unchanged')" color="primary" hide-details />
                <VSwitch v-model="fixEdges" :label="t('cirender.cloudConfig.fixEdges', 'Repair map edges while rendering')" color="primary" hide-details />
                <VSwitch v-model="metrics" :label="t('cirender.cloudConfig.metrics', 'Allow the upstream anonymous metrics option')" color="primary" hide-details />
            </section>

            <section v-else aria-labelledby="cloud-config-review-title">
                <h3 id="cloud-config-review-title">{{ t("cirender.cloudConfig.reviewTitle", "Review before writing") }}</h3>
                <VAlert type="info" variant="tonal" density="compact" role="status">
                    <strong>{{ t("cirender.cloudConfig.reviewCloudOnly", "Cloud-first") }}</strong>
                    {{ t("cirender.cloudConfig.reviewCloudOnlyBody", "No Java is launched, no client or JDK is downloaded, and no local render starts. The next action writes the complete project through local history, then returns to the same CI preflight.") }}
                </VAlert>
                <dl class="cloud-config-wizard__summary">
                    <div><dt>{{ t("cirender.cloudConfig.summaryWorld", "World") }}</dt><dd>{{ props.world }}</dd></div>
                    <div><dt>{{ t("cirender.cloudConfig.summaryProject", "Project") }}</dt><dd>{{ projectName }}</dd></div>
                    <div><dt>{{ t("cirender.cloudConfig.summaryPrimary", "Primary map") }}</dt><dd>{{ mapName }} · {{ mapId }} · {{ selectedDimensionMeta.title }}</dd></div>
                    <div><dt>{{ t("cirender.cloudConfig.summaryStorage", "Storage") }}</dt><dd>{{ dataFolder }} · {{ webroot }}{{ outputFolder ? ` · ${outputFolder}` : "" }}</dd></div>
                    <div><dt>{{ t("cirender.cloudConfig.summaryRoute", "Route") }}</dt><dd>github-actions · {{ threads === null ? "automatic" : `${threads} threads` }}</dd></div>
                </dl>
                <p v-if="problem !== null" class="text-error" role="alert">{{ problem }}</p>
            </section>
            <VAlert
                v-if="failure !== null"
                type="error"
                variant="tonal"
                density="compact"
                class="mt-4"
                role="alert"
                data-test="cloud-config-failure"
            >
                {{ failure }}
            </VAlert>
        </VCardText>
        <VDivider />
        <!--
            Cancel stays live while the write is in flight, deliberately.

            It was briefly disabled alongside the Write button when the busy state was added,
            which is the obvious-looking thing to do and is wrong here: this is not a second
            submit that a double click could duplicate, it is the escape hatch. The parent
            answers it by calling cancelCiCloudConfig with the very operation id that is
            running, so disabling it removes the only way to stop a write that has begun -
            precisely when somebody most wants to. A regression test cancels an in-flight
            operation and caught this immediately.
        -->
        <div class="cloud-config-wizard__actions">
            <VBtn variant="text" @click="emit('cancel')">{{ t("cirender.cloudConfig.cancel", "Cancel") }}</VBtn>
            <span class="cloud-config-wizard__status" role="status" aria-live="polite">{{ t("cirender.cloudConfig.status", { step: steps.findIndex((item) => item.id === step) + 1, total: steps.length }, "Step {step} of {total}") }}</span>
            <span class="flex-grow-1" />
            <VBtn v-if="step !== 'map'" :prepend-icon="mdiArrowLeft" variant="text" @click="back">{{ t("cirender.cloudConfig.back", "Back") }}</VBtn>
            <VBtn v-if="step !== 'review'" :append-icon="mdiArrowRight" color="primary" :disabled="problem !== null" @click="next">{{ t("cirender.cloudConfig.next", "Next") }}</VBtn>
            <VBtn v-else :prepend-icon="mdiCheckCircleOutline" color="primary" :disabled="problem !== null || busy === true" :loading="busy === true" data-test="cloud-config-save" @click="save">{{ t("cirender.cloudConfig.save", "Write and return to cloud preflight") }}</VBtn>
        </div>
    </VCard>
</template>

<style scoped>
.cloud-config-wizard {
    display: flex;
    flex-direction: column;
    max-block-size: min(92vh, 940px);
}

.cloud-config-wizard__intro,
.cloud-config-wizard__hint {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    line-height: 1.5;
    text-wrap: pretty;
}

.cloud-config-wizard__steps {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-block: 8px 12px;
}

.cloud-config-wizard__step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 20px;
    block-size: 20px;
    margin-inline-end: 6px;
    border-radius: 50%;
    background: rgba(var(--v-theme-on-surface), 0.1);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
}

.cloud-config-wizard__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
    gap: 16px;
    margin-block: 16px;
}

.cloud-config-wizard__summary {
    display: grid;
    gap: 10px;
    margin-block: 18px;
}

.cloud-config-wizard__summary > div {
    display: grid;
    grid-template-columns: minmax(7rem, 0.35fr) 1fr;
    gap: 12px;
    overflow-wrap: anywhere;
}

.cloud-config-wizard__summary dt {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-weight: 600;
}

.cloud-config-wizard__summary dd {
    margin: 0;
}

.cloud-config-wizard__actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px;
}

.cloud-config-wizard__status {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.8125rem;
}

@media (max-width: 600px) {
    .cloud-config-wizard__actions {
        align-items: flex-start;
    }

    .cloud-config-wizard__status {
        order: 3;
        flex-basis: 100%;
    }

    .cloud-config-wizard__summary > div {
        grid-template-columns: 1fr;
        gap: 2px;
    }
}

@media (prefers-reduced-motion: reduce) {
    .cloud-config-wizard,
    .cloud-config-wizard * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
