<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCheckboxMultipleMarkedOutline,
    mdiEarth,
    mdiEject,
    mdiFolderOpenOutline,
    mdiFolderPlusOutline,
    mdiPencilOutline,
    mdiPlusCircleOutline,
    mdiRefresh,
    mdiSelectAll,
    mdiSelectInverse,
    mdiSelectOff,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckboxBtn,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VProgressCircular,
    VProgressLinear,
    VSpacer,
    VTextField,
} from "vuetify/components";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { useConfigHost } from "../config/configHost.js";
import { discoveredWorlds } from "./discoveredWorlds.js";
import {
    describeFolderOrigin,
    describeFolderResolution,
    describeFolderState,
    displayName,
    sortWorldsByLastPlayed,
    worldDetailLine,
    worldOptionName,
    worldSearchText,
    type MinecraftFolder,
    type MinecraftWorldSummary,
    type WorldCatalogBridge,
} from "../world/worldCatalog.js";

/**
 * Worlds this computer already has, that nobody has started a project for yet.
 *
 * `../world/worldCatalog.ts` and the main-process `world/mounts.ts` + `world/catalog.ts`
 * behind it are the one discovery system this application has - the default Minecraft
 * folder, every folder somebody has mounted, every world in each. This component is a
 * second *view* over that same system, not a second implementation of it: every folder read,
 * every world listed, every mount/unmount/rename action here calls exactly the bridge
 * methods `MinecraftWorldList.vue` (the wizard's own world picker) calls, and every fact
 * shown about a world - its name, size, version, seed, last played - is formatted by the
 * exact same pure functions from `worldCatalog.ts` that component uses.
 *
 * The two views differ because the interactions genuinely differ. The wizard picks exactly
 * one world to fill a field; this tab starts projects, potentially many at once, and needs
 * multi-select, a bulk action and a per-row context menu the wizard's simple listbox has no
 * use for - so this is its own template rather than the wizard's component wearing a second
 * hat. See `discoveredWorlds.ts` for the one piece of logic that is genuinely new here:
 * deciding which discovered worlds are not already a project.
 *
 * ## Available, not automatic
 *
 * Nothing here writes a project file on its own. A discovered world is offered, visibly
 * marked as not yet a project (a "not yet a project" pill, a secondary-container tile where
 * the projects list wears a primary-container one, and its own "Use" action rather than the
 * established list's "Open"), and a click routes into starting one. A single selection opens
 * the editor pre-filled and unsaved; a bulk selection asks the parent to take the user to one
 * of those pre-filled editors for review. Silently writing a project into every world folder
 * this computer can find would put settings nobody asked for on disk, which is the "built,
 * tested, unreachable" failure mode in reverse: a feature that acts without anybody triggering
 * it.
 */
const props = defineProps<{
    bridge: WorldCatalogBridge | null;
    /** The `world` path of every existing project, so its world is left out of this list. */
    projectWorlds: readonly string[];
}>();

const emit = defineEmits<{
    /** One world, chosen to start a project from. Opens the editor pre-filled, unsaved. */
    use: [world: string];
    /** Several worlds selected for an explicit, review-before-save start flow. */
    useMany: [worlds: readonly string[]];
    notify: [level: "info" | "success" | "warning" | "error", message: string];
}>();

const { t } = useI18n();
const host = useConfigHost();
const uid = useId();

/* -------------------------------------------------------------------------- */
/* Loading, exactly the pattern MinecraftWorldList.vue uses against the same  */
/* bridge: the folder list first, then each folder's worlds scanned in        */
/* parallel and reported as each one finishes.                                */
/* -------------------------------------------------------------------------- */

const folders = ref<readonly MinecraftFolder[]>([]);
const worldsByFolder = ref<Record<string, readonly MinecraftWorldSummary[]>>({});
const scanning = ref<readonly string[]>([]);
const scanFailures = ref<Record<string, string>>({});
const loadingFolders = ref(false);
const listFailure = ref<string | null>(null);

async function load(): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null) return;

    loadingFolders.value = true;
    listFailure.value = null;
    try {
        folders.value = await bridge.listMinecraftFolders();
    } catch (error) {
        listFailure.value = error instanceof Error ? error.message : String(error);
        folders.value = [];
        return;
    } finally {
        loadingFolders.value = false;
    }

    await Promise.all(folders.value.filter((folder) => folder.state === "ok").map(scan));
}

async function scan(folder: MinecraftFolder): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null) return;

    scanning.value = [...scanning.value, folder.id];
    try {
        const answer = await bridge.scanMinecraftFolder(folder.id);
        if (answer.ok) {
            worldsByFolder.value = { ...worldsByFolder.value, [folder.id]: answer.scan.worlds };
            const failures = { ...scanFailures.value };
            delete failures[folder.id];
            scanFailures.value = failures;
        } else {
            scanFailures.value = { ...scanFailures.value, [folder.id]: answer.message };
        }
    } catch (error) {
        scanFailures.value = {
            ...scanFailures.value,
            [folder.id]: error instanceof Error ? error.message : String(error),
        };
    } finally {
        scanning.value = scanning.value.filter((id) => id !== folder.id);
    }
}

onMounted(() => {
    void load();
});

defineExpose({ load });

const busy = computed(() => loadingFolders.value || scanning.value.length > 0);

/* -------------------------------------------------------------------------- */
/* Which worlds, and which of those are not already a project                 */
/* -------------------------------------------------------------------------- */

const labelsById = computed(() => {
    const labels: Record<string, string> = {};
    for (const folder of folders.value) labels[folder.id] = folder.label;
    return labels;
});

function labelFor(world: MinecraftWorldSummary): string | null {
    if (folders.value.length < 2) return null;
    return labelsById.value[world.folderId] ?? null;
}

const allWorlds = computed(() =>
    sortWorldsByLastPlayed(folders.value.flatMap((folder) => worldsByFolder.value[folder.id] ?? [])),
);

/** Every discovered world that is not already a project, deduplicated. See `discoveredWorlds.ts`. */
const available = computed(() => discoveredWorlds(allWorlds.value, props.projectWorlds));

/* -------------------------------------------------------------------------- */
/* This list's own search, wired to the full regex builder like every other   */
/* search surface.                                                            */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const shown = computed(() =>
    available.value.filter((world) => matcher.value.test(worldSearchText(world, labelFor(world), t))),
);

const sample = computed(() => available.value.map((world) => worldSearchText(world, labelFor(world), t)).join("\n"));

const summary = computed(() =>
    matcher.value.active
        ? t(
              "project.discovered.searchSummary",
              { shown: shown.value.length, total: available.value.length },
              "Showing {shown} of {total}",
          )
        : "",
);

const searchVisible = computed(() => available.value.length > 3 || query.value.length > 0);

function detailsOf(world: MinecraftWorldSummary): string {
    return worldDetailLine(world, labelFor(world), t);
}

function optionNameOf(world: MinecraftWorldSummary): string {
    return worldOptionName(world, labelFor(world), t);
}

function appearanceIdOf(world: MinecraftWorldSummary): string {
    return `discovered-world.${world.path}`;
}

/* -------------------------------------------------------------------------- */
/* Choosing several, the same shape ProjectList.vue's bulk selection uses     */
/* -------------------------------------------------------------------------- */

const chosen = ref<string[]>([]);

function isChosen(path: string): boolean {
    return chosen.value.includes(path);
}

function toggleChosen(path: string): void {
    chosen.value = isChosen(path) ? chosen.value.filter((candidate) => candidate !== path) : [...chosen.value, path];
}

function chooseAll(): void {
    chosen.value = shown.value.map((world) => world.path);
}

function chooseNone(): void {
    chosen.value = [];
}

function chooseInverse(): void {
    const visible = shown.value.map((world) => world.path);
    chosen.value = visible.filter((path) => !isChosen(path));
}

const bulkLabel = computed(() =>
    t("project.discovered.chosenCount", { chosen: chosen.value.length }, "{chosen} selected"),
);

function useMany(): void {
    if (chosen.value.length === 0) return;
    emit("useMany", chosen.value.slice());
    chosen.value = [];
}

/* -------------------------------------------------------------------------- */
/* The listbox, roving tabindex, focus separate from selection                */
/* -------------------------------------------------------------------------- */

const focusedPath = ref<string | null>(null);

const rovingPath = computed<string | null>(() => {
    const paths = shown.value.map((world) => world.path);
    if (focusedPath.value !== null && paths.includes(focusedPath.value)) return focusedPath.value;
    return paths[0] ?? null;
});

function optionId(path: string): string {
    return `${uid}-discovered-${encodeURIComponent(path)}`;
}

function noteFocus(path: string): void {
    focusedPath.value = path;
}

async function focusOption(path: string): Promise<void> {
    focusedPath.value = path;
    await nextTick(() => document.getElementById(optionId(path))?.focus());
}

const OPEN_KEY = "Enter";
const CHOOSE_KEY = " ";

function keyLabel(key: string): string {
    return key === " " ? "Space" : key;
}

function onOptionKeydown(event: KeyboardEvent, world: MinecraftWorldSummary): void {
    if (event.key === OPEN_KEY) {
        event.preventDefault();
        emit("use", world.path);
        return;
    }
    if (event.key === CHOOSE_KEY || event.key === "Spacebar") {
        event.preventDefault();
        toggleChosen(world.path);
        return;
    }

    const paths = shown.value.map((w) => w.path);
    const here = paths.indexOf(world.path);
    if (here === -1) return;

    let wanted: number;
    if (event.key === "ArrowDown") wanted = here + 1;
    else if (event.key === "ArrowUp") wanted = here - 1;
    else if (event.key === "Home") wanted = 0;
    else if (event.key === "End") wanted = paths.length - 1;
    else return;

    event.preventDefault();
    const target = paths[Math.min(Math.max(wanted, 0), paths.length - 1)];
    if (target !== undefined) void focusOption(target);
}

/* -------------------------------------------------------------------------- */
/* Mounted folders: mount, unmount, rename - the same bridge calls the        */
/* wizard's own world list makes, presented the same honest way.              */
/* -------------------------------------------------------------------------- */

const mountFailure = ref<string | null>(null);
const mountNotice = ref<string | null>(null);
const renaming = ref<string | null>(null);
const renameText = ref("");

async function browseForFolder(): Promise<void> {
    if (host === null || props.bridge === null) return;
    const chosenFolder = await host.pickDirectory({
        title: t("project.discovered.pick", "Choose a Minecraft folder, or the saves folder inside one"),
    });
    if (chosenFolder === null) return;
    await mount(chosenFolder);
}

async function mount(folder: string): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null) return;

    mountFailure.value = null;
    mountNotice.value = null;
    const answer = await bridge.mountMinecraftFolder(folder);
    if (!answer.ok) {
        mountFailure.value = answer.message;
        return;
    }
    mountNotice.value = answer.alreadyMounted
        ? t(
              "project.discovered.mountAlready",
              { label: answer.folder.label },
              "That folder is already in the list, as {label}. Its worlds are below.",
          )
        : describeFolderResolution(answer.folder, t);
    await load();
}

/**
 * Takes a folder off the list. Never touches a file: it rewrites the small JSON list of
 * mounted folders and nothing else. See `../world/mounts.ts` for the same guarantee on the
 * main-process side, and `MinecraftWorldList.vue` for the identical wording this mirrors.
 */
async function unmount(folder: MinecraftFolder): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null) return;
    await bridge.unmountMinecraftFolder(folder.id);
    mountNotice.value = t(
        "project.discovered.unmounted",
        { label: folder.label },
        "{label} is no longer in this list. Nothing on your disk was changed, and mounting it again brings it straight back.",
    );
    await load();
}

function startRenaming(folder: MinecraftFolder): void {
    renaming.value = folder.id;
    renameText.value = folder.label;
}

async function commitRename(folder: MinecraftFolder): Promise<void> {
    const bridge = props.bridge;
    renaming.value = null;
    if (bridge === null) return;
    await bridge.labelMinecraftFolder(folder.id, renameText.value);
    await load();
}

function originOf(folder: MinecraftFolder): string | null {
    return describeFolderOrigin(folder, t);
}

function stateOf(folder: MinecraftFolder): string | null {
    return describeFolderState(folder, t);
}

function isScanning(folder: MinecraftFolder): boolean {
    return scanning.value.includes(folder.id);
}

function worldCountOf(folder: MinecraftFolder): number {
    return (worldsByFolder.value[folder.id] ?? []).length;
}

function failureOf(folder: MinecraftFolder): string | null {
    return scanFailures.value[folder.id] ?? null;
}

/* -------------------------------------------------------------------------- */
/* The honest states: distinguish "still scanning", "no folders added",       */
/* "folders added but no worlds found", "every world already has a project"   */
/* and "no match for the search" - five different facts, five different       */
/* sentences.                                                                 */
/* -------------------------------------------------------------------------- */

const searchedPlaces = computed(() => folders.value.map((folder) => folder.savesPath).join(", "));

const noFoldersAtAll = computed(() => !busy.value && folders.value.length === 0);
const foldersButNoWorlds = computed(() => !busy.value && folders.value.length > 0 && allWorlds.value.length === 0);
const worldsButAllHaveProjects = computed(
    () => !busy.value && allWorlds.value.length > 0 && available.value.length === 0,
);
const noSearchMatch = computed(() => !busy.value && available.value.length > 0 && shown.value.length === 0);
</script>

<template>
    <v-card v-if="bridge !== null" class="mb-discovered" :aria-label="t('project.discovered.cardLabel', 'Worlds ready to use')">
        <v-card-title class="mb-discovered__head mb-responsive-card-title">
            <v-icon :icon="mdiEarth" aria-hidden="true" />
            <span class="mb-responsive-card-title__text">{{ t("project.discovered.title", "Worlds ready to use") }}</span>
            <span class="mb-responsive-card-title__actions">
                <v-btn class="mb-responsive-card-title__action" :prepend-icon="mdiRefresh" variant="text" size="small" :disabled="busy" @click="load">
                    {{ t("project.discovered.rescan", "Look again") }}
                </v-btn>
            </span>
        </v-card-title>

        <v-card-text>
            <p class="mb-lede">
                {{
                    t(
                        "project.discovered.blurb",
                        "Found automatically in the default Minecraft folder and in any folder you mount below. None of these has a project yet - choosing one starts one, without typing or browsing for the path.",
                    )
                }}
            </p>

            <!--
                The panel holds two lists - where it looked, and what it found - and the
                prototype separates every list from the one above it with a labelled rule
                rather than with whitespace and a heavier font. Without it the two run
                together into one undifferentiated column, which is most of why a card of
                rows reads as the old application even once the rows themselves are right.
            -->
            <div class="mb-section-rule">
                <span class="mb-section-label">{{ t("project.discovered.foldersSection", "Minecraft folders") }}</span>
            </div>

            <ul class="mb-discovered__mounts">
                <li v-for="folder in folders" :key="folder.id" class="mb-discovered__mount">
                    <span class="mb-icon-tile mb-discovered__mount-tile" aria-hidden="true">
                        <v-icon :icon="mdiFolderOpenOutline" size="21" />
                    </span>
                    <div class="mb-discovered__mount-body">
                        <div class="mb-discovered__mount-line">
                            <template v-if="renaming === folder.id">
                                <v-text-field
                                    v-model="renameText"
                                    :label="t('project.discovered.renameLabel', 'Name for this folder')"
                                    variant="outlined"
                                    density="compact"
                                    hide-details="auto"
                                    autofocus
                                    @keydown.enter="commitRename(folder)"
                                    @blur="commitRename(folder)"
                                />
                            </template>
                            <template v-else>
                                <span class="mb-discovered__mount-name">{{ folder.label }}</span>
                                <span v-if="folder.builtIn" class="mb-badge-pill">
                                    {{ t("project.discovered.detected", "found automatically") }}
                                </span>
                                <span class="mb-badge-pill mb-discovered__count-pill">
                                    {{
                                        isScanning(folder)
                                            ? t("project.discovered.scanning", "reading...")
                                            : t("project.discovered.worldCount", { n: worldCountOf(folder) }, "{n} worlds")
                                    }}
                                </span>
                                <v-progress-circular v-if="isScanning(folder)" indeterminate size="14" width="2" aria-hidden="true" />
                                <v-btn
                                    :icon="mdiPencilOutline"
                                    :aria-label="t('project.discovered.rename', { label: folder.label }, 'Rename {label}')"
                                    variant="text"
                                    size="x-small"
                                    density="comfortable"
                                    @click="startRenaming(folder)"
                                />
                                <v-btn
                                    v-if="!folder.builtIn"
                                    :prepend-icon="mdiEject"
                                    :aria-label="
                                        t(
                                            'project.discovered.unmountOne',
                                            { label: folder.label },
                                            'Unmount {label}. This only takes it out of this list and changes nothing on your disk.',
                                        )
                                    "
                                    variant="text"
                                    size="x-small"
                                    @click="unmount(folder)"
                                >
                                    {{ t("project.discovered.unmount", "Unmount") }}
                                </v-btn>
                            </template>
                        </div>
                        <p class="mb-path">{{ folder.savesPath }}</p>
                        <p v-if="originOf(folder)" class="mb-meta">{{ originOf(folder) }}</p>
                        <p v-if="stateOf(folder)" class="mb-discovered__mount-state">{{ stateOf(folder) }}</p>
                        <p v-if="failureOf(folder)" class="mb-discovered__mount-state">{{ failureOf(folder) }}</p>
                    </div>
                </li>
            </ul>

            <div class="mb-discovered__mount-actions">
                <v-btn
                    :prepend-icon="mdiFolderPlusOutline"
                    :disabled="host === null"
                    variant="tonal"
                    size="small"
                    @click="browseForFolder"
                >
                    {{ t("project.discovered.add", "Mount another Minecraft folder") }}
                </v-btn>
                <span class="mb-meta mb-discovered__hint">
                    {{
                        t(
                            "project.discovered.addHint",
                            "Point it at a Minecraft folder or at the saves folder inside one. A launcher root with several instances - like CurseForge's own folder - adds every instance found inside it. Unmounting later only takes it out of this list and never touches your worlds.",
                        )
                    }}
                </span>
            </div>

            <v-alert v-if="mountFailure" type="warning" density="compact" variant="tonal" class="mt-2" role="alert">
                {{ mountFailure }}
            </v-alert>
            <v-alert v-if="mountNotice" type="info" density="compact" variant="tonal" class="mt-2" role="status">
                {{ mountNotice }}
            </v-alert>
            <v-alert v-if="listFailure" type="warning" density="compact" variant="tonal" class="mt-2" role="alert">
                {{ listFailure }}
            </v-alert>

            <v-progress-linear v-if="busy" indeterminate color="primary" class="mb-2" />

            <!--
                The second rule heads the whole worlds group - its search, its bulk bar and
                its rows - rather than only the rows, because the search and the bulk actions
                act on this list and on nothing else on the panel. The count is held back
                while a scan is running: "0 worlds" beside a spinner is a number that is only
                true for as long as nobody has finished looking.
            -->
            <div class="mb-section-rule">
                <span class="mb-section-label">{{ t("project.discovered.worldsSection", "Worlds ready to use") }}</span>
                <span v-if="!busy" class="mb-meta mb-discovered__section-count">
                    {{ t("project.discovered.sectionCount", { n: available.length }, "{n} worlds") }}
                </span>
            </div>

            <div v-if="searchVisible" class="mb-discovered__search">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('project.discovered.searchLabel', 'Search these worlds')"
                    :placeholder="t('project.discovered.searchHint', 'a name, a version, a folder')"
                    :sample="sample"
                    :summary="summary"
                />
            </div>

            <!-- The bulk bar, once something is chosen. -->
            <div
                v-if="shown.length > 0"
                class="mb-discovered__bulk"
                role="group"
                :aria-label="t('project.discovered.bulkLabel', 'Actions on the chosen worlds')"
            >
                <span class="mb-discovered__bulkcount" aria-live="polite">{{ bulkLabel }}</span>
                <v-btn :prepend-icon="mdiSelectAll" variant="text" size="small" :disabled="shown.length === 0" @click="chooseAll">
                    {{ t("project.discovered.selectShown", { shown: shown.length }, "Select the {shown} shown") }}
                </v-btn>
                <v-btn :prepend-icon="mdiSelectInverse" variant="text" size="small" :disabled="shown.length === 0" @click="chooseInverse">
                    {{ t("project.discovered.selectInverse", "Invert") }}
                </v-btn>
                <v-btn :prepend-icon="mdiSelectOff" variant="text" size="small" :disabled="chosen.length === 0" @click="chooseNone">
                    {{ t("project.discovered.selectNone", "Clear the selection") }}
                </v-btn>
                <v-spacer />
                <v-btn
                    :prepend-icon="mdiCheckboxMultipleMarkedOutline"
                    color="primary"
                    variant="tonal"
                    size="small"
                    :disabled="chosen.length === 0"
                    @click="useMany"
                >
                    {{ t("project.discovered.useMany", { chosen: chosen.length }, "Start projects for {chosen} chosen") }}
                </v-btn>
            </div>

            <p v-if="busy" class="mb-discovered__status" role="status" aria-live="polite">
                <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
                <span>{{ t("project.discovered.scanningStatus", "Reading your Minecraft folders...") }}</span>
            </p>

            <p v-else-if="noFoldersAtAll" class="mb-lede mb-discovered__empty" role="status">
                {{
                    t(
                        "project.discovered.noFolders",
                        "No Minecraft folder was found on this computer. Mount one above if Minecraft lives somewhere unusual.",
                    )
                }}
            </p>

            <p v-else-if="foldersButNoWorlds" class="mb-lede mb-discovered__empty" role="status">
                {{
                    t(
                        "project.discovered.noWorlds",
                        { places: searchedPlaces },
                        "No worlds were found. It looked in: {places}. Mount another folder above if there is more to look at.",
                    )
                }}
            </p>

            <p v-else-if="worldsButAllHaveProjects" class="mb-lede mb-discovered__empty" role="status">
                {{
                    t(
                        "project.discovered.allHaveProjects",
                        "Every world this computer can find already has a project below. There is nothing new to start here.",
                    )
                }}
            </p>

            <p v-else-if="noSearchMatch" class="mb-lede mb-discovered__empty" role="status">
                {{ t("project.discovered.noMatch", "No world matches that search. Clearing it brings the whole list back.") }}
            </p>

            <div
                v-else
                class="mb-discovered__list"
                role="listbox"
                aria-multiselectable="true"
                :aria-label="t('project.discovered.listLabel', 'Worlds ready to use')"
            >
                <AppearanceTarget
                    v-for="world in shown"
                    :id="appearanceIdOf(world)"
                    :key="world.path"
                    :label="displayName(world)"
                    as="div"
                    role="presentation"
                    class="mb-discovered__rowhost"
                >
                    <div
                        class="mb-discovered__row"
                        :class="{ 'mb-discovered__row--chosen': isChosen(world.path) }"
                        @contextmenu="noteFocus(world.path)"
                    >
                        <v-checkbox-btn
                            :model-value="isChosen(world.path)"
                            :aria-label="t('project.discovered.choose', { name: displayName(world) }, 'Choose {name}')"
                            :tabindex="rovingPath === world.path ? 0 : -1"
                            density="compact"
                            hide-details
                            @update:model-value="toggleChosen(world.path)"
                        />
                        <div
                            :id="optionId(world.path)"
                            class="mb-discovered__option"
                            role="option"
                            :aria-selected="isChosen(world.path) ? 'true' : 'false'"
                            :aria-label="optionNameOf(world)"
                            :tabindex="rovingPath === world.path ? 0 : -1"
                            @click="emit('use', world.path)"
                            @focus="noteFocus(world.path)"
                            @keydown="onOptionKeydown($event, world)"
                        >
                            <!--
                                The tile is decoration and says nothing a screen reader has
                                not already been told by `optionNameOf`, so it is hidden from
                                one. It is what gives the list its rhythm: a column of bare
                                text lines is exactly what the old application looked like.
                            -->
                            <span class="mb-icon-tile mb-discovered__tile" aria-hidden="true">
                                <v-icon :icon="mdiEarth" size="21" />
                            </span>
                            <span class="mb-discovered__text">
                                <span class="mb-discovered__nameline">
                                    <span class="mb-discovered__name">{{ displayName(world) }}</span>
                                    <span class="mb-badge-pill">
                                        {{ t("project.discovered.notYetChip", "not yet a project") }}
                                    </span>
                                    <span class="mb-meta mb-discovered__subtitle">{{ detailsOf(world) }}</span>
                                </span>
                                <!--
                                    Two worlds can carry the same name in two different
                                    installs, and the path is the only thing on the row that
                                    tells them apart. `optionNameOf` is unchanged and does
                                    not speak it, so this is a visual disambiguator rather
                                    than a fact only shown here: `worldSearchText` already
                                    matches on the path, so a search finds it either way.
                                -->
                                <span class="mb-path">{{ world.path }}</span>
                            </span>
                        </div>
                        <span class="mb-discovered__actions">
                            <v-btn
                                :prepend-icon="mdiPlusCircleOutline"
                                variant="text"
                                size="small"
                                :tabindex="rovingPath === world.path ? 0 : -1"
                                :aria-label="t('project.discovered.useOne', { name: displayName(world) }, 'Start a project for {name}')"
                                @click="emit('use', world.path)"
                            >
                                {{ t("project.discovered.use", "Use") }}
                            </v-btn>
                        </span>
                    </div>

                    <template #menu="{ close }">
                        <v-list density="compact" :aria-label="t('project.discovered.rowMenuLabel', 'What this world can do')">
                            <v-list-item
                                :prepend-icon="mdiPlusCircleOutline"
                                :title="t('project.discovered.menuUse', 'Start a project for this world')"
                                @click="
                                    () => {
                                        close();
                                        emit('use', world.path);
                                    }
                                "
                            >
                                <template #append>
                                    <kbd class="mb-discovered__kbd">{{ t("project.discovered.key.use", keyLabel(OPEN_KEY)) }}</kbd>
                                </template>
                            </v-list-item>
                            <v-list-item
                                :prepend-icon="mdiSelectAll"
                                :title="
                                    isChosen(world.path)
                                        ? t('project.discovered.menuUnchoose', 'Take it out of the selection')
                                        : t('project.discovered.menuChoose', 'Add it to the selection')
                                "
                                @click="
                                    () => {
                                        close();
                                        toggleChosen(world.path);
                                    }
                                "
                            >
                                <template #append>
                                    <kbd class="mb-discovered__kbd">{{ t("project.discovered.key.choose", keyLabel(CHOOSE_KEY)) }}</kbd>
                                </template>
                            </v-list-item>
                        </v-list>
                        <v-divider class="my-1" />
                    </template>
                </AppearanceTarget>
            </div>
        </v-card-text>
    </v-card>
</template>

<style scoped>
/*
 * The card's own shape, tint and outline are deliberately absent: `styles/prototypeSurface.scss`
 * states them once for every card in the application, and a 16px radius stated a second time
 * here would leave this one card a corner out of step the next time that sheet moves.
 *
 * What was here was a dashed primary border, on the reasoning that a discovered world is
 * available rather than configured and the border should say so before a word is read. The
 * prototype draws no dashed border anywhere, and the distinction it does draw is carried
 * further down this file instead: this panel's rows wear a secondary-container tile against
 * the projects list's primary-container one, and every row carries the "not yet a project"
 * pill. That is the same statement in the design's own vocabulary rather than in a border
 * style it has no other example of.
 */
.mb-discovered {
    inline-size: 100%;
}

.mb-discovered__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    /*
     * `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
     * white-space: nowrap` for a single-line block title. Flexing it (above) leaves
     * all three in place: `overflow: hidden` still clips, and the inherited `nowrap`
     * means the title cannot wrap even though it now shares its row with the "Look
     * again" button - so the bilingual title was silently cut off with no ellipsis and
     * no indication anything was missing. Same fix as `DockerWorldSourcePanel.vue`'s
     * `.mb-docker-world__card > .v-card-title`.
     */
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
}

/*
 * The prose is `mb-lede` and `mb-meta` now, so its size and colour come from the one sheet.
 * The empty states keep a rule of their own only for the space they need above the rule that
 * follows them - `mb-lede` sets a shared bottom margin and knows nothing about what a
 * particular screen puts underneath it.
 */
.mb-lede.mb-discovered__empty {
    margin-block: 4px 0;
}

/*
 * The mount rows put the path and the origin note in paragraphs, and neither `mb-path` nor
 * `mb-meta` resets a margin - they are used inside spans elsewhere, where there is none to
 * reset. Left alone the browser's own `1em` paragraph margin would open a gap the row's 3px
 * gap was chosen to close.
 */
.mb-discovered__mount-body > p {
    margin: 0;
}

.mb-discovered__hint {
    /* Beside the mount button rather than under it, so it takes the leftover width. */
    flex: 1 1 18rem;
    min-inline-size: 0;
    text-wrap: pretty;
}

/*
 * The count sits to the right of `mb-section-rule`'s hairline. The hairline is that class's
 * own `::after`, which is the last flex item by definition, so a count written into the
 * markup lands to the *left* of it and squashes up against the label. `order: 1` is the one
 * line that puts a real element after a generated one, and it is why the count can be
 * markup - which the search summary and the funny-level styling can reach - rather than more
 * generated content that neither can.
 */
.mb-discovered__section-count {
    order: 1;
}

/*
 * Both lists on this panel - where it looked, and what it found - are drawn as the same
 * prototype row, because they are the same kind of thing to look at and giving them two
 * treatments is how a card ends up reading as two half-finished screens.
 */
.mb-discovered__mounts {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-block: 0 10px;
    padding: 0;
    list-style: none;
}

.mb-discovered__mount {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 15px 18px;
    border-radius: 14px;
    background: rgb(var(--v-theme-surface-container));
    border: 1px solid rgb(var(--v-theme-outline-variant));
}

/*
 * Doubled up on `.mb-icon-tile` rather than written alone. The shared tile rule is
 * `.v-application .mb-icon-tile`, which is two classes deep on purpose; a single scoped class
 * here would tie on specificity and be decided by whichever stylesheet the bundler happened
 * to emit second, which is exactly the silent failure this design's own notes warn about.
 */
.mb-icon-tile.mb-discovered__mount-tile {
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.mb-discovered__mount-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    /* The prototype's 3px between a row's name line and the line under it. */
    gap: 3px;
    /* Without this the monospace path refuses to shrink and pushes the row wider. */
    min-inline-size: 0;
}

.mb-discovered__mount-line {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.mb-discovered__mount-name {
    font-size: 15px;
    font-weight: 500;
    line-height: 22px;
    overflow-wrap: anywhere;
}

/*
 * The second pill on a mount row states a count, not a state, and the two were told apart by
 * a chip variant before this. Re-tinting the shared pill keeps them distinguishable without a
 * second pill shape, and the same specificity doubling applies as for the tile above.
 */
.mb-badge-pill.mb-discovered__count-pill {
    background: rgb(var(--v-theme-surface-container-highest));
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-discovered__mount-state {
    margin: 0;
    font-size: 12px;
    line-height: 18px;
    color: rgb(var(--v-theme-warning));
    text-wrap: pretty;
}

.mb-discovered__mount-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 4px;
}

.mb-discovered__search {
    margin-block: 8px;
    max-width: 460px;
}

.mb-discovered__bulk {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block: 8px;
}

.mb-discovered__bulkcount {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-discovered__status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
    margin-block-start: 12px;
}

.mb-discovered__list {
    display: flex;
    flex-direction: column;
    /* The prototype's own gap between rows. At 2px the rows read as one ruled block. */
    gap: 10px;
}

.mb-discovered__rowhost {
    display: block;
}

/*
 * The row is the card now, not the option inside it. Everything the prototype states about a
 * row - its 15px/18px padding, its 14px corner, its container tint and its hairline outline -
 * belongs to the whole row rather than to the part of it that happens to be clickable, so the
 * checkbox and the Use button sit inside the same surface as the name instead of floating
 * either side of a separately-tinted middle.
 */
.mb-discovered__row {
    display: flex;
    align-items: center;
    /* Narrower than the 16px inside the option: the checkbox and the button are chrome. */
    gap: 12px;
    padding: 15px 18px;
    border-radius: 14px;
    background: rgb(var(--v-theme-surface-container));
    border: 1px solid rgb(var(--v-theme-outline-variant));
}

.mb-discovered__row:hover {
    background: rgb(var(--v-theme-surface-container-high));
}

/*
 * Chosen is a bound class rather than `:has([aria-selected="true"])` because nothing else in
 * this package relies on `:has` yet, and a selection highlight that silently does nothing on
 * an engine that does not support it is the kind of failure a screenshot never catches. The
 * option's own `aria-selected` remains the thing that actually reports the choice.
 */
.mb-discovered__row--chosen {
    background: rgb(var(--v-theme-surface-container-high));
    border-color: rgb(var(--v-theme-primary));
}

.mb-discovered__option {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 16px;
    /* The tile alone is 40px, so this only guards a row whose tile fails to load. */
    min-block-size: 40px;
    min-inline-size: 0;
    border-radius: 12px;
    cursor: pointer;
}

/*
 * Outside the option's own box rather than inside it: the option no longer has padding of its
 * own, so an inset ring would be drawn through the name. There is 15px of row padding above
 * and below to hold it.
 */
.mb-discovered__option:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-icon-tile.mb-discovered__tile {
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.mb-discovered__text {
    display: flex;
    flex: 1 1 auto;
    min-inline-size: 0;
    flex-direction: column;
    gap: 3px;
}

/*
 * Baseline rather than centre, so the 15px name, the 11px pill and the 12px meta sit on one
 * line rather than three centres of three different heights. It wraps because the meta line
 * is a sentence in bilingual mode and a row that cannot wrap is a row that clips.
 */
.mb-discovered__nameline {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 10px;
    min-inline-size: 0;
}

.mb-discovered__name {
    font-size: 15px;
    font-weight: 500;
    line-height: 22px;
    overflow-wrap: anywhere;
}

.mb-discovered__subtitle {
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

.mb-discovered__actions {
    display: inline-flex;
    flex: 0 0 auto;
}

.mb-discovered__kbd {
    padding: 1px 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
    border-radius: 4px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

@media (max-width: 600px) {
    .mb-discovered__bulk {
        gap: 4px;
    }

    /*
     * The prototype's row is a single line of tile, text and action, and it was drawn at a
     * comfortable width. The tile and the 18px of side padding it introduced cost about a
     * hundred pixels of the text's own room, which a narrow window plus a bilingual "Use"
     * label spends entirely - so at this width the action is allowed to drop beneath the
     * text rather than squeeze it. `12rem` is the point at which the name and the meta line
     * stop being worth reading side by side; below it they get the whole row.
     */
    .mb-discovered__row {
        flex-wrap: wrap;
    }

    .mb-discovered__option {
        flex: 1 1 12rem;
    }

    .mb-discovered__actions {
        margin-inline-start: auto;
    }
}
</style>
