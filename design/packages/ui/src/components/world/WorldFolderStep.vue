<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCheckCircleOutline,
    mdiChevronDown,
    mdiChevronUp,
    mdiCloudDownloadOutline,
    mdiFolderOutline,
    mdiRefresh,
    mdiTrayArrowDown,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardItem,
    VCardSubtitle,
    VCardTitle,
    VIcon,
    VItem,
    VItemGroup,
    VProgressCircular,
    VTextField,
} from "vuetify/components";
import { useConfigHost } from "../config/configHost.js";
import { ReleaseDownloads, type DownloadBridge } from "../downloads/index.js";
import BedrockConversionNote from "./BedrockConversionNote.vue";
import DockerWorldSourcePanel from "./DockerWorldSourcePanel.vue";
import MinecraftWorldList from "./MinecraftWorldList.vue";
import SshWorldSourcePanel from "./SshWorldSourcePanel.vue";
import {
    pathForDroppedFile,
    resolveWorldCatalogBridge,
    type WorldCatalogBridge,
} from "./worldCatalog.js";
import { describeWorld, describeWorldProblem, type WorldInspection } from "./worldFolder.js";

/**
 * Step one: which world.
 *
 * The folder is checked before the wizard moves on, because the alternative is a
 * render that runs for a minute inside a Java process and then reports a missing
 * `level.dat`. Each way of getting it wrong has its own sentence and its own fix:
 * the `saves` folder holding several worlds, the `region` folder from inside one,
 * a dimension folder one level too deep, and a folder that is simply not a world.
 *
 * When this build has no way to read a folder, the step says exactly that instead
 * of showing a tick it did not earn.
 *
 * This is also where somebody who has no world at all is standing, so it is where the
 * release downloader belongs. A release of this project carries whole worlds and already
 * rendered maps, published in checksummed parts because they are far past the size a
 * single release asset may be, and a downloaded one is unpacked into a folder this step
 * can take exactly as if it had been picked from disk. It stays folded away behind a
 * disclosure: somebody who already has a world should not have to look at a repository
 * name to get past step one.
 */
const props = defineProps<{
    modelValue: string;
    inspection: WorldInspection;
    inspecting: boolean;
    /** True when the app can actually look inside a folder. */
    canInspect: boolean;
    /**
     * Injected in tests. Left out, the downloads surface probes the Electron bridge
     * itself, which is why this has no default: `undefined` means probe, `null` means
     * there is deliberately no bridge and the honest unsupported state is shown.
     */
    downloadBridge?: DownloadBridge | null;
    /**
     * The shell half that finds the worlds already on this machine.
     *
     * Same convention as `downloadBridge`: left out it probes the preload itself, and an
     * explicit `null` means there is deliberately none, in which case no list is rendered
     * at all and the path field, the picker and the drop target are exactly as they were.
     * That is the browser-tab case, and it must cost the manual route nothing.
     */
    catalogBridge?: WorldCatalogBridge | null;
    /**
     * The dimension the map will be drawn from, when the host lets this step choose it.
     *
     * Left out, the found dimensions are listed in the success note and nothing is chosen
     * here, which is what the project import dialog wants. The guide passes it, and the
     * dimensions the world actually has become three selectable cards under the note - the
     * same choice the next step's Dimension field makes, driving the same model.
     */
    dimensionKey?: string | undefined;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: string];
    /** Asks the shell to read the folder again, after a pick or a retry. */
    inspect: [folder: string];
    /** A dimension card was chosen. Only emitted when `dimensionKey` was passed. */
    chooseDimension: [key: string];
}>();

const { t } = useI18n();
const host = useConfigHost();

const path = computed<string>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const problems = computed(() =>
    props.inspection.problems.map((problem) => describeWorldProblem(problem, t)),
);
const summary = computed(() => describeWorld(props.inspection, t));
const good = computed(() => props.inspection.ok && !props.inspection.unchecked);

/**
 * Whether the downloader is on screen.
 *
 * Closed to start with, and `v-if` rather than `v-show`, because mounting it is what makes
 * it ask the main process what is already downloading. Doing that for everybody who opens
 * the wizard would be work nobody asked for; doing it when somebody opens this is exactly
 * when the answer matters.
 */
const downloadsOpen = ref(false);

/** True when the host lets this step choose the dimension, and there is something to choose. */
const choosesDimension = computed(
    () => props.dimensionKey !== undefined && good.value && props.inspection.dimensions.length > 0,
);

function onDimensionPicked(value: unknown): void {
    if (typeof value === "string" && value !== props.dimensionKey) emit("chooseDimension", value);
}

/**
 * Takes a downloaded folder as the world, and checks it like any other.
 *
 * The archive is unpacked into a folder of its own, and what is inside is whatever was
 * published: sometimes the world itself, sometimes a directory holding it. Nothing is
 * assumed either way. The folder is put in the field and inspected exactly as a picked one
 * is, so a downloaded archive that turns out to hold several worlds gets the same sentence
 * as a `saves` directory picked by hand, rather than a special case that guesses.
 */
function useDownloaded(folder: string): void {
    emit("update:modelValue", folder);
    emit("inspect", folder);
}

/**
 * Takes a just-converted Java copy as the world, and checks it like any other.
 *
 * `BedrockConversionNote` only emits this once Chunker's own output has been verified to
 * hold a real world - see `docs/bedrock-worlds.md`'s "nothing that looks like a world" - so
 * this trusts the folder exactly as much as a picked or dropped one: not at all, until this
 * step's own inspection says otherwise.
 */
function useConverted(folder: string): void {
    emit("update:modelValue", folder);
    emit("inspect", folder);
}

/** A fetched SSH world rejoins the ordinary local-folder path, including its real inspection. */
function useSshWorld(folder: string): void {
    emit("update:modelValue", folder);
    emit("inspect", folder);
}

/** A fetched Docker world rejoins the same real local-folder inspection path. */
function useDockerWorld(folder: string): void {
    emit("update:modelValue", folder);
    emit("inspect", folder);
}

async function browse(): Promise<void> {
    if (host === null) return;
    const chosen = await host.pickDirectory({
        title: t("world.folder.pick", "Choose the world folder, the one that contains level.dat"),
        ...(path.value.trim() === "" ? {} : { startIn: path.value.trim() }),
    });
    if (chosen === null) return;
    emit("update:modelValue", chosen);
    emit("inspect", chosen);
}

/* -------------------------------------------------------------------------- */
/* Finding the worlds already on this machine                                 */
/* -------------------------------------------------------------------------- */

/**
 * The catalog half of the shell, probed here rather than handed down.
 *
 * `undefined` means probe, which is what the running application does; an explicit `null`
 * is a test, or a browser tab, saying there is deliberately none. The list is then absent
 * and every manual route below is untouched, which is the point: somebody with one world
 * in an unusual place is an ordinary user, not a fallback case.
 */
const catalog = computed<WorldCatalogBridge | null>(() =>
    props.catalogBridge === undefined ? resolveWorldCatalogBridge() : props.catalogBridge,
);

/** A world chosen from the list is filled in and checked exactly like a typed one. */
function chooseWorld(folder: string): void {
    emit("update:modelValue", folder);
    emit("inspect", folder);
}

/* -------------------------------------------------------------------------- */
/* Dropping a folder on the step                                              */
/* -------------------------------------------------------------------------- */

/** True while something is being dragged over the target, so the target says so. */
const dragging = ref(false);
/** Why the last drop named nothing, when it named nothing. */
const dropFailure = ref<string | null>(null);

function onDragOver(event: DragEvent): void {
    // Both the over and the enter handler must cancel the event, or the browser keeps its
    // own default handling and the drop never reaches this component at all.
    event.preventDefault();
    dragging.value = true;
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
}

function onDragLeave(): void {
    dragging.value = false;
}

/**
 * Takes a folder dropped onto the step.
 *
 * Electron removed `File.path` in version 32, so the location of a dropped folder can
 * only come from the preload. When it cannot - a browser tab, or a drag out of another
 * application that carried bytes rather than a file - this says so rather than appearing
 * to accept the drop and doing nothing, which is the failure that reads as a bug.
 */
function onDrop(event: DragEvent): void {
    event.preventDefault();
    dragging.value = false;
    dropFailure.value = null;

    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file === null) {
        dropFailure.value = t(
            "world.folder.dropEmpty",
            "That drop carried no file or folder. Drag the world folder itself from your file manager.",
        );
        return;
    }

    const dropped = pathForDroppedFile(file);
    if (dropped === null) {
        dropFailure.value = t(
            "world.folder.dropUnsupported",
            "This build cannot tell where a dropped folder is. Use Browse, or type the full path in the field above.",
        );
        return;
    }

    emit("update:modelValue", dropped);
    emit("inspect", dropped);
}
</script>

<template>
    <section
        class="mb-world-step"
        data-tutorial-anchor="world-find"
        :aria-label="t('world.wizard.step.world', 'World')"
    >
        <h3 class="mb-world-step__title">{{ t("world.folder.question", "Which world?") }}</h3>
        <p class="mb-world-step__blurb">
            {{
                t(
                    "world.folder.blurb",
                    "Point this at a Minecraft save folder. That is the folder holding level.dat and a region folder: on a server it is usually called world, and in the game it lives under saves.",
                )
            }}
        </p>

        <!--
            The path field, labelled above itself and drawn in monospace because what it holds
            is a path, with the native picker beside it. Re-checking the same folder is the
            field's own trailing action rather than a third button in the row.
        -->
        <div class="mb-world-step__row">
            <v-text-field
                v-model="path"
                :label="t('world.folder.label', 'World folder')"
                :placeholder="t('world.folder.placeholder', 'the folder that contains level.dat')"
                :prepend-inner-icon="mdiFolderOutline"
                class="mb-world-step__path"
                variant="outlined"
                persistent-placeholder
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                hide-details="auto"
                @blur="emit('inspect', path)"
                @keydown.enter="emit('inspect', path)"
            >
                <template #append-inner>
                    <v-btn
                        :icon="mdiRefresh"
                        :aria-label="t('world.folder.recheck', 'Check this folder again')"
                        :title="t('world.folder.recheckShort', 'Check again')"
                        :disabled="!canInspect || path.trim() === '' || inspecting"
                        variant="text"
                        size="small"
                        @click="emit('inspect', path)"
                    />
                </template>
            </v-text-field>
            <v-btn
                :disabled="host === null"
                class="mb-world-step__browse"
                variant="outlined"
                color="primary"
                size="x-large"
                @click="browse"
            >
                {{ t("world.folder.browse", "Browse") }}
            </v-btn>
        </div>

        <p v-if="host === null" class="mb-world-step__hint">
            {{
                t(
                    "world.folder.noPicker",
                    "There is no folder picker in this build, so type or paste the full path. Local rendering needs the desktop app.",
                )
            }}
        </p>

        <!--
            The drop target. It sits beside the field and the picker rather than replacing
            either: three ways of naming the same folder, all of them equal, because a
            world on a USB stick or pulled off a server is a normal world and must need
            nothing configured first.
        -->
        <div
            class="mb-world-step__drop"
            :class="{ 'mb-world-step__drop--over': dragging }"
            @dragenter.prevent="dragging = true"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
        >
            <v-icon :icon="mdiTrayArrowDown" size="18" aria-hidden="true" />
            <span>
                {{
                    t(
                        "world.folder.dropHere",
                        "Or drag a world folder from your file manager and drop it here.",
                    )
                }}
            </span>
        </div>

        <v-alert
            v-if="dropFailure"
            type="warning"
            density="compact"
            variant="tonal"
            class="mt-3"
            role="alert"
        >
            {{ dropFailure }}
        </v-alert>

        <div v-if="inspecting" class="mb-world-step__checking" role="status" aria-live="polite">
            <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
            <span>{{ t("world.folder.checking", "Reading the folder...") }}</span>
        </div>

        <template v-else>
            <v-alert
                v-for="problem in problems"
                :key="problem.title"
                type="warning"
                density="compact"
                variant="tonal"
                class="mt-3"
            >
                <p class="mb-world-step__problem">{{ problem.title }}</p>
                <p v-if="problem.fix" class="mb-world-step__fix">{{ problem.fix }}</p>
            </v-alert>

            <v-alert
                v-if="!canInspect && path.trim() !== '' && problems.length === 0 && !good"
                type="info"
                density="compact"
                variant="tonal"
                class="mt-3"
            >
                {{
                    t(
                        "world.folder.cannotCheck",
                        "This build cannot look inside a folder, so the world is taken as given. If it is not a world, the render will say so when it starts.",
                    )
                }}
            </v-alert>

            <!--
                The world was read: a primary-container note with a check, saying what was
                found. The dimensions follow as cards when this step chooses one, and inline
                in the note when it does not.
            -->
            <v-alert
                v-if="good"
                :icon="mdiCheckCircleOutline"
                color="primary-container"
                density="comfortable"
                variant="flat"
                class="mb-world-step__found"
                role="status"
            >
                <span>{{ summary }}</span>
                <template v-if="!choosesDimension">
                    <span
                        v-for="dimension in inspection.dimensions"
                        :key="dimension.key"
                        class="mb-world-step__found-dimension"
                    >
                        {{ dimension.label }}
                        <span class="mb-world-step__count">
                            {{
                                t(
                                    "world.folder.regionCount",
                                    { n: dimension.regionFiles },
                                    "{n} regions",
                                )
                            }}
                        </span>
                    </span>
                </template>
            </v-alert>

            <v-item-group
                v-if="choosesDimension"
                :model-value="dimensionKey"
                mandatory
                class="mb-world-step__dimensions"
                role="radiogroup"
                :aria-label="t('world.identity.dimension', 'Dimension')"
                @update:model-value="onDimensionPicked"
            >
                <v-item
                    v-for="dimension in inspection.dimensions"
                    :key="dimension.key"
                    v-slot="{ isSelected, toggle }"
                    :value="dimension.key"
                >
                    <v-card
                        :color="isSelected ? 'primary-container' : undefined"
                        :variant="isSelected ? 'flat' : 'outlined'"
                        class="mb-world-step__dimension"
                        :class="{ 'mb-world-step__dimension--selected': isSelected }"
                        role="radio"
                        :aria-checked="isSelected ? 'true' : 'false'"
                        @click="toggle"
                    >
                        <v-card-item>
                            <v-card-title class="mb-world-step__dimension-name">
                                {{ dimension.label }}
                            </v-card-title>
                            <v-card-subtitle class="mb-world-step__dimension-meta">
                                {{
                                    t(
                                        "world.identity.regionCount",
                                        { n: dimension.regionFiles },
                                        "{n} region files on disk",
                                    )
                                }}
                            </v-card-subtitle>
                        </v-card-item>
                    </v-card>
                </v-item>
            </v-item-group>

            <BedrockConversionNote :folder="modelValue" @converted="useConverted" />
        </template>

        <MinecraftWorldList :model-value="modelValue" :bridge="catalog" @choose="chooseWorld" />

        <!--
            The other places a world can come from, as one row of outlined actions. Each
            opens its own panel below the row rather than in place, so the row keeps its
            shape whichever is open.
        -->
        <div class="mb-world-step__sources">
            <v-btn
                :prepend-icon="mdiCloudDownloadOutline"
                :append-icon="downloadsOpen ? mdiChevronUp : mdiChevronDown"
                :aria-expanded="downloadsOpen ? 'true' : 'false'"
                aria-controls="mb-world-step-downloads"
                variant="outlined"
                color="primary"
                @click="downloadsOpen = !downloadsOpen"
            >
                {{
                    downloadsOpen
                        ? t("world.folder.hideDownloads", "Hide the release downloads")
                        : t(
                              "world.folder.showDownloads",
                              "No world on this machine? Download one from a release",
                          )
                }}
            </v-btn>
            <SshWorldSourcePanel class="mb-world-step__source" as-action @use="useSshWorld" />
            <DockerWorldSourcePanel class="mb-world-step__source" as-action @use="useDockerWorld" />
            <slot name="actions" />
        </div>

        <ReleaseDownloads
            v-if="downloadsOpen"
            id="mb-world-step-downloads"
            class="mb-world-step__downloads"
            :bridge="downloadBridge"
            @use="useDownloaded"
        />
    </section>
</template>

<style>
.mb-world-step__title {
    margin: 0;
    font-size: var(--md-sys-typescale-title-large-size);
    font-weight: 500;
    line-height: var(--md-sys-typescale-title-large-line-height);
}

.mb-world-step__blurb,
.mb-world-step__fix {
    max-inline-size: 66ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.5;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.mb-world-step__blurb {
    margin-block: 8px 20px;
}

.mb-world-step__hint {
    margin-block: 8px 0;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 1.5;
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-world-step__problem {
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.5;
}

.mb-world-step__row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
}

.mb-world-step__row .v-text-field {
    flex: 1 1 260px;
    min-width: 0;
}

/* A path is drawn as a path. */
.mb-world-step__path input {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-medium-size);
}

.mb-world-step__path .v-field {
    background: rgb(var(--v-theme-surface));
}

.mb-world-step__browse.v-btn {
    min-block-size: 56px;
}

.mb-world-step__checking {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--md-sys-typescale-body-medium-size);
    margin-block-start: 12px;
}

.mb-world-step__found.v-alert {
    margin-block-start: 20px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.5;
}

.mb-world-step__found-dimension {
    display: inline-block;
    margin-inline-start: 8px;
    font-weight: 500;
}

.mb-world-step__count {
    margin-inline-start: 6px;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
}

/* Three selectable cards: the dimensions the world itself has. */
.mb-world-step__dimensions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-block-start: 16px;
}

.mb-world-step__dimension.v-card {
    border-radius: var(--md-sys-shape-corner-medium);
    cursor: pointer;
}

.mb-world-step__dimension.v-card--variant-outlined {
    border-color: rgb(var(--v-theme-outline-variant));
}

.mb-world-step__dimension--selected.v-card {
    outline: 1px solid rgb(var(--v-theme-primary));
    outline-offset: -1px;
}

.mb-world-step__dimension .v-card-item {
    padding: 14px 16px;
}

.mb-world-step__dimension-name.v-card-title {
    padding: 0;
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 500;
    line-height: 1.4;
}

.mb-world-step__dimension-meta.v-card-subtitle {
    padding: 0;
    margin-block-start: 2px;
    font-size: var(--md-sys-typescale-body-small-size);
    opacity: 1;
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-world-step__dimension--selected .mb-world-step__dimension-meta.v-card-subtitle {
    color: rgb(var(--v-theme-on-primary-container));
}

.mb-world-step__drop {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-block-start: 12px;
    padding: 12px;
    min-height: 48px;
    border: 1px dashed rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-medium);
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.mb-world-step__drop--over {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
}

/* The other places a world can come from: one row of outlined actions. */
.mb-world-step__sources {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 10px;
    margin-block-start: 18px;
}

.mb-world-step__sources > .v-btn {
    min-block-size: 44px;
}

.mb-world-step__downloads {
    margin-block-start: 16px;
}
</style>
