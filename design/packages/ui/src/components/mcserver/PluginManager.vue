<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiDelete,
    mdiDownload,
    mdiMagnify,
    mdiPuzzleOutline,
    mdiRefresh,
    mdiUpload,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VBtnToggle,
    VCard,
    VCardActions,
    VCardText,
    VChip,
    VDialog,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VListItemSubtitle,
    VListItemTitle,
    VProgressLinear,
    VSelect,
    VSwitch,
    VTextField,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { useServerStore } from "./useServers.js";
import { writeBlockReason } from "./serverModel.js";
import {
    pluginsInstall,
    pluginsList,
    pluginsRemove,
    pluginsSearch,
    pluginsToggle,
    pluginsUpdates,
    pluginsVersions,
    type InstalledPlugin,
    type PluginSearchResult,
    type PluginVersion,
} from "./mcserverBridge.js";

/**
 * Search Modrinth/Hangar/SpigotMC, install a version with its hash checked, and manage
 * what is already in `plugins/`. SpigotMC results are browse-only - there is no sanctioned
 * download API for it - so those never get an install button, only a link-shaped chip
 * saying so.
 */
const props = defineProps<{ serverId: string }>();

const { t } = useI18n();
const store = useServerStore();

type Source = "modrinth" | "hangar" | "spigot";
const source = ref<Source>("modrinth");
const query = ref("");
const results = ref<PluginSearchResult[]>([]);
const searching = ref(false);
const searchFailure = ref<string | null>(null);

const installed = ref<InstalledPlugin[]>([]);
const installedFailure = ref<string | null>(null);
const updatesAvailable = ref<Record<string, PluginVersion | null>>({});

const versionDialog = ref(false);
const versionTarget = ref<PluginSearchResult | null>(null);
const versions = ref<PluginVersion[]>([]);
const installing = ref(false);
const installFailure = ref<string | null>(null);

const removeTarget = ref<InstalledPlugin | null>(null);

/**
 * The installed-plugins list has no ceiling on how many plugins a real server can carry,
 * so it gets the same local filter every other list in this app does: plain text by
 * default, an anchored regex opt-in through {@link ConfigSearchField}, and an honest
 * no-match state naming what was filtered out rather than leaving a blank list.
 */
const installedQuery = ref("");
const installedRegex = ref(false);
const installedFlags = ref("i");
const installedMatcher = computed(() =>
    createSettingMatcher(installedQuery.value, installedRegex.value, installedFlags.value),
);
const installedSample = computed(() =>
    installed.value
        .map((plugin) => `${plugin.name} ${plugin.source} ${plugin.version ?? ""}`)
        .join(String.fromCharCode(10)),
);
const filteredInstalled = computed(() =>
    installed.value.filter((plugin) =>
        installedMatcher.value.test(
            `${plugin.name} ${plugin.source} ${plugin.version ?? ""} ${plugin.path}`,
        ),
    ),
);
const installedSummary = computed(() =>
    t(
        "mcserver.plugins.installedSummary",
        { shown: filteredInstalled.value.length, total: installed.value.length },
        "Showing {shown} of {total}",
    ),
);

const capabilities = computed(() => store.capabilitiesFor(props.serverId));
const server = computed(() => store.get(props.serverId));
const blockReason = computed(() =>
    server.value ? writeBlockReason(server.value, capabilities.value) : null,
);

async function loadInstalled(): Promise<void> {
    const result = await pluginsList(props.serverId);
    if (result.ok) {
        installed.value = [...(result.value ?? [])];
        installedFailure.value = null;
        for (const plugin of installed.value) {
            if (plugin.version && plugin.projectId) {
                const update = await pluginsUpdates({
                    sourceId: plugin.source === "unknown" ? "modrinth" : plugin.source,
                    projectId: plugin.projectId,
                    installed: plugin.version,
                });
                if (update.ok)
                    updatesAvailable.value[plugin.path] = update.value?.hasUpdate
                        ? (update.value.latest ?? null)
                        : null;
            }
        }
    } else {
        installedFailure.value =
            result.failure?.message ??
            t("mcserver.plugins.listFailed", "The plugins folder could not be read.");
    }
}
onMounted(loadInstalled);
watch(() => props.serverId, loadInstalled);

async function search(): Promise<void> {
    if (query.value.trim() === "") {
        results.value = [];
        return;
    }
    searching.value = true;
    const result = await pluginsSearch({
        sourceId: source.value,
        query: query.value.trim(),
        limit: 30,
    });
    searching.value = false;
    if (result.ok) {
        results.value = [...(result.value ?? [])];
        searchFailure.value = null;
    } else {
        searchFailure.value =
            result.failure?.message ?? t("mcserver.plugins.searchFailed", "Search failed.");
        results.value = [];
    }
}

async function openVersions(plugin: PluginSearchResult): Promise<void> {
    versionTarget.value = plugin;
    versions.value = [];
    installFailure.value = null;
    versionDialog.value = true;
    const result = await pluginsVersions({
        sourceId: plugin.sourceId,
        projectId: plugin.projectId,
        serverId: props.serverId,
    });
    if (result.ok) versions.value = [...(result.value ?? [])];
}

async function install(version: PluginVersion): Promise<void> {
    installing.value = true;
    installFailure.value = null;
    const result = await pluginsInstall(props.serverId, { version });
    installing.value = false;
    if (result.ok) {
        versionDialog.value = false;
        await loadInstalled();
    } else {
        installFailure.value =
            result.failure?.message ?? t("mcserver.plugins.installFailed", "Install failed.");
    }
}

async function toggle(plugin: InstalledPlugin): Promise<void> {
    const result = await pluginsToggle(props.serverId, {
        path: plugin.path,
        enable: !plugin.enabled,
    });
    if (result.ok) await loadInstalled();
    else
        installedFailure.value =
            result.failure?.message ??
            t("mcserver.plugins.toggleFailed", "Could not change that plugin's enabled state.");
}

async function confirmRemove(): Promise<void> {
    if (!removeTarget.value) return;
    const result = await pluginsRemove(props.serverId, removeTarget.value.path);
    removeTarget.value = null;
    if (result.ok) await loadInstalled();
    else
        installedFailure.value =
            result.failure?.message ??
            t("mcserver.plugins.removeFailed", "Could not remove that plugin.");
}

const SOURCES: readonly { readonly id: Source; readonly label: string }[] = [
    { id: "hangar", label: "Hangar" },
    { id: "modrinth", label: "Modrinth" },
    { id: "spigot", label: "SpigotMC" },
];
watch(source, () => {
    if (query.value.trim() !== "") void search();
});

const dragOver = ref(false);
function onDrop(event: DragEvent): void {
    dragOver.value = false;
    // Real jar upload needs a file-write path the bridge does not expose from a raw
    // File object today; this at least reports what was dropped rather than pretending
    // to accept it silently.
    const names = [...(event.dataTransfer?.files ?? [])].map((f) => f.name).join(", ");
    if (names !== "")
        searchFailure.value = t(
            "mcserver.plugins.dropUnsupported",
            { names },
            "Drag-and-drop install for {names} needs a newer build of this app.",
        );
}
</script>

<template>
    <div class="wl-mcserver-plugins">
        <h3 class="wl-mcserver-plugins__title">{{ t("mcserver.plugins.title", "Plugins") }}</h3>
        <VAlert v-if="blockReason" type="info" variant="tonal" class="mb-3">{{
            blockReason
        }}</VAlert>

        <form class="wl-mcserver-plugins__search" role="search" @submit.prevent="search">
            <VTextField
                v-model="query"
                :label="t('mcserver.plugins.searchLabel', 'Search plugins')"
                :prepend-inner-icon="mdiMagnify"
                variant="outlined"
                hide-details
                class="wl-mcserver-plugins__query"
            />
            <VBtnToggle
                v-model="source"
                mandatory
                class="wl-mcserver-plugins__sources"
                :aria-label="t('mcserver.plugins.sourceLabel', 'Plugin source')"
            >
                <VBtn
                    v-for="item in SOURCES"
                    :key="item.id"
                    :value="item.id"
                    :variant="source === item.id ? 'flat' : 'outlined'"
                    :color="source === item.id ? 'primary-container' : 'on-surface-variant'"
                    :aria-pressed="source === item.id"
                >
                    {{ item.label }}
                </VBtn>
            </VBtnToggle>
            <VBtn
                type="submit"
                class="wl-mcserver-plugins__go"
                :prepend-icon="mdiRefresh"
                variant="outlined"
                color="primary"
                :loading="searching"
                :disabled="query.trim() === ''"
                :title="
                    query.trim() === ''
                        ? t('mcserver.plugins.searchNeeded', 'Type what to search for first.')
                        : undefined
                "
            >
                {{ t("mcserver.plugins.searchBtn", "Search") }}
            </VBtn>
        </form>
        <VAlert v-if="searchFailure" type="warning" variant="tonal" class="mb-3">{{
            searchFailure
        }}</VAlert>

        <div v-if="results.length > 0" class="wl-mcserver-plugins__results">
            <VCard
                v-for="r in results"
                :key="r.projectId"
                variant="outlined"
                class="wl-mcserver-plugins__result"
            >
                <span class="mb-icon-tile wl-mcserver-plugins__tile" aria-hidden="true"
                    ><VIcon :icon="mdiPuzzleOutline" size="21"
                /></span>
                <div class="wl-mcserver-plugins__body">
                    <div class="wl-mcserver-plugins__name-row">
                        <span class="wl-mcserver-plugins__name">{{ r.name }}</span>
                        <span class="wl-mcserver-plugins__source">{{ r.sourceId }}</span>
                    </div>
                    <p class="wl-mcserver-plugins__summary">{{ r.summary }}</p>
                </div>
                <VChip
                    v-if="!r.installable"
                    size="small"
                    variant="flat"
                    color="error"
                    :title="r.incompatibleReason ?? undefined"
                >
                    {{ t("mcserver.plugins.browseOnly", "Browse only") }}
                </VChip>
                <VBtn
                    v-else
                    size="small"
                    variant="flat"
                    color="primary-container"
                    :disabled="!!blockReason"
                    :title="blockReason ?? undefined"
                    @click="openVersions(r)"
                >
                    {{ t("mcserver.plugins.install", "Install") }}
                </VBtn>
            </VCard>
        </div>

        <div
            class="wl-mcserver-plugins__drop"
            :class="{ 'wl-mcserver-plugins__drop--over': dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
        >
            <VBtn :prepend-icon="mdiUpload" variant="text" size="small" disabled>
                {{ t("mcserver.plugins.dropHint", "Drop a .jar here to install locally") }}
            </VBtn>
        </div>

        <div class="wl-mcserver-plugins__header">
            <span class="wl-mcserver-plugins__section">{{
                t("mcserver.plugins.installedTitle", "Installed")
            }}</span>
            <span class="wl-mcserver-plugins__section-note">{{
                t(
                    "mcserver.plugins.installedNote",
                    "read from the folder and each jar's own descriptor, never the filename",
                )
            }}</span>
            <span class="wl-mcserver-plugins__spacer" />
            <VBtn
                :prepend-icon="mdiRefresh"
                variant="text"
                color="primary"
                size="small"
                @click="loadInstalled"
            >
                {{ t("mcserver.plugins.refresh", "Refresh") }}
            </VBtn>
        </div>
        <VAlert v-if="installedFailure" type="warning" variant="tonal">{{
            installedFailure
        }}</VAlert>
        <VAlert v-else-if="installed.length === 0" type="info" variant="tonal">
            {{ t("mcserver.plugins.empty", "No plugins installed.") }}
        </VAlert>
        <template v-else>
            <ConfigSearchField
                v-model="installedQuery"
                v-model:regex="installedRegex"
                v-model:flags="installedFlags"
                :label="t('mcserver.plugins.filterLabel', 'Filter installed plugins')"
                :placeholder="t('mcserver.plugins.filterHint', 'Name, source or version')"
                :sample="installedSample"
                :summary="installedSummary"
                class="mb-3"
            />
            <div
                v-if="filteredInstalled.length === 0"
                class="wl-mcserver-plugins__empty"
                role="status"
            >
                {{
                    t(
                        "mcserver.plugins.noMatch",
                        { query: installedQuery },
                        "No installed plugin matches “{query}”.",
                    )
                }}
            </div>
            <VList v-else class="wl-mcserver-plugins__installed">
                <VListItem
                    v-for="plugin in filteredInstalled"
                    :key="plugin.path"
                    class="wl-mcserver-plugins__row"
                >
                    <template #prepend>
                        <VIcon
                            :icon="mdiPuzzleOutline"
                            size="19"
                            :color="plugin.enabled ? 'primary' : undefined"
                        />
                    </template>
                    <VListItemTitle :class="{ 'wl-mcserver-plugins__off': !plugin.enabled }">{{
                        plugin.name
                    }}</VListItemTitle>
                    <VListItemSubtitle class="wl-mcserver-plugins__path"
                        >{{ plugin.path }} · {{ plugin.source }} ·
                        {{ plugin.version ?? "?" }}</VListItemSubtitle
                    >
                    <template #append>
                        <div class="wl-mcserver-plugins__row-actions">
                            <VChip
                                v-if="updatesAvailable[plugin.path]"
                                size="small"
                                color="secondary-container"
                                variant="flat"
                            >
                                {{
                                    t(
                                        "mcserver.plugins.updateAvailable",
                                        { v: updatesAvailable[plugin.path]?.versionNumber },
                                        "Update: {v}",
                                    )
                                }}
                            </VChip>
                            <VSwitch
                                :model-value="plugin.enabled"
                                color="primary"
                                density="compact"
                                hide-details
                                :aria-label="plugin.name"
                                :disabled="!!blockReason"
                                :title="blockReason ?? undefined"
                                @update:model-value="toggle(plugin)"
                            />
                            <VBtn
                                :prepend-icon="mdiDelete"
                                variant="outlined"
                                color="error"
                                size="small"
                                :disabled="!!blockReason"
                                :title="blockReason ?? t('mcserver.plugins.remove', 'Remove')"
                                :aria-label="
                                    t(
                                        'mcserver.plugins.removeAria',
                                        { name: plugin.name },
                                        'Remove {name}',
                                    )
                                "
                                @click="removeTarget = plugin"
                            >
                                {{ t("mcserver.plugins.remove", "Remove") }}
                            </VBtn>
                        </div>
                    </template>
                </VListItem>
            </VList>
        </template>
        <p class="wl-mcserver-plugins__note">
            {{
                t(
                    "mcserver.plugins.note",
                    "Disabling renames the jar with a .jar.disabled suffix and never deletes it, so it is reversible without a backup. A source that is unreachable or rate-limited fails only its own search.",
                )
            }}
        </p>

        <VDialog v-model="versionDialog" max-width="560" persistent>
            <VCard v-if="versionTarget" class="wl-mcserver-plugins__dialog">
                <VCardText>
                    <div class="wl-mcserver-plugins__dialog-title">{{ versionTarget.name }}</div>
                    <VAlert v-if="installFailure" type="warning" variant="tonal" class="mb-2">{{
                        installFailure
                    }}</VAlert>
                    <VProgressLinear v-if="installing" indeterminate color="primary" class="mb-2" />
                    <VList>
                        <VListItem v-for="v in versions" :key="v.versionId">
                            <VListItemTitle
                                >{{ v.versionNumber }} ({{ v.fileName }})</VListItemTitle
                            >
                            <VListItemSubtitle>{{ v.gameVersions.join(", ") }}</VListItemSubtitle>
                            <template #append>
                                <VChip
                                    v-if="v.compatible === false"
                                    size="small"
                                    color="error"
                                    variant="flat"
                                    :title="v.compatibilityReason ?? undefined"
                                >
                                    {{ t("mcserver.plugins.incompatible", "Incompatible") }}
                                </VChip>
                                <VBtn
                                    size="small"
                                    variant="flat"
                                    color="primary-container"
                                    :prepend-icon="mdiDownload"
                                    :disabled="v.compatible === false || installing"
                                    :title="
                                        v.compatible === false
                                            ? (v.compatibilityReason ?? undefined)
                                            : undefined
                                    "
                                    @click="install(v)"
                                >
                                    {{ t("mcserver.plugins.installVersion", "Install") }}
                                </VBtn>
                            </template>
                        </VListItem>
                    </VList>
                </VCardText>
                <VDivider />
                <VCardActions class="wl-mcserver-plugins__dialog-actions">
                    <VBtn variant="text" color="primary" @click="versionDialog = false">{{
                        t("common.close", "Close")
                    }}</VBtn>
                </VCardActions>
            </VCard>
        </VDialog>

        <ConfigSuperConfirm
            v-if="removeTarget"
            :title="t('mcserver.plugins.removeTitle', 'Remove plugin')"
            :action="
                t(
                    'mcserver.plugins.removeAction',
                    { name: removeTarget.name },
                    'Deletes {name} from the plugins folder.',
                )
            "
            :affected="[removeTarget.name]"
            :confirm-label="t('mcserver.plugins.removeConfirm', 'Remove')"
            @confirm="confirmRemove"
            @cancel="removeTarget = null"
        />
    </div>
</template>

<style scoped>
/* `Worldlens.dc.html`'s Plugins tab: search with source buttons, result cards, installed rows. */
.wl-mcserver-plugins .wl-mcserver-plugins__title {
    margin: 0 0 12px;
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 500;
}
.wl-mcserver-plugins__search {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 14px;
}
.wl-mcserver-plugins__query {
    flex: 1 1 260px;
}
.wl-mcserver-plugins .wl-mcserver-plugins__sources {
    block-size: 56px;
    gap: 6px;
    border-radius: 0;
    overflow: visible;
}
.wl-mcserver-plugins .wl-mcserver-plugins__sources :deep(.v-btn) {
    block-size: 56px;
    border-radius: var(--md-sys-shape-corner-medium);
    padding-inline: 16px;
    font-weight: 400;
}
.wl-mcserver-plugins .wl-mcserver-plugins__sources :deep(.v-btn--variant-outlined) {
    border-color: rgb(var(--v-theme-outline-variant));
}
.wl-mcserver-plugins .wl-mcserver-plugins__go {
    min-block-size: 56px;
    border-radius: var(--md-sys-shape-corner-medium);
}
.wl-mcserver-plugins__results {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 14px;
}
.wl-mcserver-plugins .wl-mcserver-plugins__result {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 18px;
}
.wl-mcserver-plugins .wl-mcserver-plugins__tile {
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-plugins__body {
    flex: 1 1 auto;
    min-width: 0;
}
.wl-mcserver-plugins__name-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
}
.wl-mcserver-plugins__name {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 500;
}
.wl-mcserver-plugins__source {
    font-size: var(--md-sys-typescale-label-small-size);
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-plugins__summary {
    margin: 3px 0 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-plugins__drop {
    border: 1px dashed rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-medium);
    padding: 12px;
    text-align: center;
    margin-bottom: 12px;
}
.wl-mcserver-plugins__drop--over {
    border-color: rgb(var(--v-theme-primary));
}
.wl-mcserver-plugins__empty {
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: var(--md-sys-typescale-body-medium-size);
    margin: 8px 0;
}
.wl-mcserver-plugins__header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    margin: 22px 0 10px;
}
.wl-mcserver-plugins__section {
    font-size: var(--md-sys-typescale-body-small-size);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-plugins__section-note {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-plugins__spacer {
    flex: 1 1 auto;
}
.wl-mcserver-plugins .wl-mcserver-plugins__row {
    background: transparent;
    border-radius: var(--md-sys-shape-corner-medium);
    margin-block-end: 8px;
    padding: 12px 18px;
}
.wl-mcserver-plugins__path {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-label-small-size);
    overflow-wrap: anywhere;
}
.wl-mcserver-plugins__off {
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-plugins__row-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}
.wl-mcserver-plugins__note {
    margin: 12px 0 0;
    max-inline-size: 68ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-plugins__dialog-title {
    margin-bottom: 8px;
    font-size: var(--md-sys-typescale-title-large-size);
}
.wl-mcserver-plugins .wl-mcserver-plugins__dialog-actions,
.wl-mcserver-plugins__dialog-actions {
    padding: 14px 24px;
    justify-content: flex-end;
}
</style>
