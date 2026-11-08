<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { createThroughputTracker } from "./throughputModel.js";
import LiveChart from "../charts/LiveChart.vue";
import { pushSample, stateOf, type LiveSample } from "../charts/liveChartModel.js";
import type { ProgressFacts } from "./progressModel.js";

/**
 * How fast a render is actually moving, right now, said in one line.
 *
 * This exists so a live speed change is not a leap of faith: `LiveSpeedControl.vue` mounts
 * it beside its dial precisely so dragging a level and then watching this number respond is
 * possible. `throughputModel.ts` has the whole honesty argument for why the reading is
 * percent-per-minute rather than an invented tile or chunk count -- upstream's own progress
 * line never carries one, and this file will not pretend it does.
 *
 * A fresh tracker per mount, watching `facts.levels`' own overall percentage - the same
 * number `RenderProgressDetail.vue` already draws as a bar, read here again for a rate
 * instead of a position.
 */
const props = defineProps<{ facts: ProgressFacts }>();

const { t } = useI18n();

const tracker = createThroughputTracker();

/**
 * Bumped every time the tracker's own state changes.
 *
 * `tracker.reading()` reads a plain closure variable, not a Vue ref, so a `computed` that
 * only calls it has nothing reactive to depend on and would cache its first answer forever -
 * silently never updating on screen no matter how many observations arrive afterwards. This
 * is the dependency that makes {@link reading} recompute: written once here so a future
 * caller only has to remember to bump it, not to rediscover the plain-closure-in-a-computed
 * trap `agent-global-memory` has already recorded once as "the value is stored, but nothing
 * reads it".
 */
const version = ref(0);

/** The render speed readings the live chart draws, one per real observation. */
const samples = ref<readonly LiveSample[]>([]);

const overallPercent = computed<number | null>(() => {
    const overall = props.facts.levels.find((level) => level.id === "overall");
    return overall?.percent ?? null;
});

watch(
    overallPercent,
    (percent) => {
        if (percent === null) return;
        tracker.observe(percent, Date.now());
        version.value++;
        // Each real reading joins the live chart; nothing is drawn between readings that the
        // render did not report.
        const rate = tracker.reading().percentPerMinute;
        if (rate !== null) samples.value = pushSample(samples.value, { t: Date.now(), v: rate });
    },
    { immediate: true },
);

// A render that stops being active leaves its last reading on screen rather than clearing
// it away; a fresh one clears the window itself, because the previous run's rate says
// nothing true about a render that has not started moving yet.
watch(
    () => props.facts.active,
    (active, wasActive) => {
        if (active && !wasActive) {
            tracker.reset();
            samples.value = [];
            version.value++;
        }
    },
);

/** Ticks so a render that has gone quiet is shown as stale rather than live. */
const clock = ref(Date.now());
const tick = setInterval(() => (clock.value = Date.now()), 5000);
const chartState = computed(() => stateOf({ samples: samples.value, running: props.facts.active, now: clock.value, staleMs: 45_000, started: props.facts.active }));
const formatRate = (value: number): string => t("liveSpeed.rateShort", { rate: Math.round(value * 10) / 10 }, "{rate}%/min");

onBeforeUnmount(() => {
    tracker.reset();
    clearInterval(tick);
});

const reading = computed(() => {
    void version.value; // establishes the reactive dependency; see `version`'s own comment.
    return tracker.reading();
});

const rateText = computed(() => {
    const value = reading.value.percentPerMinute;
    if (value === null) return "";
    // One decimal place: a render moving at 0.3%/min and one moving at 3.1%/min are very
    // different facts, and rounding both to a whole number would erase that.
    const rounded = Math.round(value * 10) / 10;
    const seconds = Math.max(1, Math.round(reading.value.windowMs / 1000));
    return t(
        "liveSpeed.throughputRate",
        { rate: rounded, seconds },
        "Moving at about {rate}% of the whole render per minute, over the last {seconds} seconds.",
    );
});
</script>

<template>
    <div class="mb-throughput-wrap">
        <p class="mb-throughput" role="status" aria-live="polite">
            {{ rateText || t("liveSpeed.throughputNone", "Not enough data yet to show a rate.") }}
        </p>
        <LiveChart :samples="samples" :state="chartState" :label="t('liveSpeed.chartLabel', 'Render speed')" :format="formatRate" :window-ms="300000" :height="120" />
    </div>
</template>

<style>
.mb-throughput {
    margin: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    min-inline-size: 0;
    max-inline-size: 100%;
    overflow-wrap: anywhere;
}
</style>
