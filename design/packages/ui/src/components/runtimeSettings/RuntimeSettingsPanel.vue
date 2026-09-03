<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    DEFAULT_RUNTIME_SETTINGS,
    resolveScheduledValues,
    parseRuntimeSettingsState,
    type AccommodationKey,
    type RuntimeLanguage,
    type RuntimeSettingKey,
    type RuntimeSettingsState,
    type RuntimeSource,
    type RuntimeValues,
} from "./model.js";
import { scheduleFieldLabel } from "./schedule.js";
import {
    createNarratorController,
    resolveVoiceStatus,
    type NarratorController,
    type VoiceInfo,
} from "./narrator.js";
import {
    loadRuntimeSettings,
    saveRuntimeSettings,
    recordRuntimeHistory,
    setAccommodation,
    updateRuntimeValues,
} from "./store.js";
import SearchablePicker from "./SearchablePicker.vue";
import { createRuntimeSettingsCoordinator, type RuntimeCoordinatorBridge } from "./coordinator.js";
import { runtimeBilingualString, runtimeString, type RuntimeStringKey } from "./runtimeStrings.js";
import { languageMode, funnyLevel } from "../setup/setupI18n.js";
import { TabbedNavigation, type TabPage } from "../tabs/index.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

type RuntimeTab = "status" | "narrator" | "schedule" | "accommodations" | "history";
interface RuntimeSearchItem {
    id: string;
    tab: RuntimeTab;
    title: string;
    detail: string;
    accommodation?: AccommodationKey;
}

function rt(key: RuntimeStringKey): string {
    const mode = languageMode();
    if (mode === "bilingual") return runtimeBilingualString(key, funnyLevel("en"), funnyLevel("yue"));
    return runtimeString(key, mode === "yue" ? "yue" : "en", mode === "yue" ? funnyLevel("yue") : funnyLevel("en"));
}
function rtf(key: RuntimeStringKey, values: Record<string, string | number>): string {
    return Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        rt(key),
    );
}
const state = ref<RuntimeSettingsState>(loadRuntimeSettings());
const runtimeTabs = ref<InstanceType<typeof TabbedNavigation> | null>(null);
const query = ref("");
const regexMode = ref(false);
const flags = ref("im");
const statusMessage = ref(rt("statusReady"));
const voiceList = ref<VoiceInfo[]>([]);
const speechAvailable = computed(() => typeof speechSynthesis !== "undefined");
const statusRecord = ref<{
    registered: boolean;
    deliveryAvailable: boolean;
    source: "local-main-process";
    message: string;
    registration: "unrun" | "confirmed" | "failed";
    evidence: "unrun" | "confirmed" | "failed";
    replies: "unrun" | "confirmed" | "failed";
    confirmation: "unrun" | "confirmed" | "failed";
} | null>(null);
const configuredSources = ref<readonly { id: string; source: "homeAssistant"; url: string; entityId: string; credentialRef: string }[]>([]);
const haSourceId = ref("");
const haUrl = ref("");
const haEntityId = ref("");
const haCredential = ref("");
const statusHubResult = ref<{ ok: boolean; message: string; cursor?: string; evidenceId?: string; replies?: readonly { id: string; at: string; kind: string; text: string }[] } | null>(null);
const statusHubCredential = ref("");
const historyConfigured = ref(false);
const historyUnlocked = ref(false);
const historyPassword = ref("");
const historyQuery = ref("");
const historyRegex = ref(false);
const historyFlags = ref("im");
const historyFrom = ref("");
const historyTo = ref("");
const historyDiff = ref("");
const historyEntries = ref<readonly { id: string; at: string; action: string; fields: readonly string[]; digest: string }[]>([]);
const runtimeBridge = typeof window === "undefined" ? undefined : window.worldlens?.runtimeSettings;
const temporaryValues = ref<Partial<RuntimeValues>>({});
const sessionOpenedAt = Date.now();
const lastChangedAt = ref(Date.now());
const lastActivityAt = ref(Date.now());
const clock = ref(Date.now());
const momentumDismissedUntil = ref(0);
let clockTimer: ReturnType<typeof setInterval> | null = null;
let temporaryTimer: ReturnType<typeof setTimeout> | null = null;
let statusHubTimer: ReturnType<typeof setInterval> | null = null;
let runtimeChannel: BroadcastChannel | null = null;
const onRuntimeStorage = (event: StorageEvent): void => {
    if (event.key === "worldlens:runtime-settings:v1") state.value = loadRuntimeSettings();
};
const onRuntimeActivity = (): void => {
    lastActivityAt.value = Date.now();
};
const originalDocumentTitle = typeof document === "undefined" ? "Worldlens" : document.title;
const originalBodyFontFamily =
    typeof document === "undefined" ? "" : document.body.style.fontFamily;
const originalBodyFontSize = typeof document === "undefined" ? "" : document.body.style.fontSize;
const originalPrimary =
    typeof document === "undefined"
        ? ""
        : document.documentElement.style.getPropertyValue("--v-theme-primary");
let narrator: NarratorController | null = null;
let unsubscribeVoices: (() => void) | null = null;
let coordinator: ReturnType<typeof createRuntimeSettingsCoordinator> | null = null;
let ownsCoordinator = false;

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));
const activeValues = computed(() =>
    resolveScheduledValues(
        { ...state.value.values, ...temporaryValues.value } as RuntimeValues,
        state.value.schedules,
    ),
);
const sessionSeconds = computed(() =>
    Math.max(0, Math.floor((clock.value - sessionOpenedAt) / 1000)),
);
const idleSeconds = computed(() =>
    Math.max(
        0,
        Math.floor((clock.value - Math.max(lastChangedAt.value, lastActivityAt.value)) / 1000),
    ),
);
const momentumVisible = computed(
    () =>
        state.value.values.accommodations.momentum &&
        idleSeconds.value >= 60 &&
        clock.value >= momentumDismissedUntil.value,
);
function accentRgb(value: string): string {
    const hex = value.replace("#", "");
    const parse = (offset: number): number =>
        Number.parseInt(hex.slice(offset, offset + 2), 16) || 0;
    return `${parse(0)}, ${parse(2)}, ${parse(4)}`;
}
const externalRules = computed(() =>
    state.value.schedules.filter((rule) => rule.source !== "local"),
);

const accommodationItems = computed<readonly { key: AccommodationKey; title: string; detail: string }[]>(() => [
    { key: "focus", title: rt("focus"), detail: rt("focusDetail") },
    { key: "lowStimulation", title: rt("lowStimulation"), detail: rt("lowStimulationDetail") },
    { key: "timeAwareness", title: rt("timeAwareness"), detail: rt("timeAwarenessDetail") },
    { key: "oneThingAtATime", title: rt("oneThingAtATime"), detail: rt("oneThingAtATimeDetail") },
    { key: "momentum", title: rt("momentum"), detail: rt("momentumDetail") },
]);

const searchableItems = computed<RuntimeSearchItem[]>(() => [
    {
        id: "status",
        tab: "status" as const,
        title: rt("statusTitle"),
        detail: rt("statusDetail"),
    },
    {
        id: "narrator",
        tab: "narrator" as const,
        title: rt("narratorTitle"),
        detail: rt("narratorDetail"),
    },
    {
        id: "schedule",
        tab: "schedule" as const,
        title: rt("scheduleTitle"),
        detail: rt("scheduleDetail"),
    },
    { id: "history", tab: "history" as const, title: rt("history"), detail: rt("historyHint") },
    ...accommodationItems.value.map((item) => ({
        id: item.key,
        tab: "accommodations" as const,
        title: item.title,
        detail: item.detail,
        accommodation: item.key,
    })),
]);

const visibleItems = computed(() => {
    if (!matcher.value.active) return searchableItems.value;
    return searchableItems.value.filter((item) =>
        matcher.value.test(`${item.title}\n${item.detail}`),
    );
});
const sample = computed(() =>
    searchableItems.value.map((item) => `${item.title} ${item.detail}`).join("\n"),
);
const summary = computed(() => {
    if (matcher.value.error !== null) return rt("invalidPattern");
    if (!matcher.value.active) return `${searchableItems.value.length} ${rt("runtimeSettings")}.`;
    return `${visibleItems.value.length} / ${searchableItems.value.length} ${rt("runtimeSettings")}.`;
});

function persistValues(patch: Parameters<typeof updateRuntimeValues>[1]): void {
    const before = state.value;
    state.value = updateRuntimeValues(state.value, patch);
    recordAppSetting("runtimeSettings", state.value);
    runtimeChannel?.postMessage({ type: "runtime-settings-updated" });
    lastChangedAt.value = Date.now();
    statusMessage.value = rt("saved");
    void runtimeBridge?.historyAppend({ action: "updated", fields: Object.keys(patch), before, after: state.value });
}

function setAccommodationValue(key: AccommodationKey, enabled: boolean): void {
    const before = state.value;
    state.value = setAccommodation(state.value, key, enabled);
    recordAppSetting("runtimeSettings", state.value);
    runtimeChannel?.postMessage({ type: "runtime-settings-updated" });
    lastChangedAt.value = Date.now();
    statusMessage.value = rt("saved");
    void runtimeBridge?.historyAppend({ action: "updated", fields: [`accommodations.${key}`], before, after: state.value });
}

function openItem(item: (typeof searchableItems.value)[number]): void {
    runtimeTabs.value?.revealPage(item.tab);
}

async function loadConfiguredSources(): Promise<void> {
    configuredSources.value = (await runtimeBridge?.sources()) ?? [];
}

async function saveHomeAssistant(): Promise<void> {
    if (runtimeBridge === undefined) return;
    const result = await runtimeBridge.saveHomeAssistant({
        id: haSourceId.value,
        url: haUrl.value,
        entityId: haEntityId.value,
        credential: haCredential.value,
    });
    haCredential.value = "";
    statusMessage.value = result.message;
    if (result.ok) await loadConfiguredSources();
}

async function removeConfiguredSource(id: string): Promise<void> {
    if (runtimeBridge === undefined) return;
    const result = await runtimeBridge.removeSource(id);
    statusMessage.value = result.message;
    if (result.ok) await loadConfiguredSources();
}

async function registerStatusHub(): Promise<void> {
    statusHubResult.value = runtimeBridge === undefined
        ? { ok: false, message: rt("statusHubUnavailable") }
        : await runtimeBridge.statusHubRegister();
    statusMessage.value = statusHubResult.value.message;
}

async function saveStatusHubCredential(): Promise<void> {
    if (runtimeBridge === undefined) return;
    const result = await runtimeBridge.statusHubSaveCredential(statusHubCredential.value);
    statusHubCredential.value = "";
    statusMessage.value = result.message;
    const record = await runtimeBridge.status();
    statusRecord.value = record;
}

async function submitStatusEvidence(): Promise<void> {
    if (runtimeBridge === undefined) return;
    statusHubResult.value = await runtimeBridge.statusHubSubmitEvidence({
        sessionSeconds: sessionSeconds.value,
        stateVersion: state.value.version,
        scheduleCount: state.value.schedules.length,
        narratorVoices: voiceList.value.length,
        at: new Date().toISOString(),
    });
    statusMessage.value = statusHubResult.value.message;
}

async function pollStatusReplies(): Promise<void> {
    if (runtimeBridge === undefined) return;
    statusHubResult.value = await runtimeBridge.statusHubPollReplies(statusHubResult.value?.cursor);
    statusMessage.value = statusHubResult.value.message;
}

async function confirmStatusReply(id: string): Promise<void> {
    if (runtimeBridge === undefined) return;
    statusHubResult.value = await runtimeBridge.statusHubConfirmReply(id);
    statusMessage.value = statusHubResult.value.message;
}

async function refreshHistory(): Promise<void> {
    const result = await runtimeBridge?.historyPresence();
    historyConfigured.value = result?.configured ?? false;
    historyUnlocked.value = result?.unlocked ?? false;
    if (historyUnlocked.value) {
        const filter = {
            query: historyQuery.value,
            regex: historyRegex.value,
            flags: historyFlags.value,
            ...(historyFrom.value === "" ? {} : { from: historyFrom.value }),
            ...(historyTo.value === "" ? {} : { to: historyTo.value }),
        };
        historyEntries.value = (await runtimeBridge?.historyList(filter)) ?? [];
    }
}

async function setHistoryCredential(): Promise<void> {
    if (runtimeBridge === undefined) return;
    const result = await runtimeBridge.historySetCredential(historyPassword.value);
    historyPassword.value = "";
    statusMessage.value = result.message;
    await refreshHistory();
}

async function unlockHistory(): Promise<void> {
    if (runtimeBridge === undefined) return;
    const result = await runtimeBridge.historyVerify(historyPassword.value);
    historyPassword.value = "";
    statusMessage.value = result.message;
    await refreshHistory();
}

async function exportHistory(): Promise<void> {
    if (runtimeBridge === undefined) return;
    const value = await runtimeBridge.historyExport("markdown");
    await navigator.clipboard?.writeText(value);
    statusMessage.value = rt("exportHistory");
}

async function viewHistoryDiff(id: string): Promise<void> {
    if (runtimeBridge === undefined) return;
    const result = await runtimeBridge.historyDiff(id) as { ok?: boolean; message?: string; entry?: { digest: string; fields: readonly string[]; before?: unknown; after?: unknown } };
    historyDiff.value = result.entry === undefined ? (result.message ?? "") : `${JSON.stringify(result.entry.before ?? null)} → ${JSON.stringify(result.entry.after ?? null)} · ${result.entry.digest}`;
}

async function restoreHistory(id: string): Promise<void> {
    if (runtimeBridge === undefined) return;
    const result = await runtimeBridge.historyRestore(id) as { ok?: boolean; message?: string; snapshot?: unknown };
    const restored = parseRuntimeSettingsState(result.snapshot);
    if (result.ok === true && restored !== null) {
        saveRuntimeSettings(restored);
        state.value = restored;
        runtimeChannel?.postMessage({ type: "runtime-settings-updated" });
    }
    statusMessage.value = result.message ?? rt("historyUnavailable");
    await refreshHistory();
}

const runtimePages = computed<TabPage[]>(() => [
    { id: "status", label: rt("statusTitle"), icon: null },
    { id: "narrator", label: rt("narratorTitle"), icon: null },
    { id: "schedule", label: rt("scheduleTitle"), icon: null },
    { id: "accommodations", label: rt("accommodationsTitle"), icon: null },
    { id: "history", label: rt("history"), icon: null },
]);

const scheduleSetting = ref<RuntimeSettingKey>("theme");
const scheduleValue = ref("dark");
const scheduleLabel = ref("Night display");
const schedulePriority = ref(1);
const scheduleSource = ref<RuntimeSource>("local");
const scheduleUrl = ref("");
const scheduleEntity = ref("");
const scheduleCredentialRef = ref("");
const scheduleStart = ref("22:00");
const scheduleEnd = ref("06:00");
const scheduleWeekdays = ref<number[]>([]);
const scheduleStartDate = ref("");
const scheduleEndDate = ref("");

function addSchedule(): void {
    if (
        !scheduleLabel.value.trim() ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleStart.value) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleEnd.value)
    ) {
        statusMessage.value = rt("invalidSchedule");
        return;
    }
    if (scheduleSource.value !== "local" && !scheduleUrl.value.trim()) {
        statusMessage.value = rt("sourceRequired");
        return;
    }
    if (
        scheduleSource.value === "homeAssistant" &&
        (!scheduleEntity.value.trim() || !scheduleCredentialRef.value.trim())
    ) {
        statusMessage.value = rt("homeAssistantRequired");
        return;
    }
    const id = `${scheduleSetting.value}-${Date.now().toString(36)}`;
    const rule = {
        id,
        label: scheduleLabel.value.trim(),
        enabled: true,
        priority: Math.trunc(schedulePriority.value),
        weekdays: [...scheduleWeekdays.value],
        startDate: scheduleStartDate.value || null,
        endDate: scheduleEndDate.value || null,
        startTime: scheduleStart.value,
        endTime: scheduleEnd.value,
        setting: scheduleSetting.value,
        value:
            scheduleSetting.value === "fontSize"
                ? Number(scheduleValue.value)
                : scheduleValue.value,
        source: scheduleSource.value,
        sourceConfig: {
            ...(scheduleUrl.value ? { url: scheduleUrl.value } : {}),
            ...(scheduleEntity.value ? { entityId: scheduleEntity.value } : {}),
            ...(scheduleCredentialRef.value ? { credentialRef: scheduleCredentialRef.value } : {}),
        },
    } as const;
    const next = { ...state.value, schedules: [...state.value.schedules, rule] };
    try {
        const before = state.value;
        state.value = next;
        // The shared store parser is the final bounded validation boundary.
        const saved = updateRuntimeValues(next, {}, undefined);
        state.value = saved;
        recordRuntimeHistory("created", ["schedules", scheduleSetting.value]);
        void runtimeBridge?.historyAppend({ action: "created", fields: ["schedules", scheduleSetting.value], before, after: state.value });
        recordAppSetting("runtimeSettings", state.value);
        runtimeChannel?.postMessage({ type: "runtime-settings-updated" });
        statusMessage.value = rt("scheduleAdded");
    } catch (error) {
        state.value = loadRuntimeSettings();
        statusMessage.value =
            error instanceof Error
                ? error.message
                : rt("invalidSchedule");
    }
}

function removeSchedule(id: string): void {
    const before = state.value;
    state.value = {
        ...state.value,
        schedules: state.value.schedules.filter((rule) => rule.id !== id),
    };
    // Save the new state through the same validator used for ordinary setting changes.
    updateRuntimeValues(state.value, {});
    recordRuntimeHistory("deleted", ["schedules"]);
    void runtimeBridge?.historyAppend({ action: "deleted", fields: ["schedules"], before, after: state.value });
    recordAppSetting("runtimeSettings", state.value);
    runtimeChannel?.postMessage({ type: "runtime-settings-updated" });
    statusMessage.value = rt("scheduleDeleted");
}

async function refreshExternalSources(): Promise<void> {
    if (externalRules.value.length === 0) {
        statusMessage.value = rt("noExternal");
        return;
    }
    if (coordinator === null) {
        statusMessage.value = rt("bridgeUnavailable");
        return;
    }
    await coordinator.refreshNow();
    statusMessage.value = rt("refreshComplete");
}

function dismissMomentum(): void {
    momentumDismissedUntil.value = Date.now() + 15 * 60 * 1000;
    lastChangedAt.value = Date.now();
}

function restoreFocus(): void {
    setAccommodationValue("focus", false);
}

watch(
    activeValues,
    (values) => {
        if (typeof document === "undefined") return;
        document.documentElement.dataset.runtimeTheme = values.theme;
        document.documentElement.dataset.runtimeDensity = values.density;
        document.documentElement.dataset.runtimeMotion = values.motion;
        document.documentElement.dataset.runtimeLowStimulation = values.accommodations
            .lowStimulation
            ? "true"
            : "false";
        document.documentElement.dataset.runtimeFocus = values.accommodations.focus
            ? "true"
            : "false";
        document.documentElement.style.setProperty("--worldlens-runtime-accent", values.accent);
        document.documentElement.style.setProperty("--v-theme-primary", accentRgb(values.accent));
        document.documentElement.style.setProperty(
            "--worldlens-runtime-font-family",
            values.fontFamily,
        );
        document.documentElement.style.setProperty(
            "--worldlens-runtime-font-scale",
            String(values.fontSize),
        );
        document.body.style.fontFamily = values.fontFamily;
        document.body.style.fontSize = `${values.fontSize}em`;
        document.title = values.displayName;
    },
    { deep: true, immediate: true },
);

function narratorStatus(language: "en" | "yue"): ReturnType<typeof resolveVoiceStatus> {
    const chosen =
        language === "yue"
            ? state.value.values.narrator.cantoneseVoiceId
            : state.value.values.narrator.englishVoiceId;
    return resolveVoiceStatus(voiceList.value, chosen, language);
}

function narratorVoiceLabel(language: "en" | "yue"): string {
    const status = narratorStatus(language);
    const effective = status.effective;
    return effective === null
        ? rt("noMatchingVoice")
        : rtf("effectiveVoice", {
              language: language === "yue" ? rt("cantonese") : rt("english"),
              name: effective.name,
              network: status.networkBacked ? " (network-backed)" : "",
          });
}

function speakTest(): void {
    narrator?.speak(
        state.value.values.narrator,
        { en: "Worldlens narrator test.", yue: "Worldlens 旁白測試。" },
        "runtime-settings-test",
        { reducedSound: state.value.values.narrator.quietHours },
    );
    statusMessage.value = rt("testQueued");
}

onMounted(() => {
    clockTimer = setInterval(() => {
        clock.value = Date.now();
    }, 1000);
    window.addEventListener("storage", onRuntimeStorage);
    window.addEventListener("pointerdown", onRuntimeActivity, { passive: true });
    window.addEventListener("keydown", onRuntimeActivity, { passive: true });
    if (typeof BroadcastChannel !== "undefined") {
        runtimeChannel = new BroadcastChannel("worldlens-runtime-settings");
        runtimeChannel.onmessage = () => {
            state.value = loadRuntimeSettings();
        };
    }
    const bridge = runtimeBridge;
    coordinator = createRuntimeSettingsCoordinator({
        readState: () => state.value,
        applyTemporary: (values) => {
            temporaryValues.value = values as Partial<RuntimeValues>;
            if (temporaryTimer !== null) clearTimeout(temporaryTimer);
            temporaryTimer = setTimeout(
                () => {
                    temporaryValues.value = {};
                    temporaryTimer = null;
                },
                5 * 60 * 1000,
            );
        },
        bridge: (bridge ?? null) as RuntimeCoordinatorBridge | null,
    });
    if (document.documentElement.dataset.runtimeCoordinator !== "active") {
        coordinator.start();
        ownsCoordinator = true;
    }
    if (bridge !== undefined)
        void bridge.status().then((record) => {
            statusRecord.value = record;
            if (record.deliveryAvailable) {
                void registerStatusHub();
                statusHubTimer = setInterval(() => { void pollStatusReplies(); }, 60_000);
            }
        });
    void loadConfiguredSources();
    void refreshHistory();
    narrator = createNarratorController();
    voiceList.value = [...narrator.voices()];
    unsubscribeVoices = narrator.subscribe(() => {
        voiceList.value = [...(narrator?.voices() ?? [])];
    });
    narrator.refresh();
});

onUnmounted(() => {
    if (ownsCoordinator) coordinator?.stop();
    ownsCoordinator = false;
    coordinator = null;
    if (clockTimer !== null) clearInterval(clockTimer);
    if (temporaryTimer !== null) clearTimeout(temporaryTimer);
    if (statusHubTimer !== null) clearInterval(statusHubTimer);
    statusHubTimer = null;
    window.removeEventListener("storage", onRuntimeStorage);
    window.removeEventListener("pointerdown", onRuntimeActivity);
    window.removeEventListener("keydown", onRuntimeActivity);
    runtimeChannel?.close();
    runtimeChannel = null;
    if (typeof document !== "undefined") {
        document.title = originalDocumentTitle;
        document.body.style.fontFamily = originalBodyFontFamily;
        document.body.style.fontSize = originalBodyFontSize;
        document.documentElement.style.setProperty("--v-theme-primary", originalPrimary);
        delete document.documentElement.dataset.runtimeTheme;
        delete document.documentElement.dataset.runtimeDensity;
        delete document.documentElement.dataset.runtimeMotion;
        delete document.documentElement.dataset.runtimeLowStimulation;
        delete document.documentElement.dataset.runtimeFocus;
    }
    unsubscribeVoices?.();
    unsubscribeVoices = null;
    narrator?.dispose();
    narrator = null;
});
</script>

<template>
    <section class="mb-runtime-settings" :aria-label="rt('runtimeSettingsLabel')">
        <ConfigSearchField
            v-model="query"
            v-model:regex="regexMode"
            v-model:flags="flags"
            :label="rt('findRuntimeSettings')"
            :placeholder="rt('runtimeSearchPlaceholder')"
            :sample="sample"
            :summary="summary"
        />

        <ul
            v-if="matcher.active"
            class="mb-runtime-settings__results"
            :aria-label="rt('runtimeResults')"
        >
            <li v-for="item in visibleItems" :key="item.id" class="mb-runtime-settings__result">
                <button type="button" @click="openItem(item)">
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.detail }}</span>
                </button>
                <input
                    v-if="item.accommodation"
                    type="checkbox"
                    :checked="state.values.accommodations[item.accommodation]"
                    :aria-label="`${rt('adjust')} ${item.title}`"
                    @change="
                        setAccommodationValue(
                            item.accommodation,
                            ($event.target as HTMLInputElement).checked,
                        )
                    "
                />
            </li>
            <li v-if="visibleItems.length === 0" class="mb-runtime-settings__empty">
                {{ rt("runtimeNoMatch") }}
            </li>
        </ul>

        <TabbedNavigation
            ref="runtimeTabs"
            :pages="runtimePages"
            storage-key="worldlens-runtime-settings-tabs"
            :window-label="rt('runtimeSettingsLabel')"
            :strip-label="rt('runtimeResults')"
        >
            <template #status>
                <article
                    id="runtime-panel-status"
                    role="tabpanel"
                    aria-labelledby="runtime-tab-status"
                    class="mb-runtime-settings__panel"
                >
            <h4>{{ rt("statusTitle") }}</h4>
                    <p class="mb-runtime-settings__notice" aria-live="polite">
                        {{ statusMessage }}
                    </p>
                    <dl class="mb-runtime-settings__status-list">
                        <div>
                            <dt>{{ rt("timeAwareness") }}</dt>
                            <dd>
                                {{
                                    state.values.accommodations.timeAwareness
                                        ? `Session ${sessionSeconds}s, unchanged ${idleSeconds}s`
                                        : rt("off")
                                }}
                            </dd>
                        </div>
                        <div>
                            <dt>{{ rt("runtimeSettings") }}</dt>
                            <dd>
                                {{ rtf("localState", { version: state.version, count: state.schedules.length }) }}
                            </dd>
                        </div>
                        <div>
                            <dt>{{ rt("narrator") }}</dt>
                            <dd>
                                {{
                                    !speechAvailable
                                        ? rt("speechUnavailable")
                                        : rtf("voicesReported", { count: voiceList.length })
                                }}
                            </dd>
                        </div>
                        <div>
                            <dt>{{ rt("externalSources") }}</dt>
                            <dd>
                                {{
                                    externalRules.length === 0
                                        ? rt("noneConfigured")
                                        : rtf("externalConfigured", { count: externalRules.length })
                                }}
                            </dd>
                        </div>
                        <div>
                            <dt>{{ rt("statusDelivery") }}</dt>
                            <dd>
                                {{
                                    statusRecord === null
                                    ? rt("statusReading")
                                        : statusRecord.deliveryAvailable
                                          ? rt("authenticatedAvailable")
                                          : `⚠️ ${statusRecord.message}`
                                }}
                            </dd>
                        </div>
                    </dl>
                    <p class="mb-runtime-settings__hint">
                        {{ rt("statusEvidenceHint") }}
                    </p>
                    <div class="mb-runtime-settings__status-actions">
                        <button type="button" :disabled="!statusRecord?.deliveryAvailable" @click="registerStatusHub">
                            {{ rt("registerStatusHub") }}
                        </button>
                        <button type="button" :disabled="!statusRecord?.deliveryAvailable" @click="submitStatusEvidence">
                            {{ rt("submitEvidence") }}
                        </button>
                        <button type="button" :disabled="!statusRecord?.deliveryAvailable" @click="pollStatusReplies">
                            {{ rt("pollReplies") }}
                        </button>
                    </div>
                    <p v-if="statusRecord !== null && !statusRecord.deliveryAvailable" class="mb-runtime-settings__hint">
                        {{ rt("statusHubUnavailable") }}
                    </p>
                    <p v-if="statusHubResult?.evidenceId" class="mb-runtime-settings__hint">Evidence id: {{ statusHubResult.evidenceId }}</p>
                    <label>{{ rt("statusHubCredential") }} <input v-model="statusHubCredential" type="password" autocomplete="new-password" /></label>
                    <button type="button" @click="saveStatusHubCredential">{{ rt("saveStatusHubCredential") }}</button>
                    <ul v-if="statusHubResult?.replies?.length" class="mb-runtime-settings__rules" :aria-label="rt('pollReplies')">
                        <li v-for="reply in statusHubResult.replies" :key="reply.id">
                            <span><strong>{{ reply.kind }}</strong> · {{ reply.text }}</span>
                            <button type="button" @click="confirmStatusReply(reply.id)">{{ rt("confirmReply") }}</button>
                        </li>
                    </ul>
                    <fieldset class="mb-runtime-settings__source-form">
                        <legend>{{ rt("homeAssistantSources") }}</legend>
                        <label>{{ rt("sourceId") }} <input v-model="haSourceId" autocomplete="off" /></label>
                        <label>{{ rt("homeAssistantUrl") }} <input v-model="haUrl" inputmode="url" autocomplete="off" /></label>
                        <label>{{ rt("entityId") }} <input v-model="haEntityId" autocomplete="off" /></label>
                        <label>{{ rt("homeAssistantCredential") }} <input v-model="haCredential" type="password" autocomplete="new-password" /></label>
                        <button type="button" @click="saveHomeAssistant">{{ rt("saveHomeAssistant") }}</button>
                    </fieldset>
                    <ul class="mb-runtime-settings__rules" :aria-label="rt('homeAssistantSources')">
                        <li v-for="source in configuredSources" :key="source.id">
                            <span>{{ rtf("configuredSource", { id: source.id, entity: source.entityId }) }}</span>
                            <button type="button" @click="removeConfiguredSource(source.id)">{{ rt("remove") }}</button>
                        </li>
                    </ul>
                </article>
            </template>
            <template #narrator>
                <article
                    id="runtime-panel-narrator"
                    role="tabpanel"
                    aria-labelledby="runtime-tab-narrator"
                    class="mb-runtime-settings__panel"
                >
            <h4>{{ rt("narratorTitle") }}</h4>
                    <p class="mb-runtime-settings__hint">
                        {{ rt("narrationHint") }}
                    </p>
                    <label
                        ><input
                            type="checkbox"
                            :checked="state.values.narrator.enabled"
                            @change="
                                persistValues({
                                    narrator: {
                                        ...state.values.narrator,
                                        enabled: ($event.target as HTMLInputElement).checked,
                                    },
                                })
                            "
                        />
                        {{ rt("enableNarration") }}</label
                    >
                    <SearchablePicker
                        :model-value="state.values.narrator.language"
                        :label="rt('narrationLanguage')"
                        :options="[
                            { id: 'en', label: rt('english') },
                            { id: 'yue', label: rt('cantonese') },
                            { id: 'both', label: rt('bothEnglishThenCantonese') },
                        ]"
                        @update:model-value="
                            (value) =>
                                persistValues({
                                    narrator: {
                                        ...state.values.narrator,
                                        language: value as RuntimeLanguage,
                                    },
                                })
                        "
                    />
                    <SearchablePicker
                        :model-value="state.values.narrator.englishVoiceId ?? ''"
                        :label="rt('englishVoice')"
                        :options="[
                            { id: '', label: rt('chooseAutomatically') },
                            ...voiceList
                                .filter((voice) => voice.lang.toLowerCase().startsWith('en'))
                                .map((voice) => ({
                                    id: voice.id,
                                    label: `${voice.name} · ${voice.lang}${voice.networkBacked ? ' · network-backed' : ''}`,
                                })),
                        ]"
                        @update:model-value="
                            (value) =>
                                persistValues({
                                    narrator: {
                                        ...state.values.narrator,
                                        englishVoiceId: value || null,
                                    },
                                })
                        "
                    />
                    <p class="mb-runtime-settings__hint">{{ narratorVoiceLabel("en") }}</p>
                    <SearchablePicker
                        :model-value="state.values.narrator.cantoneseVoiceId ?? ''"
                        :label="rt('cantoneseVoice')"
                        :options="[
                            { id: '', label: rt('chooseAutomatically') },
                            ...voiceList
                                .filter((voice) =>
                                    ['yue', 'zh-hk'].some((prefix) =>
                                        voice.lang.toLowerCase().startsWith(prefix),
                                    ),
                                )
                                .map((voice) => ({
                                    id: voice.id,
                                    label: `${voice.name} · ${voice.lang}${voice.networkBacked ? ' · network-backed' : ''}`,
                                })),
                        ]"
                        @update:model-value="
                            (value) =>
                                persistValues({
                                    narrator: {
                                        ...state.values.narrator,
                                        cantoneseVoiceId: value || null,
                                    },
                                })
                        "
                    />
                    <p class="mb-runtime-settings__hint">{{ narratorVoiceLabel("yue") }}</p>
                    <label
                        >{{ rt("rate") }}
                        <input
                            type="range"
                            min="0.1"
                            max="4"
                            step="0.1"
                            :value="state.values.narrator.rate"
                            @input="
                                persistValues({
                                    narrator: {
                                        ...state.values.narrator,
                                        rate: Number(($event.target as HTMLInputElement).value),
                                    },
                                })
                            "
                    /></label>
                    <label
                        >{{ rt("pitch") }}
                        <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            :value="state.values.narrator.pitch"
                            @input="
                                persistValues({
                                    narrator: {
                                        ...state.values.narrator,
                                        pitch: Number(($event.target as HTMLInputElement).value),
                                    },
                                })
                            "
                    /></label>
                    <label
                        ><input
                            type="checkbox"
                            :checked="state.values.narrator.quietHours"
                            @change="
                                persistValues({
                                    narrator: {
                                        ...state.values.narrator,
                                        quietHours: ($event.target as HTMLInputElement).checked,
                                    },
                                })
                            "
                        />
                        {{ rt("quietNarration") }}</label
                    >
                    <button type="button" @click="speakTest">{{ rt("speakTest") }}</button>
                </article>
            </template>
            <template #schedule>
                <article
                    id="runtime-panel-schedule"
                    role="tabpanel"
                    aria-labelledby="runtime-tab-schedule"
                    class="mb-runtime-settings__panel"
                >
            <h4>{{ rt("scheduleTitle") }}</h4>
                    <p class="mb-runtime-settings__hint">
                        {{ rt("scheduleHint") }}
                    </p>
                    <div class="mb-runtime-settings__grid">
                        <label>{{ rt("label") }} <input v-model="scheduleLabel" /></label>
                        <SearchablePicker
                            :model-value="scheduleSetting"
                            :label="rt('scheduledSetting')"
                            :options="
                                [
                                    'language',
                                    'theme',
                                    'density',
                                    'accent',
                                    'fontFamily',
                                    'fontSize',
                                    'motion',
                                    'displayName',
                                ].map((key) => ({
                                    id: key,
                                    label: scheduleFieldLabel(key as RuntimeSettingKey),
                                }))
                            "
                            @update:model-value="
                                (value) => (scheduleSetting = value as RuntimeSettingKey)
                            "
                        />
                        <label>{{ rt("value") }} <input v-model="scheduleValue" /></label>
                        <label
                            >{{ rt("priority") }}
                            <input
                                v-model.number="schedulePriority"
                                type="number"
                                min="-100000"
                                max="100000"
                                step="1"
                        /></label>
                        <SearchablePicker
                            :model-value="scheduleSource"
                            :label="rt('source')"
                            :options="[
                                { id: 'local', label: rt('local') },
                                { id: 'https', label: rt('validatedHttpsApi') },
                                { id: 'homeAssistant', label: rt('homeAssistantBoolean') },
                            ]"
                            @update:model-value="
                                (value) => (scheduleSource = value as RuntimeSource)
                            "
                        />
                        <label>{{ rt("startTime") }} <input v-model="scheduleStart" type="time" /></label>
                        <label>{{ rt("endTime") }} <input v-model="scheduleEnd" type="time" /></label>
                        <label>{{ rt("startDate") }} <input v-model="scheduleStartDate" type="date" /></label>
                        <label>{{ rt("endDate") }} <input v-model="scheduleEndDate" type="date" /></label>
                        <fieldset class="mb-runtime-settings__weekdays">
                            <legend>{{ rt("days") }}</legend>
                            <label
                                ><input
                                    type="checkbox"
                                    :checked="scheduleWeekdays.length === 0"
                                    @change="scheduleWeekdays = []"
                                />
                                {{ rt("everyDay") }}</label
                            >
                            <label
                                v-for="day in [
                                    { id: 0, name: rt('sunday') },
                                    { id: 1, name: rt('monday') },
                                    { id: 2, name: rt('tuesday') },
                                    { id: 3, name: rt('wednesday') },
                                    { id: 4, name: rt('thursday') },
                                    { id: 5, name: rt('friday') },
                                    { id: 6, name: rt('saturday') },
                                ]"
                                :key="day.id"
                                ><input
                                    type="checkbox"
                                    :checked="scheduleWeekdays.includes(day.id)"
                                    @change="
                                        scheduleWeekdays = scheduleWeekdays.includes(day.id)
                                            ? scheduleWeekdays.filter(
                                                  (selected) => selected !== day.id,
                                              )
                                            : [...scheduleWeekdays, day.id]
                                    "
                                />
                                {{ day.name }}</label
                            >
                        </fieldset>
                        <label v-if="scheduleSource !== 'local'"
                            >{{ rt("url") }} <input v-model="scheduleUrl" inputmode="url"
                        /></label>
                        <label v-if="scheduleSource === 'homeAssistant'"
                            >{{ rt("entityId") }}
                            <input v-model="scheduleEntity" :placeholder="rt('entityId')"
                        /></label>
                        <label v-if="scheduleSource === 'homeAssistant'"
                            >{{ rt("credentialVaultReference") }} <input v-model="scheduleCredentialRef"
                        /></label>
                    </div>
                    <button type="button" @click="addSchedule">{{ rt("addSchedule") }}</button>
                    <button
                        type="button"
                        :disabled="externalRules.length === 0"
                        @click="refreshExternalSources"
                    >
                        {{ rt("refreshExternal") }}
                    </button>
                    <ul class="mb-runtime-settings__rules" :aria-label="rt('scheduledRules')">
                        <li v-for="rule in state.schedules" :key="rule.id">
                            <span
                                ><strong>{{ rule.label }}</strong> ·
                                {{ scheduleFieldLabel(rule.setting) }} = {{ rule.value }} ·
                                {{ rule.startTime }} to {{ rule.endTime }} · {{ rule.source }}</span
                            >
                            <button
                                type="button"
                                :aria-label="`${rt('remove')} ${rule.label}`"
                                @click="removeSchedule(rule.id)"
                            >
                                {{ rt("remove") }}
                            </button>
                        </li>
                        <li v-if="state.schedules.length === 0" class="mb-runtime-settings__empty">
                            {{ rt("noRules") }}
                        </li>
                    </ul>
                </article>
            </template>
            <template #accommodations>
                <article
                    id="runtime-panel-accommodations"
                    role="tabpanel"
                    aria-labelledby="runtime-tab-accommodations"
                    class="mb-runtime-settings__panel"
                >
            <h4>{{ rt("accommodationsTitle") }}</h4>
                    <p class="mb-runtime-settings__hint">
                        {{ rt("accommodationsHint") }}
                    </p>
                    <label
                        v-for="item in accommodationItems"
                        :key="item.key"
                        class="mb-runtime-settings__accommodation"
                    >
                        <input
                            type="checkbox"
                            :checked="state.values.accommodations[item.key]"
                            @change="
                                setAccommodationValue(
                                    item.key,
                                    ($event.target as HTMLInputElement).checked,
                                )
                            "
                        />
                        <span
                            ><strong>{{ item.title }}</strong
                            ><small>{{ item.detail }}</small></span
                        >
                    </label>
                    <label
                        >{{ rt("nextAction") }}
                        <input
                            :value="state.values.nextAction"
                            :placeholder="rt('chooseNextAction')"
                            @change="
                                persistValues({
                                    nextAction: ($event.target as HTMLInputElement).value,
                                })
                            "
                        />
                    </label>
                    <button
                        v-if="state.values.accommodations.focus"
                        type="button"
                        @click="restoreFocus"
                    >
                        {{ rt("restoreEmphasis") }}
                    </button>
                    <div
                        v-if="momentumVisible"
                        class="mb-runtime-settings__momentum"
                        role="status"
                        aria-live="polite"
                    >
                        <strong>{{ rt("momentumReminder") }}</strong>
                        <span>{{ rtf("nothingChanged", { seconds: idleSeconds }) }}</span>
                        <button type="button" @click="dismissMomentum">
                            {{ rt("notNow") }}
                        </button>
                    </div>
                    <p class="mb-runtime-settings__hint">
                        {{ rtf("currentPreview", { theme: activeValues.theme, density: activeValues.density, motion: activeValues.motion, displayName: activeValues.displayName }) }}
                    </p>
                </article>
            </template>
            <template #history>
                <article
                    id="runtime-panel-history"
                    role="tabpanel"
                    aria-labelledby="runtime-tab-history"
                    class="mb-runtime-settings__panel"
                >
                    <h4>{{ rt("history") }}</h4>
                    <p class="mb-runtime-settings__hint">{{ rt("historyHint") }}</p>
                    <label>{{ rt("historyPassword") }} <input v-model="historyPassword" type="password" autocomplete="new-password" /></label>
                    <div class="mb-runtime-settings__status-actions">
                        <button v-if="!historyConfigured" type="button" @click="setHistoryCredential">{{ rt("setHistoryCredential") }}</button>
                        <button v-else type="button" @click="unlockHistory">{{ rt("unlockHistory") }}</button>
                        <button type="button" :disabled="!historyUnlocked" @click="exportHistory">{{ rt("exportHistory") }}</button>
                    </div>
                    <ConfigSearchField
                        v-model="historyQuery"
                        v-model:regex="historyRegex"
                        v-model:flags="historyFlags"
                        :label="rt('historySearch')"
                        :sample="historyEntries.map((entry) => `${entry.action} ${entry.fields.join(' ')}`).join('\n')"
                        :summary="`${historyEntries.length}`"
                        @update:model-value="refreshHistory"
                    />
                    <div class="mb-runtime-settings__grid">
                        <label>{{ rt("fromDate") }} <input v-model="historyFrom" type="date" @change="refreshHistory" /></label>
                        <label>{{ rt("toDate") }} <input v-model="historyTo" type="date" @change="refreshHistory" /></label>
                    </div>
                    <p v-if="historyDiff" class="mb-runtime-settings__hint">{{ historyDiff }}</p>
                    <p v-if="!historyUnlocked" class="mb-runtime-settings__hint">{{ rt("historyUnavailable") }}</p>
                    <ul v-else class="mb-runtime-settings__rules" :aria-label="rt('history')">
                        <li v-for="entry in historyEntries" :key="entry.id">
                            <span><strong>{{ entry.action }}</strong> · {{ entry.at }} · {{ entry.fields.join(", ") }}</span>
                            <span class="mb-runtime-settings__status-actions">
                                <code>{{ entry.digest.slice(0, 12) }}</code>
                                <button type="button" @click="viewHistoryDiff(entry.id)">{{ rt("viewDiff") }}</button>
                                <button type="button" @click="restoreHistory(entry.id)">{{ rt("restoreRevision") }}</button>
                            </span>
                        </li>
                    </ul>
                </article>
            </template>
        </TabbedNavigation>
    </section>
</template>

<style scoped>
.mb-runtime-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    font-family: var(--worldlens-runtime-font-family, inherit);
    font-size: calc(1em * var(--worldlens-runtime-font-scale, 1));
}
.mb-runtime-settings__results,
.mb-runtime-settings__rules {
    list-style: none;
    display: grid;
    gap: 6px;
    padding: 0;
    margin: 0;
}
.mb-runtime-settings__result,
.mb-runtime-settings__rules li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(var(--v-theme-on-surface), 0.04);
}
.mb-runtime-settings__result button {
    flex: 1;
    border: 0;
    background: none;
    color: inherit;
    text-align: start;
    cursor: pointer;
}
.mb-runtime-settings__result span,
.mb-runtime-settings__hint,
.mb-runtime-settings__notice,
.mb-runtime-settings__empty {
    display: block;
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.mb-runtime-settings__tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.mb-runtime-settings__tabs button,
.mb-runtime-settings__panel button {
    min-block-size: 44px;
    padding: 8px 12px;
    border: 0;
    border-radius: 10px;
    background: rgba(var(--v-theme-on-surface), 0.08);
    color: inherit;
    cursor: pointer;
}
.mb-runtime-settings__tabs button[aria-selected="true"] {
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
}
.mb-runtime-settings__panel {
    display: grid;
    gap: 12px;
    min-width: 0;
}
.mb-runtime-settings__panel h4 {
    margin: 0;
    font-size: 1rem;
}
.mb-runtime-settings__status-list {
    display: grid;
    gap: 8px;
    margin: 0;
}
.mb-runtime-settings__status-list div {
    display: grid;
    grid-template-columns: minmax(8rem, 0.35fr) minmax(0, 1fr);
    gap: 10px;
    padding: 8px;
    border-radius: 10px;
    background: rgba(var(--v-theme-on-surface), 0.04);
}
.mb-runtime-settings__status-list dt {
    font-weight: 600;
}
.mb-runtime-settings__status-list dd {
    margin: 0;
    overflow-wrap: anywhere;
}
.mb-runtime-settings__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 10px;
}
.mb-runtime-settings__weekdays {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    min-inline-size: 0;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.18);
    border-radius: 10px;
    padding: 8px;
}
.mb-runtime-settings__weekdays legend {
    padding-inline: 4px;
    font-size: 0.8rem;
}
.mb-runtime-settings__panel label {
    display: grid;
    gap: 5px;
    min-width: 0;
    font-size: 0.85rem;
}
.mb-runtime-settings__panel input:not([type="checkbox"]),
.mb-runtime-settings__panel select {
    min-block-size: 42px;
    max-inline-size: 100%;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.35);
    border-radius: 8px;
    padding: 8px;
    background: rgb(var(--v-theme-surface));
    color: inherit;
}
.mb-runtime-settings__panel input[type="checkbox"] {
    inline-size: 20px;
    block-size: 20px;
}
.mb-runtime-settings__accommodation {
    display: flex !important;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    align-items: start;
    gap: 10px !important;
    padding: 8px;
    border-radius: 10px;
    background: rgba(var(--v-theme-on-surface), 0.04);
}
.mb-runtime-settings__accommodation span {
    display: grid;
    gap: 3px;
}
.mb-runtime-settings__accommodation small {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.mb-runtime-settings__momentum {
    display: grid;
    gap: 6px;
    padding: 12px;
    border-radius: 12px;
    background: rgba(var(--v-theme-primary), 0.14);
}
:global(html[data-runtime-low-stimulation="true"] *) {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
}
:global(html[data-runtime-focus="true"] .mb-runtime-secondary) {
    opacity: 0.42;
}
:global(html[data-runtime-focus="true"] .mb-runtime-primary) {
    opacity: 1;
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 3px;
}
button:focus-visible,
input:focus-visible,
select:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
@media (max-width: 560px) {
    .mb-runtime-settings__status-list div {
        grid-template-columns: 1fr;
    }
    .mb-runtime-settings__grid {
        grid-template-columns: 1fr;
    }
}
</style>
