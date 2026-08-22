<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy, mdiDownload, mdiHammerWrench, mdiRefresh, mdiSend } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VChip, VMenu, VList, VListItem, VTextField } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import CommandBuilder from "./CommandBuilder.vue";
import { useServerStore } from "./useServers.js";
import { consoleClose, consoleOpen, consoleSend, onConsoleLine, rconTest, type RconTestResult } from "./mcserverBridge.js";
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

const COMMON_COMMANDS = ["say", "stop", "save-all", "whitelist", "op", "deop", "kick", "ban", "gamemode", "difficulty", "time set", "weather"];

let unsubscribe: (() => void) | null = null;

async function fillFromTail(): Promise<void> {
    const result = await store.logTail(props.serverId, 500);
    if (result.ok) {
        lines.value = [...(result.value ?? [])];
        failure.value = null;
    } else {
        failure.value = result.failure?.message ?? t("mcserver.console.readFailed", "The log could not be read.");
    }
}

async function openSession(): Promise<void> {
    opening.value = true;
    const result = await consoleOpen(props.serverId, 500);
    if (result.ok && result.value) {
        sessionId.value = result.value.sessionId;
    }
    opening.value = false;
}

async function refreshRcon(): Promise<void> {
    const result = await rconTest(props.serverId);
    rcon.value = result.ok ? (result.value ?? null) : { ok: false, latencyMs: null, message: result.failure?.message ?? "" };
}

async function scrollIfFollowing(): Promise<void> {
    if (!follow.value) return;
    await nextTick();
    const el = logRef.value;
    if (el) el.scrollTop = el.scrollHeight;
}

onMounted(async () => {
    await fillFromTail();
    unsubscribe = onConsoleLine((forSessionId, event) => {
        if (sessionId.value !== null && forSessionId !== sessionId.value) return;
        lines.value = [...lines.value, event];
        void scrollIfFollowing();
    });
    await openSession();
    await refreshRcon();
    void scrollIfFollowing();
});
onBeforeUnmount(() => {
    if (unsubscribe) unsubscribe();
    if (sessionId.value !== null) void consoleClose(props.serverId, sessionId.value);
});
watch(
    () => props.serverId,
    async () => {
        if (sessionId.value !== null) await consoleClose(props.serverId, sessionId.value);
        sessionId.value = null;
        history.value = [];
        await fillFromTail();
        await openSession();
        await refreshRcon();
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
    if (stream === "app") return "info";
    return "";
}

const sendReason = computed<string | null>(() => {
    if (sessionId.value === null) return t("mcserver.console.noSession", "No console session is open yet.");
    return null;
});

function useBuiltCommand(text: string): void {
    command.value = text;
}

async function send(): Promise<void> {
    const text = command.value.trim();
    if (text === "" || sessionId.value === null) return;
    sending.value = true;
    const result = await consoleSend(props.serverId, sessionId.value, text);
    sending.value = false;
    if (result.ok) {
        history.value = [...history.value, text];
        historyIndex.value = null;
        command.value = "";
    } else {
        failure.value = result.failure?.message ?? t("mcserver.console.sendFailed", "The command could not be sent.");
    }
}

function historyUp(): void {
    if (history.value.length === 0) return;
    const next = historyIndex.value === null ? history.value.length - 1 : Math.max(0, historyIndex.value - 1);
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
        await navigator.clipboard.writeText(filteredLines.value.map((l) => `[${l.stream}] ${l.text}`).join("\n"));
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
            <VMenu>
                <template #activator="{ props: menuProps }">
                    <VBtn v-bind="menuProps" variant="text" size="small">
                        {{ t("mcserver.console.level", { level: levelFilter }, "Level: {level}") }}
                    </VBtn>
                </template>
                <VList>
                    <VListItem v-for="level in (['all', 'stdout', 'stderr', 'app'] as const)" :key="level" @click="levelFilter = level">
                        {{ level }}
                    </VListItem>
                </VList>
            </VMenu>
            <VBtn :prepend-icon="mdiRefresh" variant="text" size="small" @click="fillFromTail">
                {{ t("mcserver.console.refresh", "Refresh") }}
            </VBtn>
            <VBtn :prepend-icon="mdiContentCopy" variant="text" size="small" @click="copyTranscript">
                {{ t("mcserver.console.copy", "Copy") }}
            </VBtn>
            <VBtn :prepend-icon="mdiDownload" variant="text" size="small" @click="exportTranscript">
                {{ t("mcserver.console.export", "Export") }}
            </VBtn>
            <VBtn variant="text" size="small" :color="follow ? 'primary' : undefined" @click="follow = !follow">
                {{ follow ? t("mcserver.console.following", "Following") : t("mcserver.console.paused", "Paused") }}
            </VBtn>
            <VBtn :prepend-icon="mdiHammerWrench" variant="text" size="small" @click="builderOpen = true">
                {{ t("mcserver.console.openCommandBuilder", "Command builder") }}
            </VBtn>
            <VChip
                size="small"
                :color="rcon?.ok ? 'success' : 'warning'"
                :title="rcon?.message"
            >
                {{ rcon?.ok ? t("mcserver.console.rconUp", "RCON reachable") : t("mcserver.console.rconDown", "RCON not reachable") }}
            </VChip>
        </div>
        <VAlert v-if="failure" type="warning" variant="tonal" class="mb-2">{{ failure }}</VAlert>
        <VCard variant="outlined">
            <VCardText ref="logRef" class="wl-mcserver-console__log" role="log" aria-live="polite">
                <div v-if="filteredLines.length === 0" class="text-medium-emphasis">
                    {{ t("mcserver.console.empty", "No log lines yet.") }}
                </div>
                <div v-for="(line, index) in filteredLines" :key="index" class="wl-mcserver-console__line">
                    <VChip size="x-small" :color="colourFor(line.stream)" variant="text">{{ line.stream }}</VChip>
                    {{ line.text }}
                </div>
            </VCardText>
        </VCard>

        <form class="wl-mcserver-console__input" @submit.prevent="send">
            <VTextField
                v-model="command"
                :label="t('mcserver.console.command', 'Command')"
                :disabled="!!sendReason || sending"
                :title="sendReason ?? undefined"
                density="compact"
                hide-details
                autocomplete="off"
                @keydown.up.prevent="historyUp"
                @keydown.down.prevent="historyDown"
                @keydown.tab.prevent="completions.length > 0 && (command = completions[0] ?? command)"
            />
            <VBtn
                type="submit"
                :prepend-icon="mdiSend"
                color="primary"
                variant="tonal"
                :disabled="!!sendReason || sending || command.trim() === ''"
                :title="sendReason ?? undefined"
            >
                {{ t("mcserver.console.send", "Send") }}
            </VBtn>
        </form>
        <div v-if="completions.length > 0" class="wl-mcserver-console__completions text-caption text-medium-emphasis">
            {{ completions.join(", ") }}
        </div>
        <CommandBuilder v-model="builderOpen" :server-id="serverId" @use-command="useBuiltCommand" />
    </div>
</template>

<style scoped>
.wl-mcserver-console__toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 8px;
    flex-wrap: wrap;
}
.wl-mcserver-console__search {
    flex: 1 1 260px;
}
.wl-mcserver-console__log {
    font-family: monospace;
    font-size: 12px;
    max-height: 420px;
    overflow-y: auto;
    white-space: pre-wrap;
}
.wl-mcserver-console__input {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
}
.wl-mcserver-console__input :deep(.v-input) {
    flex: 1 1 auto;
}
</style>
