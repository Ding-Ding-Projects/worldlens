<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCloudDownloadOutline, mdiConnection, mdiRefresh, mdiStop } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VChip,
    VDivider,
    VProgressCircular,
    VRadio,
    VRadioGroup,
    VSelect,
    VTextField,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import PathField from "../PathField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    resolveWorldDownloaderBridge,
    type DownloaderEvent,
    type DownloaderSettings,
    type DownloaderStatus,
    type WorldDownloaderBridge,
} from "./worldDownloaderBridge.js";

interface FinishedSummary {
    readonly bytes: number;
    readonly chunks: number;
    readonly dimensions: readonly { readonly dimension: string; readonly chunks: number }[];
    readonly notes: readonly string[];
}

/**
 * Getting a world off a live Minecraft server, through the bundled Fabric Carpet world
 * downloader.
 *
 * ## Why this screen is mostly a status report
 *
 * Every one of the main-process module's answers is a sentence rather than an exception - "no
 * Java on this machine", "that port is taken", "the settings are not filled in yet" - and this
 * screen's whole job is showing whichever one is true right now, honestly, rather than
 * predicting one before asking. `status()` is polled on mount and after every action; nothing
 * here optimistically shows a state the main process has not actually reported.
 *
 * ## The bridge can be absent
 *
 * `resolveWorldDownloaderBridge()` returns null on a build old enough not to expose the
 * namespace, or a hosted deployment that never will. That renders as an honest unavailable
 * card, never a silently inert form.
 */

const props = defineProps<{
    /**
     * Injected in tests. Left out, the Electron bridge is probed, which is why this has no
     * default: `undefined` means probe, `null` means there is deliberately no bridge and the
     * unavailable state is what should be shown.
     */
    bridge?: WorldDownloaderBridge | null | undefined;
}>();

const { t } = useI18n();

const bridge = ref<WorldDownloaderBridge | null>(
    props.bridge === undefined ? null : props.bridge,
);
const status = ref<DownloaderStatus | null>(null);
const settings = ref<DownloaderSettings | null>(null);
const settingsStored = ref(false);
const busy = ref<
    "none" | "testConnection" | "ensureJar" | "start" | "stop" | "save" | "token" | "port"
>("none");
const testMessage = ref<string | null>(null);
const startMessage = ref<string | null>(null);
const portFree = ref<boolean | null>(null);
const portMessage = ref<string | null>(null);
const savedJustNow = ref(false);
const log = ref<string[]>([]);
const logQuery = ref("");
const logRegex = ref(false);
const logFlags = ref("i");
const finished = ref<FinishedSummary | null>(null);
let unsubscribe: (() => void) | null = null;

const filteredLog = computed(() => {
    const matcher = createSettingMatcher(logQuery.value, logRegex.value, logFlags.value);
    if (matcher.error !== null || logQuery.value === "") return log.value;
    return log.value.filter((line) => matcher.test(line));
});

async function refreshStatus(): Promise<void> {
    if (bridge.value === null) return;
    status.value = await bridge.value.status();
}

async function loadSettings(): Promise<void> {
    if (bridge.value === null) return;
    const answer = await bridge.value.readSettings();
    settings.value = answer.settings;
    settingsStored.value = answer.stored;
}

function onEvent(event: DownloaderEvent): void {
    if (event.type === "log") log.value = [...log.value, event.line];
    if (event.type === "finished") {
        finished.value = {
            bytes: event.bytes,
            chunks: event.chunks,
            dimensions: event.dimensions,
            notes: event.notes,
        };
    }
    void refreshStatus();
}

onMounted(async () => {
    if (props.bridge === undefined) bridge.value = resolveWorldDownloaderBridge();
    if (bridge.value === null) return;
    unsubscribe = bridge.value.onWorldDownloaderEvent(onEvent);
    await Promise.all([refreshStatus(), loadSettings()]);
});

onBeforeUnmount(() => {
    unsubscribe?.();
});

async function saveSettings(): Promise<void> {
    if (bridge.value === null || settings.value === null) return;
    busy.value = "save";
    savedJustNow.value = false;
    try {
        await bridge.value.writeSettings(settings.value);
        settingsStored.value = true;
        savedJustNow.value = true;
    } finally {
        busy.value = "none";
    }
}

async function testConnection(): Promise<void> {
    if (bridge.value === null || settings.value === null) return;
    busy.value = "testConnection";
    testMessage.value = null;
    try {
        const [host, portText] = settings.value.server.split(":");
        const port = portText === undefined ? undefined : Number.parseInt(portText, 10);
        const answer = await bridge.value.testConnection({
            host: host ?? "",
            ...(port === undefined || Number.isNaN(port) ? {} : { port }),
            declaredVersion: settings.value.declaredVersion,
        });
        testMessage.value = answer.message;
    } finally {
        busy.value = "none";
    }
}

async function ensureJar(): Promise<void> {
    if (bridge.value === null) return;
    busy.value = "ensureJar";
    try {
        await bridge.value.ensureJar();
        await refreshStatus();
    } finally {
        busy.value = "none";
    }
}

async function openTokenIntake(): Promise<void> {
    if (bridge.value === null) return;
    busy.value = "token";
    try {
        await bridge.value.openTokenIntake();
        await refreshStatus();
    } finally {
        busy.value = "none";
    }
}

async function clearToken(): Promise<void> {
    if (bridge.value === null) return;
    busy.value = "token";
    try {
        await bridge.value.clearToken();
        await refreshStatus();
    } finally {
        busy.value = "none";
    }
}

async function checkPort(): Promise<void> {
    if (bridge.value === null) return;
    busy.value = "port";
    portMessage.value = null;
    portFree.value = null;
    try {
        const rawOptions = settings.value?.options ?? {};
        const rawPort = rawOptions["proxyPort"];
        const port = typeof rawPort === "number" ? rawPort : 25566;
        const answer = await bridge.value.portFree(port);
        portFree.value = answer.free;
        portMessage.value = answer.message;
    } finally {
        busy.value = "none";
    }
}

async function start(): Promise<void> {
    if (bridge.value === null || settings.value === null) return;
    busy.value = "start";
    startMessage.value = null;
    finished.value = null;
    log.value = [];
    try {
        const answer = await bridge.value.start({ settings: settings.value });
        if (!answer.ok) startMessage.value = answer.message;
        await refreshStatus();
    } finally {
        busy.value = "none";
    }
}

async function stop(): Promise<void> {
    if (bridge.value === null || status.value?.session.sessionId == null) return;
    busy.value = "stop";
    try {
        await bridge.value.stop(status.value.session.sessionId);
        await refreshStatus();
    } finally {
        busy.value = "none";
    }
}

const running = computed(() => status.value?.session.sessionId !== null && status.value !== null);

/**
 * A literal `t()` call per phase, deliberately, rather than one dynamic template-literal key.
 *
 * `catalogueCoverage.test.ts` reads this file's source for literal string keys; a key built
 * from `status.session.phase` at runtime is invisible to that scan and would let a screen on
 * `COVERED_SURFACES` silently answer an untranslated phase name forever.
 */
const phaseLabel = computed<string | null>(() => {
    switch (status.value?.session.phase) {
        case "connecting":
            return t("worldDownloader.session.phase.connecting", "Connecting...");
        case "signing-in":
            return t("worldDownloader.session.phase.signing-in", "Signing in...");
        case "downloading":
            return t("worldDownloader.session.phase.downloading", "Downloading chunks...");
        case "finishing":
            return t("worldDownloader.session.phase.finishing", "Finishing up...");
        case "done":
            return t("worldDownloader.session.phase.done", "Finished.");
        case "failed":
            return t("worldDownloader.session.phase.failed", "Failed.");
        default:
            return null;
    }
});
</script>

<template>
    <div class="mb-world-downloader" data-test="world-downloader-screen">
        <VCard v-if="bridge === null" data-test="world-downloader-unavailable">
            <VCardTitle>{{ t("worldDownloader.title", "Get a world off a server") }}</VCardTitle>
            <VCardText>
                {{
                    t(
                        "worldDownloader.unavailable",
                        "This build cannot reach the world downloader. The desktop bridge is not available.",
                    )
                }}
            </VCardText>
        </VCard>

        <template v-else>
            <VCard class="mb-4">
                <VCardTitle>{{ t("worldDownloader.title", "Get a world off a server") }}</VCardTitle>
                <VCardText>
                    <p>
                        {{
                            t(
                                "worldDownloader.help",
                                "Connects to a Minecraft server as a normal client and saves every chunk it is sent to a folder on this computer, using the bundled Fabric Carpet world downloader.",
                            )
                        }}
                    </p>

                    <div class="mb-status-row" data-test="world-downloader-status">
                        <VChip
                            :color="status?.jar ? 'primary' : undefined"
                            data-test="world-downloader-jar-chip"
                        >
                            {{
                                status?.jar
                                    ? t("worldDownloader.status.jar.present", "Downloader tool: ready")
                                    : t(
                                          "worldDownloader.status.jar.missing",
                                          "Downloader tool: not downloaded yet",
                                      )
                            }}
                        </VChip>
                        <VChip
                            :color="status?.java.available ? 'primary' : 'error'"
                            data-test="world-downloader-java-chip"
                        >
                            {{
                                status?.java.available
                                    ? t("worldDownloader.status.java.present", "Java: found")
                                    : t("worldDownloader.status.java.missing", "Java: not found")
                            }}
                        </VChip>
                        <VBtn
                            v-if="!status?.jar"
                            :loading="busy === 'ensureJar'"
                            :disabled="busy !== 'none'"
                            :prepend-icon="mdiCloudDownloadOutline"
                            data-test="world-downloader-get-jar"
                            @click="ensureJar"
                        >
                            {{
                                busy === "ensureJar"
                                    ? t("worldDownloader.status.getJar.running", "Getting the downloader...")
                                    : t("worldDownloader.status.getJar", "Get the downloader")
                            }}
                        </VBtn>
                    </div>
                </VCardText>
            </VCard>

            <VCard v-if="settings !== null" class="mb-4">
                <VCardTitle>{{ t("worldDownloader.settings.server", "Server address") }}</VCardTitle>
                <VCardText>
                    <VAlert v-if="!settingsStored" type="info" variant="tonal" class="mb-2">
                        {{
                            t(
                                "worldDownloader.settings.usingDefaults",
                                "These are the application's own defaults - nothing has been saved yet.",
                            )
                        }}
                    </VAlert>
                    <VTextField
                        v-model="settings.server"
                        :label="t('worldDownloader.settings.server', 'Server address')"
                        :hint="t('worldDownloader.settings.serverHint', '')"
                        persistent-hint
                        data-test="world-downloader-server-field"
                    />
                    <PathField
                        v-model="settings.outputFolder"
                        field="the folder to save the world into"
                        semantic="folder"
                        :label="t('worldDownloader.settings.outputFolder', 'Save the world to')"
                        density="compact"
                        data-test="world-downloader-output-field"
                    />
                    <VTextField
                        v-model="settings.declaredVersion"
                        :label="t('worldDownloader.settings.declaredVersion', 'Server version')"
                        data-test="world-downloader-version-field"
                    />
                    <VRadioGroup
                        v-model="settings.account.mode"
                        :label="t('worldDownloader.settings.accountMode', 'Sign in as')"
                        data-test="world-downloader-account-mode"
                    >
                        <VRadio
                            value="microsoft"
                            :label="t('worldDownloader.settings.accountMode.microsoft', 'Microsoft account')"
                        />
                        <VRadio
                            value="token"
                            :label="t('worldDownloader.settings.accountMode.token', 'Existing access token')"
                        />
                        <VRadio
                            value="offline"
                            :label="t('worldDownloader.settings.accountMode.offline', 'Offline / cracked server')"
                        />
                    </VRadioGroup>
                    <VTextField
                        v-model="settings.account.username"
                        :label="t('worldDownloader.settings.username', 'Username')"
                        data-test="world-downloader-username-field"
                    />

                    <template v-if="settings.account.mode === 'token'">
                        <p data-test="world-downloader-token-status">
                            {{
                                status?.secret.held
                                    ? t("worldDownloader.settings.tokenHeld", "A token is held for this computer.")
                                    : t("worldDownloader.settings.tokenNotHeld", "No token is held.")
                            }}
                        </p>
                        <p>
                            {{
                                t(
                                    "worldDownloader.settings.tokenIntakeExplain",
                                    "The token is typed into its own window, and this screen never sees the value.",
                                )
                            }}
                        </p>
                        <div class="mb-status-row">
                            <VBtn
                                :loading="busy === 'token'"
                                :disabled="busy !== 'none'"
                                data-test="world-downloader-open-token-intake"
                                @click="openTokenIntake"
                            >
                                {{ t("worldDownloader.settings.openTokenIntake", "Add access token") }}
                            </VBtn>
                            <VBtn
                                :loading="busy === 'token'"
                                :disabled="busy !== 'none' || !status?.secret.held"
                                data-test="world-downloader-clear-token"
                                @click="clearToken"
                            >
                                {{ t("worldDownloader.settings.clearToken", "Forget token") }}
                            </VBtn>
                        </div>
                    </template>

                    <div class="mb-status-row">
                        <VBtn
                            :loading="busy === 'save'"
                            :disabled="busy !== 'none'"
                            color="primary"
                            data-test="world-downloader-save-settings"
                            @click="saveSettings"
                        >
                            {{ t("worldDownloader.settings.save", "Save settings") }}
                        </VBtn>
                        <VBtn
                            :loading="busy === 'testConnection'"
                            :disabled="busy !== 'none'"
                            :prepend-icon="mdiConnection"
                            data-test="world-downloader-test-connection"
                            @click="testConnection"
                        >
                            {{
                                busy === "testConnection"
                                    ? t("worldDownloader.testConnection.running", "Testing the connection...")
                                    : t("worldDownloader.testConnection", "Test connection")
                            }}
                        </VBtn>
                        <VBtn
                            :loading="busy === 'port'"
                            :disabled="busy !== 'none'"
                            data-test="world-downloader-check-port"
                            @click="checkPort"
                        >
                            {{ t("worldDownloader.status.checkPort", "Check proxy port") }}
                        </VBtn>
                    </div>
                    <VAlert v-if="savedJustNow" type="success" variant="tonal" class="mt-2" data-test="world-downloader-saved">
                        {{ t("worldDownloader.settings.saved", "Settings saved.") }}
                    </VAlert>
                    <VAlert v-if="testMessage" type="info" variant="tonal" class="mt-2">
                        {{ testMessage }}
                    </VAlert>
                    <VAlert v-if="portMessage" type="info" variant="tonal" class="mt-2" data-test="world-downloader-port-message">
                        {{
                            portFree === true
                                ? t("worldDownloader.status.portFree", "Proxy port is free.")
                                : t("worldDownloader.status.portTaken", "That port is already taken.")
                        }}
                        {{ portMessage }}
                    </VAlert>
                </VCardText>
            </VCard>

            <VCard>
                <VCardTitle>
                    {{ running ? t("worldDownloader.stop", "Stop") : t("worldDownloader.start", "Start download") }}
                </VCardTitle>
                <VCardText>
                    <div class="mb-status-row">
                        <VBtn
                            v-if="!running"
                            color="primary"
                            :loading="busy === 'start'"
                            :disabled="busy !== 'none' || !status?.jar || !status?.java.available"
                            :prepend-icon="mdiCloudDownloadOutline"
                            data-test="world-downloader-start"
                            @click="start"
                        >
                            {{ t("worldDownloader.start", "Start download") }}
                        </VBtn>
                        <VBtn
                            v-else
                            color="error"
                            :loading="busy === 'stop'"
                            :disabled="busy !== 'none'"
                            :prepend-icon="mdiStop"
                            data-test="world-downloader-stop"
                            @click="stop"
                        >
                            {{ t("worldDownloader.stop", "Stop") }}
                        </VBtn>
                        <VProgressCircular v-if="running" indeterminate size="20" />
                        <span v-if="phaseLabel !== null" data-test="world-downloader-phase">
                            {{ phaseLabel }}
                        </span>
                    </div>
                    <VAlert
                        v-if="!running && (!status?.jar || !status?.java.available)"
                        type="warning"
                        variant="tonal"
                        class="mt-2"
                        data-test="world-downloader-blocked"
                    >
                        {{ t("worldDownloader.start.blocked", "Fix the settings above before starting.") }}
                    </VAlert>
                    <VAlert v-if="startMessage" type="error" variant="tonal" class="mt-2">
                        {{ startMessage }}
                    </VAlert>

                    <VCard v-if="finished !== null" variant="tonal" class="my-4" data-test="world-downloader-finished">
                        <VCardText>
                            <p>
                                {{ t("worldDownloader.session.chunks", "Chunks saved") }}: {{ finished.chunks }}
                            </p>
                            <p>
                                {{ t("worldDownloader.session.bytes", "Bytes written") }}: {{ finished.bytes }}
                            </p>
                            <p>{{ t("worldDownloader.session.dimensions", "By dimension") }}:</p>
                            <ul>
                                <li v-for="dimension in finished.dimensions" :key="dimension.dimension">
                                    {{ dimension.dimension }}: {{ dimension.chunks }}
                                </li>
                            </ul>
                            <template v-if="finished.notes.length > 0">
                                <p>{{ t("worldDownloader.session.notes", "Notes") }}:</p>
                                <ul>
                                    <li v-for="note in finished.notes" :key="note">{{ note }}</li>
                                </ul>
                            </template>
                        </VCardText>
                    </VCard>

                    <VDivider class="my-4" />

                    <ConfigSearchField
                        v-model="logQuery"
                        v-model:regex="logRegex"
                        v-model:flags="logFlags"
                        :label="t('worldDownloader.session.log', 'Log')"
                        :placeholder="t('worldDownloader.search.placeholder', 'Filter the log')"
                        :sample="log.join('\n')"
                        data-test="world-downloader-log-search"
                    />
                    <pre class="mb-log" data-test="world-downloader-log">{{ filteredLog.join('\n') }}</pre>
                </VCardText>
            </VCard>
        </template>
    </div>
</template>

<style scoped>
.mb-status-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.mb-log {
    max-height: 240px;
    overflow: auto;
    font-family: monospace;
    font-size: 0.85em;
}
</style>
