<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowLeft,
    mdiConsoleLine,
    mdiDeleteOffOutline,
    mdiLan,
    mdiLock,
    mdiLockOutline,
    mdiPlay,
    mdiStop,
    mdiWeb,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VChip,
    VIcon,
    VTab,
    VTabs,
    VTextField,
    VWindow,
    VWindowItem,
} from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import BotWorkflowPanel from "./BotWorkflowPanel.vue";
import { workflowText as text } from "./workflowText.js";
import ServerConsole from "./ServerConsole.vue";
import ServerConfigEditor from "./ServerConfigEditor.vue";
import PluginManager from "./PluginManager.vue";
import PlayerManager from "./PlayerManager.vue";
import AwsProvisionPanel from "./AwsProvisionPanel.vue";
import ServerBackupsPanel from "./ServerBackupsPanel.vue";
import ServerJobHeader from "./ServerJobHeader.vue";
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
    initialTab?: "console" | "config" | "plugins" | "players" | "web" | "backups" | "aws" | "bots";
}>();
const emit = defineEmits<{ forgotten: []; back: [] }>();

const { t } = useI18n();
const store = useServerStore();
const tab = ref<"console" | "config" | "plugins" | "players" | "web" | "backups" | "aws" | "bots">(
    "console",
);
watch(
    () => props.initialTab,
    (value) => {
        if (value !== undefined) tab.value = value;
    },
    { immediate: true },
);

const lifecycleFailure = ref<string | null>(null);
const lifecycleBusy = ref(false);
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let monitored = false;
let unknownAttempts = 0;
async function refresh(): Promise<void> {
    const id = props.serverId;
    await store.probe(id);
    if (disposed || id !== props.serverId) return;
    await store.refreshStatus(id);
}
async function pollStatus(): Promise<void> {
    const id = props.serverId;
    try {
        if (store.statuses[id]?.running) {
            monitored = true;
            unknownAttempts = 0;
        }
        if (lifecycleBusy.value) return;
        const answer = await store.refreshStatus(id);
        if (disposed || id !== props.serverId) return;
        if (!answer.ok || answer.value?.state === "unknown") {
            ++unknownAttempts;
            return;
        }
        unknownAttempts = 0;
        monitored = answer.value?.running === true;
        if (answer.value?.state === "exited") {
            lifecycleFailure.value = t(
                "mcserver.lifecycle.exited",
                { name: store.get(id)?.name ?? id, code: answer.value.exitCode ?? "unknown" },
                {
                    default:
                        "Server {name} exited (code {code}). Open its console or logs for details.",
                },
            );
        }
    } finally {
        if (!disposed)
            statusTimer = setTimeout(() => {
                void pollStatus();
            }, 2000);
    }
}
onMounted(() => {
    void refresh();
    statusTimer = setTimeout(() => {
        void pollStatus();
    }, 2000);
});
onUnmounted(() => {
    disposed = true;
    clearTimeout(statusTimer);
});
watch(
    () => props.serverId,
    () => {
        monitored = false;
        unknownAttempts = 0;
        lifecycleFailure.value = null;
        void refresh();
    },
);

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

async function lifecycle(action: "start" | "stop" | "forget"): Promise<void> {
    if (lifecycleBusy.value) return;
    lifecycleBusy.value = true;
    lifecycleFailure.value = null;
    const id = props.serverId;
    try {
        const result =
            action === "start"
                ? await store.start(id)
                : action === "stop"
                  ? await store.stop(id, { graceful: true })
                  : await store.forget(id);
        if (disposed || id !== props.serverId) return;
        if (!result.ok) {
            lifecycleFailure.value = `${result.failure?.message ?? t("mcserver.lifecycle.incomplete", "The server operation did not complete. Check its status and try again.")}${result.failure?.detail ? ` ${result.failure.detail}` : ""}`;
        } else if (action === "forget") {
            emit("forgotten");
            return;
        }
        await refresh();
    } catch {
        if (!disposed && id === props.serverId)
            lifecycleFailure.value = t(
                "mcserver.lifecycle.incomplete",
                "The server operation did not complete. Check its status and try again.",
            );
    } finally {
        lifecycleBusy.value = false;
    }
}
async function start(): Promise<void> {
    await lifecycle("start");
}
async function stop(): Promise<void> {
    await lifecycle("stop");
}
async function confirmForget(): Promise<void> {
    await lifecycle("forget");
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
const stateChipColor = computed(() => {
    const state = status.value?.state ?? null;
    if (state === "running") return "secondary-container";
    if (state === "paused" || state === "unknown") return "tertiary-container";
    return "surface-container-highest";
});
const bindAddress = computed(() =>
    webStatus.value ? `${webStatus.value.host}:${webStatus.value.port ?? "?"}` : null,
);

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
        <ServerJobHeader />

        <div class="wl-mcserver-panel__header">
            <VBtn
                data-test="back-to-minecraft-servers"
                :prepend-icon="mdiArrowLeft"
                variant="text"
                color="primary"
                size="small"
                class="wl-mcserver-panel__back"
                @click="emit('back')"
            >
                {{ t("mcserver.panel.backToServers", "All servers") }}
            </VBtn>
            <span class="wl-mcserver-panel__spacer" />
            <div class="wl-mcserver-panel__actions">
                <VBtn
                    :prepend-icon="mdiPlay"
                    size="small"
                    :color="startReason ? 'on-surface' : 'primary-container'"
                    :variant="startReason ? 'outlined' : 'flat'"
                    :disabled="lifecycleBusy || !!startReason"
                    :title="startReason ?? undefined"
                    @click="start"
                >
                    {{ t("mcserver.panel.start", "Start") }}
                </VBtn>
                <VBtn
                    :prepend-icon="mdiStop"
                    size="small"
                    color="on-surface"
                    variant="outlined"
                    :disabled="lifecycleBusy || !!stopReason"
                    :title="stopReason ?? undefined"
                    @click="stop"
                >
                    {{ t("mcserver.panel.stop", "Stop") }}
                </VBtn>
            </div>
            <VChip :color="stateChipColor" variant="flat" size="small">
                {{ stateLabel(status?.state ?? null).text }}
            </VChip>
        </div>
        <div class="wl-mcserver-panel__identity">
            <h2 class="wl-mcserver-panel__name">{{ server.name }}</h2>
            <div class="wl-mcserver-panel__meta">
                {{ flavourName(server.flavour) }}
                <span v-if="server.minecraftVersion"> &middot; {{ server.minecraftVersion }}</span>
                &middot; {{ transportSummary(server) }}
            </div>
        </div>

        <VAlert v-if="server.origin === 'adopted'" type="info" variant="tonal" class="mt-3">
            {{
                t(
                    "mcserver.panel.adopted",
                    "This server was adopted, not created here. Every action below is limited to what it was granted.",
                )
            }}
        </VAlert>

        <VAlert
            v-if="lifecycleFailure"
            type="error"
            role="alert"
            closable
            class="mt-3"
            @click:close="lifecycleFailure = null"
            >{{ lifecycleFailure }}</VAlert
        >

        <VTabs v-model="tab" class="wl-mcserver-panel__tabs" color="primary" show-arrows>
            <VTab value="console">{{ t("mcserver.panel.tabConsole", "Console") }}</VTab>
            <VTab value="config">{{ t("mcserver.panel.tabConfig", "Config") }}</VTab>
            <VTab value="plugins">{{ t("mcserver.panel.tabPlugins", "Plugins") }}</VTab>
            <VTab value="players">{{ t("mcserver.panel.tabPlayers", "Players") }}</VTab>
            <VTab value="web">{{ t("mcserver.panel.tabWeb", "Web console") }}</VTab>
            <VTab value="backups">{{ t("mcserver.panel.tabBackups", "Backups and restore") }}</VTab>
            <VTab value="aws">{{ t("mcserver.panel.tabAws", "AWS hosting") }}</VTab>
            <VTab value="bots">{{ text("Bots", "機械人") }}</VTab>
        </VTabs>
        <VWindow v-model="tab" class="wl-mcserver-panel__window">
            <VWindowItem value="bots"><BotWorkflowPanel :server-id="server.id" /></VWindowItem>
            <VWindowItem value="console"><ServerConsole :server-id="server.id" /></VWindowItem>
            <VWindowItem value="config"><ServerConfigEditor :server-id="server.id" /></VWindowItem>
            <VWindowItem value="plugins"><PluginManager :server-id="server.id" /></VWindowItem>
            <VWindowItem value="players"><PlayerManager :server-id="server.id" /></VWindowItem>
            <VWindowItem value="web">
                <div class="wl-mcserver-web">
                    <VCard variant="outlined" class="wl-mcserver-web__card">
                        <div class="wl-mcserver-web__head">
                            <VIcon :icon="mdiWeb" size="22" class="wl-mcserver-web__glyph" />
                            <h3 class="wl-mcserver-web__title">
                                {{ t("mcserver.web.title", "Web management console") }}
                            </h3>
                            <span class="wl-mcserver-panel__spacer" />
                            <div class="wl-mcserver-web__status">
                                <VChip
                                    :color="
                                        webStatus?.running
                                            ? 'secondary-container'
                                            : 'surface-container-highest'
                                    "
                                    variant="flat"
                                    size="small"
                                >
                                    {{
                                        webStatus?.running
                                            ? t("mcserver.web.running", "Running")
                                            : t("mcserver.web.stopped", "Stopped")
                                    }}
                                </VChip>
                            </div>
                        </div>
                        <p class="wl-mcserver-web__lede">
                            {{
                                t(
                                    "mcserver.web.lede",
                                    "This server's console, config, plugins and players from an ordinary browser, over a locally hosted, password-protected HTTP server.",
                                )
                            }}
                        </p>

                        <VAlert v-if="webFailure" type="warning" variant="tonal" class="mb-3">{{
                            webFailure
                        }}</VAlert>
                        <VAlert v-if="passwordSaved" type="success" variant="tonal" class="mb-3">
                            {{ t("mcserver.web.passwordSaved", "Password updated.") }}
                        </VAlert>

                        <div class="wl-mcserver-web__row">
                            <span class="wl-mcserver-web__label">{{
                                t("mcserver.web.bindLabel", "Bind address")
                            }}</span>
                            <span class="wl-mcserver-web__value">{{ bindAddress ?? "–" }}</span>
                            <span class="wl-mcserver-panel__spacer" />
                            <VBtn
                                :prepend-icon="mdiLan"
                                size="small"
                                variant="outlined"
                                color="primary"
                                @click="rebind"
                            >
                                {{ t("mcserver.web.rebind", "Change bind address") }}
                            </VBtn>
                        </div>
                        <VAlert
                            v-if="webStatus?.loopbackOnly"
                            type="info"
                            variant="tonal"
                            density="compact"
                            class="mb-3"
                        >
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
                            density="compact"
                            class="mb-3"
                        >
                            {{
                                t(
                                    "mcserver.web.lan",
                                    "Reachable from your local network. Make sure the password is strong.",
                                )
                            }}
                        </VAlert>

                        <div class="wl-mcserver-web__row wl-mcserver-web__password">
                            <span class="wl-mcserver-web__label">{{
                                t("mcserver.web.passwordLabel", "Password")
                            }}</span>
                            <VTextField
                                v-model="newPassword"
                                type="password"
                                autocomplete="new-password"
                                :label="t('mcserver.web.newPassword', 'Set a new password')"
                                density="compact"
                                variant="outlined"
                                hide-details
                                class="wl-mcserver-web__field"
                            />
                            <VChip
                                v-if="webStatus?.hasPassword"
                                size="small"
                                color="secondary-container"
                                variant="flat"
                                :prepend-icon="mdiLock"
                            >
                                {{ t("mcserver.web.hasPassword", "Password set") }}
                            </VChip>
                            <VBtn
                                size="small"
                                variant="outlined"
                                color="primary"
                                :disabled="newPassword.trim() === ''"
                                :title="
                                    newPassword.trim() === ''
                                        ? t(
                                              'mcserver.web.passwordNeeded',
                                              'Type the new password first.',
                                          )
                                        : undefined
                                "
                                @click="setPassword"
                            >
                                {{ t("mcserver.web.setPassword", "Set password") }}
                            </VBtn>
                        </div>

                        <div class="wl-mcserver-web__actions">
                            <VBtn
                                :prepend-icon="mdiPlay"
                                :variant="webStatus?.running === true ? 'outlined' : 'flat'"
                                :color="
                                    webStatus?.running === true ? 'on-surface' : 'primary-container'
                                "
                                :disabled="webStatus?.running === true"
                                @click="startWeb"
                            >
                                {{ t("mcserver.web.start", "Start") }}
                            </VBtn>
                            <VBtn
                                :prepend-icon="mdiStop"
                                :variant="webStatus?.running === true ? 'flat' : 'outlined'"
                                :color="
                                    webStatus?.running === true ? 'primary-container' : 'on-surface'
                                "
                                :disabled="webStatus?.running !== true"
                                @click="stopWeb"
                            >
                                {{ t("mcserver.web.stop", "Stop") }}
                            </VBtn>
                        </div>
                    </VCard>

                    <div class="wl-mcserver-web__facts">
                        <VCard
                            v-for="fact in [
                                {
                                    icon: mdiConsoleLine,
                                    title: t(
                                        'mcserver.web.factRconTitle',
                                        'RCON is the command path',
                                    ),
                                    tag: 'local · docker · ssh',
                                    body: t(
                                        'mcserver.web.factRconBody',
                                        'Console input behaves identically whether the server is a local process, a local container or one reached over SSH. The password never appears in the interface; the record only carries whether one exists.',
                                    ),
                                },
                                {
                                    icon: mdiLockOutline,
                                    title: t(
                                        'mcserver.web.factScopeTitle',
                                        'Writes are scope-checked',
                                    ),
                                    tag: t('mcserver.web.factScopeTag', 'refuse, never adjust'),
                                    body: t(
                                        'mcserver.web.factScopeBody',
                                        'Every path passes the transport\'s single scope check. An adopted server only gets the writes it was granted.',
                                    ),
                                },
                                {
                                    icon: mdiDeleteOffOutline,
                                    title: t(
                                        'mcserver.web.factForgetTitle',
                                        'Forgetting deletes nothing',
                                    ),
                                    tag: t('mcserver.web.factForgetTag', 'two-key gate'),
                                    body: t(
                                        'mcserver.web.factForgetBody',
                                        'Forget removes the server from this list only. Its files and container stay where they are.',
                                    ),
                                },
                            ]"
                            :key="fact.title"
                            variant="outlined"
                            class="wl-mcserver-web__fact"
                        >
                            <div class="wl-mcserver-web__fact-head">
                                <VIcon :icon="fact.icon" size="20" />
                                <span class="wl-mcserver-web__fact-title">{{ fact.title }}</span>
                                <span class="wl-mcserver-panel__spacer" />
                                <span class="wl-mcserver-web__fact-tag">{{ fact.tag }}</span>
                            </div>
                            <p class="wl-mcserver-web__fact-body">{{ fact.body }}</p>
                        </VCard>
                    </div>
                </div>
            </VWindowItem>
            <VWindowItem value="backups"><ServerBackupsPanel :server-id="server.id" /></VWindowItem>
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
/* `Worldlens.dc.html`'s opened-server view: the job header, then back row, name, tabs. */
.wl-mcserver-panel {
    padding: 26px 40px 44px;
}
@media (max-width: 720px) {
    .wl-mcserver-panel {
        padding-inline: 16px;
    }
}
.wl-mcserver-panel__header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
.wl-mcserver-panel .wl-mcserver-panel__back {
    padding-inline: 4px 8px;
    font-weight: 400;
}
.wl-mcserver-panel__spacer {
    flex: 1 1 auto;
}
.wl-mcserver-panel__actions {
    display: flex;
    gap: 8px;
}
.wl-mcserver-panel__identity {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
    margin-top: 12px;
}
.wl-mcserver-panel .wl-mcserver-panel__name {
    margin: 0;
    font-size: var(--md-sys-typescale-title-large-size);
    font-weight: 400;
    line-height: 28px;
}
.wl-mcserver-panel__meta {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-panel .wl-mcserver-panel__tabs {
    margin-top: 18px;
    border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
}
.wl-mcserver-panel__tabs :deep(.v-tab) {
    text-transform: none;
    letter-spacing: 0;
    font-size: var(--md-sys-typescale-title-small-size);
    font-weight: 500;
    min-inline-size: 0;
    padding-inline: 18px;
}
.wl-mcserver-panel__tabs :deep(.v-tab:not(.v-tab--selected)) {
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-panel__window {
    padding-top: 18px;
}
.wl-mcserver-panel__forget {
    margin-top: 24px;
}
.wl-mcserver-web {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
}
@media (max-width: 960px) {
    .wl-mcserver-web {
        grid-template-columns: minmax(0, 1fr);
    }
}
.wl-mcserver-panel .wl-mcserver-web__card {
    padding: 20px 22px;
    border-radius: var(--md-sys-shape-corner-large);
}
.wl-mcserver-web__head,
.wl-mcserver-web__fact-head {
    display: flex;
    align-items: center;
    gap: 12px;
}
.wl-mcserver-web__glyph {
    color: rgb(var(--v-theme-primary));
}
.wl-mcserver-panel .wl-mcserver-web__title {
    margin: 0;
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 500;
}
.wl-mcserver-web__status {
    display: flex;
    gap: 8px;
    align-items: center;
}
.wl-mcserver-web__lede {
    margin: 12px 0 16px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-web__row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 12px 14px;
    margin-bottom: 12px;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-surface-container-high));
}
.wl-mcserver-web__label {
    flex: 0 0 120px;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-web__value {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-medium-size);
}
.wl-mcserver-web__field {
    flex: 1 1 180px;
    min-inline-size: 160px;
}
.wl-mcserver-web__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
}
.wl-mcserver-web__facts {
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.wl-mcserver-panel .wl-mcserver-web__fact {
    padding: 14px 16px;
    border-radius: var(--md-sys-shape-corner-large);
}
.wl-mcserver-web__fact-title {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 500;
}
.wl-mcserver-web__fact-tag {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-label-small-size);
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-web__fact-body {
    margin: 6px 0 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
