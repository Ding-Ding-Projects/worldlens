<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VCard, VCardText, VCardTitle, VBtn, VChip } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import RemoteHostingPanel from "./RemoteHostingPanel.vue";
import RemoteTargetEditor from "./RemoteTargetEditor.vue";
import { resolveRemoteBridge, type RemoteTarget } from "./remoteBridge.js";
import { saveTargets } from "./remoteTargets.js";
import { resolveWorldBridge, type RenderSummary } from "../world/worldBridge.js";
import {
    resolveHostingBridge,
    type RemoteHostMapRequest,
    type RemoteHostingRecord,
} from "./hostingBridge.js";
import { loadRemoteHostingChoices, hostingMapsForRender } from "./hostingModel.js";

/**
 * A discoverable home for publishing a completed map.
 *
 * This screen deliberately composes the bridges and pickers that already power the render
 * flow. It never invents a target, render id, world path, or map: an empty state is the honest
 * answer until a saved SSH target and a finished render are both present. The chosen target and
 * render are remembered locally so returning here restores focus to the same source instead of
 * making the person hunt through the list again.
 */
const { t } = useI18n();
const targetBridge = resolveRemoteBridge();
const hostingBridge = resolveHostingBridge();
const worldBridge = resolveWorldBridge();

const targets = ref<readonly RemoteTarget[]>([]);
const selectedTargetId = ref<string | null>(readString("worldlens.remote-hosting.target"));
const renders = ref<readonly RenderSummary[]>([]);
const hostingRecords = ref<readonly RemoteHostingRecord[]>([]);
const selectedRenderId = ref<string | null>(readString("worldlens.remote-hosting.render"));
const loading = ref(false);
const renderQuery = ref("");
const renderRegex = ref(false);
const renderFlags = ref("i");

function readString(key: string): string | null {
    try {
        const value = globalThis.localStorage?.getItem(key);
        return value === null || value.trim() === "" ? null : value;
    } catch {
        return null;
    }
}

function writeString(key: string, value: string | null): void {
    try {
        if (value === null) globalThis.localStorage?.removeItem(key);
        else globalThis.localStorage?.setItem(key, value);
    } catch {
        // The selection remains usable for this session when storage is unavailable.
    }
}

const finishedRenders = computed(() =>
    renders.value.filter(
        (render) => render.outcome === "finished" && render.dataRoot !== null && render.maps.length > 0,
    ),
);

const renderSample = computed(() =>
    finishedRenders.value
        .map((render) => `${render.renderId} ${render.maps.map((map) => `${map.name} ${map.world}`).join(" ")}`)
        .join("\n"),
);

const shownRenders = computed(() => {
    const query = renderQuery.value.trim().toLocaleLowerCase();
    if (query === "") return finishedRenders.value;
    return finishedRenders.value.filter((render) => {
        const text = `${render.renderId} ${render.maps.map((map) => `${map.name} ${map.world} ${map.dimension}`).join(" ")}`;
        if (!renderRegex.value) return text.toLocaleLowerCase().includes(query);
        try {
            return new RegExp(renderQuery.value, renderFlags.value).test(text);
        } catch {
            return false;
        }
    });
});

const selectedTarget = computed(
    () => targets.value.find((target) => target.id === selectedTargetId.value) ?? null,
);
const selectedRender = computed(
    () => finishedRenders.value.find((render) => render.renderId === selectedRenderId.value) ?? null,
);
const hostedRenderIds = computed(() => new Set(hostingRecords.value.map((record) => record.renderId)));
const selectedMaps = computed<readonly RemoteHostMapRequest[]>(() =>
    selectedRender.value === null ? [] : hostingMapsForRender(selectedRender.value),
);

function chooseTarget(id: string | null): void {
    selectedTargetId.value = id;
    writeString("worldlens.remote-hosting.target", id);
}

function chooseRender(id: string): void {
    selectedRenderId.value = id;
    writeString("worldlens.remote-hosting.render", id);
}

async function loadRenders(): Promise<void> {
    loading.value = true;
    try {
        const choices = await loadRemoteHostingChoices(worldBridge, undefined, hostingBridge);
        targets.value = choices.targets;
        renders.value = choices.renders;
        hostingRecords.value = choices.hostingRecords;
        const dashboardHostingId = readString("worldlens.dashboard.hostingId");
        const dashboardRecord = dashboardHostingId === null
            ? null
            : hostingRecords.value.find((record) => record.hostingId === dashboardHostingId) ?? null;
        if (dashboardRecord !== null) {
            selectedTargetId.value = dashboardRecord.target.id;
            selectedRenderId.value = dashboardRecord.renderId;
            writeString("worldlens.remote-hosting.target", selectedTargetId.value);
            writeString("worldlens.remote-hosting.render", selectedRenderId.value);
        }
        if (selectedRender.value === null) {
            selectedRenderId.value = finishedRenders.value[0]?.renderId ?? null;
            writeString("worldlens.remote-hosting.render", selectedRenderId.value);
        }
    } finally {
        loading.value = false;
    }
}

function updateTargets(next: readonly RemoteTarget[]): void {
    targets.value = next;
    saveTargets(next);
    if (selectedTarget.value === null) chooseTarget(next[0]?.id ?? null);
}

onMounted(() => void loadRenders());
</script>

<template>
    <div class="mb-remote-hosting-screen mb-shell-centre mb-interactive" data-test="remote-hosting-screen">
        <v-card variant="tonal">
            <v-card-title>{{ t("tabs.page.remoteHosting", "Remote hosting") }}</v-card-title>
            <v-card-text>
                <v-alert v-if="hostingBridge === null" type="info" variant="tonal" density="compact">
                    {{ t("remote.unsupported", "This build cannot hand a render to another machine.") }}
                </v-alert>

                <template v-else>
                    <section aria-labelledby="remote-hosting-target-title">
                        <h2 id="remote-hosting-target-title" class="text-subtitle-1">
                            {{ t("remote.hosting.targetTitle", "Saved SSH targets") }}
                        </h2>
                        <RemoteTargetEditor
                            :bridge="targetBridge"
                            :targets="targets"
                            :selected-id="selectedTargetId"
                            @update:targets="updateTargets"
                            @update:selected-id="chooseTarget"
                        />
                    </section>

                    <section class="mt-4" aria-labelledby="remote-hosting-render-title">
                        <h2 id="remote-hosting-render-title" class="text-subtitle-1">
                            {{ t("remote.hosting.renderTitle", "Finished rendered maps") }}
                        </h2>
                        <ConfigSearchField
                            v-model="renderQuery"
                            v-model:regex="renderRegex"
                            v-model:flags="renderFlags"
                            :label="t('remote.hosting.renderSearch', 'Search finished renders')"
                            :sample="renderSample"
                        />
                        <p v-if="loading" role="status">{{ t("remote.hosting.loading", "Reading finished renders…") }}</p>
                        <p v-else-if="shownRenders.length === 0" role="status">
                            {{ t("remote.hosting.noRenders", "No completed render with maps is available yet.") }}
                        </p>
                        <ul v-else class="mb-remote-hosting-screen__renders">
                            <li v-for="render in shownRenders" :key="render.renderId">
                                <v-btn
                                    :variant="render.renderId === selectedRenderId ? 'tonal' : 'text'"
                                    :aria-pressed="render.renderId === selectedRenderId"
                                    size="small"
                                    @click="chooseRender(render.renderId)"
                                >
                                    {{ render.renderId }}
                                </v-btn>
                                <v-chip size="x-small" variant="outlined">
                                    {{ render.maps.map((map) => map.name).join(", ") }}
                                </v-chip>
                                <v-chip v-if="hostedRenderIds.has(render.renderId)" size="x-small" color="primary" variant="tonal">
                                    {{ t("remote.hosting.alreadyPublished", "Already published") }}
                                </v-chip>
                            </li>
                        </ul>
                    </section>

                    <RemoteHostingPanel
                        v-if="selectedTarget !== null && selectedRender !== null && selectedRender.dataRoot !== null"
                        class="mt-4"
                        :target="selectedTarget"
                        :render-id="selectedRender.renderId"
                        :maps="selectedMaps"
                    />
                    <v-alert v-else type="info" variant="tonal" density="compact" class="mt-4">
                        {{ t("remote.hosting.chooseBoth", "Choose a saved SSH target and a finished render to publish it.") }}
                    </v-alert>
                </template>
            </v-card-text>
        </v-card>
    </div>
</template>

<style scoped>
.mb-remote-hosting-screen__renders { display: grid; gap: 4px; margin: 8px 0 0; padding: 0; list-style: none; }
.mb-remote-hosting-screen__renders li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
