<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiRefresh, mdiStopCircleOutline, mdiPlayCircleOutline, mdiRestart, mdiDeleteOutline } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VChip, VProgressLinear, VTextField } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import { resolveDockerHostingBridge, type DockerHostingBridge, type DockerHostingContainer, type DockerHostingEvent, type DockerHostingOperation, type DockerHostingSnapshot } from "./dockerHostingBridge.js";

const props = defineProps<{ bridge?: DockerHostingBridge | null }>();
const { t } = useI18n();
const bridge = props.bridge === undefined ? resolveDockerHostingBridge() : props.bridge;
const snapshot = ref<DockerHostingSnapshot | null>(null);
const query = ref("");
const regex = ref(false);
const flags = ref("i");
const regexError = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const operationId = ref<string | null>(null);
const operation = ref<DockerHostingOperation | null>(null);
const progress = ref<{ phase: string; message: string; done: number; total: number } | null>(null);
const logLines = ref<string[]>([]);
const cancelBusy = ref(false);
const selectedIds = ref<string[]>([]);
let unsubscribe: (() => void) | null = null;

const owned = computed(() => (snapshot.value?.containers ?? []).filter((container) => container.owned));
const selected = computed(() => owned.value.filter((container) => selectedIds.value.includes(container.id)));
const shown = computed(() => {
    const text = query.value.trim();
    const matcher = createSettingMatcher(text, regex.value, flags.value);
    regexError.value = matcher.error;
    return owned.value.filter((container) => matcher.test(`${container.name} ${container.image} ${container.status}`));
});

async function refresh(): Promise<void> {
    if (bridge === null || loading.value) return;
    loading.value = true; error.value = null;
    try {
        const result = await bridge.inspect();
        if (result.ok) snapshot.value = result.snapshot; else error.value = result.failure.message;
    } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
    finally { loading.value = false; }
}

async function mutate(container: DockerHostingContainer, kind: DockerHostingOperation): Promise<void> {
    if (bridge === null || operationId.value !== null) return;
    error.value = null; operation.value = kind; progress.value = null; logLines.value = [];
    try {
        let authorization: string | undefined;
        if (kind === "stop" || kind === "remove") {
            const grant = kind === "remove"
                ? await bridge.removeToken(container.id)
                : await bridge.authorize({ operation: "stop", containerId: container.id });
            if (!grant.ok) { error.value = grant.failure.message; return; }
            authorization = grant.token;
        }
        const result = await bridge.mutate({ operation: kind, containerId: container.id, ...(authorization === undefined ? {} : { authorization }) });
        if (result.ok) snapshot.value = result.snapshot; else error.value = result.failure.message;
    } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
    finally { operation.value = null; operationId.value = null; progress.value = null; }
}

async function cancel(): Promise<void> { if (bridge === null || operationId.value === null || cancelBusy.value) return; cancelBusy.value = true; try { await bridge.cancel(operationId.value); } finally { cancelBusy.value = false; } }
function eventReceived(event: DockerHostingEvent): void {
    if (event.type === "started") { operationId.value = event.operationId; operation.value = event.operation; return; }
    if (operationId.value !== null && event.operationId !== operationId.value) return;
    if (event.type === "progress") progress.value = event;
    if (event.type === "log") logLines.value = [...logLines.value.slice(-99), event.message];
    if (event.type === "finished") { snapshot.value = event.snapshot; void loadLogs(event.containerId); operationId.value = null; }
    if (event.type === "failed") { error.value = event.failure.message; operationId.value = null; }
    if (event.type === "cancelled") { error.value = t("dockerHosting.cancelled", "Operation cancelled; no further Docker action was started."); operationId.value = null; }
}
onMounted(() => { void refresh(); if (bridge !== null) unsubscribe = bridge.onEvent(eventReceived); });
onBeforeUnmount(() => unsubscribe?.());

defineExpose({ refresh, mutate, cancel, snapshot, progress });

async function loadLogs(containerId: string): Promise<void> {
    if (bridge === null) return;
    const result = await bridge.logs(containerId, 200);
    if (result.ok) logLines.value = result.logs.split(/\r?\n/).filter(Boolean).slice(-100);
}

function toggleSelected(id: string): void { selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((item) => item !== id) : [...selectedIds.value, id]; }
function exportSelection(): void {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), records: selected.value }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "worldlens-docker-hosting.json"; anchor.click(); URL.revokeObjectURL(url);
}
</script>

<template>
    <div class="mb-docker-hosting" data-test="docker-hosting-screen">
        <v-card variant="tonal">
            <v-card-title>{{ t("dockerHosting.title", "Docker hosting manager") }}</v-card-title>
            <v-card-text>
                <v-alert v-if="bridge === null" type="info" variant="tonal">{{ t("dockerHosting.unavailable", "This build cannot manage Docker. The desktop bridge is not available.") }}</v-alert>
                <template v-else>
                    <div v-if="snapshot" class="mb-docker-hosting__daemon" role="status">
                        <v-chip :color="snapshot.daemon === 'ready' ? 'success' : 'warning'" size="small" variant="tonal">{{ snapshot.daemon === "ready" ? t("dockerHosting.ready", "Docker ready") : snapshot.daemon }}</v-chip>
                        <span>{{ snapshot.message }}</span>
                        <span v-if="snapshot.serverVersion">{{ t("dockerHosting.server", "Daemon {version}", { version: snapshot.serverVersion }) }}</span>
                        <v-btn :prepend-icon="mdiRefresh" size="small" variant="text" :loading="loading" @click="refresh">{{ t("dockerHosting.refresh", "Refresh") }}</v-btn>
                    </div>
                    <v-alert v-if="error" type="error" variant="tonal" role="alert">{{ error }}</v-alert>
                    <ConfigSearchField v-model="query" v-model:regex="regex" v-model:flags="flags" :label="t('dockerHosting.search', 'Search owned containers')" :sample="owned.map((item) => `${item.name} ${item.image}`).join('\n')" />
                    <p v-if="regexError" class="mb-docker-hosting__regex-error" role="alert">{{ regexError }}</p>
                    <div v-if="selectedIds.length" class="mb-docker-hosting__bulk" role="status">
                        {{ t("dockerHosting.selected", "{count} selected", { count: selectedIds.length }) }}
                        <v-btn size="small" variant="text" @click="exportSelection">{{ t("dockerHosting.export", "Export") }}</v-btn>
                        <v-btn size="small" variant="text" @click="selectedIds = []">{{ t("dockerHosting.clearSelection", "Clear") }}</v-btn>
                    </div>
                    <p v-if="shown.length === 0" role="status">{{ t("dockerHosting.empty", "No app-owned BlueMap server containers are available.") }}</p>
                    <ul v-else class="mb-docker-hosting__list">
                        <AppearanceTarget v-for="container in shown" :key="container.id" as="li" :id="`docker-hosting.container.${container.id}`" :label="container.name" class="mb-docker-hosting__row">
                            <div class="mb-docker-hosting__identity"><v-checkbox :model-value="selectedIds.includes(container.id)" hide-details density="compact" :aria-label="t('dockerHosting.select', 'Select {name}', { name: container.name })" @update:model-value="toggleSelected(container.id)" /><strong>{{ container.name }}</strong><span>{{ container.image }} · {{ container.status }}</span><span>{{ container.ports.join(", ") || t("dockerHosting.noPorts", "No published ports") }}</span></div>
                            <v-chip size="small" :color="container.running ? 'success' : 'default'" variant="tonal">{{ container.running ? t("dockerHosting.running", "Running") : t("dockerHosting.stopped", "Stopped") }}</v-chip>
                            <div class="mb-docker-hosting__actions">
                                <v-btn v-if="!container.running" :prepend-icon="mdiPlayCircleOutline" size="small" variant="text" :disabled="operationId !== null" @click="mutate(container, 'start')">{{ t("dockerHosting.start", "Start") }}</v-btn>
                                <ConfigSuperConfirm v-else :title="t('dockerHosting.stopTitle', 'Confirm stopping this server')" :action="t('dockerHosting.stopBody', 'Stopping is safe: it ends this app-owned container, keeps its volumes, and does not touch unrelated Docker workloads.')" :confirm-label="t('dockerHosting.stop', 'Stop')" :disabled="operationId !== null" @confirm="mutate(container, 'stop')"><template #activator="{ props: activatorProps }"><v-btn v-bind="activatorProps" :prepend-icon="mdiStopCircleOutline" size="small" variant="text">{{ t("dockerHosting.stop", "Stop") }}</v-btn></template></ConfigSuperConfirm>
                                <v-btn :prepend-icon="mdiRestart" size="small" variant="text" :disabled="operationId !== null" @click="mutate(container, 'restart')">{{ t("dockerHosting.restart", "Restart") }}</v-btn>
                                <v-btn v-if="container.configState === 'outdated'" :prepend-icon="mdiRefresh" size="small" variant="text" disabled :title="t('dockerHosting.updateDisabled', 'Update is disabled until a transactional recreate plan is available; no running workload will be replaced implicitly.')">{{ t("dockerHosting.update", "Update") }}</v-btn>
                                <ConfigSuperConfirm :title="t('dockerHosting.removeTitle', 'Confirm removing this server')" :action="t('dockerHosting.removeBody', 'This removes only the selected app-owned container. Volumes and unrelated workloads are kept.')" :confirm-label="t('dockerHosting.remove', 'Remove')" :disabled="operationId !== null" @confirm="mutate(container, 'remove')"><template #activator="{ props: activatorProps }"><v-btn v-bind="activatorProps" :prepend-icon="mdiDeleteOutline" size="small" variant="text" color="error">{{ t("dockerHosting.remove", "Remove") }}</v-btn></template></ConfigSuperConfirm>
                            </div>
                            <v-progress-linear v-if="operationId && progress" :model-value="progress.total > 0 ? progress.done / progress.total * 100 : undefined" :indeterminate="progress.total <= 0" role="progressbar" :aria-label="progress.message" />
                        </AppearanceTarget>
                    </ul>
                    <div v-if="operationId" class="mb-docker-hosting__operation" role="status"><strong>{{ progress?.phase ?? operation }}</strong> {{ progress?.message }} <v-btn size="small" variant="tonal" :loading="cancelBusy" :disabled="cancelBusy" @click="cancel">{{ t("dockerHosting.cancel", "Cancel") }}</v-btn></div>
                    <details v-if="logLines.length" class="mb-docker-hosting__logs"><summary>{{ t("dockerHosting.logs", "Operation log") }}</summary><pre>{{ logLines.join("\n") }}</pre></details>
                </template>
            </v-card-text>
        </v-card>
    </div>
</template>

<style scoped>
.mb-docker-hosting__daemon,.mb-docker-hosting__operation{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-block-end:12px}.mb-docker-hosting__list{display:grid;gap:10px;list-style:none;padding:0}.mb-docker-hosting__row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:12px;border:1px solid rgba(var(--v-theme-on-surface),.12);border-radius:16px}.mb-docker-hosting__identity{display:grid;gap:2px;min-width:0}.mb-docker-hosting__identity span{overflow-wrap:anywhere;color:rgba(var(--v-theme-on-surface),.72);font-size:.8rem}.mb-docker-hosting__actions{grid-column:1/-1;display:flex;gap:4px;flex-wrap:wrap}.mb-docker-hosting__row .v-progress-linear{grid-column:1/-1}.mb-docker-hosting__logs{margin-block-start:12px}.mb-docker-hosting__logs pre{max-height:180px;overflow:auto;white-space:pre-wrap}
</style>
