<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiPlay, mdiStop } from "@mdi/js";
import { VAlert, VBtn, VChip, VTab, VTabs, VWindow, VWindowItem } from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import ServerConsole from "./ServerConsole.vue";
import ServerConfigEditor from "./ServerConfigEditor.vue";
import PluginManager from "./PluginManager.vue";
import PlayerManager from "./PlayerManager.vue";
import { useServerStore } from "./useServers.js";
import { flavourName, lifecycleBlockReason, stateLabel, transportSummary } from "./serverModel.js";
import { ref } from "vue";

/**
 * One server's whole panel: lifecycle controls, its console, its `server.properties`, its
 * plugins and its players, in tabs. Named `WebConsolePanel` per the assignment - it is the
 * "open one server and work on it" surface the shell hosts as the job's main view.
 */
const props = defineProps<{ serverId: string }>();
const emit = defineEmits<{ forgotten: [] }>();

const { t } = useI18n();
const store = useServerStore();
const tab = ref<"console" | "config" | "plugins" | "players">("console");

async function refresh(): Promise<void> {
    await store.probe(props.serverId);
    await store.refreshStatus(props.serverId);
}
onMounted(refresh);
watch(() => props.serverId, refresh);

const server = computed(() => store.get(props.serverId));
const status = computed(() => store.statuses[props.serverId] ?? null);
const capabilities = computed(() => store.capabilitiesFor(props.serverId));

const startReason = computed(() =>
    server.value ? lifecycleBlockReason(server.value, capabilities.value, "start", status.value?.state ?? null) : null,
);
const stopReason = computed(() =>
    server.value ? lifecycleBlockReason(server.value, capabilities.value, "stop", status.value?.state ?? null) : null,
);

async function start(): Promise<void> {
    await store.start(props.serverId);
    await refresh();
}
async function stop(): Promise<void> {
    await store.stop(props.serverId, { graceful: true });
    await refresh();
}
async function confirmForget(): Promise<void> {
    const result = await store.forget(props.serverId);
    if (result.ok) emit("forgotten");
}
</script>

<template>
    <div v-if="server" class="wl-mcserver-panel">
        <div class="wl-mcserver-panel__header">
            <div>
                <h2 class="text-h6">{{ server.name }}</h2>
                <p class="text-caption text-medium-emphasis">
                    {{ flavourName(server.flavour) }}
                    <span v-if="server.minecraftVersion"> &middot; {{ server.minecraftVersion }}</span>
                    &middot; {{ transportSummary(server) }}
                </p>
            </div>
            <VChip :color="stateLabel(status?.state ?? null).color" variant="flat">
                {{ stateLabel(status?.state ?? null).text }}
            </VChip>
        </div>

        <VAlert v-if="server.origin === 'adopted'" type="info" variant="tonal" class="mb-3">
            {{ t("mcserver.panel.adopted", "This server was adopted, not created here. Every action below is limited to what it was granted.") }}
        </VAlert>

        <div class="wl-mcserver-panel__actions">
            <VBtn
                :prepend-icon="mdiPlay"
                color="primary"
                variant="tonal"
                :disabled="!!startReason"
                :title="startReason ?? undefined"
                @click="start"
            >
                {{ t("mcserver.panel.start", "Start") }}
            </VBtn>
            <VBtn
                :prepend-icon="mdiStop"
                variant="tonal"
                :disabled="!!stopReason"
                :title="stopReason ?? undefined"
                @click="stop"
            >
                {{ t("mcserver.panel.stop", "Stop") }}
            </VBtn>
        </div>

        <VTabs v-model="tab" class="mt-4">
            <VTab value="console">{{ t("mcserver.panel.tabConsole", "Console") }}</VTab>
            <VTab value="config">{{ t("mcserver.panel.tabConfig", "Configuration") }}</VTab>
            <VTab value="plugins">{{ t("mcserver.panel.tabPlugins", "Plugins") }}</VTab>
            <VTab value="players">{{ t("mcserver.panel.tabPlayers", "Players") }}</VTab>
        </VTabs>
        <VWindow v-model="tab">
            <VWindowItem value="console"><ServerConsole :server-id="server.id" /></VWindowItem>
            <VWindowItem value="config"><ServerConfigEditor :server-id="server.id" /></VWindowItem>
            <VWindowItem value="plugins"><PluginManager :server-id="server.id" /></VWindowItem>
            <VWindowItem value="players"><PlayerManager :server-id="server.id" /></VWindowItem>
        </VWindow>

        <ConfigSuperConfirm
            class="wl-mcserver-panel__forget"
            :title="t('mcserver.panel.forgetTitle', 'Forget this server')"
            :action="
                server.origin === 'adopted'
                    ? t(
                          'mcserver.panel.forgetActionAdopted',
                          { name: server.name },
                          'Removes {name} from this list only. The container or folder it points at is never touched.',
                      )
                    : t(
                          'mcserver.panel.forgetAction',
                          { name: server.name },
                          'Removes {name} from this list. Its files and container are not deleted.',
                      )
            "
            :affected="[server.name]"
            :confirm-label="t('mcserver.panel.forgetConfirm', 'Forget')"
            @confirm="confirmForget"
        />
    </div>
</template>

<style scoped>
.wl-mcserver-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}
.wl-mcserver-panel__actions {
    display: flex;
    gap: 8px;
}
.wl-mcserver-panel__forget {
    margin-top: 24px;
}
</style>
