<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ease, gridValues, nearestIndex, range, trend, visible, type LiveSample, type LiveState } from "./liveChartModel.js";

/**
 * A live chart in the Liveline style: one smooth line that eases toward each new reading, a
 * pulsing live dot with its momentum, a soft gradient fill, a quiet grid, a value badge and a
 * range that animate together, pointer and keyboard scrubbing, a screen-reader summary, and
 * honest loading, paused, stale and empty states.
 *
 * Under reduced motion the line, badge and range snap to each reading and the dot is still.
 * The chart never draws a point the source did not send.
 */

const props = withDefaults(
    defineProps<{
        samples: readonly LiveSample[];
        state: LiveState;
        /** What the chart measures, for its accessible name. */
        label: string;
        /** Formats a value with its unit, such as "2.4%/min". */
        format: (value: number) => string;
        windowMs?: number;
        height?: number;
    }>(),
    { windowMs: 120_000, height: 160 },
);

const { t, locale } = useI18n();
const canvas = ref<HTMLCanvasElement | null>(null);
const wrap = ref<HTMLElement | null>(null);
const scrub = ref<number | null>(null);
const reduced = ref(false);

const now = ref(Date.now());
const shown = computed(() => visible(props.samples, now.value, props.windowMs));
const latest = computed(() => props.samples.at(-1) ?? null);
const momentum = computed(() => trend(shown.value));
const target = computed(() => range(shown.value));

/** What is drawn this frame: eased toward the targets, or equal to them under reduced motion. */
const drawn = { min: 0, max: 1, last: 0 };
const badge = ref<number | null>(null);

const arrow = computed(() => (momentum.value === "up" ? "▲" : momentum.value === "down" ? "▼" : "▬"));
const trendWord = computed(() =>
    momentum.value === "up" ? t("chart.trend.up", "rising") : momentum.value === "down" ? t("chart.trend.down", "falling") : t("chart.trend.flat", "steady"),
);

const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value === "yue" ? "zh-HK" : undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }));

const stateText = computed(() => {
    switch (props.state) {
        case "loading":
            return t("chart.state.loading", "Waiting for the first readings.");
        case "paused":
            return t("chart.state.paused", "Paused. The last readings stay on screen and new ones catch up when it resumes.");
        case "stale":
            return t("chart.state.stale", { age: latest.value ? timeFormat.value.format(latest.value.t) : "" }, "No new reading since {age}. The source has gone quiet.");
        case "empty":
            return t("chart.state.empty", "Nothing to show yet.");
        default:
            return "";
    }
});

const summary = computed(() => {
    if (!latest.value) return stateText.value;
    return t("chart.summary", { label: props.label, value: props.format(latest.value.v), trend: trendWord.value }, "{label}: {value}, {trend}.") + (stateText.value ? ` ${stateText.value}` : "");
});

const scrubbed = computed(() => (scrub.value === null ? null : (shown.value[scrub.value] ?? null)));

function colours(): { line: string; grid: string; text: string; surface: string } {
    const style = getComputedStyle(wrap.value ?? document.documentElement);
    const rgb = (name: string, fallback: string): string => {
        const v = style.getPropertyValue(name).trim();
        return v ? `rgb(${v})` : fallback;
    };
    // material-exempt: fallbacks used only when a theme role cannot be read for the canvas; they are the Material 3 baseline values of those same roles.
    return { line: rgb("--v-theme-primary", "#6750a4"), grid: rgb("--v-theme-outline-variant", "#cac4d0"), text: rgb("--v-theme-on-surface-variant", "#49454f"), surface: rgb("--v-theme-surface", "#ffffff") };
}

function frame(): void {
    now.value = Date.now();
    const goal = target.value;
    const last = latest.value?.v ?? 0;
    if (reduced.value) {
        drawn.min = goal.min;
        drawn.max = goal.max;
        drawn.last = last;
    } else {
        drawn.min = ease(drawn.min, goal.min);
        drawn.max = ease(drawn.max, goal.max);
        drawn.last = ease(drawn.last, last);
    }
    badge.value = latest.value ? drawn.last : null;
    paint();
}

function paint(): void {
    const el = canvas.value;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !wrap.value) return;
    const ratio = globalThis.devicePixelRatio || 1;
    const width = wrap.value.clientWidth || 600;
    const height = props.height;
    if (el.width !== Math.round(width * ratio)) el.width = Math.round(width * ratio);
    if (el.height !== Math.round(height * ratio)) el.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const c = colours();
    const left = 8;
    const right = width - 56;
    const top = 12;
    const bottom = height - 22;
    const x = (time: number): number => left + ((time - (now.value - props.windowMs)) / props.windowMs) * (right - left);
    const y = (v: number): number => bottom - ((v - drawn.min) / (drawn.max - drawn.min || 1)) * (bottom - top);

    // Quiet grid with labels on the right.
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = c.text;
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    for (const g of gridValues(drawn.min, drawn.max)) {
        const gy = Math.round(y(g)) + 0.5;
        if (gy < top - 1 || gy > bottom + 1) continue;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(left, gy);
        ctx.lineTo(right, gy);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(props.format(g), right + 6, gy + 4);
    }

    const pts = shown.value;
    if (pts.length === 0) return;
    const coords = pts.map((s, i) => ({ px: x(s.t), py: i === pts.length - 1 ? y(drawn.last) : y(s.v) }));

    // Gradient fill under the line, from the series colour.
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, c.line.replace("rgb(", "rgba(").replace(")", ", 0.28)"));
    gradient.addColorStop(1, c.line.replace("rgb(", "rgba(").replace(")", ", 0)"));
    ctx.beginPath();
    ctx.moveTo(coords[0]!.px, bottom);
    for (const p of coords) ctx.lineTo(p.px, p.py);
    ctx.lineTo(coords.at(-1)!.px, bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // The line: a smooth curve through the real readings.
    ctx.beginPath();
    ctx.moveTo(coords[0]!.px, coords[0]!.py);
    for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1]!;
        const b = coords[i]!;
        const mx = (a.px + b.px) / 2;
        ctx.bezierCurveTo(mx, a.py, mx, b.py, b.px, b.py);
    }
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // The live dot, pulsing while live.
    const head = coords.at(-1)!;
    if (props.state === "live" && !reduced.value) {
        const phase = (now.value % 1600) / 1600;
        ctx.beginPath();
        ctx.arc(head.px, head.py, 4 + phase * 10, 0, Math.PI * 2);
        ctx.fillStyle = c.line.replace("rgb(", "rgba(").replace(")", `, ${0.35 * (1 - phase)})`);
        ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(head.px, head.py, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = props.state === "live" ? c.line : c.text;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.surface;
    ctx.stroke();

    // Scrub crosshair.
    if (scrub.value !== null && coords[scrub.value]) {
        const p = coords[scrub.value]!;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = c.text;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.px, top);
        ctx.lineTo(p.px, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(p.px, p.py, 4, 0, Math.PI * 2);
        ctx.fillStyle = c.line;
        ctx.fill();
    }
}

let raf = 0;
function loop(): void {
    frame();
    raf = requestAnimationFrame(loop);
}

function onPointerMove(event: PointerEvent): void {
    const rect = canvas.value?.getBoundingClientRect();
    if (!rect || shown.value.length === 0) return;
    const left = 8;
    const right = rect.width - 56;
    const time = now.value - props.windowMs + ((event.clientX - rect.left - left) / (right - left)) * props.windowMs;
    scrub.value = nearestIndex(shown.value, time);
}

function onKeydown(event: KeyboardEvent): void {
    const count = shown.value.length;
    if (count === 0) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const from = scrub.value ?? count;
        scrub.value = Math.min(count - 1, Math.max(0, from + (event.key === "ArrowLeft" ? -1 : 1)));
    } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        scrub.value = event.key === "Home" ? 0 : count - 1;
    } else if (event.key === "Escape") {
        scrub.value = null;
    }
}

let media: MediaQueryList | null = null;
const onMotion = (): void => {
    reduced.value = media?.matches === true || document.documentElement.dataset["lowStimulation"] === "true";
};

onMounted(() => {
    media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    onMotion();
    media?.addEventListener?.("change", onMotion);
    const goal = target.value;
    drawn.min = goal.min;
    drawn.max = goal.max;
    drawn.last = latest.value?.v ?? 0;
    if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(loop);
    else frame();
});
onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf);
    media?.removeEventListener?.("change", onMotion);
});

// Under reduced motion there is no loop to rely on for each reading; paint on change.
watch(
    () => props.samples.length,
    () => {
        if (reduced.value || typeof requestAnimationFrame !== "function") frame();
    },
);

defineExpose({ scrub });
</script>

<template>
    <figure ref="wrap" class="wl-live" :data-state="state">
        <figcaption class="wl-live__head">
            <span class="wl-live__label">{{ label }}</span>
            <span v-if="latest" class="wl-live__badge" :data-trend="momentum">
                <span aria-hidden="true">{{ arrow }}</span>
                {{ format(badge ?? latest.v) }}
                <span class="wl-sr-only">{{ trendWord }}</span>
            </span>
            <span v-if="state === 'live'" class="wl-live__live">{{ t("chart.live", "Live") }}</span>
        </figcaption>
        <canvas
            ref="canvas"
            class="wl-live__canvas"
            :style="{ height: `${height}px` }"
            role="img"
            tabindex="0"
            :aria-label="summary"
            :aria-describedby="scrubbed ? 'wl-live-scrub' : undefined"
            @pointermove="onPointerMove"
            @pointerleave="scrub = null"
            @keydown="onKeydown"
        />
        <p v-if="scrubbed" id="wl-live-scrub" class="wl-live__tip" data-test="chart-scrub">{{ timeFormat.format(scrubbed.t) }} · {{ format(scrubbed.v) }}</p>
        <p v-if="stateText" class="wl-live__state" data-test="chart-state">{{ stateText }}</p>
        <p class="wl-sr-only" role="status" aria-live="polite">{{ summary }}</p>
    </figure>
</template>

<style scoped>
.wl-live { margin: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.wl-live__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wl-live__label { font-size: var(--md-sys-typescale-label-large-size, 14px); font-weight: 500; }
.wl-live__badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px; font-variant-numeric: tabular-nums;
    background: rgb(var(--v-theme-primary-container, var(--v-theme-surface-variant))); color: rgb(var(--v-theme-on-primary-container, var(--v-theme-on-surface)));
}
.wl-live__live { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: rgb(var(--v-theme-primary)); }
.wl-live__canvas { display: block; width: 100%; border-radius: 12px; outline: none; }
.wl-live__canvas:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-live__tip { margin: 0; font-size: 12px; font-variant-numeric: tabular-nums; }
.wl-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.wl-live__state { margin: 0; font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
</style>
