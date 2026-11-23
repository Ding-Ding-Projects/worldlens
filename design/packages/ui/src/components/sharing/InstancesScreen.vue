<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy, mdiOpenInNew, mdiRefresh } from "@mdi/js";
import {
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VChip,
    VDialog,
    VIcon,
    VSnackbar,
    VTextField,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import LiveViewerDialog from "../liveviewer/LiveViewerDialog.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    loadRows,
    resolveSharingBridges,
    rowSearchText,
    runAction,
    type Health,
    type InstanceAction,
    type InstanceRow,
    type SharingBridges,
} from "./instancesModel.js";

/**
 * Every hosted map, appliance and live viewer this app created, in one place.
 *
 * Health is checked from this PC when the page opens and every 30 seconds, and each row says
 * when it was last checked. Only instances the app recorded are listed; Remove names exactly
 * what it deletes and asks for the instance name before it does anything.
 */
const props = withDefaults(defineProps<{ bridges?: SharingBridges | null; intervalMs?: number }>(), {
    bridges: null,
    intervalMs: 30_000,
});
const { t } = useI18n();
const bridges = computed<SharingBridges>(() => props.bridges ?? resolveSharingBridges());

const rows = ref<InstanceRow[]>([]);
const health = ref<Record<string, { state: Health; at: string }>>({});
const loading = ref(false);
const busy = ref<string | null>(null);
const snackbar = ref("");
const query = ref("");
const regex = ref(false);
const flags = ref("i");
const removing = ref<InstanceRow | null>(null);
const removeTyped = ref("");
const liveViewerOpen = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));
const shown = computed(() => rows.value.filter((row) => matcher.value.test(rowSearchText(row))));
const corpus = computed(() => rows.value.map(rowSearchText).join("\n"));

function kindLabel(row: InstanceRow): string {
    return row.kind === "container"
        ? t("instances.kind.container", "Container")
        : row.kind === "appliance"
          ? t("instances.kind.appliance", "Appliance")
          : row.kind === "app"
            ? t("instances.kind.app", "WorldLens app")
          : t("instances.kind.live", "Live viewer");
}

function time24(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

async function checkAll(): Promise<void> {
    const check = bridges.value.sharing?.checkLink;
    if (!check) return;
    await Promise.all(
        rows.value.map(async (row) => {
            if (row.link === "") return;
            try {
                const answer = (await check(row.link)) as { ok?: boolean; checkedAt?: string } | null;
                health.value = {
                    ...health.value,
                    [row.key]: { state: answer?.ok ? "healthy" : "unreachable", at: answer?.checkedAt ?? new Date().toISOString() },
                };
            } catch {
                health.value = { ...health.value, [row.key]: { state: "unreachable", at: new Date().toISOString() } };
            }
        }),
    );
}

async function refresh(): Promise<void> {
    loading.value = true;
    try {
        rows.value = await loadRows(bridges.value);
        await checkAll();
    } finally {
        loading.value = false;
    }
}

function healthOf(row: InstanceRow): { state: Health; at: string } {
    return health.value[row.key] ?? { state: "unchecked", at: "" };
}

function healthText(row: InstanceRow): string {
    const h = healthOf(row);
    if (h.state === "unchecked") return t("instances.health.unchecked", "Not checked yet");
    return h.state === "healthy"
        ? t("instances.health.healthy", { time: time24(h.at) }, "Answering · checked at {time}")
        : t("instances.health.unreachable", { time: time24(h.at) }, "Not answering · checked at {time}");
}

async function act(row: InstanceRow, action: InstanceAction): Promise<void> {
    busy.value = `${row.key}:${action}`;
    const result = await runAction(bridges.value, row, action);
    busy.value = null;
    snackbar.value = result.ok
        ? t("instances.done", { name: row.name }, "Done: {name}")
        : result.message || t("instances.failed", "That did not work.");
    await refresh();
}

async function open(row: InstanceRow): Promise<void> {
    const opener = bridges.value.sharing?.openExternal;
    if (opener) await opener(row.link);
    else window.open(row.link, "_blank", "noopener");
}

async function copy(row: InstanceRow): Promise<void> {
    try {
        await navigator.clipboard.writeText(row.link);
        snackbar.value = t("instances.copied", "Link copied");
    } catch {
        snackbar.value = t("instances.copyFailed", "Copy did not work. Select the link and copy it.");
    }
}

function askRemove(row: InstanceRow): void {
    removing.value = row;
    removeTyped.value = "";
}

async function confirmRemove(): Promise<void> {
    const row = removing.value;
    if (row === null || removeTyped.value !== row.name) return;
    removing.value = null;
    await act(row, "remove");
}

onMounted(() => {
    void refresh();
    timer = setInterval(() => void checkAll(), props.intervalMs);
});
onBeforeUnmount(() => {
    if (timer !== null) clearInterval(timer);
});

defineExpose({ refresh });
</script>

<template>
    <section class="mb-instances" :aria-label="t('instances.title', 'Hosted instances')">
        <header class="mb-instances__head">
            <h1 class="mb-instances__title">{{ t("instances.title", "Hosted instances") }}</h1>
            <p class="mb-instances__lede">
                {{
                    t(
                        "instances.lede",
                        "Only instances Worldlens created. Health is checked from this PC when the page opens and every 30 seconds.",
                    )
                }}
            </p>
            <v-btn :prepend-icon="mdiRefresh" :loading="loading" variant="outlined" @click="refresh">
                {{ t("instances.checkAll", "Check all now") }}
            </v-btn>
            <v-btn color="primary" variant="flat" data-start-live-viewer @click="liveViewerOpen = true">
                {{ t("instances.startLive", "Start a live viewer") }}
            </v-btn>
        </header>
        <ConfigSearchField
            v-model="query"
            v-model:regex="regex"
            v-model:flags="flags"
            :label="t('instances.search', 'Search instances')"
            :sample="corpus"
            :summary="t('instances.summary', { shown: shown.length, total: rows.length }, 'Showing {shown} of {total} instances.')"
        />
        <p v-if="!loading && rows.length === 0" class="mb-instances__empty">
            {{
                t(
                    "instances.empty",
                    "Nothing hosted yet. Finish a render and choose Host the map, Build an appliance or Live viewer and bot.",
                )
            }}
        </p>
        <div class="mb-instances__grid">
            <article v-for="row in shown" :key="row.key" class="mb-instances__card" :data-instance="row.key">
                <div class="mb-instances__row">
                    <span
                        class="mb-instances__dot"
                        :class="`mb-instances__dot--${healthOf(row).state}`"
                        aria-hidden="true"
                    />
                    <h2 class="mb-instances__name">{{ row.name }}</h2>
                    <v-chip size="x-small" variant="outlined">{{ kindLabel(row) }}</v-chip>
                    <span class="mb-instances__health" role="status">{{ healthText(row) }}</span>
                </div>
                <span class="mb-instances__where">{{ row.where }}</span>
                <div class="mb-instances__link">
                    <code>{{ row.link }}</code>
                    <v-btn :prepend-icon="mdiOpenInNew" color="primary" variant="flat" size="small" :disabled="!row.link" @click="open(row)">
                        {{ t("instances.open", "Open") }}
                    </v-btn>
                    <v-btn :prepend-icon="mdiContentCopy" variant="outlined" size="small" :disabled="!row.link" @click="copy(row)">
                        {{ t("instances.copy", "Copy") }}
                    </v-btn>
                </div>
                <div class="mb-instances__actions">
                    <v-btn
                        v-if="row.actions.includes('start') && row.running !== true"
                        size="small"
                        variant="tonal"
                        :loading="busy === `${row.key}:start`"
                        @click="act(row, 'start')"
                        >{{ t("instances.start", "Start") }}</v-btn
                    >
                    <v-btn
                        v-if="row.actions.includes('stop') && row.running !== false"
                        size="small"
                        variant="tonal"
                        :loading="busy === `${row.key}:stop`"
                        @click="act(row, 'stop')"
                        >{{ t("instances.stop", "Stop") }}</v-btn
                    >
                    <v-btn
                        v-if="row.actions.includes('restart')"
                        size="small"
                        variant="tonal"
                        :loading="busy === `${row.key}:restart`"
                        @click="act(row, 'restart')"
                        >{{ t("instances.restart", "Restart") }}</v-btn
                    >
                    <v-btn
                        v-if="row.actions.includes('update')"
                        size="small"
                        variant="tonal"
                        :loading="busy === `${row.key}:update`"
                        @click="act(row, 'update')"
                        >{{ t("instances.update", "Update map") }}</v-btn
                    >
                    <v-btn size="small" variant="outlined" color="error" @click="askRemove(row)">
                        {{ t("instances.remove", "Remove…") }}
                    </v-btn>
                </div>
                <span class="mb-instances__detail">{{ row.detail }}</span>
            </article>
        </div>

        <v-dialog :model-value="removing !== null" max-width="520" @update:model-value="(v) => !v && (removing = null)">
            <v-card v-if="removing">
                <v-card-title>{{ t("instances.removeTitle", { name: removing.name }, "Remove {name}?") }}</v-card-title>
                <v-card-text>
                    <p>{{ t("instances.removeBody", { what: removing.removes }, "This deletes {what}. It cannot be undone.") }}</p>
                    <v-text-field
                        v-model="removeTyped"
                        :label="t('instances.removeType', { name: removing.name }, 'Type {name} to confirm')"
                        autofocus
                    />
                </v-card-text>
                <v-card-actions>
                    <v-btn variant="text" @click="removing = null">{{ t("instances.cancel", "Keep it") }}</v-btn>
                    <v-btn color="error" variant="flat" :disabled="removeTyped !== removing.name" @click="confirmRemove">
                        {{ t("instances.removeConfirm", "Remove") }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
        <LiveViewerDialog v-model="liveViewerOpen" @update:model-value="(v) => !v && refresh()" />
        <v-snackbar :model-value="snackbar !== ''" timeout="3000" @update:model-value="(v) => !v && (snackbar = '')">
            {{ snackbar }}
        </v-snackbar>
    </section>
</template>

<style scoped>
.mb-instances {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    max-width: 1280px;
}
.mb-instances__head {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
.mb-instances__title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 500;
}
.mb-instances__lede {
    margin: 0;
    flex: 1 1 320px;
    font-size: 0.8125rem;
    color: rgb(var(--v-theme-on-surface-variant));
}
.mb-instances__empty {
    color: rgb(var(--v-theme-on-surface-variant));
}
.mb-instances__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr));
    gap: 16px;
}
.mb-instances__card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 18px;
    border-radius: 16px;
    background: rgb(var(--v-theme-surface-container));
    transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.mb-instances__card:hover {
    transform: translateY(-2px);
}
.mb-instances__row,
.mb-instances__link,
.mb-instances__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.mb-instances__name {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
}
.mb-instances__health {
    margin-left: auto;
    font-size: 0.75rem;
}
.mb-instances__dot {
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background: rgb(var(--v-theme-outline));
}
.mb-instances__dot--healthy {
    background: rgb(var(--v-theme-success));
}
.mb-instances__dot--unreachable {
    background: rgb(var(--v-theme-error));
}
.mb-instances__where,
.mb-instances__detail {
    font-size: 0.75rem;
    color: rgb(var(--v-theme-on-surface-variant));
}
.mb-instances__detail {
    font-family: "Roboto Mono", monospace;
}
.mb-instances__link code {
    flex: 1 1 220px;
    min-width: 0;
    overflow-wrap: anywhere;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgb(var(--v-theme-surface-container-high));
    font-family: "Roboto Mono", monospace;
    font-size: 0.8125rem;
}
@media (prefers-reduced-motion: reduce) {
    .mb-instances__card {
        transition: none;
    }
    .mb-instances__card:hover {
        transform: none;
    }
}
</style>
