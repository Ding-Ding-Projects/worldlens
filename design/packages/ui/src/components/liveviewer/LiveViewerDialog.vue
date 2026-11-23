<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiContentCopy, mdiOpenInNew } from "@mdi/js";
import { VAlert, VBtn, VBtnToggle, VCard, VCardText, VCardTitle, VDialog, VIcon, VProgressCircular, VSelect, VSlider, VSwitch, VTextField } from "vuetify/components";
import {
    NEEDED_VERSION,
    PLAYER_NAME,
    defaultSettings,
    resolveLiveViewerBridge,
    type DeviceCode,
    type Failure,
    type HostChoice,
    type HostStep,
    type InstanceStatus,
    type LiveViewerBridge,
    type LiveViewerSettings,
    type ServerChoice,
    type Verification,
    type ViewerInstance,
} from "./liveViewerBridge.js";

/**
 * One click to host a live 3D view of a Minecraft server, with a bot that joins it.
 *
 * Every control edits a real setting that reaches the container; nothing here is a
 * mock-up. The version, the servers and the hosts all come from the main process, and a
 * control that cannot apply (a Microsoft account with none saved, a host with no saved
 * SSH profile) says why beside itself instead of going quiet.
 */
const props = defineProps<{ modelValue: boolean; bridge?: LiveViewerBridge | null }>();
const emit = defineEmits<{ (event: "update:modelValue", value: boolean): void }>();

const { t } = useI18n();
const bridge = computed<LiveViewerBridge | null>(() => (props.bridge === undefined ? resolveLiveViewerBridge() : props.bridge));

const MANUAL = "__manual__";
const settings = reactive<LiveViewerSettings>(defaultSettings());
const servers = ref<ServerChoice[]>([]);
const hosts = ref<HostChoice[]>([{ kind: "local", hostId: null, label: "This PC" }]);
const chosenServer = ref<string>(MANUAL);
const manualHost = ref("");
const chosenHost = ref<string>("local");
const webPort = ref(3007);
const viewerName = ref("Live viewer");
const manualVersion = ref(false);
const versionText = ref("");
const accounts = ref<{ accountRef: string; label: string }[]>([]);
const accountsAvailable = ref(true);
const chosenAccount = ref<string | null>(null);
const newAccountLabel = ref("");
/** Microsoft sign-in needs the application (client) ID registered for this install. */
const clientConfigured = ref(true);
const clientIdDraft = ref("");
const clientIdMessage = ref("");
const CLIENT_ID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
async function saveClientId(): Promise<void> {
    const b = bridge.value;
    if (b === null || b.configureClient === undefined) return;
    const answer = await b.configureClient(clientIdDraft.value.trim());
    clientIdMessage.value = answer.ok ? t("liveViewer.auth.clientSaved", "Saved. You can add an account and sign in now.") : answer.message;
    if (answer.ok) clientConfigured.value = true;
}
const deviceCode = ref<DeviceCode | null>(null);
const signingIn = ref(false);
const signedInNote = ref<string | null>(null);

const running = ref(false);
const operationId = ref("");
const steps = ref<HostStep[]>([]);
const failure = ref<Failure | null>(null);
const ready = ref<{ instance: ViewerInstance; verification: Verification } | null>(null);
const copied = ref(false);
const hosted = ref<InstanceStatus[]>([]);
const removeTarget = ref<string | null>(null);
const removeConfirm = ref("");
const managerNote = ref<string | null>(null);

let unsubscribe: (() => void) | null = null;

const STEP_LABELS: Record<HostStep["id"], [string, string]> = {
    docker: ["steps.docker", "Check Docker"],
    image: ["steps.image", "Load the bundled viewer image"],
    volumes: ["steps.volumes", "Prepare storage"],
    config: ["steps.config", "Write the viewer settings"],
    secrets: ["steps.secrets", "Store the Microsoft sign-in privately"],
    start: ["steps.start", "Start the viewer"],
    health: ["steps.health", "Open the link from this PC"],
    verify: ["steps.verify", "Wait for the bot to join"],
};

const kindOptions = computed(() => [
    { value: "viewer", title: t("liveViewer.kind.viewer", "Prismarine Viewer") },
    { value: "client", title: t("liveViewer.kind.client", "Prismarine Web Client") },
]);
const cameraOptions = computed(() => [
    { value: "follow", title: t("liveViewer.camera.follow", "Follow camera") },
    { value: "first", title: t("liveViewer.camera.first", "First person") },
]);
const authOptions = computed(() => [
    { value: "offline", title: t("liveViewer.auth.offline", "Offline name") },
    { value: "microsoft", title: t("liveViewer.auth.microsoft", "Microsoft account") },
]);
const serverItems = computed(() => [
    ...servers.value.map((server) => ({ value: server.id, title: server.label })),
    { value: MANUAL, title: t("liveViewer.server.manual", "Enter an address") },
]);
const hostItems = computed(() => hosts.value.map((host) => ({ value: host.kind === "local" ? "local" : (host.hostId ?? ""), title: host.label })));

const selectedServer = computed(() => servers.value.find((server) => server.id === chosenServer.value) ?? null);
const versionItems = computed(() => {
    const detected = selectedServer.value?.version;
    return [{ value: "auto", title: detected ? t("liveViewer.version.detectKnown", { version: detected }, "Detect ({version})") : t("liveViewer.version.detect", "Detect") }];
});
const visibleSteps = computed(() => steps.value.filter((step) => step.state !== "skipped" || step.detail !== null));
const clientOnlyNote = computed(() => settings.kind === "client");

const serverHost = computed(() => (selectedServer.value !== null ? selectedServer.value.host : manualHost.value.trim()));
const serverPort = ref(25565);
const portText = computed({ get: () => String(serverPort.value), set: (value: string) => (serverPort.value = Number(value)) });
const webPortText = computed({ get: () => String(webPort.value), set: (value: string) => (webPort.value = Number(value)) });
const delayText = computed({ get: () => String(settings.behaviours.reconnect.delaySeconds), set: (v: string) => (settings.behaviours.reconnect.delaySeconds = Number(v)) });
const triesText = computed({ get: () => String(settings.behaviours.reconnect.tries), set: (v: string) => (settings.behaviours.reconnect.tries = Number(v)) });

watch(selectedServer, (server) => {
    if (server === null) return;
    serverPort.value = server.port;
});

const botNameProblem = computed(() => (PLAYER_NAME.test(settings.botName) ? null : t("liveViewer.problem.botName", "Use 3 to 16 letters, digits or underscores.")));
const versionProblem = computed(() => (manualVersion.value && !NEEDED_VERSION.test(versionText.value.trim()) ? t("liveViewer.problem.version", "Write a version such as 1.21.4.") : null));
const followProblem = computed(() => (settings.behaviours.follow.enabled && !PLAYER_NAME.test(settings.behaviours.follow.player) ? t("liveViewer.problem.follow", "Name the player to follow, or turn following off.") : null));
const portProblem = computed(() => (Number.isInteger(webPort.value) && webPort.value >= 1024 && webPort.value <= 65535 ? null : t("liveViewer.problem.webPort", "Choose a web port between 1024 and 65535.")));
const serverPortProblem = computed(() => (Number.isInteger(serverPort.value) && serverPort.value >= 1 && serverPort.value <= 65535 ? null : t("liveViewer.problem.serverPort", "The server port must be between 1 and 65535.")));

/** Why Host cannot be pressed, named next to the button. Null when it can. */
const blockedBecause = computed<string | null>(() => {
    if (bridge.value === null) return t("liveViewer.blocked.noBridge", "Hosting needs the desktop application.");
    if (running.value) return t("liveViewer.blocked.running", "Already hosting.");
    if (serverHost.value === "") return t("liveViewer.blocked.server", "Choose a server or enter its address.");
    if (serverPortProblem.value !== null) return serverPortProblem.value;
    if (botNameProblem.value !== null) return botNameProblem.value;
    if (versionProblem.value !== null) return versionProblem.value;
    if (portProblem.value !== null) return portProblem.value;
    if (followProblem.value !== null) return followProblem.value;
    if (settings.auth === "microsoft" && chosenAccount.value === null) return t("liveViewer.blocked.account", "Choose a Microsoft account, or add one and sign in.");
    return null;
});

const authHelp = computed(() =>
    settings.auth === "microsoft"
        ? t("liveViewer.auth.microsoftHelp", "Sign in with a code at microsoft.com/link. The session is kept in protected app storage and written only to a private volume on the hosting machine.")
        : t("liveViewer.auth.offlineHelp", "Works on servers in offline mode only."),
);

function formatTime(iso: string): string {
    const date = new Date(iso);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const readyNote = computed(() => {
    if (ready.value === null) return "";
    const { verification } = ready.value;
    if (verification.botJoined) return t("liveViewer.ready.joined", { bot: verification.botName, time: formatTime(verification.checkedAt) }, "{bot} joined at {time}");
    return t("liveViewer.ready.notJoined", { bot: verification.botName, why: verification.botNote ?? t("liveViewer.ready.waiting", "it is still connecting") }, "The link works. {bot} has not joined yet: {why}");
});

function currentTarget(): { kind: "local" } | { kind: "ssh"; hostId: string } {
    return chosenHost.value === "local" ? { kind: "local" } : { kind: "ssh", hostId: chosenHost.value };
}

function buildSettings(): LiveViewerSettings {
    return {
        ...JSON.parse(JSON.stringify(settings)),
        server: { host: serverHost.value, port: serverPort.value },
        version: manualVersion.value ? versionText.value.trim() : "auto",
    } as LiveViewerSettings;
}

async function host(): Promise<void> {
    if (blockedBecause.value !== null || bridge.value === null || running.value) return;
    running.value = true;
    failure.value = null;
    ready.value = null;
    steps.value = [];
    operationId.value = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    try {
        const answer = await bridge.value.host({
            config: buildSettings(),
            target: currentTarget(),
            hostPort: webPort.value,
            name: viewerName.value.trim() || "Live viewer",
            ...(settings.auth === "microsoft" && chosenAccount.value !== null ? { accountRef: chosenAccount.value } : {}),
            operationId: operationId.value,
        });
        if (answer.steps !== undefined) steps.value = answer.steps;
        if (answer.ok) {
            ready.value = { instance: answer.instance, verification: answer.verification };
            await refreshHosted();
        } else failure.value = answer.failure;
    } finally {
        running.value = false;
    }
}

async function cancelHosting(): Promise<void> {
    if (bridge.value !== null && operationId.value !== "") await bridge.value.cancel(operationId.value);
}

async function copyLink(): Promise<void> {
    const url = ready.value?.instance.url;
    if (url === undefined) return;
    try {
        await navigator.clipboard.writeText(url);
        copied.value = true;
        setTimeout(() => (copied.value = false), 2500);
    } catch {
        copied.value = false;
    }
}

async function addAccount(): Promise<void> {
    if (bridge.value === null || newAccountLabel.value.trim() === "") return;
    const created = await bridge.value.createAccount(newAccountLabel.value.trim());
    if (created.ok) {
        accounts.value = [...accounts.value, created.value];
        chosenAccount.value = created.value.accountRef;
        newAccountLabel.value = "";
        signedInNote.value = null;
    } else failure.value = created.failure;
}

async function signIn(): Promise<void> {
    if (bridge.value === null || chosenAccount.value === null || signingIn.value) return;
    signingIn.value = true;
    deviceCode.value = null;
    signedInNote.value = null;
    try {
        const answer = await bridge.value.signIn(chosenAccount.value);
        signedInNote.value = answer.ok ? t("liveViewer.auth.signedIn", "Signed in. The account is ready to host.") : answer.failure.message;
    } finally {
        signingIn.value = false;
        deviceCode.value = null;
    }
}

async function cancelSignIn(): Promise<void> {
    if (bridge.value !== null && chosenAccount.value !== null) await bridge.value.cancelSignIn(chosenAccount.value);
}

async function refreshHosted(): Promise<void> {
    if (bridge.value === null || bridge.value.list === undefined) return;
    const listed = await bridge.value.list();
    if (listed.ok) hosted.value = listed.value;
}

async function control(id: string, action: "start" | "stop" | "restart"): Promise<void> {
    if (bridge.value === null) return;
    const answer = await bridge.value.control({ id, action });
    managerNote.value = answer.ok ? null : answer.failure.message;
    await refreshHosted();
}

async function confirmRemove(id: string): Promise<void> {
    if (bridge.value === null) return;
    const answer = await bridge.value.remove({ id, confirmName: removeConfirm.value });
    managerNote.value = answer.ok ? null : answer.failure.message;
    if (answer.ok) {
        removeTarget.value = null;
        removeConfirm.value = "";
    }
    await refreshHosted();
}

function stateLabel(state: InstanceStatus["state"]): string {
    return { running: t("liveViewer.state.running", "Running"), stopped: t("liveViewer.state.stopped", "Stopped"), missing: t("liveViewer.state.missing", "Missing from Docker"), unknown: t("liveViewer.state.unknown", "Unknown") }[state];
}

function close(): void {
    emit("update:modelValue", false);
}

onMounted(async () => {
    const b = bridge.value;
    if (b === null) return;
    unsubscribe = b.onEvent((event) => {
        if (event.kind === "progress" && event.operationId === operationId.value) steps.value = event.steps;
        if (event.kind === "device-code") deviceCode.value = event.code;
    });
    const choices = await b.choices();
    if (choices.ok) {
        servers.value = choices.servers;
        hosts.value = choices.hosts;
        if (choices.servers.length > 0) chosenServer.value = choices.servers[0]!.id;
    }
    const known = await b.accounts?.();
    if (known !== undefined) {
        accounts.value = known.value;
        accountsAvailable.value = known.available;
        if (known.value.length > 0) chosenAccount.value = known.value[0]!.accountRef;
    }
    const client = await b.clientId?.();
    if (client !== undefined) {
        clientConfigured.value = client.configured;
        clientIdDraft.value = client.clientId;
    }
    await refreshHosted();
});

onBeforeUnmount(() => unsubscribe?.());
</script>

<template>
    <VDialog :model-value="modelValue" max-width="1180" scrollable data-test="live-viewer-dialog" @update:model-value="(v: boolean) => emit('update:modelValue', v)">
        <VCard class="lv-card" role="dialog" aria-labelledby="lv-title">
            <VCardTitle class="lv-head">
                <h2 id="lv-title" class="lv-title">{{ t("liveViewer.title", "Live 3D viewer and bot") }}</h2>
                <VBtnToggle v-model="settings.kind" mandatory variant="outlined" divided class="lv-kind" :aria-label="t('liveViewer.kind.label', 'Viewer')" data-test="lv-kind">
                    <VBtn v-for="option in kindOptions" :key="option.value" :value="option.value" size="small">{{ option.title }}</VBtn>
                </VBtnToggle>
                <VBtn icon variant="text" :aria-label="t('liveViewer.close', 'Close')" data-test="lv-close" @click="close"><VIcon :icon="mdiClose" /></VBtn>
            </VCardTitle>

            <VCardText class="lv-body">
                <VAlert v-if="bridge === null" type="info" variant="tonal" class="mb-3" data-test="lv-no-bridge">
                    {{ t("liveViewer.noBridge", "Hosting a live viewer needs the desktop application. This build can show the settings but cannot host.") }}
                </VAlert>
                <div class="lv-grid">
                    <section class="lv-col" aria-labelledby="lv-srv">
                        <h3 id="lv-srv" class="lv-h">{{ t("liveViewer.server.title", "Minecraft server") }}</h3>
                        <VSelect v-model="chosenServer" :items="serverItems" item-title="title" item-value="value" :label="t('liveViewer.server.label', 'Server')" density="comfortable" hide-details data-test="lv-server" />
                        <div v-if="selectedServer === null" class="lv-row">
                            <VTextField v-model="manualHost" :label="t('liveViewer.server.host', 'Address')" density="comfortable" hide-details autocomplete="off" data-test="lv-manual-host" />
                            <VTextField v-model="portText" :label="t('liveViewer.server.port', 'Port')" type="number" min="1" max="65535" density="comfortable" hide-details data-test="lv-server-port" />
                        </div>
                        <div class="lv-row">
                            <VSelect :model-value="'auto'" :items="versionItems" item-title="title" item-value="value" :label="t('liveViewer.version.label', 'Version')" density="comfortable" hide-details :disabled="manualVersion" data-test="lv-version" />
                            <VTextField v-model="settings.botName" :label="t('liveViewer.bot.name', 'Bot name')" density="comfortable" :error-messages="botNameProblem ? [botNameProblem] : []" autocomplete="off" data-test="lv-bot-name" />
                        </div>
                        <VSwitch v-model="manualVersion" color="primary" density="compact" hide-details :label="t('liveViewer.version.manual', 'Choose the version by hand')" data-test="lv-manual-version" />
                        <VTextField v-if="manualVersion" v-model="versionText" :label="t('liveViewer.version.hand', 'Version')" density="comfortable" :error-messages="versionProblem ? [versionProblem] : []" placeholder="1.21.4" data-test="lv-version-text" />

                        <fieldset class="lv-fs">
                            <legend class="lv-legend">{{ t("liveViewer.auth.label", "Sign-in") }}</legend>
                            <VBtnToggle v-model="settings.auth" mandatory variant="outlined" divided density="comfortable" :aria-label="t('liveViewer.auth.label', 'Sign-in')" data-test="lv-auth">
                                <VBtn v-for="option in authOptions" :key="option.value" :value="option.value" size="small">{{ option.title }}</VBtn>
                            </VBtnToggle>
                            <span class="lv-help" data-test="lv-auth-help">{{ authHelp }}</span>
                            <template v-if="settings.auth === 'microsoft'">
                                <VAlert v-if="!accountsAvailable" type="warning" variant="tonal" density="compact" data-test="lv-no-storage">{{ t("liveViewer.auth.noStorage", "Protected account storage is unavailable on this PC, so a Microsoft account cannot be kept.") }}</VAlert>
                                <VSelect v-else v-model="chosenAccount" :items="accounts" item-title="label" item-value="accountRef" :label="t('liveViewer.auth.account', 'Account')" density="comfortable" hide-details :no-data-text="t('liveViewer.auth.noAccounts', 'No accounts yet. Add one below.')" data-test="lv-account" />
                                <div v-if="accountsAvailable && !clientConfigured" class="lv-client" data-test="lv-client">
                                    <span class="lv-help">{{ t("liveViewer.auth.clientHelp", "Microsoft sign-in uses the application (client) ID of an app registration in your Microsoft Entra account. Paste that ID once; it is kept on this PC.") }}</span>
                                    <div class="lv-row">
                                        <VTextField v-model="clientIdDraft" :label="t('liveViewer.auth.clientId', 'Application (client) ID')" placeholder="00000000-0000-0000-0000-000000000000" density="comfortable" hide-details spellcheck="false" autocomplete="off" data-test="lv-client-id" />
                                        <VBtn variant="tonal" :disabled="!CLIENT_ID_PATTERN.test(clientIdDraft.trim())" data-test="lv-client-save" @click="saveClientId">{{ t("liveViewer.auth.clientSave", "Save") }}</VBtn>
                                    </div>
                                    <span v-if="!CLIENT_ID_PATTERN.test(clientIdDraft.trim())" class="lv-help">{{ t("liveViewer.auth.clientShape", "Save turns on once the ID has the shape 00000000-0000-0000-0000-000000000000.") }}</span>
                                    <span v-if="clientIdMessage" class="lv-help" role="status">{{ clientIdMessage }}</span>
                                </div>
                                <div v-if="accountsAvailable" class="lv-row">
                                    <VTextField v-model="newAccountLabel" :label="t('liveViewer.auth.newLabel', 'New account label')" density="comfortable" hide-details data-test="lv-new-account" />
                                    <VBtn variant="tonal" :disabled="newAccountLabel.trim() === ''" data-test="lv-add-account" @click="addAccount">{{ t("liveViewer.auth.add", "Add") }}</VBtn>
                                </div>
                                <div v-if="accountsAvailable" class="lv-row">
                                    <VBtn color="primary" variant="tonal" :disabled="chosenAccount === null || signingIn" data-test="lv-sign-in" @click="signIn">{{ t("liveViewer.auth.signIn", "Sign in with Microsoft") }}</VBtn>
                                    <VBtn v-if="signingIn" variant="text" data-test="lv-cancel-sign-in" @click="cancelSignIn">{{ t("liveViewer.auth.cancel", "Cancel sign-in") }}</VBtn>
                                    <span v-if="chosenAccount === null" class="lv-help">{{ t("liveViewer.auth.chooseFirst", "Choose or add an account first.") }}</span>
                                </div>
                                <div v-if="deviceCode" class="lv-code" role="status" aria-live="polite" data-test="lv-device-code">
                                    <span>{{ t("liveViewer.auth.codeIntro", "Open this page and enter the code:") }}</span>
                                    <a :href="deviceCode.verificationUri" target="_blank" rel="noopener noreferrer">{{ deviceCode.verificationUri }}</a>
                                    <strong class="lv-code-value" data-test="lv-user-code">{{ deviceCode.userCode }}</strong>
                                    <VProgressCircular indeterminate size="18" width="2" :aria-label="t('liveViewer.auth.waiting', 'Waiting for sign-in')" />
                                </div>
                                <span v-if="signedInNote" class="lv-help" role="status" data-test="lv-signed-in">{{ signedInNote }}</span>
                            </template>
                        </fieldset>

                        <div class="lv-row">
                            <VSelect v-model="chosenHost" :items="hostItems" item-title="title" item-value="value" :label="t('liveViewer.host.label', 'Host on')" density="comfortable" hide-details data-test="lv-host" />
                            <VTextField v-model="webPortText" :label="t('liveViewer.host.port', 'Web port')" type="number" min="1024" max="65535" density="comfortable" :error-messages="portProblem ? [portProblem] : []" data-test="lv-web-port" />
                        </div>
                        <VTextField v-model="viewerName" :label="t('liveViewer.host.name', 'Name in the list')" density="comfortable" hide-details autocomplete="off" data-test="lv-name" />
                    </section>

                    <section class="lv-col" aria-labelledby="lv-view">
                        <h3 id="lv-view" class="lv-h">{{ t("liveViewer.view.title", "Viewer") }}</h3>
                        <VAlert v-if="clientOnlyNote" type="info" variant="tonal" density="compact" data-test="lv-client-note">
                            {{ t("liveViewer.view.clientNote", "Prismarine Web Client is its own player in the visitor's browser. The camera, mouse look, other players, chat panel and view distance below apply to Prismarine Viewer only. The bot's behaviours still apply.") }}
                        </VAlert>
                        <VSlider v-model="settings.viewDistance" :min="2" :max="16" :step="1" thumb-label :disabled="clientOnlyNote" :label="t('liveViewer.view.distance', 'View distance') + ': ' + settings.viewDistance" density="comfortable" hide-details data-test="lv-distance" />
                        <VBtnToggle v-model="settings.camera" mandatory variant="outlined" divided :disabled="clientOnlyNote" :aria-label="t('liveViewer.camera.label', 'Camera')" data-test="lv-camera">
                            <VBtn v-for="option in cameraOptions" :key="option.value" :value="option.value" size="small">{{ option.title }}</VBtn>
                        </VBtnToggle>
                        <VSwitch v-model="settings.mouseLook" color="primary" hide-details :disabled="clientOnlyNote" :label="t('liveViewer.view.mouseLook', 'Mouse look for visitors')" data-test="lv-mouse-look" />
                        <VSwitch v-model="settings.showPlayers" color="primary" hide-details :disabled="clientOnlyNote" :label="t('liveViewer.view.players', 'Show other players')" data-test="lv-show-players" />
                        <VSwitch v-model="settings.showChat" color="primary" hide-details :disabled="clientOnlyNote" :label="t('liveViewer.view.chat', 'Show chat beside the view')" data-test="lv-show-chat" />
                    </section>

                    <section class="lv-col" aria-labelledby="lv-bot">
                        <h3 id="lv-bot" class="lv-h">{{ t("liveViewer.behaviour.title", "Bot behaviour") }}</h3>
                        <VSwitch v-model="settings.behaviours.reconnect.enabled" color="primary" hide-details :label="t('liveViewer.behaviour.reconnect', 'Reconnect after a kick')" data-test="lv-reconnect" />
                        <div v-if="settings.behaviours.reconnect.enabled" class="lv-row">
                            <VTextField v-model="delayText" type="number" min="1" max="3600" :label="t('liveViewer.behaviour.delay', 'Wait (seconds)')" density="comfortable" hide-details data-test="lv-delay" />
                            <VTextField v-model="triesText" type="number" min="1" max="1000" :label="t('liveViewer.behaviour.tries', 'Tries')" density="comfortable" hide-details data-test="lv-tries" />
                        </div>
                        <VSwitch v-model="settings.behaviours.follow.enabled" color="primary" hide-details :label="t('liveViewer.behaviour.follow', 'Follow a player')" data-test="lv-follow" />
                        <VTextField v-if="settings.behaviours.follow.enabled" v-model="settings.behaviours.follow.player" :label="t('liveViewer.behaviour.player', 'Player to follow')" density="comfortable" :error-messages="followProblem ? [followProblem] : []" autocomplete="off" data-test="lv-follow-player" />
                        <VSwitch v-model="settings.behaviours.lookAtPlayers" color="primary" hide-details :label="t('liveViewer.behaviour.look', 'Look at nearby players')" data-test="lv-look" />
                        <VSwitch v-model="settings.behaviours.relayChat" color="primary" hide-details :label="t('liveViewer.behaviour.relay', 'Relay chat to the page')" data-test="lv-relay" />
                        <VSwitch v-model="settings.behaviours.sleepAtNight" color="primary" hide-details :label="t('liveViewer.behaviour.sleep', 'Sleep at night')" data-test="lv-sleep" />
                    </section>
                </div>

                <ol v-if="steps.length > 0" class="lv-steps" aria-live="polite" data-test="lv-steps">
                    <li v-for="step in visibleSteps" :key="step.id" :class="['lv-step', 'lv-' + step.state]">
                        <span class="lv-step-state">{{ { pending: "·", running: "…", done: "✓", failed: "✗", skipped: "–" }[step.state] }}</span>
                        <span>{{ t("liveViewer." + STEP_LABELS[step.id][0], STEP_LABELS[step.id][1]) }}</span>
                        <span v-if="step.detail" class="lv-help">{{ step.detail }}</span>
                    </li>
                </ol>

                <VAlert v-if="failure" type="error" variant="tonal" class="mt-3" role="alert" data-test="lv-failure">
                    <strong>{{ failure.message }}</strong>
                    <div v-if="failure.detail" class="lv-help">{{ failure.detail }}</div>
                </VAlert>

                <div v-if="ready" class="lv-ready" role="status" aria-live="polite" data-test="lv-ready">
                    <strong>{{ ready.instance.kind === "viewer" ? t("liveViewer.ready.viewer", "Prismarine Viewer is up") : t("liveViewer.ready.client", "Prismarine Web Client is up") }}</strong>
                    <code class="lv-url" data-test="lv-url">{{ ready.instance.url }}</code>
                    <VBtn color="primary" :href="ready.instance.url" target="_blank" rel="noopener noreferrer" :prepend-icon="mdiOpenInNew" data-test="lv-open">{{ t("liveViewer.ready.open", "Open") }}</VBtn>
                    <VBtn variant="outlined" :prepend-icon="mdiContentCopy" data-test="lv-copy" @click="copyLink">{{ copied ? t("liveViewer.ready.copied", "Copied") : t("liveViewer.ready.copy", "Copy link") }}</VBtn>
                    <span class="lv-help" data-test="lv-ready-note">{{ readyNote }}</span>
                </div>

                <section v-if="hosted.length > 0" class="lv-manager" aria-labelledby="lv-mgr">
                    <h3 id="lv-mgr" class="lv-h">{{ t("liveViewer.manager.title", "Hosted viewers") }}</h3>
                    <VAlert v-if="managerNote" type="warning" variant="tonal" density="compact">{{ managerNote }}</VAlert>
                    <ul class="lv-list">
                        <li v-for="status in hosted" :key="status.instance.id" class="lv-item" data-test="lv-hosted">
                            <div class="lv-item-main">
                                <strong>{{ status.instance.name }}</strong>
                                <span class="lv-help">{{ stateLabel(status.state) }} · {{ status.instance.serverLabel }} · {{ status.instance.url }}<template v-if="status.botConnected !== null"> · {{ status.botConnected ? t("liveViewer.manager.botIn", "bot is in") : t("liveViewer.manager.botOut", "bot is not in") }}</template></span>
                            </div>
                            <VBtn size="small" variant="text" :href="status.instance.url" target="_blank" rel="noopener noreferrer">{{ t("liveViewer.ready.open", "Open") }}</VBtn>
                            <VBtn v-if="status.state === 'running'" size="small" variant="text" data-test="lv-stop" @click="control(status.instance.id, 'stop')">{{ t("liveViewer.manager.stop", "Stop") }}</VBtn>
                            <VBtn v-else-if="status.state === 'stopped'" size="small" variant="text" data-test="lv-start" @click="control(status.instance.id, 'start')">{{ t("liveViewer.manager.start", "Start") }}</VBtn>
                            <VBtn size="small" variant="text" color="error" data-test="lv-remove" @click="removeTarget = status.instance.id; removeConfirm = ''">{{ t("liveViewer.manager.remove", "Remove") }}</VBtn>
                            <div v-if="removeTarget === status.instance.id" class="lv-remove-box" role="group" :aria-label="t('liveViewer.manager.confirmGroup', 'Confirm removal')">
                                <span class="lv-help">{{ t("liveViewer.manager.confirm", "Type the viewer's name to remove it, its settings and its stored sign-in. The Minecraft server is not touched.") }}</span>
                                <VTextField v-model="removeConfirm" density="compact" hide-details :label="t('liveViewer.manager.confirmName', 'Viewer name')" data-test="lv-remove-name" />
                                <VBtn size="small" color="error" :disabled="removeConfirm !== status.instance.name" data-test="lv-remove-confirm" @click="confirmRemove(status.instance.id)">{{ t("liveViewer.manager.removeNow", "Remove now") }}</VBtn>
                                <VBtn size="small" variant="text" @click="removeTarget = null">{{ t("liveViewer.manager.keep", "Keep it") }}</VBtn>
                            </div>
                        </li>
                    </ul>
                </section>

                <div class="lv-actions">
                    <VBtn color="primary" size="large" :loading="running" :disabled="blockedBecause !== null" data-test="lv-host-button" @click="host">{{ t("liveViewer.host.button", "Host the view") }}</VBtn>
                    <VBtn v-if="running" variant="outlined" size="large" data-test="lv-cancel" @click="cancelHosting">{{ t("liveViewer.host.cancel", "Cancel") }}</VBtn>
                    <span v-if="blockedBecause" class="lv-help" role="note" data-test="lv-blocked">{{ blockedBecause }}</span>
                </div>
            </VCardText>
        </VCard>
    </VDialog>
</template>

<style scoped>
.lv-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.lv-title { margin: 0; font-size: 1.5rem; font-weight: 500; flex: 1 1 auto; }
.lv-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.lv-col { background: rgb(var(--v-theme-surface-variant), 0.12); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.lv-h { margin: 0; font-size: 0.95rem; font-weight: 500; }
.lv-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: center; }
.lv-client { display: flex; flex-direction: column; gap: 6px; }
.lv-fs { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.lv-legend { font-size: 0.8rem; opacity: 0.8; margin-bottom: 4px; }
.lv-help { font-size: 0.8rem; opacity: 0.85; overflow-wrap: anywhere; }
.lv-code { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; background: rgb(var(--v-theme-primary), 0.14); }
.lv-code-value { font-family: "Roboto Mono", monospace; font-size: 1.3rem; letter-spacing: 0.12em; }
.lv-steps { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 4px; }
.lv-step { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.lv-step-state { width: 1.2em; text-align: center; font-weight: 700; }
.lv-failed .lv-step-state { color: rgb(var(--v-theme-error)); }
.lv-done .lv-step-state { color: rgb(var(--v-theme-success, 46 125 50)); }
.lv-ready { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px 18px; border-radius: 16px; background: rgb(var(--v-theme-primary), 0.18); }
.lv-url { flex: 1 1 260px; min-width: 0; padding: 8px 12px; border-radius: 10px; background: rgba(0, 0, 0, 0.2); overflow-wrap: anywhere; }
.lv-manager { margin-top: 16px; display: grid; gap: 8px; }
.lv-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.lv-item { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 12px; background: rgb(var(--v-theme-surface-variant), 0.12); }
.lv-item-main { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; }
.lv-remove-box { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.lv-actions { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
@media (max-width: 960px) { .lv-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 420px) { .lv-row { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
