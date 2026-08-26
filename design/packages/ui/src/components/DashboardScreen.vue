<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowDown, mdiArrowUp, mdiDownload, mdiLaptop, mdiOpenInNew, mdiPin, mdiPinOff, mdiRefresh, mdiServerNetwork, mdiStop } from "@mdi/js";
import { VBtn, VCard, VCardActions, VCardText, VCheckbox, VChip, VIcon, VSelect } from "vuetify/components";
import ConfigSearchField from "./config/ConfigSearchField.vue";
import { createSettingMatcher } from "./config/regexEngine.js";

const emit = defineEmits<{ close: []; openProfile: [id: string]; openHosting: [id: string] }>();
const { t } = useI18n();
const bridge = typeof window === "undefined" ? undefined : window.worldlens;
const entries = ref<readonly DashboardEntry[]>([]);
const loading = ref(false);
const query = ref(readJson("worldlens.dashboard.query", ""));
const regexMode = ref(false);
const flags = ref("i");
const selected = ref<string[]>(readJson("worldlens.dashboard.selection", []));
const lastRefresh = ref<number | null>(null);
const refreshScope = ref<"all" | "selected">("all");
const errorMessage = ref("");
const openedMessage = ref("");
const pinned = ref<string[]>(readJson("worldlens.dashboard.pinned", []));
const order = ref<string[]>(readJson("worldlens.dashboard.order", []));
const groups = ref<Record<string, string>>(readJson("worldlens.dashboard.groups", {}));

function readJson<T>(key: string, fallback: T): T {
    try {
        const raw = globalThis.localStorage?.getItem(key);
        return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch { return fallback; }
}
function persist(key: string, value: unknown): void {
    try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* state remains live */ }
}

type DashboardRow = DashboardEntry;
const rows = computed<DashboardRow[]>(() => {
    const rank = new Map(order.value.map((id, index) => [id, index]));
    return [...entries.value].sort((a, b) => {
        const pin = Number(pinned.value.includes(b.id)) - Number(pinned.value.includes(a.id));
        const group = (groups[a.id] ?? "").localeCompare(groups[b.id] ?? "");
        return pin || group || (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label);
    });
});
function sourceLabel(source: DashboardEntry["source"]): string {
    return source === "hosting" ? t("dashboard.source.hosting", "Hosted container") : t("dashboard.source.profile", "Saved profile");
}
const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));
const visibleRows = computed(() => rows.value.filter((row) => matcher.value.test([
    row.label, sourceLabel(row.source), row.url ?? "", row.reachability, row.version ?? "", row.mapIds.join(" "), String(row.players ?? ""), row.renderState ?? row.status,
].join(" "))));
const sample = computed(() => rows.value.map((row) => [row.label, sourceLabel(row.source), row.url ?? "", row.reachability].join(" ")).join("\n"));
const allVisibleSelected = computed(() => visibleRows.value.length > 0 && visibleRows.value.every((row) => selected.value.includes(row.id)));
const selectedRows = computed(() => rows.value.filter((row) => selected.value.includes(row.id)));
const refreshLabel = computed(() => lastRefresh.value === null
    ? t("dashboard.neverChecked", "Not checked yet")
    : t("dashboard.checkedAt", { time: new Date(lastRefresh.value).toLocaleTimeString() }, "Checked {time}"));
const groupNames = ["", "Operations", "Needs attention"];

watch(() => rows.value.map((row) => row.id), (ids) => {
    selected.value = selected.value.filter((id) => ids.includes(id));
    order.value = [...order.value.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.value.includes(id))];
    pinned.value = pinned.value.filter((id) => ids.includes(id));
});

watch(query, (value) => persist("worldlens.dashboard.query", value));
watch(selected, (value) => persist("worldlens.dashboard.selection", value), { deep: true });
watch(pinned, (value) => persist("worldlens.dashboard.pinned", value), { deep: true });
watch(order, (value) => persist("worldlens.dashboard.order", value), { deep: true });
watch(groups, (value) => persist("worldlens.dashboard.groups", value), { deep: true });

function toggle(id: string): void {
    selected.value = selected.value.includes(id) ? selected.value.filter((item) => item !== id) : [...selected.value, id];
}

function toggleAll(): void {
    selected.value = allVisibleSelected.value
        ? selected.value.filter((id) => !visibleRows.value.some((row) => row.id === id))
        : Array.from(new Set([...selected.value, ...visibleRows.value.map((row) => row.id)]));
}

function openSelected(): void {
    const row = selectedRows.value[0];
    if (!row) return;
    if (row.owner.kind === "profile") emit("openProfile", row.owner.id);
    else emit("openHosting", row.owner.id);
    openedMessage.value = selectedRows.value.length > 1
        ? t("dashboard.openedFirst", { opened: row.label, skipped: selectedRows.value.length - 1 }, "Opened {opened}; {skipped} other selected rows remain selected.")
        : t("dashboard.opened", { opened: row.label }, "Opened {opened}.");
}

function togglePin(id: string): void {
    pinned.value = pinned.value.includes(id) ? pinned.value.filter((item) => item !== id) : [...pinned.value, id];
}
function move(id: string, delta: number): void {
    const ids = rows.value.map((row) => row.id);
    const index = ids.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    order.value = ids;
}
function setGroup(id: string, group: string): void { groups.value = { ...groups.value, [id]: group }; }

function exportSelected(): void {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), servers: selectedRows.value }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "worldlens-server-dashboard.json";
    anchor.click();
    URL.revokeObjectURL(url);
}

/**
 * How long a dashboard request may take before this surface stops believing in it.
 *
 * Generous, because a real refresh probes every saved server and a slow or distant one is not a
 * fault. What it is not is unbounded: a request that is only settled by a reply hangs forever when
 * the reply never comes, and neither `catch` nor `finally` runs for a promise that stays pending.
 * The symptom is a dialog stuck on "Refreshing all rows..." with a Cancel button that does nothing,
 * which is exactly what was reported.
 */
const REQUEST_DEADLINE_MS = 60_000;

/** Rejects rather than resolving, so the existing error path runs instead of showing empty truth. */
async function withDeadline<T>(work: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            work,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                    () => reject(new Error(t("dashboard.timedOut", { label, seconds: String(Math.round(REQUEST_DEADLINE_MS / 1000)) }, "{label} did not answer within {seconds} seconds. Nothing was changed; the rows below are the last ones this screen was given."))),
                    REQUEST_DEADLINE_MS,
                );
            }),
        ]);
    } finally {
        // Cleared on every path, or each request leaks a timer.
        if (timer !== undefined) clearTimeout(timer);
    }
}

/**
 * Tracks which request is current, so a superseded one cannot write over a newer answer.
 *
 * Cancel clears the busy state immediately rather than waiting for a request that may never
 * settle. Without this, the one control offered for a stuck refresh was the one control that could
 * not end it.
 */
let requestToken = 0;

async function load(initial = false): Promise<void> {
    if (bridge === undefined) return;
    const token = ++requestToken;
    loading.value = true;
    try {
        errorMessage.value = "";
        const snapshot = initial
            ? await withDeadline(bridge.dashboardSnapshot(), t("dashboard.requestSnapshot", "The dashboard"))
            : await withDeadline(bridge.dashboardRefresh({ concurrency: 3, retries: 2, backoffMs: 250 }), t("dashboard.requestRefresh", "The refresh"));
        // A stale answer must not overwrite a newer one, nor revive a cancelled request's spinner.
        if (token !== requestToken) return;
        entries.value = snapshot.entries;
        const generatedAt = Date.parse(snapshot.generatedAt);
        lastRefresh.value = Number.isFinite(generatedAt) ? generatedAt : null;
    } catch (error) {
        if (token !== requestToken) return;
        errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
        if (token === requestToken) loading.value = false;
    }
}

function refresh(): Promise<void> { refreshScope.value = selected.value.length > 0 ? "selected" : "all"; return load(false); }
/**
 * Ends the wait here as well as asking the main process to stop.
 *
 * The old version only sent the cancel and left `loading` alone, so it relied on the very request
 * that was stuck to settle and clear the spinner. Bumping the token first orphans that request:
 * whatever it eventually does, it can no longer write rows or touch the busy state.
 */
function cancelRefresh(): void {
    requestToken += 1;
    loading.value = false;
    void bridge?.dashboardCancel().catch((error) => { errorMessage.value = error instanceof Error ? error.message : String(error); });
}
onMounted(() => void load(true));
onUnmounted(() => { void bridge?.dashboardCancel().catch(() => undefined); });
</script>

<template>
    <v-card class="mb-dashboard" min-width="min(100%, 760px)">
        <template #title>
            <div class="mb-dashboard__title-row">
                <div>
                    <div class="text-h5">{{ t("dashboard.title", "Server dashboard") }}</div>
                    <div class="text-body-small mb-dashboard__muted">{{ t("dashboard.subtitle", "Every saved map, server and hosted container in one view") }}</div>
                </div>
                <v-btn :loading="loading" :prepend-icon="mdiRefresh" variant="tonal" @click="refresh">{{ selected.length ? t("dashboard.refreshSelected", "Refresh selection (all rows checked)") : t("dashboard.refresh", "Refresh all") }}</v-btn>
                <v-btn v-if="loading" :prepend-icon="mdiStop" variant="text" @click="cancelRefresh">{{ t("dashboard.cancel", "Cancel") }}</v-btn>
            </div>
        </template>
        <v-card-text>
            <div class="mb-dashboard__toolbar">
                <ConfigSearchField v-model="query" v-model:regex="regexMode" v-model:flags="flags" :label="t('dashboard.search', 'Search dashboard')" :placeholder="t('dashboard.searchHint', 'name, URL, source or status')" :sample="sample" />
                <span class="mb-dashboard__refresh" role="status">{{ refreshLabel }}</span>
            </div>
            <div class="mb-dashboard__bulk" role="toolbar" :aria-label="t('dashboard.bulkLabel', 'Dashboard bulk actions')">
                <v-checkbox class="mb-dashboard__select-all" :model-value="allVisibleSelected" :label="t('dashboard.selectAll', 'Select visible')" density="compact" hide-details @update:model-value="toggleAll" />
                <span class="mb-dashboard__selection">{{ t("dashboard.selected", { count: selected.length }, "{count} selected") }}</span>
                <v-btn size="small" variant="tonal" :disabled="selected.length === 0" :prepend-icon="mdiOpenInNew" @click="openSelected">{{ t("dashboard.openFirst", "Open first selected") }}</v-btn>
                <v-btn size="small" variant="text" :disabled="selected.length === 0" :prepend-icon="mdiDownload" @click="exportSelected">{{ t("dashboard.export", "Export") }}</v-btn>
            </div>
            <p v-if="loading" class="mb-dashboard__state" role="status">{{ refreshScope === "selected" ? t("dashboard.refreshingSelected", "Refreshing the selection; the production bridge checks all rows because its contract is snapshot-wide.") : t("dashboard.refreshing", "Refreshing all rows with bounded concurrency…") }}</p>
            <p v-if="errorMessage" class="mb-dashboard__state mb-dashboard__state--error" role="alert">{{ t("dashboard.refreshError", { error: errorMessage }, "Refresh did not complete: {error}") }}</p>
            <p v-if="openedMessage" class="mb-dashboard__state" role="status">{{ openedMessage }}</p>
            <div v-if="visibleRows.length" class="mb-dashboard__grid">
                <article v-for="row in visibleRows" :key="row.id" class="mb-dashboard__row" :class="{ 'mb-dashboard__row--selected': selected.includes(row.id) }">
                    <div class="mb-dashboard__row-top">
                        <v-checkbox class="mb-dashboard__check" :model-value="selected.includes(row.id)" :aria-label="t('dashboard.select', { name: row.label }, `Select ${row.label}`)" density="compact" hide-details @update:model-value="toggle(row.id)" />
                        <v-icon :icon="row.source === 'profile' ? mdiLaptop : mdiServerNetwork" aria-hidden="true" />
                        <v-btn class="mb-dashboard__name" variant="text" :ripple="false" @click="row.owner.kind === 'profile' ? emit('openProfile', row.owner.id) : emit('openHosting', row.owner.id)">{{ row.label }}</v-btn>
                        <v-chip size="small" variant="tonal">{{ sourceLabel(row.source) }}</v-chip>
                        <v-btn size="x-small" variant="text" :icon="pinned.includes(row.id) ? mdiPinOff : mdiPin" :aria-label="pinned.includes(row.id) ? t('dashboard.unpin', 'Unpin') : t('dashboard.pin', 'Pin')" @click="togglePin(row.id)" />
                        <v-btn size="x-small" variant="text" :icon="mdiArrowUp" :aria-label="t('dashboard.moveUp', 'Move up')" @click="move(row.id, -1)" />
                        <v-btn size="x-small" variant="text" :icon="mdiArrowDown" :aria-label="t('dashboard.moveDown', 'Move down')" @click="move(row.id, 1)" />
                    </div>
                    <div class="mb-dashboard__url">{{ row.url ?? t("dashboard.unknown", "Unknown") }}</div>
                    <v-select class="mb-dashboard__group" :aria-label="t('dashboard.group', 'Dashboard group')" :model-value="groups[row.id] ?? ''" :items="groupNames.map((group) => ({ title: group || t('dashboard.noGroup', 'No group'), value: group }))" density="compact" hide-details variant="outlined" @update:model-value="setGroup(row.id, $event)" />
                    <dl class="mb-dashboard__facts">
                        <div><dt>{{ t("dashboard.reachability", "Reachability") }}</dt><dd>{{ row.reachability }}</dd></div>
                        <div><dt>{{ t("dashboard.version", "Version") }}</dt><dd>{{ row.version ?? t("dashboard.unknown", "Unknown") }}</dd></div>
                        <div><dt>{{ t("dashboard.maps", "Maps") }}</dt><dd>{{ row.mapIds.length || t("dashboard.unknown", "Unknown") }}</dd></div>
                        <div><dt>{{ t("dashboard.players", "Players") }}</dt><dd>{{ row.players ?? t("dashboard.unknown", "Unknown") }}</dd></div>
                        <div><dt>{{ t("dashboard.render", "Render") }}</dt><dd>{{ row.renderState ?? row.status }}</dd></div>
                        <div><dt>{{ t("dashboard.lastChecked", "Last check") }}</dt><dd>{{ row.lastCheckedAt ? new Date(row.lastCheckedAt).toLocaleString() : t("dashboard.neverChecked", "Not checked yet") }}</dd></div>
                    </dl>
                    <p v-if="row.failure" class="mb-dashboard__failure">{{ row.failure }}</p>
                </article>
            </div>
            <p v-else class="mb-dashboard__empty" role="status">{{ query ? t("dashboard.noMatch", "No saved servers match this search.") : t("dashboard.empty", "No saved maps, servers or hosted containers yet.") }}</p>
            <p class="mb-dashboard__boundary">{{ t("dashboard.boundary", "Unknown and stale values remain visible until their owning adapter reports them; this dashboard does not guess health, version or player counts.") }}</p>
        </v-card-text>
        <v-card-actions><v-btn @click="emit('close')">{{ t("dashboard.close", "Close") }}</v-btn></v-card-actions>
    </v-card>
</template>

<style scoped>
.mb-dashboard { width: min(100%, 980px); }
.mb-dashboard__title-row, .mb-dashboard__toolbar, .mb-dashboard__bulk, .mb-dashboard__row-top { display: flex; align-items: center; gap: 12px; }
.mb-dashboard__title-row { justify-content: space-between; gap: 24px; }
.mb-dashboard__toolbar { align-items: end; margin-block: 4px 12px; }
.mb-dashboard__toolbar :deep(.v-field) { flex: 1 1 auto; }
.mb-dashboard__muted, .mb-dashboard__refresh, .mb-dashboard__boundary, .mb-dashboard__url { color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.mb-dashboard__refresh { white-space: nowrap; font-size: .8rem; }
.mb-dashboard__bulk { flex-wrap: wrap; border-block: 1px solid rgba(var(--v-theme-on-surface), .12); padding-block: 10px; margin-block-end: 12px; }
.mb-dashboard__selection { margin-inline-end: auto; color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.mb-dashboard__select-all, .mb-dashboard__check { display: inline-flex; align-items: center; gap: 8px; min-block-size: 40px; }
.mb-dashboard__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 12px; }
.mb-dashboard__row { border: 1px solid rgba(var(--v-theme-on-surface), .14); border-radius: 12px; padding: 12px; min-inline-size: 0; }
.mb-dashboard__row--selected { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .06); }
.mb-dashboard__name { flex: 1 1 auto; min-inline-size: 0; overflow-wrap: anywhere; text-align: start; font: inherit; font-weight: 600; color: rgb(var(--v-theme-primary)); text-decoration: underline; text-underline-offset: 3px; }
.mb-dashboard__url { margin: 4px 0 10px 40px; overflow-wrap: anywhere; font-size: .82rem; }
.mb-dashboard__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0 0 0 40px; }
.mb-dashboard__facts div { min-inline-size: 0; }
.mb-dashboard__facts dt { font-size: .72rem; color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.mb-dashboard__facts dd { margin: 2px 0 0; overflow-wrap: anywhere; }
.mb-dashboard__failure { color: rgb(var(--v-theme-error)); font-size: .8rem; overflow-wrap: anywhere; }
.mb-dashboard__empty { padding: 24px 0; }
.mb-dashboard__state { margin: 8px 0; }
.mb-dashboard__state--error { color: rgb(var(--v-theme-error)); }
.mb-dashboard__group { max-inline-size: 100%; margin: 0 0 10px 40px; min-block-size: 32px; border: 1px solid rgba(var(--v-theme-on-surface), .2); border-radius: 6px; padding: 4px 8px; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); }
.mb-dashboard__boundary { font-size: .78rem; margin: 16px 0 0; }
@media (max-width: 640px) { .mb-dashboard__title-row, .mb-dashboard__toolbar { align-items: stretch; flex-direction: column; } .mb-dashboard__refresh { white-space: normal; } .mb-dashboard__facts, .mb-dashboard__group { margin-inline-start: 0; } .mb-dashboard__url { margin-inline-start: 0; } }
</style>
