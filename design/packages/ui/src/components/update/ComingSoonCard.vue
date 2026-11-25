<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { VBtn, VIcon, VProgressLinear } from "vuetify/components";
import {
    mdiAlertCircle,
    mdiCheckCircle,
    mdiCircleOutline,
    mdiProgressClock,
    mdiRefresh,
    mdiSkipNext,
} from "@mdi/js";
import { langAttr, type TranslationVars } from "../setup/setupI18n.js";
import { updatePair, updateText, type UpdateCopyKey } from "./updateCopy.js";
import { ESTIMATE_MIN_SAMPLES, comingSoonFor, formatDuration } from "./comingSoonModel.js";
import type { ComingSoonStageModel } from "./comingSoonModel.js";
import type { ComingSoonState, UpdateState } from "./updateBridge.js";

/**
 * "Update coming soon": the build that is being made but is not published yet.
 *
 * Shown in the Updates section above the always-there status row, and only while there is
 * something true to say. With no build in flight it renders nothing at all, and the moment
 * the ordinary updater offers the build it steps aside (see `comingSoonFor`).
 *
 * What it never does: install, download or restart anything, move a bar without a real stage
 * change behind it, or carry any control other than a re-check. The stage list is an ordered
 * list whose every row spells its state as a word, so colour and icon are never the only
 * carrier, and a polite live region announces a change of stage once rather than on every
 * clock tick.
 *
 * Reduced motion: the bar's own transition is switched off under `prefers-reduced-motion`,
 * and nothing here animates otherwise. The elapsed time is plain text refreshed every twenty
 * seconds, not a counter.
 */
const props = defineProps<{
    comingSoon: ComingSoonState | null;
    updateState: UpdateState;
    /** Test seam for the clock; defaults to the real one. */
    now?: () => number;
}>();

const emit = defineEmits<{ (event: "refresh"): void }>();

const clock = props.now ?? Date.now;
const nowMs = ref(clock());
let ticker: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
    ticker = setInterval(() => {
        nowMs.value = clock();
    }, 20_000);
});
onBeforeUnmount(() => {
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
});

const model = computed(() => comingSoonFor(props.comingSoon, props.updateState, nowMs.value));

function pair(key: UpdateCopyKey, vars: TranslationVars = {}) {
    return updatePair(key, vars);
}

const title = computed(() => updateText("update.comingSoon.title"));

const headline = computed(() => {
    const m = model.value;
    if (m === null) return null;
    if (m.kind === "building") {
        return pair(m.queued ? "update.comingSoon.queued" : "update.comingSoon.building", {
            version: m.version,
        });
    }
    if (m.kind === "failed") return pair("update.comingSoon.failed.title");
    return pair(
        m.reason === "offline"
            ? "update.comingSoon.unknown.offline"
            : m.reason === "rate-limited"
              ? m.retryClock === null
                  ? "update.comingSoon.unknown.rateLimitedNoTime"
                  : "update.comingSoon.unknown.rateLimited"
              : "update.comingSoon.unknown.unavailable",
        m.retryClock === null ? {} : { time: m.retryClock },
    );
});

const failedBody = computed(() => {
    const m = model.value;
    if (m === null || m.kind !== "failed") return null;
    return pair("update.comingSoon.failed.body", { version: m.version, conclusion: m.conclusion });
});
const failedStage = computed(() => {
    const m = model.value;
    if (m === null || m.kind !== "failed" || m.failedStage === null) return null;
    return pair("update.comingSoon.failed.stage", { stage: m.failedStage });
});

function stageLabel(stage: ComingSoonStageModel): string {
    return stage.labelKey === null ? (stage.label ?? "") : updateText(stage.labelKey);
}

function stageIcon(stage: ComingSoonStageModel): string {
    switch (stage.state) {
        case "done":
            return mdiCheckCircle;
        case "running":
            return mdiProgressClock;
        case "failed":
            return mdiAlertCircle;
        case "skipped":
            return mdiSkipNext;
        default:
            return mdiCircleOutline;
    }
}

const building = computed(() => {
    const m = model.value;
    return m !== null && m.kind === "building" ? m : null;
});

const progressText = computed(() =>
    building.value === null
        ? null
        : pair("update.comingSoon.progress", {
              done: building.value.stagesDone,
              total: building.value.stagesTotal,
          }),
);

const estimateText = computed(() => {
    const b = building.value;
    if (b === null) return null;
    const e = b.estimate;
    if (e.kind === "remaining") {
        return pair("update.comingSoon.estimate.remaining", {
            remaining: formatDuration(e.remainingMs),
            typical: formatDuration(e.typicalMs),
            count: e.sampleCount,
        });
    }
    if (e.kind === "overrun") {
        return pair("update.comingSoon.estimate.overrun", {
            typical: formatDuration(e.typicalMs),
            count: e.sampleCount,
        });
    }
    return pair("update.comingSoon.estimate.none", { needed: ESTIMATE_MIN_SAMPLES });
});

const replacedText = computed(() =>
    building.value === null || building.value.replacedRun === null
        ? null
        : pair("update.comingSoon.replaced", {
              previous: building.value.replacedRun,
              version: building.value.version,
          }),
);

const contentsNote = computed(() => {
    const b = building.value;
    if (b === null) return null;
    if (b.contents === null) {
        return pair(
            b.contentsUnavailable === "no-base"
                ? "update.comingSoon.contents.noBase"
                : "update.comingSoon.contents.failed",
        );
    }
    if (b.contents.commits.length === 0) return pair("update.comingSoon.contents.none");
    return null;
});

const moreChanges = computed(() => {
    const contents = building.value?.contents ?? null;
    if (contents === null || !contents.truncated) return null;
    return pair("update.comingSoon.contents.more", {
        count: contents.total - contents.commits.length,
    });
});

/**
 * The one sentence a screen reader hears when the build moves on. It depends only on the
 * count of finished stages and the current stage, never on the clock, so the elapsed time
 * ticking over does not re-announce it.
 */
const announcement = computed(() => {
    const b = building.value;
    if (b === null) return "";
    const vars = { version: b.version, done: b.stagesDone, total: b.stagesTotal };
    if (b.currentStage === null) return updateText("update.comingSoon.a11y.progressNone", vars);
    return updateText("update.comingSoon.a11y.progress", {
        ...vars,
        stage: stageLabel(b.currentStage),
    });
});

function stageAccessibleName(stage: ComingSoonStageModel): string {
    return updateText("update.comingSoon.a11y.stage", {
        stage: stageLabel(stage),
        state: updateText(stage.stateKey),
    });
}
</script>

<template>
    <section
        v-if="model !== null && headline !== null"
        class="mb-coming-soon"
        :class="`mb-coming-soon--${model.kind}`"
        :aria-label="title"
        data-testid="coming-soon"
    >
        <h3 class="mb-coming-soon__title">{{ title }}</h3>

        <div class="mb-coming-soon__headline" :role="model.kind === 'failed' ? 'alert' : undefined">
            <p class="mb-coming-soon__primary">{{ headline.primary }}</p>
            <p v-if="headline.secondary !== null" class="mb-coming-soon__secondary" :lang="langAttr('yue')">
                {{ headline.secondary }}
            </p>
        </div>

        <!-- A build in flight -->
        <template v-if="building !== null">
            <p v-if="replacedText !== null" class="mb-coming-soon__note" data-testid="coming-soon-replaced">
                {{ replacedText.primary }}
                <span v-if="replacedText.secondary !== null" :lang="langAttr('yue')">
                    {{ replacedText.secondary }}
                </span>
            </p>
            <p v-if="building.stalled" class="mb-coming-soon__note mb-coming-soon__note--warn" role="note" data-testid="coming-soon-stalled">
                {{ updateText("update.comingSoon.stalled") }}
            </p>

            <!-- A real count of finished stages, never a timer. -->
            <div class="mb-coming-soon__progress">
                <v-progress-linear
                    :model-value="building.percent"
                    height="8"
                    rounded
                    color="primary"
                    :aria-label="progressText?.primary ?? title"
                    :aria-valuetext="progressText?.primary ?? ''"
                />
                <p v-if="progressText !== null" class="mb-coming-soon__count">{{ progressText.primary }}</p>
            </div>

            <dl class="mb-coming-soon__facts">
                <div v-if="building.startedClock !== null" class="mb-coming-soon__fact">
                    <dt>{{ updateText("update.comingSoon.label.started") }}</dt>
                    <dd data-testid="coming-soon-started">{{ building.startedClock }}</dd>
                </div>
                <div v-if="building.elapsedMs !== null" class="mb-coming-soon__fact">
                    <dt>{{ updateText("update.comingSoon.label.elapsed") }}</dt>
                    <dd data-testid="coming-soon-elapsed">{{ formatDuration(building.elapsedMs) }}</dd>
                </div>
                <div v-if="estimateText !== null" class="mb-coming-soon__fact mb-coming-soon__fact--wide">
                    <dt>{{ updateText("update.comingSoon.label.estimate") }}</dt>
                    <dd data-testid="coming-soon-estimate">
                        {{ estimateText.primary }}
                        <span v-if="estimateText.secondary !== null" class="mb-coming-soon__secondary" :lang="langAttr('yue')">
                            {{ estimateText.secondary }}
                        </span>
                    </dd>
                </div>
            </dl>

            <h4 class="mb-coming-soon__heading">{{ updateText("update.comingSoon.label.stages") }}</h4>
            <ol class="mb-coming-soon__stages" data-testid="coming-soon-stages">
                <li
                    v-for="stage in building.stages"
                    :key="stage.id"
                    class="mb-coming-soon__stage"
                    :class="`mb-coming-soon__stage--${stage.state}`"
                    :aria-label="stageAccessibleName(stage)"
                >
                    <v-icon :icon="stageIcon(stage)" size="18" aria-hidden="true" />
                    <span class="mb-coming-soon__stage-name">{{ stageLabel(stage) }}</span>
                    <span class="mb-coming-soon__stage-state" :data-state="stage.state">
                        {{ updateText(stage.stateKey) }}
                    </span>
                </li>
            </ol>

            <h4 class="mb-coming-soon__heading">{{ updateText("update.comingSoon.label.contents") }}</h4>
            <ul
                v-if="building.contents !== null && building.contents.commits.length > 0"
                class="mb-coming-soon__contents"
                data-testid="coming-soon-contents"
            >
                <li v-for="commit in building.contents.commits" :key="commit.sha">{{ commit.subject }}</li>
            </ul>
            <p v-if="moreChanges !== null" class="mb-coming-soon__note">{{ moreChanges.primary }}</p>
            <p v-if="contentsNote !== null" class="mb-coming-soon__note" data-testid="coming-soon-contents-note">
                {{ contentsNote.primary }}
                <span v-if="contentsNote.secondary !== null" :lang="langAttr('yue')">{{ contentsNote.secondary }}</span>
            </p>

            <!-- Announces a change of stage once, not on every clock tick. -->
            <div class="mb-coming-soon__sr" role="status" aria-live="polite" data-testid="coming-soon-live">
                {{ announcement }}
            </div>
        </template>

        <!-- A build that ended without publishing -->
        <template v-else-if="model.kind === 'failed'">
            <p v-if="failedBody !== null" class="mb-coming-soon__note">
                {{ failedBody.primary }}
                <span v-if="failedBody.secondary !== null" :lang="langAttr('yue')">{{ failedBody.secondary }}</span>
            </p>
            <p v-if="failedStage !== null" class="mb-coming-soon__note" data-testid="coming-soon-failed-stage">
                {{ failedStage.primary }}
            </p>
        </template>

        <p class="mb-coming-soon__promise">{{ updateText("update.comingSoon.nothingInstalls") }}</p>

        <div class="mb-coming-soon__actions">
            <v-btn
                :prepend-icon="mdiRefresh"
                variant="tonal"
                class="mb-coming-soon__refresh"
                @click="emit('refresh')"
            >
                {{ updateText("update.comingSoon.action.refresh") }}
            </v-btn>
        </div>
    </section>
</template>

<style>
.mb-coming-soon {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-block-end: 16px;
    padding: 12px 14px;
    border-radius: var(--md-sys-shape-corner-medium, 12px);
    background: rgba(var(--v-theme-primary), 0.08);
    border: 1px solid rgba(var(--v-theme-primary), 0.3);
}

.mb-coming-soon--failed {
    background: rgba(var(--v-theme-error), 0.08);
    border-color: rgba(var(--v-theme-error), 0.4);
}

.mb-coming-soon--unknown {
    background: rgba(var(--v-theme-on-surface), 0.04);
    border-color: rgba(var(--v-theme-on-surface), 0.2);
}

.mb-coming-soon__title {
    margin: 0;
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 600;
}

.mb-coming-soon__heading {
    margin: 4px 0 0;
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: 600;
}

.mb-coming-soon__primary,
.mb-coming-soon__note,
.mb-coming-soon__promise {
    margin: 0;
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-coming-soon__secondary {
    display: block;
    margin: 2px 0 0;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-coming-soon__note--warn {
    font-weight: 600;
}

.mb-coming-soon__promise {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-coming-soon__count {
    margin: 4px 0 0;
    font-size: var(--md-sys-typescale-body-small-size);
}

.mb-coming-soon__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 8px 24px;
    margin: 0;
}

.mb-coming-soon__fact--wide {
    grid-column: 1 / -1;
}

.mb-coming-soon__fact > dt {
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-coming-soon__fact > dd {
    margin: 0;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
}

.mb-coming-soon__stages {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.mb-coming-soon__stage {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 32px;
}

.mb-coming-soon__stage-name {
    overflow-wrap: anywhere;
}

.mb-coming-soon__stage-state {
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: 600;
}

.mb-coming-soon__stage--done .v-icon {
    color: rgb(var(--v-theme-success, var(--v-theme-primary)));
}

.mb-coming-soon__stage--failed .v-icon,
.mb-coming-soon__stage--failed .mb-coming-soon__stage-state {
    color: rgb(var(--v-theme-error));
}

.mb-coming-soon__contents {
    margin: 0;
    padding-inline-start: 20px;
    max-height: 14rem;
    overflow: auto;
    overflow-wrap: anywhere;
}

.mb-coming-soon__actions .v-btn {
    min-height: 48px;
}

.mb-coming-soon__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

@media (prefers-reduced-motion: reduce) {
    .mb-coming-soon .v-progress-linear__determinate {
        transition: none !important;
    }
}
</style>
