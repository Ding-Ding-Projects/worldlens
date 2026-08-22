<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDelete, mdiDownload, mdiPuzzleOutline, mdiRefresh, mdiUpload } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VChip,
    VDialog,
    VDivider,
    VList,
    VListItem,
    VListItemSubtitle,
    VListItemTitle,
    VProgressLinear,
    VSelect,
    VSwitch,
    VTab,
    VTabs,
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
const installedMatcher = computed(() => createSettingMatcher(installedQuery.value, installedRegex.value, installedFlags.value));
const installedSample = computed(() => installed.value.map((plugin) => `${plugin.name} ${plugin.source} ${plugin.version ?? ""}`).join(String.fromCharCode(10)));
const filteredInstalled = computed(() =>
    installed.value.filter((plugin) => installedMatcher.value.test(`${plugin.name} ${plugin.source} ${plugin.version ?? ""} ${plugin.path}`)),
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
const blockReason = computed(() => (server.value ? writeBlockReason(server.value, capabilities.value) : null));

async function loadInstalled(): Promise<void> {
    const result = await pluginsList(props.serverId);
    if (result.ok) {
        installed.value = [...(result.value ?? [])];
        installedFailure.value = null;
        for (const plugin of installed.value) {
            if (plugin.version && plugin.projectId) {
                const update = await pluginsUpdates({ sourceId: plugin.source === "unknown" ? "modrinth" : plugin.source, projectId: plugin.projectId, installed: plugin.version });
                if (update.ok) updatesAvailable.value[plugin.path] = update.value?.hasUpdate ? (update.value.latest ?? null) : null;
            }
        }
    } else {
        installedFailure.value = result.failure?.message ?? t("mcserver.plugins.listFailed", "The plugins folder could not be read.");
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
    const result = await pluginsSearch({ sourceId: source.value, query: query.value.trim(), limit: 30 });
    searching.value = false;
    if (result.ok) {
        results.value = [...(result.value ?? [])];
        searchFailure.value = null;
    } else {
        searchFailure.value = result.failure?.message ?? t("mcserver.plugins.searchFailed", "Search failed.");
        results.value = [];
    }
}

async function openVersions(plugin: PluginSearchResult): Promise<void> {
    versionTarget.value = plugin;
    versions.value = [];
    installFailure.value = null;
    versionDialog.value = true;
    const result = await pluginsVersions({ sourceId: plugin.sourceId, projectId: plugin.projectId, serverId: props.serverId });
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
        installFailure.value = result.failure?.message ?? t("mcserver.plugins.installFailed", "Install failed.");
    }
}

async function toggle(plugin: InstalledPlugin): Promise<void> {
    const result = await pluginsToggle(props.serverId, { path: plugin.path, enable: !plugin.enabled });
    if (result.ok) await loadInstalled();
    else installedFailure.value = result.failure?.message ?? t("mcserver.plugins.toggleFailed", "Could not change that plugin's enabled state.");
}

async function confirmRemove(): Promise<void> {
    if (!removeTarget.value) return;
    const result = await pluginsRemove(props.serverId, removeTarget.value.path);
    removeTarget.value = null;
    if (result.ok) await loadInstalled();
    else installedFailure.value = result.failure?.message ?? t("mcserver.plugins.removeFailed", "Could not remove that plugin.");
}

const dragOver = ref(false);
function onDrop(event: DragEvent): void {
    dragOver.value = false;
    // Real jar upload needs a file-write path the bridge does not expose from a raw
    // File object today; this at least reports what was dropped rather than pretending
    // to accept it silently.
    const names = [...(event.dataTransfer?.files ?? [])].map((f) => f.name).join(", ");
    if (names !== "") searchFailure.value = t("mcserver.plugins.dropUnsupported", { names }, "Drag-and-drop install for {names} needs a newer build of this app.");
}
</script>

<template>
    <div class="wl-mcserver-plugins">
        <div class="text-subtitle-1 mb-2">{{ t("mcserver.plugins.title", "Plugins") }}</div>
        <VAlert v-if="blockReason" type="info" variant="tonal" class="mb-2">{{ blockReason }}</VAlert>

        <VTabs v-model="source">
            <VTab value="modrinth">Modrinth</VTab>
            <VTab value="hangar">Hangar</VTab>
            <VTab value="spigot">SpigotMC</VTab>
        </VTabs>

        <div class="wl-mcserver-plugins__search">
            <VTextField
                v-model="query"
                :label="t('mcserver.plugins.searchLabel', 'Search plugins')"
                density="compact"
                hide-details
                @keydown.enter="search"
            />
            <VBtn :prepend-icon="mdiRefresh" variant="tonal" :loading="searching" @click="search">
                {{ t("mcserver.plugins.searchBtn", "Search") }}
            </VBtn>
        </div>
        <VAlert v-if="searchFailure" type="warning" variant="tonal" class="my-2">{{ searchFailure }}</VAlert>

        <VList v-if="results.length > 0" class="mb-4">
            <VListItem v-for="r in results" :key="r.projectId">
                <VListItemTitle>{{ r.name }}</VListItemTitle>
                <VListItemSubtitle>{{ r.summary }}</VListItemSubtitle>
                <template #append>
                    <VChip v-if="!r.installable" size="small" variant="tonal" color="warning" :title="r.incompatibleReason ?? undefined">
                        {{ t("mcserver.plugins.browseOnly", "Browse only") }}
                    </VChip>
                    <VBtn
                        v-else
                        size="small"
                        variant="tonal"
                        color="primary"
                        :disabled="!!blockReason"
                        :title="blockReason ?? undefined"
                        @click="openVersions(r)"
                    >
                        {{ t("mcserver.plugins.install", "Install") }}
                    </VBtn>
                </template>
            </VListItem>
        </VList>

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

        <VDivider class="my-3" />
        <div class="wl-mcserver-plugins__header">
            <div class="text-subtitle-2">{{ t("mcserver.plugins.installedTitle", "Installed") }}</div>
            <VBtn :prepend-icon="mdiRefresh" variant="text" size="small" @click="loadInstalled">
                {{ t("mcserver.plugins.refresh", "Refresh") }}
            </VBtn>
        </div>
        <VAlert v-if="installedFailure" type="warning" variant="tonal">{{ installedFailure }}</VAlert>
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
                class="mb-2"
            />
            <div v-if="filteredInstalled.length === 0" class="wl-mcserver-plugins__empty" role="status">
                {{ t("mcserver.plugins.noMatch", { query: installedQuery }, "No installed plugin matches “{query}”.") }}
            </div>
        <VList v-else>
            <VListItem v-for="plugin in filteredInstalled" :key="plugin.path">
                <template #prepend>
                    <VChip size="small" color="primary" variant="tonal">{{ plugin.source }}</VChip>
                </template>
                <VListItemTitle>{{ plugin.name }}</VListItemTitle>
                <VListItemSubtitle>{{ plugin.version ?? "?" }}</VListItemSubtitle>
                <template #append>
                    <VChip v-if="updatesAvailable[plugin.path]" size="small" color="info" variant="tonal">
                        {{ t("mcserver.plugins.updateAvailable", { v: updatesAvailable[plugin.path]?.versionNumber }, "Update: {v}") }}
                    </VChip>
                    <VSwitch
                        :model-value="plugin.enabled"
                        density="compact"
                        hide-details
                        :disabled="!!blockReason"
                        :title="blockReason ?? undefined"
                        @update:model-value="toggle(plugin)"
                    />
                    <VBtn
                        :icon="mdiDelete"
                        variant="text"
                        size="small"
                        :disabled="!!blockReason"
                        :title="blockReason ?? t('mcserver.plugins.remove', 'Remove')"
                        :aria-label="t('mcserver.plugins.removeAria', { name: plugin.name }, 'Remove {name}')"
                        @click="removeTarget = plugin"
                    />
                </template>
            </VListItem>
        </VList>
        </template>

        <VDialog v-model="versionDialog" max-width="480" persistent>
            <VCard v-if="versionTarget">
                <VCardText>
                    <div class="text-subtitle-1 mb-2">{{ versionTarget.name }}</div>
                    <VAlert v-if="installFailure" type="warning" variant="tonal" class="mb-2">{{ installFailure }}</VAlert>
                    <VProgressLinear v-if="installing" indeterminate class="mb-2" />
                    <VList>
                        <VListItem v-for="v in versions" :key="v.versionId">
                            <VListItemTitle>{{ v.versionNumber }} ({{ v.fileName }})</VListItemTitle>
                            <VListItemSubtitle>{{ v.gameVersions.join(", ") }}</VListItemSubtitle>
                            <template #append>
                                <VChip v-if="v.compatible === false" size="small" color="error" variant="tonal" :title="v.compatibilityReason ?? undefined">
                                    {{ t("mcserver.plugins.incompatible", "Incompatible") }}
                                </VChip>
                                <VBtn
                                    size="small"
                                    variant="tonal"
                                    color="primary"
                                    :prepend-icon="mdiDownload"
                                    :disabled="v.compatible === false || installing"
                                    @click="install(v)"
                                >
                                    {{ t("mcserver.plugins.installVersion", "Install") }}
                                </VBtn>
                            </template>
                        </VListItem>
                    </VList>
                </VCardText>
                <VCardActions>
                    <VBtn variant="text" @click="versionDialog = false">{{ t("common.close", "Close") }}</VBtn>
                </VCardActions>
            </VCard>
        </VDialog>

        <ConfigSuperConfirm
            v-if="removeTarget"
            :title="t('mcserver.plugins.removeTitle', 'Remove plugin')"
            :action="t('mcserver.plugins.removeAction', { name: removeTarget.name }, 'Deletes {name} from the plugins folder.')"
            :affected="[removeTarget.name]"
            :confirm-label="t('mcserver.plugins.removeConfirm', 'Remove')"
            @confirm="confirmRemove"
            @cancel="removeTarget = null"
        />
    </div>
</template>

<style scoped>
.wl-mcserver-plugins__search {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 12px 0;
}
.wl-mcserver-plugins__search :deep(.v-input) {
    flex: 1 1 auto;
}
.wl-mcserver-plugins__drop {
    border: 1px dashed rgba(128, 128, 128, 0.4);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
    margin-bottom: 12px;
}
.wl-mcserver-plugins__drop--over {
    border-color: rgb(var(--v-theme-primary));
}
.wl-mcserver-plugins__empty {
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: 0.875rem;
    margin: 8px 0;
}
.wl-mcserver-plugins__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}
</style>
