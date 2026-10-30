<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertCircleOutline,
    mdiCancel,
    mdiCheckboxMultipleMarkedOutline,
    mdiCheckCircleOutline,
    mdiChevronDown,
    mdiChevronUp,
    mdiCloudSyncOutline,
    mdiConsoleLine,
    mdiDocker,
    mdiDotsHorizontalCircleOutline,
    mdiLaptop,
    mdiLoading,
    mdiSelectOff,
    mdiSync,
    mdiTrashCanOutline,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VChip,
    VCheckbox,
    VExpandTransition,
    VIcon,
    VProgressCircular,
    VProgressLinear,
} from "vuetify/components";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { GATE_COMPLETION_HOLD_MS } from "../confirm/superConfirmGate.js";
import { createSettingMatcher } from "../config/regexEngine.js";
import { createCiRenders } from "../cirender/ciRenders.js";
import type { CiRenderBridge } from "../cirender/ciRenderBridge.js";
import { resolveCiRenderBridge } from "../cirender/ciRenderBridge.js";
import RenderProgressDetail from "../progress/RenderProgressDetail.vue";
import RepairOffer from "../repair/RepairOffer.vue";
import type { RepairBridge } from "../repair/repairBridge.js";
import { formatPercent } from "../progress/format.js";
import type { ContainerOffersBridge } from "../world/containerOffers.js";
import type { WorldBridge } from "../world/worldBridge.js";
import {
    createActiveRenders,
    searchTextOf,
    type ActiveRenderRow,
    type ConsoleTarget,
    type RenderRouteBucket,
} from "./activeRenders.js";

/**
 * Every render in progress, on every route, in one place - so navigating away from whatever
 * screen started a render never again means losing sight of it.
 *
 * `activeRenders.ts` does all of the actual work: finding what is running, watching it with
 * the exact same {@link RenderProgressDetail}-shaped facts the render console itself draws,
 * and reattaching a container this app found but has not picked back up yet. This component
 * is the list, the search, the bulk selection and the super-confirmation gate around it.
 */

/**
 * `undefined` (the default, when a caller does not pass the prop at all) means "probe the
 * Electron preload"; `null` means "there is deliberately none". The same two-value contract
 * `WorldScreen.vue`'s own `bridge`/`optionalBridge`/`remoteBridge` props use, and for the
 * same reason it goes undefaulted here: giving these a default of `undefined` is what
 * `exactOptionalPropertyTypes` refuses, because it can no longer tell "the caller omitted
 * this prop" from "the caller passed `undefined` on purpose".
 */
const props = defineProps<{
    worldBridge?: WorldBridge | null;
    containerOffersBridge?: ContainerOffersBridge | null;
    ciRenderBridge?: CiRenderBridge | null;
    /** The repair offer's bridge; left out it is probed, `null` means there is none. */
    repairBridge?: RepairBridge | null;
}>();

const emit = defineEmits<{
    /** Take the person to the render's full console and controls, at whichever page owns it. */
    openConsole: [target: ConsoleTarget];
}>();

const { t } = useI18n();

const ciBridge =
    props.ciRenderBridge === undefined ? resolveCiRenderBridge() : props.ciRenderBridge;
const ciRenders = createCiRenders(ciBridge);
const aggregator = createActiveRenders({
    // `props.worldBridge === undefined` means "probe the preload"; `createActiveRenders`
    // itself does that probing when its own option is left out entirely rather than passed
    // as `undefined`, so an explicit `undefined` here would short-circuit the probe. See the
    // props' own doc comment for the same two-value contract on the way in.
    ...(props.worldBridge === undefined ? {} : { worldBridge: props.worldBridge }),
    ...(props.containerOffersBridge === undefined
        ? {}
        : { containerOffersBridge: props.containerOffersBridge }),
    ciRenders,
});

onMounted(() => {
    void aggregator.reconcile();
});

onBeforeUnmount(() => {
    aggregator.dispose();
    ciRenders.dispose();
});

/* -------------------------------------------------------------------------- */
/* Search, with the full regex builder anchored beside the field              */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const filteredRows = computed<readonly ActiveRenderRow[]>(() => {
    const test = matcher.value.test;
    return aggregator.rows.value.filter((row) => test(searchTextOf(row)));
});

const searchSample = computed(() =>
    aggregator.rows.value.map((row) => searchTextOf(row)).join("\n"),
);

/* -------------------------------------------------------------------------- */
/* Selection and bulk cancel, gated behind super confirmation                 */
/* -------------------------------------------------------------------------- */

const selected = ref<Set<string>>(new Set());
const expanded = ref<Set<string>>(new Set());
const renderDetailIdPrefix = useId();

function toggleSelected(key: string): void {
    const next = new Set(selected.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selected.value = next;
}

function toggleExpanded(key: string): void {
    const next = new Set(expanded.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded.value = next;
}

const visibleKeys = computed(() => filteredRows.value.map((row) => row.key));

/** A render that is still going, or found and waiting to be picked back up. */
function isLive(row: ActiveRenderRow): boolean {
    return row.state === "starting" || row.state === "running" || row.state === "offer";
}

/** The prototype's two bands: the live cards first, the settled rows under their own rule. */
const activeRows = computed(() => filteredRows.value.filter(isLive));
const settledRows = computed(() => filteredRows.value.filter((row) => !isLive(row)));

/** `undefined` keeps the offer's own probe; anything else is passed through as given. */
const repairBridgeValue = computed(() => props.repairBridge);

/**
 * The header's one-line count, from the rows the aggregator really holds. Only the states
 * actually present are named, so an idle page says "nothing running" rather than a row of zeros.
 */
const countLine = computed(() => {
    const rows = aggregator.rows.value;
    const count = (states: readonly string[]) =>
        rows.filter((row) => states.includes(row.state)).length;
    const parts: string[] = [];
    const running = count(["starting", "running"]);
    const offers = count(["offer"]);
    const failed = count(["failed"]);
    const stopped = count(["cancelled"]);
    const finished = count(["finished"]);
    if (running > 0)
        parts.push(t("rendersInProgress.count.running", { n: String(running) }, "{n} running"));
    if (offers > 0)
        parts.push(t("rendersInProgress.count.offer", { n: String(offers) }, "{n} to reattach"));
    if (failed > 0)
        parts.push(t("rendersInProgress.count.failed", { n: String(failed) }, "{n} failed"));
    if (stopped > 0)
        parts.push(t("rendersInProgress.count.stopped", { n: String(stopped) }, "{n} stopped"));
    if (finished > 0)
        parts.push(t("rendersInProgress.count.finished", { n: String(finished) }, "{n} finished"));
    if (parts.length === 0) return t("rendersInProgress.count.none", "nothing running right now");
    return parts.join(" · ");
});

/** The render the header's "Open the render console" goes to: the first one that has one. */
const firstConsoleKey = computed(
    () => aggregator.rows.value.find((row) => row.canOpenConsole)?.key ?? null,
);

function settledIcon(row: ActiveRenderRow): string {
    switch (row.state) {
        case "finished":
            return mdiCheckCircleOutline;
        case "failed":
            return mdiAlertCircleOutline;
        default:
            return mdiCancel;
    }
}
const hasSelection = computed(() => selected.value.size > 0);

function selectAllVisible(): void {
    selected.value = new Set(visibleKeys.value);
}

function clearSelection(): void {
    selected.value = new Set();
}

/** Selected rows that are actually still cancellable, right now - the honest bulk count. */
const cancellableSelected = computed(() =>
    filteredRows.value.filter((row) => selected.value.has(row.key) && row.canCancel),
);

const cancelAffected = computed<string[]>(() =>
    cancellableSelected.value.slice(0, 10).map((row) => `${row.worldLabel} — ${row.projectLabel}`),
);

const cancelAction = computed(() =>
    t(
        "rendersInProgress.bulk.cancelExplain",
        { count: String(cancellableSelected.value.length) },
        "This stops {count} renders. Every tile each one already finished stays on disk; nothing is deleted, and a stopped render can be carried on later.",
    ),
);

let cancelTimer: ReturnType<typeof setTimeout> | null = null;
const bulkStatus = ref("");

onBeforeUnmount(() => {
    if (cancelTimer !== null) clearTimeout(cancelTimer);
});

function runBulkCancel(): void {
    if (cancelTimer !== null) clearTimeout(cancelTimer);
    const keys = cancellableSelected.value.map((row) => row.key);
    cancelTimer = setTimeout(() => {
        cancelTimer = null;
        void (async () => {
            let ok = 0;
            for (const key of keys) {
                if (await aggregator.cancel(key)) ok++;
            }
            bulkStatus.value = t(
                "rendersInProgress.bulk.cancelDone",
                { count: String(ok), of: String(keys.length) },
                "Stopped {count} of {of}.",
            );
            clearSelection();
        })();
    }, GATE_COMPLETION_HOLD_MS);
}

/* -------------------------------------------------------------------------- */
/* Per-row actions                                                            */
/* -------------------------------------------------------------------------- */

const rowBusy = ref<Set<string>>(new Set());

function withBusy(key: string, work: () => Promise<void>): void {
    const next = new Set(rowBusy.value);
    next.add(key);
    rowBusy.value = next;
    void work().finally(() => {
        const after = new Set(rowBusy.value);
        after.delete(key);
        rowBusy.value = after;
    });
}

function cancelOne(key: string): void {
    withBusy(key, async () => {
        await aggregator.cancel(key);
    });
}

function reattachOne(key: string): void {
    withBusy(key, async () => {
        await aggregator.reattach(key);
    });
}

function openConsole(key: string): void {
    const target = aggregator.consoleTargetFor(key);
    if (target !== null) emit("openConsole", target);
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

function routeIcon(route: RenderRouteBucket): string {
    switch (route) {
        case "local":
            return mdiLaptop;
        case "docker":
            return mdiDocker;
        case "ci":
            return mdiCloudSyncOutline;
    }
}

function routeLabel(route: RenderRouteBucket): string {
    switch (route) {
        case "local":
            return t("rendersInProgress.route.local", "Local process");
        case "docker":
            return t("rendersInProgress.route.docker", "Container (Docker)");
        case "ci":
            return t("rendersInProgress.route.ci", "GitHub's runners");
    }
}

function stateLabel(row: ActiveRenderRow): string {
    switch (row.state) {
        case "starting":
            return t("rendersInProgress.state.starting", "Starting");
        case "running":
            return t("rendersInProgress.state.running", "Running");
        case "finished":
            return t("rendersInProgress.state.finished", "Finished");
        case "failed":
            return t("rendersInProgress.state.failed", "Failed");
        case "cancelled":
            return t("rendersInProgress.state.cancelled", "Stopped");
        case "offer":
            return t("rendersInProgress.state.offer", "Found, not attached");
    }
}

function stateTone(row: ActiveRenderRow): string {
    switch (row.state) {
        case "failed":
            return "error";
        case "cancelled":
            return "warning";
        case "offer":
            return "warning";
        case "finished":
            return "success";
        default:
            return "info";
    }
}

function percentLabel(row: ActiveRenderRow): string {
    return row.percent === null ? "" : formatPercent(row.percent);
}
</script>

<template>
    <div class="mb-renders">
        <!--
            The page header the prototype opens every job on: a 44px icon tile, the title with a
            one-line count under it, and the page's own action at the far end. The counts are
            read from the rows the aggregator really holds, never written down.
        -->
        <header class="mb-renders__head">
            <div class="mb-icon-tile mb-renders__tile" aria-hidden="true">
                <v-icon :icon="mdiDotsHorizontalCircleOutline" size="24" />
            </div>
            <div class="mb-renders__titles">
                <h1 class="mb-renders__title">
                    {{ t("rendersInProgress.title", "Renders in progress") }}
                </h1>
                <p class="mb-renders__count">{{ countLine }}</p>
            </div>
            <v-btn
                v-if="firstConsoleKey !== null"
                variant="outlined"
                color="primary"
                class="mb-renders__console"
                @click="openConsole(firstConsoleKey)"
            >
                {{ t("rendersInProgress.openRenderConsole", "Open the render console") }}
            </v-btn>
        </header>
        <p class="mb-lede mb-renders__blurb">
            {{
                t(
                    "rendersInProgress.blurb",
                    "Every render this application knows about right now: on this computer, in a container, or on GitHub's runners - including one this app did not start this session.",
                )
            }}
        </p>

        <div class="mb-renders__tools">
            <div class="mb-renders__search">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('rendersInProgress.search.label', 'Search renders')"
                    :placeholder="
                        t('rendersInProgress.search.placeholder', 'World, project, route, or state')
                    "
                    :sample="searchSample"
                    :summary="
                        t(
                            'rendersInProgress.search.summary',
                            {
                                shown: String(filteredRows.length),
                                total: String(aggregator.rows.value.length),
                            },
                            'Showing {shown} of {total}',
                        )
                    "
                />
            </div>

            <div v-if="visibleKeys.length > 0" class="mb-renders__bulkbar">
                <v-btn
                    :prepend-icon="mdiCheckboxMultipleMarkedOutline"
                    variant="text"
                    size="small"
                    @click="selectAllVisible"
                >
                    {{
                        t(
                            "rendersInProgress.bulk.selectAll",
                            { count: String(visibleKeys.length) },
                            "Select all {count} shown",
                        )
                    }}
                </v-btn>
                <v-btn
                    v-if="hasSelection"
                    :prepend-icon="mdiSelectOff"
                    variant="text"
                    size="small"
                    @click="clearSelection"
                >
                    {{ t("rendersInProgress.bulk.clear", "Clear selection") }}
                </v-btn>

                <p class="mb-renders__bulkstatus" role="status" aria-live="polite">
                    {{
                        t(
                            "rendersInProgress.bulk.selected",
                            { count: String(selected.size) },
                            "{count} selected",
                        )
                    }}
                    <template v-if="bulkStatus">{{ bulkStatus }}</template>
                </p>

                <template v-if="hasSelection && cancellableSelected.length > 0">
                    <ConfigSuperConfirm
                        :title="t('rendersInProgress.bulk.cancelTitle', 'Stop selected renders')"
                        :action="cancelAction"
                        :affected="cancelAffected"
                        :confirm-label="
                            t(
                                'rendersInProgress.bulk.cancelConfirmLabel',
                                'Slide to stop the selected renders',
                            )
                        "
                        @confirm="runBulkCancel"
                    >
                        <template #activator="{ props: activator }">
                            <v-btn
                                v-bind="activator"
                                :prepend-icon="mdiTrashCanOutline"
                                color="error"
                                variant="tonal"
                                size="small"
                            >
                                {{
                                    t(
                                        "rendersInProgress.bulk.cancelButton",
                                        { count: String(cancellableSelected.length) },
                                        "Stop {count} selected",
                                    )
                                }}
                            </v-btn>
                        </template>
                    </ConfigSuperConfirm>
                </template>
            </div>
        </div>

        <!--
            Two honestly different empty states. "Still checking" is shown only until the
            first pass over all three routes has actually returned - never confused with the
            state that comes after, which means the check ran and genuinely found nothing.
        -->
        <v-card
            v-if="aggregator.emptyState.value === 'checking'"
            class="mb-renders__empty"
            data-test="empty-checking"
        >
            <v-progress-circular
                indeterminate
                size="20"
                width="2"
                color="primary"
                aria-hidden="true"
            />
            <p>
                {{
                    t(
                        "rendersInProgress.empty.checking",
                        "Checking every route for a render in progress...",
                    )
                }}
            </p>
        </v-card>
        <v-card
            v-else-if="aggregator.emptyState.value === 'empty'"
            class="mb-renders__empty"
            data-test="empty-none"
        >
            <v-icon :icon="mdiCheckCircleOutline" size="20" aria-hidden="true" />
            <p>
                {{
                    t(
                        "rendersInProgress.empty.none",
                        "Nothing is rendering right now, on this computer, in a container, or on GitHub's runners.",
                    )
                }}
            </p>
        </v-card>
        <v-card
            v-else-if="filteredRows.length === 0"
            class="mb-renders__empty"
            data-test="empty-no-match"
        >
            <p>
                {{ t("rendersInProgress.empty.noMatch", "Nothing running matches this search.") }}
            </p>
        </v-card>

        <!--
            `mb-motion-stagger` (styles/motion.scss) gives each row the M3 entry - a short
            fade and rise, cascaded by one `short1` per row and capped at four steps. It is a
            CSS animation, so it runs when a row's element is created and never again: a
            render whose percentage ticks every second keeps the same keyed `<li>` and stays
            perfectly still, which is the whole difference between animating an arrival and
            animating an update.
        -->
        <ul v-if="activeRows.length > 0" class="mb-renders__list mb-motion-stagger">
            <li v-for="(row, rowIndex) in activeRows" :key="row.key" class="mb-renders__item">
                <AppearanceTarget
                    :id="`renders.row.${row.key}`"
                    :label="`${row.worldLabel} — ${row.projectLabel}`"
                    as="div"
                >
                    <v-card class="mb-renders__card" :class="`mb-renders__card--${row.state}`">
                        <div class="mb-renders__row">
                            <v-checkbox
                                :model-value="selected.has(row.key)"
                                density="compact"
                                hide-details
                                class="mb-renders__check"
                                :aria-label="
                                    t(
                                        'rendersInProgress.row.select',
                                        { world: row.worldLabel },
                                        'Select the render of {world}',
                                    )
                                "
                                @update:model-value="toggleSelected(row.key)"
                            />
                            <div class="mb-icon-tile mb-renders__rowtile" aria-hidden="true">
                                <v-icon :icon="routeIcon(row.route)" size="20" />
                            </div>

                            <div class="mb-renders__identity">
                                <h2 class="mb-renders__name">
                                    {{ row.worldLabel }}
                                    <span class="mb-renders__project">
                                        · {{ row.projectLabel }}</span
                                    >
                                </h2>
                                <span class="mb-renders__meta">
                                    {{ routeLabel(row.route) }}
                                    <template v-if="row.routeDetail"
                                        >· {{ row.routeDetail }}</template
                                    >
                                </span>
                            </div>

                            <v-chip size="small" :color="stateTone(row)" variant="tonal">
                                {{ stateLabel(row) }}
                            </v-chip>

                            <v-icon
                                v-if="rowBusy.has(row.key)"
                                :icon="mdiLoading"
                                class="mb-renders__spin"
                                size="18"
                                aria-hidden="true"
                            />

                            <div class="mb-renders__actions">
                                <v-btn
                                    v-if="row.needsReattach"
                                    :prepend-icon="mdiSync"
                                    variant="tonal"
                                    color="primary"
                                    :disabled="row.busy || rowBusy.has(row.key)"
                                    @click="reattachOne(row.key)"
                                >
                                    {{ t("rendersInProgress.row.reattach", "Reattach") }}
                                </v-btn>
                                <v-btn
                                    v-if="row.canOpenConsole"
                                    :prepend-icon="mdiConsoleLine"
                                    variant="outlined"
                                    @click="openConsole(row.key)"
                                >
                                    {{ t("rendersInProgress.row.openConsole", "Open console") }}
                                </v-btn>
                                <v-btn
                                    v-if="row.canCancel"
                                    variant="outlined"
                                    color="error"
                                    :disabled="row.busy || rowBusy.has(row.key)"
                                    @click="cancelOne(row.key)"
                                >
                                    {{ t("rendersInProgress.row.cancel", "Stop") }}
                                </v-btn>
                            </div>
                        </div>

                        <div class="mb-renders__progress">
                            <v-progress-linear
                                :model-value="row.percent ?? 0"
                                :indeterminate="row.percent === null"
                                :aria-label="`${row.worldLabel} — ${row.projectLabel}`"
                                color="primary"
                                bg-color="surface-container-highest"
                                bg-opacity="1"
                                height="8"
                                rounded
                            />
                            <span v-if="percentLabel(row) !== ''" class="mb-renders__percent">
                                {{ percentLabel(row) }}
                            </span>
                        </div>

                        <v-alert
                            v-if="row.errorText !== null"
                            type="error"
                            variant="tonal"
                            density="compact"
                            class="mb-renders__error"
                            :icon="mdiAlertCircleOutline"
                        >
                            {{ row.errorText }}
                        </v-alert>
                        <v-alert
                            v-else-if="row.needsReattach && row.reattachMessage !== null"
                            type="warning"
                            variant="tonal"
                            density="compact"
                            class="mb-renders__error"
                        >
                            {{ row.reattachMessage }}
                        </v-alert>

                        <div class="mb-renders__disclosure">
                            <v-btn
                                :append-icon="expanded.has(row.key) ? mdiChevronUp : mdiChevronDown"
                                variant="text"
                                size="small"
                                :aria-expanded="expanded.has(row.key) ? 'true' : 'false'"
                                :aria-controls="`${renderDetailIdPrefix}-${rowIndex}`"
                                @click="toggleExpanded(row.key)"
                            >
                                {{
                                    expanded.has(row.key)
                                        ? t("rendersInProgress.row.hideDetail", "Hide the stages")
                                        : t("rendersInProgress.row.showDetail", "Show the stages")
                                }}
                            </v-btn>
                        </div>

                        <v-expand-transition>
                            <div
                                v-if="expanded.has(row.key)"
                                :id="`${renderDetailIdPrefix}-${rowIndex}`"
                                class="mb-renders__detail"
                            >
                                <RenderProgressDetail :facts="row.facts" />
                            </div>
                        </v-expand-transition>
                    </v-card>
                </AppearanceTarget>
            </li>
        </ul>

        <RepairOffer :bridge="repairBridgeValue" />

        <!--
            Renders that are over - finished, stopped or failed - in the prototype's quieter
            outlined rows under their own rule, so a page with one live render and three
            settled ones still leads with the one that is moving.
        -->
        <section v-if="settledRows.length > 0" class="mb-renders__settled">
            <div class="mb-section-rule">
                <h2 class="mb-section-label">
                    {{ t("rendersInProgress.settled", "Finished, stopped or failed") }}
                </h2>
            </div>
            <ul class="mb-renders__list mb-renders__list--settled mb-motion-stagger">
                <li v-for="row in settledRows" :key="row.key" class="mb-renders__item">
                    <AppearanceTarget
                        :id="`renders.row.${row.key}`"
                        :label="`${row.worldLabel} — ${row.projectLabel}`"
                        as="div"
                    >
                        <v-card
                            variant="outlined"
                            class="mb-renders__settledcard"
                            :class="`mb-renders__card--${row.state}`"
                        >
                            <div class="mb-renders__row">
                                <v-checkbox
                                    :model-value="selected.has(row.key)"
                                    density="compact"
                                    hide-details
                                    class="mb-renders__check"
                                    :aria-label="
                                        t(
                                            'rendersInProgress.row.select',
                                            { world: row.worldLabel },
                                            'Select the render of {world}',
                                        )
                                    "
                                    @update:model-value="toggleSelected(row.key)"
                                />
                                <v-icon
                                    :icon="settledIcon(row)"
                                    :color="stateTone(row)"
                                    size="20"
                                    aria-hidden="true"
                                />
                                <div class="mb-renders__identity">
                                    <span class="mb-renders__settledname">
                                        {{ row.worldLabel }} · {{ row.projectLabel }}
                                    </span>
                                    <span v-if="row.errorText !== null" class="mb-renders__meta">
                                        {{ row.errorText }}
                                    </span>
                                </div>
                                <span class="mb-renders__mono">
                                    {{ routeLabel(row.route) }} · {{ stateLabel(row) }}
                                </span>
                                <div class="mb-renders__actions">
                                    <v-btn
                                        v-if="row.canOpenConsole"
                                        variant="outlined"
                                        color="primary"
                                        size="small"
                                        @click="openConsole(row.key)"
                                    >
                                        {{ t("rendersInProgress.row.openConsole", "Open console") }}
                                    </v-btn>
                                </div>
                            </div>
                        </v-card>
                    </AppearanceTarget>
                </li>
            </ul>
        </section>
    </div>
</template>

<style>
/*
 * The prototype's Renders page: a 30/48/48 gutter and a 1120px measure, a header row with the
 * icon tile and the page action, then the live render cards, the repair offer and the settled
 * rows, each 20px apart.
 */
.mb-renders {
    display: flex;
    flex-direction: column;
    gap: 20px;
    inline-size: 100%;
    max-inline-size: 1120px;
    padding: 30px 48px 48px;
    box-sizing: border-box;
}

@media (max-width: 900px) {
    .mb-renders {
        padding: 20px 16px 32px;
    }
}

.mb-renders__head {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}

.mb-renders .mb-icon-tile.mb-renders__tile {
    inline-size: 44px;
    block-size: 44px;
    flex-basis: 44px;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-surface-container));
    border: 1px solid rgb(var(--v-theme-outline-variant));
}

.mb-renders__titles {
    flex: 1 1 auto;
    min-inline-size: 0;
}

.mb-renders .mb-renders__title {
    margin: 0;
    font-size: var(--md-sys-typescale-headline-small-size);
    font-weight: 400;
    line-height: 32px;
}

.mb-renders__count {
    margin: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 16px;
    color: rgb(var(--v-theme-outline));
}

.mb-renders .mb-lede.mb-renders__blurb {
    margin: -8px 0 0;
}

.mb-renders__tools {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-renders__search {
    max-inline-size: 480px;
}

.mb-renders__bulkbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.mb-renders__bulkstatus {
    margin: 0 0 0 4px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-on-surface-variant));
}

.v-application .v-card.mb-renders__empty {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 22px;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-renders__empty p {
    margin: 0;
}

.mb-renders__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.mb-renders__list--settled {
    gap: 8px;
}

/* The live card: a 16px corner, the prototype's container tint and a hairline outline. */
.v-application .v-card.mb-renders__card {
    overflow: hidden;
    border-radius: var(--md-sys-shape-corner-large);
}

.mb-renders__row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 18px 22px 14px;
    min-inline-size: 0;
}

.mb-renders__check {
    flex: 0 0 auto;
}

.mb-renders .mb-icon-tile.mb-renders__rowtile {
    inline-size: 38px;
    block-size: 38px;
    flex-basis: 38px;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

.mb-renders__identity {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    flex: 1 1 12rem;
}

.mb-renders .mb-renders__name {
    margin: 0;
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 500;
    line-height: 24px;
    overflow-wrap: anywhere;
}

.mb-renders__project {
    font-weight: 500;
}

.mb-renders__meta,
.mb-renders__mono {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 18px;
    color: rgb(var(--v-theme-outline));
    overflow-wrap: anywhere;
}

.mb-renders__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-inline-start: auto;
}

.mb-renders__progress {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 22px 16px;
}

.mb-renders__progress .v-progress-linear {
    flex: 1 1 auto;
}

.mb-renders__percent {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-on-surface-variant));
    white-space: nowrap;
}

.mb-renders__spin {
    animation: mb-renders-spin var(--md-sys-motion-duration-extra-long3) linear infinite;
}

@keyframes mb-renders-spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-renders__spin {
        animation: none;
    }
}

.mb-renders__error {
    margin: 0 22px 14px;
}

.mb-renders__disclosure {
    display: flex;
    padding: 6px 14px;
    border-block-start: 1px solid rgb(var(--v-theme-outline-variant));
}

.mb-renders__detail {
    padding: 18px 22px;
    border-block-start: 1px solid rgb(var(--v-theme-outline-variant));
}

.mb-renders__settled .mb-section-label {
    margin: 0;
}

/* A settled row is outlined only: the prototype keeps the tint for what is still moving. */
.v-application .v-card.mb-renders__settledcard {
    background: transparent;
    border-radius: var(--md-sys-shape-corner-medium);
}

.mb-renders__settledcard .mb-renders__row {
    padding: 10px 18px 10px 10px;
}

.mb-renders__settledname {
    font-size: var(--md-sys-typescale-body-large-size);
    line-height: 22px;
    overflow-wrap: anywhere;
}
</style>
