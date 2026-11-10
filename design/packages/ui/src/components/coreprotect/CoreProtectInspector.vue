<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy, mdiDatabaseSearchOutline, mdiDownload, mdiEye, mdiMapMarkerRadiusOutline, mdiPause, mdiPlay, mdiStop } from "@mdi/js";
import { VAlert, VAutocomplete, VBtn, VChip, VChipGroup, VIcon, VRangeSlider, VSelect, VSwitch, VTextField } from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import InfoButton from "../info/InfoButton.vue";
import { useBlueMap } from "../menu/useBlueMap.js";
import { ACTION_STYLE, quickActions, summarize, toCsv, type BlockChange, type ChangeAction, type QuickAction } from "./coreprotectModel.js";
import { canRereadSource, canWatch, closeDatabase, coreprotect, openFile, pause, pickAndOpen, play, requery, startWatching, stopReplay, stopWatching } from "./coreprotectStore.js";

/**
 * The CoreProtect inspector: open a server's CoreProtect database, filter its block changes by
 * world, time, player, action and material, highlight them on the map, play them back in time
 * order or watch the file for new changes, and copy ready-made CoreProtect commands for the
 * selection. Everything is read on this computer; nothing is uploaded or written.
 */
const emit = defineEmits<{ "open-map": [] }>();
const { t } = useI18n();
const app = useBlueMap();
const fileInput = ref<HTMLInputElement | null>(null);
const copied = ref<string | null>(null);

const ACTIONS: readonly ChangeAction[] = ["place", "break", "click", "kill"];
const actionLabel = (a: ChangeAction): string =>
    ({ place: t("cp.action.place", "Placed"), break: t("cp.action.break", "Broken"), click: t("cp.action.click", "Used"), kill: t("cp.action.kill", "Killed") })[a];

const summary = computed(() => summarize(coreprotect.changes));
const fmt = (s: number | null): string => (s === null ? "" : new Date(s * 1000).toLocaleString());

/** The time window as a slider over the database's whole span. */
const span = computed(() => ({ min: coreprotect.meta?.first ?? 0, max: coreprotect.meta?.last ?? 1 }));
const windowModel = computed<number[]>({
    get: () => [coreprotect.filter.from ?? span.value.min, coreprotect.filter.to ?? span.value.max],
    set: (value: number[]) => update({ from: value[0] ?? null, to: value[1] ?? null }),
});

function update(patch: Partial<typeof coreprotect.filter>): void {
    stopReplay();
    coreprotect.filter = { ...coreprotect.filter, ...patch };
    requery();
}

const PRESETS = [
    { id: "hour", seconds: 3600 },
    { id: "day", seconds: 86400 },
    { id: "week", seconds: 7 * 86400 },
] as const;
const presetLabel = (id: (typeof PRESETS)[number]["id"]): string =>
    id === "hour" ? t("cp.preset.hour", "Last hour") : id === "day" ? t("cp.preset.day", "Last day") : t("cp.preset.week", "Last week");
function preset(seconds: number | null): void {
    const last = coreprotect.meta?.last ?? null;
    update(seconds === null || last === null ? { from: null, to: null } : { from: last - seconds, to: last });
}

async function onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = "";
    if (file) await openFile(file);
}

async function open(): Promise<void> {
    if (!(await pickAndOpen())) fileInput.value?.click();
}

async function onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) await openFile(file);
}

function focusOn(change: BlockChange): void {
    coreprotect.focus = change;
    const viewer = app.value?.mapViewer;
    viewer?.controlsManager.position.set(change.x + 0.5, change.y, change.z + 0.5);
}

function showOnMap(change?: BlockChange): void {
    coreprotect.showOnMap = true;
    if (change) focusOn(change);
    else if (summary.value.bounds) {
        const b = summary.value.bounds;
        app.value?.mapViewer.controlsManager.position.set((b.minX + b.maxX) / 2, 64, (b.minZ + b.maxZ) / 2);
    }
    emit("open-map");
}

/** The rows the list shows: newest first, the first 500. */
const LIST_LIMIT = 500;
const listed = computed(() => [...coreprotect.changes].reverse().slice(0, LIST_LIMIT));

const actions = computed<QuickAction[]>(() =>
    quickActions(
        {
            users: coreprotect.filter.users,
            world: coreprotect.filter.world,
            from: summary.value.first ?? coreprotect.filter.from ?? 0,
            to: summary.value.last ?? coreprotect.filter.to ?? 0,
            now: Math.floor(Date.now() / 1000),
        },
        coreprotect.focus,
    ),
);
const actionTitle = (id: QuickAction["id"]): string =>
    ({
        lookup: t("cp.qa.lookup", "Look up these changes"),
        count: t("cp.qa.count", "Count them"),
        preview: t("cp.qa.preview", "Preview a rollback"),
        rollback: t("cp.qa.rollback", "Roll back"),
        restore: t("cp.qa.restore", "Restore"),
        inspect: t("cp.qa.inspect", "Toggle the inspector wand"),
        teleport: t("cp.qa.teleport", "Teleport to the selected change"),
    })[id];

async function copy(action: QuickAction): Promise<void> {
    try {
        await navigator.clipboard.writeText(action.command);
        copied.value = action.id;
    } catch {
        copied.value = null;
    }
}

function download(name: string, text: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stem = computed(() => (coreprotect.fileName ?? "coreprotect").replace(/\.[^.]+$/u, ""));

const fadeGuide = computed(() => ({
    purpose: t("cp.guide.fade.purpose", "How long a change stays bright on the map before it dims."),
    defaultValue: t("cp.guide.fade.default", "One hour of database time."),
    effect: t("cp.guide.fade.effect", "Older changes stay visible but fainter, so the newest work stands out. During a replay, age is measured from the replay clock."),
}));
const FADES = computed(() => [
    { value: 0, title: t("cp.fade.none", "Never dim") },
    { value: 600, title: t("cp.fade.10m", "10 minutes") },
    { value: 3600, title: t("cp.fade.1h", "1 hour") },
    { value: 86400, title: t("cp.fade.1d", "1 day") },
]);
const SPEEDS = computed(() => [
    { value: 1, title: t("cp.speed.real", "Real time") },
    { value: 60, title: t("cp.speed.60", "1 minute per second") },
    { value: 600, title: t("cp.speed.600", "10 minutes per second") },
    { value: 3600, title: t("cp.speed.3600", "1 hour per second") },
]);
</script>

<template>
    <section class="wl-cp" data-test="coreprotect-inspector" :aria-label="t('cp.title', 'CoreProtect inspector')" @dragover.prevent @drop="onDrop">
        <header class="wl-cp__head">
            <div>
                <h1>{{ t("cp.title", "CoreProtect inspector") }}</h1>
                <p>{{ t("cp.intro", "Open a server's CoreProtect database (plugins/CoreProtect/database.db) to see who changed which blocks, highlighted on the map. It is read on this computer and never changed.") }}</p>
            </div>
            <div class="wl-cp__actions">
                <VBtn color="primary" :prepend-icon="mdiDatabaseSearchOutline" :loading="coreprotect.loading" @click="open">{{ t("cp.open", "Open database") }}</VBtn>
                <VBtn v-if="coreprotect.meta" variant="text" @click="closeDatabase()">{{ t("cp.close", "Close") }}</VBtn>
                <input ref="fileInput" type="file" accept=".db,.sqlite,.sqlite3" hidden :aria-label="t('cp.open', 'Open database')" @change="onFile" />
            </div>
        </header>

        <VAlert v-if="coreprotect.error" type="error" variant="tonal" density="compact">{{ coreprotect.error }}</VAlert>

        <div v-if="!coreprotect.meta" class="wl-cp__empty" role="status">
            <VIcon :icon="mdiDatabaseSearchOutline" size="40" />
            <p>{{ t("cp.empty", "Drop database.db here, or open it. A copy downloaded from the server works; MySQL databases need exporting to SQLite first.") }}</p>
        </div>

        <template v-else>
            <p class="wl-cp__meta">
                <strong>{{ coreprotect.fileName }}</strong> ·
                {{ t("cp.metaLine", { rows: coreprotect.meta.blockRows.toLocaleString(), users: coreprotect.meta.users.length, from: fmt(coreprotect.meta.first), to: fmt(coreprotect.meta.last) }, "{rows} block changes by {users} players and sources, {from} to {to}") }}
            </p>

            <div class="wl-cp__filters">
                <VSelect :model-value="coreprotect.filter.world" :items="coreprotect.meta.worlds" :label="t('cp.world', 'World')" density="compact" hide-details @update:model-value="(w: string) => update({ world: w })" />
                <VAutocomplete
                    :model-value="[...coreprotect.filter.users]"
                    :items="coreprotect.meta.users"
                    multiple
                    chips
                    closable-chips
                    clearable
                    :label="t('cp.users', 'Players and sources (all when empty)')"
                    density="compact"
                    hide-details
                    @update:model-value="(u: string[]) => update({ users: u })"
                />
                <VTextField :model-value="coreprotect.filter.material" :label="t('cp.material', 'Block contains')" density="compact" hide-details clearable @update:model-value="(m: string | null) => update({ material: m ?? '' })" />
            </div>

            <VChipGroup column :model-value="[...coreprotect.filter.actions]" multiple filter :aria-label="t('cp.actions', 'Actions')" @update:model-value="(a: ChangeAction[]) => update({ actions: a })">
                <VChip v-for="a in ACTIONS" :key="a" :value="a" variant="tonal">
                    <span class="wl-cp__swatch" :style="{ background: `rgb(${ACTION_STYLE[a].r}, ${ACTION_STYLE[a].g}, ${ACTION_STYLE[a].b})` }" aria-hidden="true">{{ ACTION_STYLE[a].glyph }}</span>
                    {{ actionLabel(a) }}
                </VChip>
            </VChipGroup>

            <div class="wl-cp__window">
                <VRangeSlider v-model="windowModel" :min="span.min" :max="span.max" :step="1" :label="t('cp.window', 'Time')" hide-details density="compact" />
                <p class="wl-cp__range">{{ fmt(coreprotect.filter.from) }} → {{ fmt(coreprotect.filter.to) }}</p>
                <div class="wl-cp__actions">
                    <VBtn v-for="p in PRESETS" :key="p.id" size="small" variant="tonal" @click="preset(p.seconds)">{{ presetLabel(p.id) }}</VBtn>
                    <VBtn size="small" variant="text" @click="preset(null)">{{ t("cp.preset.all", "Everything") }}</VBtn>
                    <VSwitch :model-value="coreprotect.filter.includeRolledBack" color="primary" inset density="compact" hide-details :label="t('cp.rolledBack', 'Include rolled-back changes')" @update:model-value="(v: boolean | null) => update({ includeRolledBack: v === true })" />
                </div>
            </div>

            <div class="wl-cp__stats" role="status">
                <span>{{ t("cp.found", { count: summary.total.toLocaleString() }, "{count} changes") }}</span>
                <span v-for="a in ACTIONS" :key="a">{{ ACTION_STYLE[a].glyph }} {{ actionLabel(a) }} {{ summary.byAction[a] }}</span>
                <span v-if="coreprotect.more" class="wl-cp__warn">{{ t("cp.more", "More changes match than the inspector holds at once; narrow the time or players to see them all.") }}</span>
            </div>

            <div class="wl-cp__map">
                <VSwitch v-model="coreprotect.showOnMap" color="primary" inset density="compact" hide-details :label="t('cp.showOnMap', 'Highlight on the map')" />
                <span class="wl-cp__with-info">
                    <VSelect v-model="coreprotect.fadeSeconds" :items="FADES" :label="t('cp.fade', 'Dim after')" density="compact" hide-details />
                    <InfoButton :control="t('cp.fade', 'Dim after')" :guide="fadeGuide" resettable @reset="coreprotect.fadeSeconds = 3600" />
                </span>
                <VBtn variant="tonal" :prepend-icon="mdiMapMarkerRadiusOutline" :disabled="summary.total === 0" @click="showOnMap()">{{ t("cp.goMap", "Show on the map") }}</VBtn>
            </div>

            <div class="wl-cp__replay">
                <VBtn :prepend-icon="coreprotect.replay.playing ? mdiPause : mdiPlay" :disabled="summary.total === 0" @click="coreprotect.replay.playing ? pause() : play()">
                    {{ coreprotect.replay.playing ? t("cp.pause", "Pause") : t("cp.play", "Play back") }}
                </VBtn>
                <VBtn v-if="coreprotect.replay.cursor !== null" variant="text" :prepend-icon="mdiStop" @click="stopReplay()">{{ t("cp.stop", "Show every change") }}</VBtn>
                <VSelect v-model="coreprotect.replay.speed" :items="SPEEDS" :label="t('cp.speed', 'Speed')" density="compact" hide-details class="wl-cp__speed" />
                <span v-if="coreprotect.replay.cursor !== null" class="wl-cp__clock" aria-live="polite">{{ fmt(Math.floor(coreprotect.replay.cursor)) }}</span>
                <VSwitch
                    :model-value="coreprotect.watching"
                    :disabled="!canRereadSource()"
                    color="primary"
                    inset
                    density="compact"
                    hide-details
                    :label="t('cp.watch', 'Watch the file for new changes')"
                    @update:model-value="(v: boolean | null) => (v ? startWatching() : stopWatching())"
                />
                <p v-if="!canRereadSource()" class="wl-cp__hint">
                    {{ canWatch() ? t("cp.watchReopen", "Open the database with Open database (not by dropping it) to watch it.") : t("cp.watchUnsupported", "This window cannot keep a file open, so watching is not available here; open the file again to see new changes.") }}
                </p>
            </div>

            <section class="wl-cp__quick" :aria-label="t('cp.quick', 'Quick admin actions')">
                <h2>{{ t("cp.quick", "Quick admin actions") }}</h2>
                <p class="wl-cp__hint">{{ t("cp.quickHint", "CoreProtect commands for the players, world and time of these changes, ready to paste into the server console or chat. Times count back from now, so copy just before you use them. Rollback and restore change the live world, so they need both keys first.") }}</p>
                <div v-for="a in actions" :key="a.id" class="wl-cp__cmd">
                    <span class="wl-cp__cmd-title">{{ actionTitle(a.id) }}</span>
                    <code>{{ a.command }}</code>
                    <ConfigSuperConfirm
                        v-if="a.changesWorld"
                        :title="actionTitle(a.id)"
                        :action="t('cp.qa.confirm', { command: a.command }, 'Copies {command}. Run on the server, it changes every matching block in the live world.')"
                        :affected="[coreprotect.filter.world ?? t('cp.allWorlds', 'every world')]"
                        :confirm-label="t('cp.qa.copy', 'Copy')"
                        @confirm="copy(a)"
                    >
                        <template #activator="{ props: activator }">
                            <VBtn v-bind="activator" size="small" variant="tonal" color="error" :prepend-icon="mdiContentCopy">{{ copied === a.id ? t("cp.qa.copied", "Copied") : t("cp.qa.copy", "Copy") }}</VBtn>
                        </template>
                    </ConfigSuperConfirm>
                    <VBtn v-else size="small" variant="tonal" :prepend-icon="mdiContentCopy" @click="copy(a)">{{ copied === a.id ? t("cp.qa.copied", "Copied") : t("cp.qa.copy", "Copy") }}</VBtn>
                </div>
                <p v-if="coreprotect.focus" class="wl-cp__hint">{{ t("cp.focusWorld", { world: coreprotect.focus.world }, "Teleport runs in the world you stand in; the selected change is in {world}.") }}</p>
            </section>

            <div class="wl-cp__actions">
                <VBtn size="small" variant="text" :prepend-icon="mdiDownload" :disabled="summary.total === 0" @click="download(`${stem}-changes.csv`, toCsv(coreprotect.changes), 'text/csv')">{{ t("cp.exportCsv", "Export CSV") }}</VBtn>
                <VBtn size="small" variant="text" :prepend-icon="mdiDownload" :disabled="summary.total === 0" @click="download(`${stem}-changes.json`, JSON.stringify({ schema: 'worldlens.coreprotect.changes/1', filter: coreprotect.filter, changes: coreprotect.changes }, null, 2), 'application/json')">{{ t("cp.exportJson", "Export JSON") }}</VBtn>
            </div>

            <table class="wl-cp__table" :aria-label="t('cp.list', 'Changes, newest first')">
                <caption>{{ summary.total > LIST_LIMIT ? t("cp.listLimit", { shown: LIST_LIMIT, total: summary.total.toLocaleString() }, "Newest {shown} of {total}; the map and exports include them all.") : t("cp.list", "Changes, newest first") }}</caption>
                <thead>
                    <tr><th scope="col">{{ t("cp.col.time", "Time") }}</th><th scope="col">{{ t("cp.col.who", "Who") }}</th><th scope="col">{{ t("cp.col.what", "What") }}</th><th scope="col">{{ t("cp.col.where", "Where") }}</th><th scope="col"><span class="wl-sr-only">{{ t("cp.col.map", "Map") }}</span></th></tr>
                </thead>
                <tbody>
                    <tr v-for="(c, i) in listed" :key="i" :class="{ 'is-rolled': c.rolledBack, 'is-focus': coreprotect.focus === c }">
                        <td>{{ fmt(c.time) }}</td>
                        <td>{{ c.user }}</td>
                        <td><span :style="{ color: `rgb(${ACTION_STYLE[c.action].r}, ${ACTION_STYLE[c.action].g}, ${ACTION_STYLE[c.action].b})` }" aria-hidden="true">{{ ACTION_STYLE[c.action].glyph }}</span> {{ actionLabel(c.action) }} {{ c.material.replace(/^minecraft:/u, "") }}<span v-if="c.rolledBack"> · {{ t("cp.rolled", "rolled back") }}</span></td>
                        <td class="wl-cp__xyz">{{ c.x }} {{ c.y }} {{ c.z }}</td>
                        <td><VBtn icon size="x-small" variant="text" :aria-label="t('cp.focus', { x: c.x, y: c.y, z: c.z }, 'Show {x} {y} {z} on the map')" @click="showOnMap(c)"><VIcon :icon="mdiEye" /></VBtn></td>
                    </tr>
                </tbody>
            </table>
        </template>
    </section>
</template>

<style scoped>
.wl-cp { display: flex; flex-direction: column; gap: 14px; padding: 24px; max-width: 1200px; }
.wl-cp__head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
.wl-cp__head h1 { margin: 0; font-size: var(--md-sys-typescale-headline-small-size, 24px); }
.wl-cp__head p, .wl-cp__hint, .wl-cp__meta, .wl-cp__range { margin: 4px 0 0; color: rgb(var(--v-theme-on-surface-variant)); max-width: 75ch; }
.wl-cp__hint { font-size: 13px; }
.wl-cp__actions, .wl-cp__map, .wl-cp__replay, .wl-cp__stats { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.wl-cp__filters { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(220px, 2fr) minmax(160px, 1fr); gap: 12px; }
.wl-cp__empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 16px; border: 2px dashed rgba(var(--v-theme-on-surface), 0.2); border-radius: 24px; text-align: center; }
/* material-exempt: the glyph on an action legend swatch, whose background is the data colour of that action. */
.wl-cp__swatch { display: inline-flex; width: 18px; height: 18px; border-radius: 4px; margin-right: 6px; color: #fff; font-weight: 700; align-items: center; justify-content: center; font-size: 13px; }
.wl-cp__stats { font-size: 13px; }
.wl-cp__warn { color: rgb(var(--v-theme-warning)); }
.wl-cp__speed { max-width: 220px; }
.wl-cp__with-info { display: inline-flex; align-items: center; gap: 2px; min-width: 180px; }
.wl-cp__clock { font-variant-numeric: tabular-nums; font-weight: 500; }
.wl-cp__quick { padding: 16px; border-radius: 16px; background: rgba(var(--v-theme-on-surface), 0.04); border: 1px solid rgba(var(--v-theme-on-surface), 0.12); display: flex; flex-direction: column; gap: 8px; }
.wl-cp__quick h2 { margin: 0; font-size: 16px; }
.wl-cp__cmd { display: grid; grid-template-columns: minmax(150px, 220px) 1fr auto; gap: 10px; align-items: center; }
.wl-cp__cmd code { font-family: "Roboto Mono", ui-monospace, monospace; font-size: 12px; overflow-wrap: anywhere; padding: 4px 8px; border-radius: 6px; background: rgba(var(--v-theme-on-surface), 0.06); }
.wl-cp__cmd-title { font-size: 13px; font-weight: 500; }
.wl-cp__table { border-collapse: collapse; width: 100%; font-size: 13px; }
.wl-cp__table caption { text-align: left; padding: 4px 0; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-cp__table th, .wl-cp__table td { text-align: left; padding: 4px 8px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08); }
.wl-cp__table tr.is-rolled td { opacity: 0.6; }
.wl-cp__table tr.is-focus td { background: rgba(var(--v-theme-primary), 0.12); }
.wl-cp__xyz { font-family: "Roboto Mono", ui-monospace, monospace; white-space: nowrap; }
.wl-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 760px) {
    .wl-cp__filters { grid-template-columns: 1fr; }
    .wl-cp__cmd { grid-template-columns: 1fr; }
}
</style>
