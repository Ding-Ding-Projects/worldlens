<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    DEFAULT_RUNTIME_SETTINGS,
    resolveScheduledValues,
    type AccommodationKey,
    type RuntimeLanguage,
    type RuntimeSettingKey,
    type RuntimeSettingsState,
    type RuntimeSource,
} from "./model.js";
import { readExternalRule, scheduleFieldLabel, applyTemporaryExternalValues } from "./schedule.js";
import {
    createNarratorController,
    resolveVoiceStatus,
    type NarratorController,
    type VoiceInfo,
} from "./narrator.js";
import {
    loadRuntimeSettings,
    recordRuntimeHistory,
    setAccommodation,
    updateRuntimeValues,
} from "./store.js";

type RuntimeTab = "status" | "narrator" | "schedule" | "accommodations";
interface RuntimeSearchItem {
    id: string;
    tab: RuntimeTab;
    title: string;
    detail: string;
    accommodation?: AccommodationKey;
}

const { t } = useI18n();
const state = ref<RuntimeSettingsState>(loadRuntimeSettings());
const activeTab = ref<RuntimeTab>("status");
const query = ref("");
const regexMode = ref(false);
const flags = ref("im");
const statusMessage = ref(t("runtime.status.ready", "Runtime settings are local and ready."));
const voiceList = ref<VoiceInfo[]>([]);
const speechAvailable = computed(() => typeof speechSynthesis !== "undefined");
let narrator: NarratorController | null = null;
let unsubscribeVoices: (() => void) | null = null;

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));
const activeValues = computed(() =>
    resolveScheduledValues(state.value.values, state.value.schedules),
);
const externalRules = computed(() =>
    state.value.schedules.filter((rule) => rule.source !== "local"),
);

const accommodationItems: readonly { key: AccommodationKey; title: string; detail: string }[] = [
    {
        key: "focus",
        title: "Focus",
        detail: "Bring the current item forward without hiding anything.",
    },
    {
        key: "lowStimulation",
        title: "Low stimulation",
        detail: "Reduce non-essential motion, colour and notices.",
    },
    {
        key: "timeAwareness",
        title: "Time awareness",
        detail: "Show elapsed session time where the work happens.",
    },
    {
        key: "oneThingAtATime",
        title: "One thing at a time",
        detail: "Keep one user-chosen next action visible.",
    },
    {
        key: "momentum",
        title: "Momentum",
        detail: "Offer a dismissible prompt after a quiet period.",
    },
];

const searchableItems = computed<RuntimeSearchItem[]>(() => [
    {
        id: "status",
        tab: "status" as const,
        title: "Status Hub",
        detail: "Factual runtime records and delivery availability.",
    },
    {
        id: "narrator",
        tab: "narrator" as const,
        title: "Spoken narrator",
        detail: "Narration language, voices, rate, pitch and quiet behaviour.",
    },
    {
        id: "schedule",
        tab: "schedule" as const,
        title: "Scheduled settings",
        detail: "Versioned local, HTTPS and Home Assistant rules.",
    },
    ...accommodationItems.map((item) => ({
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
    if (matcher.value.error !== null)
        return t(
            "runtime.search.invalid",
            "The pattern is not valid, so no runtime settings are listed.",
        );
    if (!matcher.value.active)
        return t(
            "runtime.search.total",
            { n: searchableItems.value.length },
            "{n} runtime settings.",
        );
    return t(
        "runtime.search.found",
        { shown: visibleItems.value.length, total: searchableItems.value.length },
        "{shown} of {total} runtime settings match.",
    );
});

function persistValues(patch: Parameters<typeof updateRuntimeValues>[1]): void {
    state.value = updateRuntimeValues(state.value, patch);
    statusMessage.value = t(
        "runtime.status.saved",
        "Saved locally and recorded in runtime settings history.",
    );
}

function setAccommodationValue(key: AccommodationKey, enabled: boolean): void {
    state.value = setAccommodation(state.value, key, enabled);
    statusMessage.value = t(
        "runtime.status.saved",
        "Saved locally and recorded in runtime settings history.",
    );
}

function openItem(item: (typeof searchableItems.value)[number]): void {
    activeTab.value = item.tab;
}

const tabs: readonly { id: RuntimeTab; label: string }[] = [
    { id: "status", label: "Status Hub" },
    { id: "narrator", label: "Narrator" },
    { id: "schedule", label: "Scheduled settings" },
    { id: "accommodations", label: "Attention modes" },
];

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
        statusMessage.value = t(
            "runtime.schedule.invalid",
            "Enter a label and valid start and end times before adding the rule.",
        );
        return;
    }
    if (scheduleSource.value !== "local" && !scheduleUrl.value.trim()) {
        statusMessage.value = t(
            "runtime.schedule.sourceRequired",
            "An external source needs a validated HTTPS or loopback URL.",
        );
        return;
    }
    if (
        scheduleSource.value === "homeAssistant" &&
        (!scheduleEntity.value.trim() || !scheduleCredentialRef.value.trim())
    ) {
        statusMessage.value = t(
            "runtime.schedule.homeAssistantRequired",
            "Home Assistant needs an entity id and a credential-vault reference.",
        );
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
        state.value = next;
        // The shared store parser is the final bounded validation boundary.
        const saved = updateRuntimeValues(next, {}, undefined);
        state.value = saved;
        recordRuntimeHistory("created", ["schedules", scheduleSetting.value]);
        statusMessage.value = t(
            "runtime.schedule.added",
            "The scheduled rule was added and recorded locally.",
        );
    } catch (error) {
        state.value = loadRuntimeSettings();
        statusMessage.value =
            error instanceof Error
                ? error.message
                : t("runtime.schedule.invalid", "The scheduled rule could not be saved.");
    }
}

function removeSchedule(id: string): void {
    state.value = {
        ...state.value,
        schedules: state.value.schedules.filter((rule) => rule.id !== id),
    };
    // Save the new state through the same validator used for ordinary setting changes.
    updateRuntimeValues(state.value, {});
    recordRuntimeHistory("deleted", ["schedules"]);
    statusMessage.value = t(
        "runtime.schedule.deleted",
        "The scheduled rule was removed and recorded locally.",
    );
}

async function refreshExternalSources(): Promise<void> {
    if (externalRules.value.length === 0) {
        statusMessage.value = t(
            "runtime.schedule.none",
            "No external source is configured, so nothing was requested.",
        );
        return;
    }
    const rule = externalRules.value[0];
    if (rule === undefined) return;
    const result = await readExternalRule(rule);
    if (!result.ok || result.value === undefined) {
        statusMessage.value = result.message;
        return;
    }
    state.value = applyTemporaryExternalValues(state.value, result.value);
    statusMessage.value = `${result.message} The value is temporary and the local base remains recoverable.`;
}

function narratorStatus(language: "en" | "yue"): ReturnType<typeof resolveVoiceStatus> {
    const chosen =
        language === "yue"
            ? state.value.values.narrator.cantoneseVoiceId
            : state.value.values.narrator.englishVoiceId;
    return resolveVoiceStatus(voiceList.value, chosen, language);
}

function narratorVoiceLabel(language: "en" | "yue"): string {
    const effective = narratorStatus(language).effective;
    return effective === null
        ? "No matching voice is available on this computer."
        : `Effective ${language === "yue" ? "Cantonese" : "English"} voice: ${effective.name}.`;
}

function speakTest(): void {
    narrator?.speak(
        state.value.values.narrator,
        { en: "Worldlens narrator test.", yue: "Worldlens 旁白測試。" },
        "runtime-settings-test",
        { reducedSound: state.value.values.narrator.quietHours },
    );
    statusMessage.value = t(
        "runtime.narrator.testQueued",
        "The test message was queued, or was skipped because quiet or assistive technology settings are active.",
    );
}

onMounted(() => {
    narrator = createNarratorController();
    voiceList.value = [...narrator.voices()];
    unsubscribeVoices = narrator.subscribe(() => {
        voiceList.value = [...(narrator?.voices() ?? [])];
    });
    narrator.refresh();
});

onUnmounted(() => {
    unsubscribeVoices?.();
    unsubscribeVoices = null;
    narrator?.dispose();
    narrator = null;
});
</script>

<template>
    <section class="mb-runtime-settings" aria-label="Runtime settings">
        <ConfigSearchField
            v-model="query"
            v-model:regex="regexMode"
            v-model:flags="flags"
            label="Find runtime settings"
            placeholder="Try narrator, night, focus or voice"
            :sample="sample"
            :summary="summary"
        />

        <ul
            v-if="matcher.active"
            class="mb-runtime-settings__results"
            aria-label="Runtime setting results"
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
                    :aria-label="`Adjust ${item.title}`"
                    @change="
                        setAccommodationValue(
                            item.accommodation,
                            ($event.target as HTMLInputElement).checked,
                        )
                    "
                />
            </li>
            <li v-if="visibleItems.length === 0" class="mb-runtime-settings__empty">
                No runtime setting matches this search.
            </li>
        </ul>

        <div
            class="mb-runtime-settings__tabs"
            role="tablist"
            aria-label="Runtime settings sections"
        >
            <button
                v-for="tab in tabs"
                :id="`runtime-tab-${tab.id}`"
                :key="tab.id"
                type="button"
                role="tab"
                :aria-selected="activeTab === tab.id"
                :aria-controls="`runtime-panel-${tab.id}`"
                @click="activeTab = tab.id"
            >
                {{ tab.label }}
            </button>
        </div>

        <article
            v-if="activeTab === 'status'"
            id="runtime-panel-status"
            role="tabpanel"
            aria-labelledby="runtime-tab-status"
            class="mb-runtime-settings__panel"
        >
            <h4>Status Hub</h4>
            <p class="mb-runtime-settings__notice" aria-live="polite">{{ statusMessage }}</p>
            <dl class="mb-runtime-settings__status-list">
                <div>
                    <dt>Runtime settings</dt>
                    <dd>
                        ✅ Local state version {{ state.version }},
                        {{ state.schedules.length }} schedule rule(s)
                    </dd>
                </div>
                <div>
                    <dt>Narrator</dt>
                    <dd>
                        {{
                            !speechAvailable
                                ? "⚠️ Speech synthesis is unavailable on this computer"
                                : `✅ ${voiceList.length} voice(s) reported, with late updates watched`
                        }}
                    </dd>
                </div>
                <div>
                    <dt>External sources</dt>
                    <dd>
                        {{
                            externalRules.length === 0
                                ? "⏸️ None configured, no request made"
                                : `⏳ ${externalRules.length} configured, refresh is user-started`
                        }}
                    </dd>
                </div>
                <div>
                    <dt>Status delivery</dt>
                    <dd>
                        ⚠️ Authenticated Status Hub delivery is unavailable in this build. These
                        factual records remain local, and no send control is shown.
                    </dd>
                </div>
            </dl>
            <p class="mb-runtime-settings__hint">
                The Status Hub record is evidence, not a promise. Unavailable delivery stays visible
                instead of pretending a message was sent.
            </p>
        </article>

        <article
            v-else-if="activeTab === 'narrator'"
            id="runtime-panel-narrator"
            role="tabpanel"
            aria-labelledby="runtime-tab-narrator"
            class="mb-runtime-settings__panel"
        >
            <h4>Spoken narrator</h4>
            <p class="mb-runtime-settings__hint">
                Narration is off until enabled. Voice lists are read from this computer, stable
                voice ids are retained, and Both speaks English then Cantonese in order.
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
                Enable narration</label
            >
            <label
                >Language
                <select
                    :value="state.values.narrator.language"
                    @change="
                        persistValues({
                            narrator: {
                                ...state.values.narrator,
                                language: ($event.target as HTMLSelectElement)
                                    .value as RuntimeLanguage,
                            },
                        })
                    "
                >
                    <option value="en">English</option>
                    <option value="yue">Cantonese</option>
                    <option value="both">Both, English then Cantonese</option>
                </select>
            </label>
            <label
                >English voice
                <select
                    :value="state.values.narrator.englishVoiceId ?? ''"
                    @change="
                        persistValues({
                            narrator: {
                                ...state.values.narrator,
                                englishVoiceId: ($event.target as HTMLSelectElement).value || null,
                            },
                        })
                    "
                >
                    <option value="">Choose automatically</option>
                    <option
                        v-for="voice in voiceList.filter((voice) =>
                            voice.lang.toLowerCase().startsWith('en'),
                        )"
                        :key="voice.id"
                        :value="voice.id"
                    >
                        {{ voice.name }} · {{ voice.lang
                        }}{{ voice.networkBacked ? " · network-backed" : "" }}
                    </option>
                </select>
            </label>
            <p class="mb-runtime-settings__hint">
                {{
                    narratorStatus("en").installed
                        ? `Selected English voice is installed${narratorStatus("en").networkBacked ? " and network-backed" : ""}.`
                        : "Choose automatically is active, or the selected English voice is not installed and will fall back."
                }}
            </p>
            <label
                >Cantonese voice
                <select
                    :value="state.values.narrator.cantoneseVoiceId ?? ''"
                    @change="
                        persistValues({
                            narrator: {
                                ...state.values.narrator,
                                cantoneseVoiceId:
                                    ($event.target as HTMLSelectElement).value || null,
                            },
                        })
                    "
                >
                    <option value="">Choose automatically</option>
                    <option
                        v-for="voice in voiceList.filter((voice) =>
                            ['yue', 'zh-hk', 'zh-tw'].some((prefix) =>
                                voice.lang.toLowerCase().startsWith(prefix),
                            ),
                        )"
                        :key="voice.id"
                        :value="voice.id"
                    >
                        {{ voice.name }} · {{ voice.lang
                        }}{{ voice.networkBacked ? " · network-backed" : "" }}
                    </option>
                </select>
            </label>
            <p class="mb-runtime-settings__hint">{{ narratorVoiceLabel("yue") }}</p>
            <label
                >Rate
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
                >Pitch
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
                Quiet mode, yield to reduced sound and assistive technology</label
            >
            <button type="button" @click="speakTest">Speak a test message</button>
        </article>

        <article
            v-else-if="activeTab === 'schedule'"
            id="runtime-panel-schedule"
            role="tabpanel"
            aria-labelledby="runtime-tab-schedule"
            class="mb-runtime-settings__panel"
        >
            <h4>Scheduled settings</h4>
            <p class="mb-runtime-settings__hint">
                Times use this computer's local timezone. Every day means all weekdays.
                Cross-midnight windows are supported, and a higher priority wins before the stable
                id tie-breaker.
            </p>
            <div class="mb-runtime-settings__grid">
                <label>Label <input v-model="scheduleLabel" /></label>
                <label
                    >Setting
                    <select v-model="scheduleSetting">
                        <option
                            v-for="key in [
                                'language',
                                'theme',
                                'density',
                                'accent',
                                'fontFamily',
                                'fontSize',
                                'motion',
                                'displayName',
                            ]"
                            :key="key"
                            :value="key"
                        >
                            {{ scheduleFieldLabel(key as RuntimeSettingKey) }}
                        </option>
                    </select>
                </label>
                <label>Value <input v-model="scheduleValue" /></label>
                <label
                    >Priority
                    <input
                        v-model.number="schedulePriority"
                        type="number"
                        min="-100000"
                        max="100000"
                        step="1"
                /></label>
                <label
                    >Source
                    <select v-model="scheduleSource">
                        <option value="local">Local</option>
                        <option value="https">Validated HTTPS API</option>
                        <option value="homeAssistant">Home Assistant boolean</option>
                    </select></label
                >
                <label>Start time <input v-model="scheduleStart" type="time" /></label>
                <label>End time <input v-model="scheduleEnd" type="time" /></label>
                <label>Start date <input v-model="scheduleStartDate" type="date" /></label>
                <label>End date <input v-model="scheduleEndDate" type="date" /></label>
                <label v-if="scheduleSource !== 'local'"
                    >HTTPS or loopback URL <input v-model="scheduleUrl" inputmode="url"
                /></label>
                <label v-if="scheduleSource === 'homeAssistant'"
                    >Boolean entity id
                    <input v-model="scheduleEntity" placeholder="input_boolean.night"
                /></label>
                <label v-if="scheduleSource === 'homeAssistant'"
                    >Credential-vault reference <input v-model="scheduleCredentialRef"
                /></label>
            </div>
            <button type="button" @click="addSchedule">Add scheduled rule</button>
            <button
                type="button"
                :disabled="externalRules.length === 0"
                @click="refreshExternalSources"
            >
                Refresh external sources
            </button>
            <ul class="mb-runtime-settings__rules" aria-label="Scheduled rules">
                <li v-for="rule in state.schedules" :key="rule.id">
                    <span
                        ><strong>{{ rule.label }}</strong> ·
                        {{ scheduleFieldLabel(rule.setting) }} = {{ rule.value }} ·
                        {{ rule.startTime }} to {{ rule.endTime }} · {{ rule.source }}</span
                    >
                    <button
                        type="button"
                        :aria-label="`Remove ${rule.label}`"
                        @click="removeSchedule(rule.id)"
                    >
                        Remove
                    </button>
                </li>
                <li v-if="state.schedules.length === 0" class="mb-runtime-settings__empty">
                    No scheduled rules yet.
                </li>
            </ul>
        </article>

        <article
            v-else
            id="runtime-panel-accommodations"
            role="tabpanel"
            aria-labelledby="runtime-tab-accommodations"
            class="mb-runtime-settings__panel"
        >
            <h4>Attention modes</h4>
            <p class="mb-runtime-settings__hint">
                These are independent interface accommodations, off by default, non-medical, and
                never hide work without an obvious way back.
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
                        setAccommodationValue(item.key, ($event.target as HTMLInputElement).checked)
                    "
                />
                <span
                    ><strong>{{ item.title }}</strong
                    ><small>{{ item.detail }}</small></span
                >
            </label>
            <p class="mb-runtime-settings__hint">
                Current scheduled preview: {{ activeValues.theme }}, {{ activeValues.density }},
                {{ activeValues.motion }}, display name {{ activeValues.displayName }}.
            </p>
        </article>
    </section>
</template>

<style scoped>
.mb-runtime-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
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
