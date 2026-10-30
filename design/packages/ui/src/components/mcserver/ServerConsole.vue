<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowCollapseDown,
    mdiContentCopy,
    mdiDownload,
    mdiFlash,
    mdiHammerWrench,
    mdiRefresh,
    mdiSend,
} from "@mdi/js";
import { VAlert, VBtn, VBtnToggle, VCard, VCardText, VChip, VTextField } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import CommandBuilder from "./CommandBuilder.vue";
import { useServerStore } from "./useServers.js";
import {
    consoleClose,
    consoleOpen,
    consoleSend,
    onConsoleLine,
    rconTest,
    type RconTestResult,
} from "./mcserverBridge.js";
import type { ConsoleLine } from "./serverStore.js";

/**
 * The live transcript for one server, plus a real command box when the server's
 * `console` capability is anything better than `"none"`.
 *
 * `consoleOpen` starts a session and `onConsoleLine` streams it; `logTail` still backs the
 * initial fill so the box is never empty while the session negotiates. RCON reachability is
 * shown as a chip rather than assumed - the send box stays disabled, with the exact reason
 * named, until a session is actually open.
 */
const props = withDefaults(defineProps<{ serverId: string }>(), {});

const { t } = useI18n();
const store = useServerStore();

const lines = ref<ConsoleLine[]>([]);
const failure = ref<string | null>(null);
const query = ref("");
const useRegex = ref(false);
const flags = ref("i");
const levelFilter = ref<"all" | "stdout" | "stderr" | "app">("all");
const follow = ref(true);
const logRef = ref<HTMLElement | null>(null);

const sessionId = ref<string | null>(null);
const opening = ref(false);
const rcon = ref<RconTestResult | null>(null);

const command = ref("");
const builderOpen = ref(false);
const history = ref<string[]>([]);
const historyIndex = ref<number | null>(null);
const sending = ref(false);

const COMMON_COMMANDS = [
    "say",
    "stop",
    "save-all",
    "whitelist",
    "op",
    "deop",
    "kick",
    "ban",
    "gamemode",
    "difficulty",
    "time set",
    "weather",
];

let unsubscribe: (() => void) | null = null;
let sessionGeneration = 0;
let disposed = false;

async function fillFromTail(): Promise<void> {
    const observedId = props.serverId;
    const result = await store.logTail(observedId, 500);
    if (disposed || observedId !== props.serverId) return;
    if (result.ok) {
        lines.value = [...(result.value ?? [])];
        failure.value = null;
    } else {
        failure.value =
            result.failure?.message ??
            t("mcserver.console.readFailed", "The log could not be read.");
    }
}

async function openSession(): Promise<void> {
    if (disposed) return;
    const generation = ++sessionGeneration;
    const serverId = props.serverId;
    const previous = sessionId.value;
    sessionId.value = null;
    opening.value = true;
    try {
        if (previous) await consoleClose(serverId, previous);
        const result = await consoleOpen(serverId, 500);
        if (disposed || generation !== sessionGeneration || serverId !== props.serverId) {
            if (result.ok && result.value) await consoleClose(serverId, result.value.sessionId);
            return;
        }
        if (result.ok && result.value) {
            sessionId.value = result.value.sessionId;
            failure.value = null;
        } else
            failure.value =
                result.failure?.message ??
                t("mcserver.console.noSession", "No console session is open yet.");
    } catch {
        if (generation === sessionGeneration)
            failure.value = t("mcserver.console.noSession", "No console session is open yet.");
    } finally {
        if (generation === sessionGeneration) opening.value = false;
    }
}

async function refreshRcon(): Promise<void> {
    const observedId = props.serverId;
    const result = await rconTest(observedId);
    if (disposed || observedId !== props.serverId) return;
    rcon.value = result.ok
        ? (result.value ?? null)
        : { ok: false, latencyMs: null, message: result.failure?.message ?? "" };
}

async function scrollIfFollowing(): Promise<void> {
    if (!follow.value) return;
    await nextTick();
    const el = logRef.value;
    if (el) el.scrollTop = el.scrollHeight;
}

onMounted(async () => {
    await fillFromTail();
    if (disposed) return;
    unsubscribe = onConsoleLine((forSessionId, event) => {
        if (sessionId.value === null || forSessionId !== sessionId.value) return;
        lines.value = [...lines.value, event];
        void scrollIfFollowing();
    });
    await openSession();
    await refreshRcon();
    void scrollIfFollowing();
});
onBeforeUnmount(() => {
    disposed = true;
    ++sessionGeneration;
    if (unsubscribe) unsubscribe();
    if (sessionId.value !== null) void consoleClose(props.serverId, sessionId.value);
});
watch(
    () => props.serverId,
    async (_current, previous) => {
        ++sessionGeneration;
        if (sessionId.value !== null) await consoleClose(previous, sessionId.value);
        sessionId.value = null;
        history.value = [];
        await fillFromTail();
        await openSession();
        await refreshRcon();
    },
);

// A new attempt owns a new console session. Observation loss never invents a stopped state.
watch(
    () => {
        const status = store.statuses[props.serverId] as
            ((typeof store.statuses)[string] & { attemptId?: string }) | undefined;
        return status?.running ? `${status.attemptId ?? status.startedAt ?? "running"}` : null;
    },
    (attempt, previous) => {
        if (attempt !== null && attempt !== previous) void openSession();
    },
);

const filteredLines = computed(() => {
    let out = lines.value;
    if (levelFilter.value !== "all") out = out.filter((line) => line.stream === levelFilter.value);
    if (query.value.trim() === "") return out;
    if (!useRegex.value) {
        const needle = query.value.toLowerCase();
        return out.filter((line) => line.text.toLowerCase().includes(needle));
    }
    try {
        const pattern = new RegExp(query.value, flags.value);
        return out.filter((line) => pattern.test(line.text));
    } catch {
        return [];
    }
});

const sampleText = computed(() => lines.value.map((l) => l.text).join("\n"));

function colourFor(stream: ConsoleLine["stream"]): string {
    if (stream === "stderr") return "error";
    if (stream === "app") return "primary";
    return "";
}

/** The line's own clock time, HH:MM:SS, or nothing when the host sent no parseable time. */
function timeOf(at: string): string {
    const parsed = new Date(at);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toTimeString().slice(0, 8);
}

const sendReason = computed<string | null>(() => {
    if (sessionId.value === null)
        return t("mcserver.console.noSession", "No console session is open yet.");
    return null;
});

function useBuiltCommand(text: string): void {
    command.value = text;
}

async function send(): Promise<void> {
    const text = command.value.trim();
    if (text === "" || sessionId.value === null || sending.value) return;
    const ownedServer = props.serverId;
    const ownedSession = sessionId.value;
    sending.value = true;
    const result = await consoleSend(ownedServer, ownedSession, text);
    sending.value = false;
    if (ownedServer !== props.serverId || ownedSession !== sessionId.value) return;
    if (result.ok) {
        history.value = [...history.value, text];
        historyIndex.value = null;
        command.value = "";
    } else {
        failure.value =
            result.failure?.message ??
            t("mcserver.console.sendFailed", "The command could not be sent.");
    }
}

function historyUp(): void {
    if (history.value.length === 0) return;
    const next =
        historyIndex.value === null
            ? history.value.length - 1
            : Math.max(0, historyIndex.value - 1);
    historyIndex.value = next;
    command.value = history.value[next] ?? "";
}
function historyDown(): void {
    if (historyIndex.value === null) return;
    const next = historyIndex.value + 1;
    if (next >= history.value.length) {
        historyIndex.value = null;
        command.value = "";
        return;
    }
    historyIndex.value = next;
    command.value = history.value[next] ?? "";
}

const completions = computed(() => {
    const prefix = command.value.trim().toLowerCase();
    if (prefix === "") return [];
    return COMMON_COMMANDS.filter((c) => c.startsWith(prefix) && c !== prefix);
});

async function copyTranscript(): Promise<void> {
    try {
        await navigator.clipboard.writeText(
            filteredLines.value.map((l) => `[${l.stream}] ${l.text}`).join("\n"),
        );
    } catch {
        // Clipboard access can be refused by the platform; nothing more useful to do here.
    }
}
function exportTranscript(): void {
    const text = filteredLines.value.map((l) => `[${l.at}] [${l.stream}] ${l.text}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${props.serverId}-console.log`;
    a.click();
    URL.revokeObjectURL(url);
}
</script>

<template>
    <div class="wl-mcserver-console">
        <div class="wl-mcserver-console__toolbar">
            <ConfigSearchField
                v-model="query"
                v-model:regex="useRegex"
                v-model:flags="flags"
                :label="t('mcserver.console.search', 'Search log')"
                :sample="sampleText"
                class="wl-mcserver-console__search"
            />
            <VBtnToggle
                v-model="levelFilter"
                mandatory
                class="wl-mcserver-console__levels"
                :aria-label="t('mcserver.console.level', { level: levelFilter }, 'Level: {level}')"
            >
                <VBtn
                    v-for="level in ['all', 'stdout', 'stderr', 'app'] as const"
                    :key="level"
                    :value="level"
                    :variant="levelFilter === level ? 'flat' : 'outlined'"
                    :color="levelFilter === level ? 'primary-container' : 'on-surface-variant'"
                    :aria-pressed="levelFilter === level"
                >
                    {{ level }}
                </VBtn>
            </VBtnToggle>
            <VBtn
                class="wl-mcserver-console__tool"
                :prepend-icon="mdiArrowCollapseDown"
                variant="outlined"
                :color="follow ? 'primary' : 'on-surface-variant'"
                :aria-pressed="follow"
                @click="follow = !follow"
            >
                {{
                    follow
                        ? t("mcserver.console.following", "Following")
                        : t("mcserver.console.paused", "Paused")
                }}
            </VBtn>
            <VBtn
                class="wl-mcserver-console__icon"
                :icon="mdiRefresh"
                variant="outlined"
                color="on-surface-variant"
                :aria-label="t('mcserver.console.refresh', 'Refresh')"
                :title="t('mcserver.console.refresh', 'Refresh')"
                @click="fillFromTail"
            />
            <VBtn
                class="wl-mcserver-console__icon"
                :icon="mdiContentCopy"
                variant="outlined"
                color="on-surface-variant"
                :aria-label="t('mcserver.console.copy', 'Copy')"
                :title="t('mcserver.console.copy', 'Copy')"
                @click="copyTranscript"
            />
            <VBtn
                class="wl-mcserver-console__icon"
                :icon="mdiDownload"
                variant="outlined"
                color="on-surface-variant"
                :aria-label="t('mcserver.console.export', 'Export')"
                :title="t('mcserver.console.export', 'Export')"
                @click="exportTranscript"
            />
        </div>
        <VAlert v-if="failure" type="warning" variant="tonal" class="mb-3">{{ failure }}</VAlert>
        <VCard variant="outlined" class="wl-mcserver-console__card">
            <VCardText ref="logRef" class="wl-mcserver-console__log" role="log" aria-live="polite">
                <div v-if="filteredLines.length === 0" class="wl-mcserver-console__empty">
                    {{ t("mcserver.console.empty", "No log lines yet.") }}
                </div>
                <div
                    v-for="(line, index) in filteredLines"
                    :key="index"
                    class="wl-mcserver-console__line"
                >
                    <span class="wl-mcserver-console__at">{{ timeOf(line.at) }}</span>
                    <span class="wl-mcserver-console__stream">{{ line.stream }}</span>
                    <span
                        class="wl-mcserver-console__text"
                        :class="colourFor(line.stream) ? `text-${colourFor(line.stream)}` : ''"
                        >{{ line.text }}</span
                    >
                </div>
            </VCardText>
        </VCard>

        <form class="wl-mcserver-console__input" @submit.prevent="send">
            <VChip
                size="small"
                :color="rcon?.ok ? 'secondary-container' : 'tertiary-container'"
                variant="flat"
                :prepend-icon="mdiFlash"
                :title="rcon?.message"
            >
                {{
                    rcon?.ok
                        ? t("mcserver.console.rconUp", "RCON reachable")
                        : t("mcserver.console.rconDown", "RCON not reachable")
                }}
            </VChip>
            <VTextField
                v-model="command"
                :label="t('mcserver.console.command', 'Command')"
                :disabled="!!sendReason || sending"
                :title="sendReason ?? undefined"
                prefix="/"
                variant="outlined"
                hide-details
                autocomplete="off"
                class="wl-mcserver-console__command"
                @keydown.up.prevent="historyUp"
                @keydown.down.prevent="historyDown"
                @keydown.tab.prevent="
                    completions.length > 0 && (command = completions[0] ?? command)
                "
            />
            <VBtn
                class="wl-mcserver-console__tool"
                :prepend-icon="mdiHammerWrench"
                variant="outlined"
                color="primary"
                @click="builderOpen = true"
            >
                {{ t("mcserver.console.openCommandBuilder", "Command builder") }}
            </VBtn>
            <VBtn
                class="wl-mcserver-console__tool"
                type="submit"
                :prepend-icon="mdiSend"
                color="primary-container"
                variant="flat"
                :disabled="!!sendReason || sending || command.trim() === ''"
                :title="sendReason ?? undefined"
            >
                {{ t("mcserver.console.send", "Send") }}
            </VBtn>
        </form>
        <p v-if="sendReason" class="wl-mcserver-console__reason">{{ sendReason }}</p>
        <div class="wl-mcserver-console__completions">
            <VChip
                v-for="completion in completions"
                :key="completion"
                size="small"
                variant="outlined"
                class="wl-mcserver-console__completion"
                @click="command = completion + ' '"
            >
                {{ completion }}
            </VChip>
            <span class="wl-mcserver-console__spacer" />
            <span class="wl-mcserver-console__hint">{{
                t(
                    "mcserver.console.historyHint",
                    "Up and down walk the history. Detaching the session never touches the server.",
                )
            }}</span>
        </div>
        <CommandBuilder
            v-model="builderOpen"
            :server-id="serverId"
            @use-command="useBuiltCommand"
        />
    </div>
</template>

<style scoped>
/* `Worldlens.dc.html`'s console tab: a 42px tool row, a mono transcript, a 46px command row. */
.wl-mcserver-console__toolbar {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
}
.wl-mcserver-console__search {
    flex: 1 1 260px;
}
.wl-mcserver-console .wl-mcserver-console__levels {
    block-size: 44px;
    gap: 6px;
    border-radius: 0;
    overflow: visible;
}
.wl-mcserver-console .wl-mcserver-console__levels :deep(.v-btn) {
    block-size: 44px;
    min-block-size: 44px;
    border-radius: var(--md-sys-shape-corner-medium);
    padding-inline: 14px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: 400;
}
.wl-mcserver-console .wl-mcserver-console__levels :deep(.v-btn--variant-outlined),
.wl-mcserver-console .wl-mcserver-console__icon {
    border-color: rgb(var(--v-theme-outline-variant));
}
.wl-mcserver-console .wl-mcserver-console__tool {
    min-block-size: 44px;
    border-radius: var(--md-sys-shape-corner-medium);
    padding-inline: 14px;
}
.wl-mcserver-console .wl-mcserver-console__icon {
    inline-size: 44px;
    block-size: 44px;
    border-radius: var(--md-sys-shape-corner-medium);
}
.wl-mcserver-console .wl-mcserver-console__card {
    background: rgb(var(--v-theme-background));
    border-radius: var(--md-sys-shape-corner-large);
}
.wl-mcserver-console .wl-mcserver-console__log {
    padding: 14px 16px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 20px;
    block-size: 300px;
    min-block-size: 160px;
    resize: vertical;
    overflow-y: auto;
}
.wl-mcserver-console__line {
    display: flex;
    gap: 12px;
}
.wl-mcserver-console__at {
    flex: 0 0 62px;
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-console__stream {
    flex: 0 0 58px;
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-console__text {
    flex: 1 1 auto;
    min-inline-size: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
.wl-mcserver-console__empty {
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-console__input {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 12px;
    flex-wrap: wrap;
}
.wl-mcserver-console__command {
    flex: 1 1 240px;
    font-family: "Roboto Mono", ui-monospace, monospace;
}
.wl-mcserver-console__reason {
    margin: 6px 0 0;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-console__completions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
}
.wl-mcserver-console__completion {
    font-family: "Roboto Mono", ui-monospace, monospace;
}
.wl-mcserver-console__spacer {
    flex: 1 1 auto;
}
.wl-mcserver-console__hint {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
}
</style>
