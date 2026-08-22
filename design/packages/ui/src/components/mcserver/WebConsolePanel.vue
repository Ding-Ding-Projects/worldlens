<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiLan, mdiLock, mdiPlay, mdiStop } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VChip,
    VDivider,
    VTab,
    VTabs,
    VTextField,
    VWindow,
    VWindowItem,
} from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import ServerConsole from "./ServerConsole.vue";
import ServerConfigEditor from "./ServerConfigEditor.vue";
import PluginManager from "./PluginManager.vue";
import PlayerManager from "./PlayerManager.vue";
import AwsProvisionPanel from "./AwsProvisionPanel.vue";
import { useServerStore } from "./useServers.js";
import { flavourName, lifecycleBlockReason, stateLabel, transportSummary } from "./serverModel.js";
import {
    webConsoleBind,
    webConsoleSetPassword,
    webConsoleStart,
    webConsoleStatus,
    webConsoleStop,
    type WebConsoleStatus,
} from "./mcserverBridge.js";

/**
 * One server's whole panel: lifecycle controls, its console, its configuration files, its
 * plugins, its players, and - on its own tab - the locally hosted web management console.
 *
 * The web-console password crosses this component exactly once, inbound to `setPassword`,
 * and is never echoed back, logged, or bound into any other field.
 */
const props = defineProps<{
    serverId: string;
    initialTab?: "console" | "config" | "plugins" | "players" | "web" | "aws";
}>();
const emit = defineEmits<{ forgotten: [] }>();

const { t } = useI18n();
const store = useServerStore();
const tab = ref<"console" | "config" | "plugins" | "players" | "web" | "aws">("console");
watch(
    () => props.initialTab,
    (value) => {
        if (value !== undefined) tab.value = value;
    },
    { immediate: true },
);

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
    server.value
        ? lifecycleBlockReason(
              server.value,
              capabilities.value,
              "start",
              status.value?.state ?? null,
          )
        : null,
);
const stopReason = computed(() =>
    server.value
        ? lifecycleBlockReason(
              server.value,
              capabilities.value,
              "stop",
              status.value?.state ?? null,
          )
        : null,
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

// --- Web console ---
const webStatus = ref<WebConsoleStatus | null>(null);
const webFailure = ref<string | null>(null);
const newPassword = ref("");
const passwordSaved = ref(false);

async function loadWebStatus(): Promise<void> {
    const result = await webConsoleStatus();
    if (result.ok) {
        webStatus.value = result.value ?? null;
        webFailure.value = null;
    } else {
        webFailure.value =
            result.failure?.message ??
            t("mcserver.web.statusFailed", "Could not read the web console's status.");
    }
}
onMounted(loadWebStatus);

async function startWeb(): Promise<void> {
    const result = await webConsoleStart(undefined);
    if (result.ok) webStatus.value = result.value ?? null;
    else
        webFailure.value =
            result.failure?.message ??
            t("mcserver.web.startFailed", "Could not start the web console.");
}
async function stopWeb(): Promise<void> {
    const result = await webConsoleStop();
    if (result.ok) await loadWebStatus();
    else
        webFailure.value =
            result.failure?.message ??
            t("mcserver.web.stopFailed", "Could not stop the web console.");
}
async function rebind(): Promise<void> {
    const result = await webConsoleBind();
    if (result.ok) webStatus.value = result.value ?? null;
    else
        webFailure.value =
            result.failure?.message ??
            t("mcserver.web.bindFailed", "Could not change the bind address.");
}
async function setPassword(): Promise<void> {
    if (newPassword.value.trim() === "") return;
    const result = await webConsoleSetPassword(newPassword.value);
    newPassword.value = "";
    if (result.ok) {
        passwordSaved.value = true;
        await loadWebStatus();
    } else {
        webFailure.value =
            result.failure?.message ??
            t("mcserver.web.passwordFailed", "Could not set the password.");
    }
}
</script>

<template>
    <div v-if="server" class="wl-mcserver-panel">
        <div class="wl-mcserver-panel__header">
            <div>
                <div class="text-h6">{{ server.name }}</div>
                <div class="text-caption text-medium-emphasis">
                    {{ flavourName(server.flavour) }}
                    <span v-if="server.minecraftVersion">
                        &middot; {{ server.minecraftVersion }}</span
                    >
                    &middot; {{ transportSummary(server) }}
                </div>
            </div>
            <VChip :color="stateLabel(status?.state ?? null).color" variant="flat">
                {{ stateLabel(status?.state ?? null).text }}
            </VChip>
        </div>

        <VAlert v-if="server.origin === 'adopted'" type="info" variant="tonal" class="mb-3">
            {{
                t(
                    "mcserver.panel.adopted",
                    "This server was adopted, not created here. Every action below is limited to what it was granted.",
                )
            }}
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
            <VTab value="web">{{ t("mcserver.panel.tabWeb", "Web console") }}</VTab>
            <VTab value="aws">{{ t("mcserver.panel.tabAws", "AWS hosting") }}</VTab>
        </VTabs>
        <VWindow v-model="tab">
            <VWindowItem value="console"><ServerConsole :server-id="server.id" /></VWindowItem>
            <VWindowItem value="config"><ServerConfigEditor :server-id="server.id" /></VWindowItem>
            <VWindowItem value="plugins"><PluginManager :server-id="server.id" /></VWindowItem>
            <VWindowItem value="players"><PlayerManager :server-id="server.id" /></VWindowItem>
            <VWindowItem value="web">
                <div class="wl-mcserver-web">
                    <VAlert v-if="webFailure" type="warning" variant="tonal" class="mb-2">{{
                        webFailure
                    }}</VAlert>
                    <VAlert v-if="passwordSaved" type="success" variant="tonal" class="mb-2">
                        {{ t("mcserver.web.passwordSaved", "Password updated.") }}
                    </VAlert>

                    <div class="wl-mcserver-web__status">
                        <VChip :color="webStatus?.running ? 'success' : 'surface'" variant="flat">
                            {{
                                webStatus?.running
                                    ? t("mcserver.web.running", "Running")
                                    : t("mcserver.web.stopped", "Stopped")
                            }}
                        </VChip>
                        <VChip v-if="webStatus" size="small" variant="tonal"
                            >{{ webStatus.host }}:{{ webStatus.port ?? "?" }}</VChip
                        >
                        <VChip
                            v-if="webStatus?.hasPassword"
                            size="small"
                            color="primary"
                            variant="tonal"
                            :prepend-icon="mdiLock"
                        >
                            {{ t("mcserver.web.hasPassword", "Password set") }}
                        </VChip>
                    </div>

                    <VAlert v-if="webStatus?.loopbackOnly" type="info" variant="tonal" class="my-2">
                        {{
                            t(
                                "mcserver.web.loopback",
                                "Only reachable from this machine. Rebind to make it reachable on the LAN - understand that anyone on that network who knows the password can reach it too.",
                            )
                        }}
                    </VAlert>
                    <VAlert
                        v-else-if="webStatus?.running"
                        type="warning"
                        variant="tonal"
                        class="my-2"
                    >
                        {{
                            t(
                                "mcserver.web.lan",
                                "Reachable from your local network. Make sure the password is strong.",
                            )
                        }}
                    </VAlert>

                    <div class="wl-mcserver-web__actions">
                        <VBtn
                            :prepend-icon="mdiPlay"
                            variant="tonal"
                            color="primary"
                            :disabled="webStatus?.running === true"
                            @click="startWeb"
                        >
                            {{ t("mcserver.web.start", "Start") }}
                        </VBtn>
                        <VBtn
                            :prepend-icon="mdiStop"
                            variant="tonal"
                            :disabled="webStatus?.running !== true"
                            @click="stopWeb"
                        >
                            {{ t("mcserver.web.stop", "Stop") }}
                        </VBtn>
                        <VBtn :prepend-icon="mdiLan" variant="text" @click="rebind">
                            {{ t("mcserver.web.rebind", "Change bind address") }}
                        </VBtn>
                    </div>

                    <VDivider class="my-3" />
                    <div class="wl-mcserver-web__password">
                        <VTextField
                            v-model="newPassword"
                            type="password"
                            autocomplete="new-password"
                            :label="t('mcserver.web.newPassword', 'Set a new password')"
                            density="compact"
                            hide-details
                        />
                        <VBtn
                            variant="tonal"
                            :disabled="newPassword.trim() === ''"
                            @click="setPassword"
                        >
                            {{ t("mcserver.web.setPassword", "Set password") }}
                        </VBtn>
                    </div>
                </div>
            </VWindowItem>
            <VWindowItem value="aws"><AwsProvisionPanel :server-id="server.id" /></VWindowItem>
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
.wl-mcserver-web__status {
    display: flex;
    gap: 8px;
    align-items: center;
}
.wl-mcserver-web__actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
}
.wl-mcserver-web__password {
    display: flex;
    gap: 8px;
    align-items: center;
    max-width: 420px;
}
</style>
