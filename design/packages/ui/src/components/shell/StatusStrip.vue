<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertCircleOutline, mdiLightningBolt } from "@mdi/js";
import { VBtn, VChip, VIcon, VProgressLinear } from "vuetify/components";
import { formatCount } from "../progress/format.js";
import type { ProgressFacts } from "../progress/progressModel.js";
import { formatDuration } from "../world/renderRun.js";
import { nonNegativeInteger, safeProgressPercent } from "./shellNumbers.js";

/**
 * One line under the title bar, and only when there is something to say.
 *
 * ### What it shows
 *
 * The prototype's rendering strip: a bolt, "Rendering **world · maps**", a slim bar, the
 * engine's own count and estimate in monospace, and at the right end an error-container chip
 * naming the unresolved problems and an outlined **Open console** button. When several renders
 * run at once there is no single world or console to name, so the line says how many are
 * rendering and the button opens the Renders job that lists each of them.
 *
 * ### It reads the same source the Renders chip reads
 *
 * The active-render count, the subject and the facts come from the shell's existing
 * `createActiveRenders` aggregation, passed in. Not a second subscription: two aggregations would
 * each poll on their own schedule and the strip and the job chip would start disagreeing about
 * how many renders are running, which is the one thing a persistent indicator must never do.
 *
 * ### It never floats
 *
 * A line in the layout, above the content, reflowing it. Not a toast, not an absolutely
 * positioned overlay. When there is nothing to report it renders nothing at all rather than an
 * empty bar reserving height for a message that is not there.
 *
 * ### Announced politely, and not on every tick
 *
 * `role="status"` with a polite live region, and the announced text deliberately excludes the
 * progress numbers. A render emits progress several times a second; announcing each one turns a
 * status line into a screen reader reading numbers continuously and drowning everything else.
 * The bar and the monospace readout show the movement; the live region announces only when the
 * sentence itself changes.
 */
const props = withDefaults(
    defineProps<{
        /** Starting, running or offered - the same rows the Renders chip counts. */
        runningRenderCount?: number;
        /**
         * A percentage, 0 to 100, across the running rows that can report one - the same scale
         * `ProgressLevel.percent` uses - or null when nothing reports progress.
         */
        renderProgress?: number | null;
        /** What the one running render is rendering, or null when several (or none) run. */
        renderSubject?: string | null;
        /** The one running render's progress facts, for its count and estimate. */
        renderFacts?: ProgressFacts | null;
        /** True when the one running render has a console this shell can open. */
        consoleAvailable?: boolean;
        /** Unresolved problems, from the Problems adapter. */
        problemCount?: number;
        /** Whether the Problems panel is already showing, for `aria-expanded`. */
        problemsOpen?: boolean;
        /** Stable id of the docked Problems panel this strip controls. */
        problemsPanelId?: string;
    }>(),
    {
        runningRenderCount: 0,
        renderProgress: null,
        renderSubject: null,
        renderFacts: null,
        consoleAvailable: false,
        problemCount: 0,
        problemsOpen: false,
        problemsPanelId: "",
    },
);

const emit = defineEmits<{
    openRenders: [];
    openConsole: [];
    toggleProblems: [];
}>();

const { t } = useI18n();

/**
 * The bar's value, or null when nothing reports progress.
 *
 * Normalised here rather than in the template because `exactOptionalPropertyTypes` makes an
 * optional prop `number | null | undefined` at the binding, and a template expression cannot
 * narrow all three the way a computed can.
 */
const progressPercent = computed(() => safeProgressPercent(props.renderProgress));

const runningRenderCount = computed(() => nonNegativeInteger(props.runningRenderCount));
const problemCount = computed(() => nonNegativeInteger(props.problemCount));
const hasRenders = computed(() => runningRenderCount.value > 0);
const hasProblems = computed(() => problemCount.value > 0);

/** Nothing to say means nothing on screen, not an empty bar holding height. */
const visible = computed(() => hasRenders.value || hasProblems.value);

/** The world is named only when exactly one render is running; several have no one name. */
const subject = computed(() => {
    const value = props.renderSubject?.trim() ?? "";
    return runningRenderCount.value === 1 && value !== "" ? value : null;
});

const renderText = computed(() =>
    subject.value === null
        ? t("status.renders", { count: String(runningRenderCount.value) }, "{count} rendering")
        : t("status.rendering", { subject: subject.value }, "Rendering {subject}"),
);

/** "Rendering" alone, so the subject beside it can carry its own emphasis. */
const renderingLead = computed(() => t("status.renderingLead", "Rendering"));

const problemText = computed(() =>
    problemCount.value === 1
        ? t("status.problem", "1 problem")
        : t("status.problems", { count: String(problemCount.value) }, "{count} problems"),
);

/**
 * The monospace readout: the engine's overall count and its estimate, whichever are known.
 *
 * Nothing is invented. A count with no total says "so far", an estimate the engine did not
 * send and the tracker cannot make yet is simply absent, and when neither is known the readout
 * is not drawn at all.
 */
const readout = computed(() => {
    const facts = subject.value === null ? null : props.renderFacts;
    if (facts === null) return "";
    const parts: string[] = [];
    const overall = facts.levels.find((level) => level.id === "overall") ?? facts.levels[0];
    if (overall?.count) parts.push(formatCount(overall.count, t));
    const estimate = facts.estimate;
    const words =
        estimate.source === "none"
            ? ""
            : estimate.text !== null && estimate.text.trim() !== ""
              ? estimate.text.trim()
              : estimate.seconds === null
                ? ""
                : formatDuration(estimate.seconds, t);
    if (words !== "") parts.push(t("status.left", { eta: words }, "{eta} left"));
    return parts.join(" · ");
});

/**
 * The announced sentence, without the numbers.
 *
 * Held in a ref that only changes when the words change, so the live region fires on "a render
 * started" and not on "the render moved from 41% to 42%".
 */
const announced = ref("");

watch(
    [renderText, problemText, hasRenders, hasProblems],
    () => {
        const parts: string[] = [];
        if (hasRenders.value) parts.push(renderText.value);
        if (hasProblems.value) parts.push(problemText.value);
        announced.value = parts.join(" · ");
    },
    { immediate: true },
);

/** One render with a console opens that console; several open the list of renders. */
const renderAction = computed<"console" | "renders" | null>(() => {
    if (!hasRenders.value) return null;
    return subject.value !== null && props.consoleAvailable ? "console" : "renders";
});
</script>

<template>
    <div v-if="visible" class="wl-status mb-interactive">
        <!--
            The live region is the sentence and only the sentence. A button inside it would be
            re-announced every time the numbers moved, which turns a status update into a repeated
            instruction.
        -->
        <p class="wl-status__line" role="status" aria-live="polite">{{ announced }}</p>

        <template v-if="hasRenders">
            <v-icon class="wl-status__bolt" :icon="mdiLightningBolt" size="18" aria-hidden="true" />
            <span class="wl-status__item" aria-hidden="true">
                <template v-if="subject !== null">
                    {{ renderingLead }}
                    <strong class="wl-status__subject">{{ subject }}</strong>
                </template>
                <template v-else>{{ renderText }}</template>
            </span>
            <v-progress-linear
                v-if="progressPercent !== null"
                class="wl-status__bar"
                :model-value="progressPercent"
                color="primary"
                bg-color="surface-container-highest"
                bg-opacity="1"
                height="4"
                rounded
                aria-hidden="true"
            />
            <span v-if="readout !== ''" class="wl-status__readout" aria-hidden="true">
                {{ readout }}
            </span>
        </template>

        <span class="wl-status__actions">
            <!--
            The problems chip is the Problems panel's disclosure: it names the count in words and
            says whether the panel it controls is open.
        -->
            <v-chip
                v-if="hasProblems"
                class="wl-status__action wl-status__problems"
                color="error-container"
                variant="flat"
                size="small"
                :prepend-icon="mdiAlertCircleOutline"
                :aria-label="
                    problemsOpen ? t('problems.close', 'Close the problems panel') : problemText
                "
                :aria-expanded="problemsOpen ? 'true' : 'false'"
                :aria-controls="problemsPanelId === '' ? undefined : problemsPanelId"
                @click="emit('toggleProblems')"
            >
                {{ problemText }}
            </v-chip>

            <v-btn
                v-if="renderAction === 'console'"
                class="wl-status__action wl-status__console"
                variant="outlined"
                color="primary"
                size="small"
                @click="emit('openConsole')"
            >
                {{ t("status.action.console", "Open console") }}
            </v-btn>
            <v-btn
                v-else-if="renderAction === 'renders'"
                class="wl-status__action wl-status__renders"
                variant="outlined"
                color="primary"
                size="small"
                @click="emit('openRenders')"
            >
                {{ t("status.action.renders", "Open renders") }}
            </v-btn>
        </span>
    </div>
</template>

<style scoped>
/*
 * In the layout, reflowing what is under it. Never `position: fixed` and never `absolute`: a
 * status line that floated would be a toast with a different name.
 */
.wl-status {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 8px 20px;
    min-block-size: 48px;
    background: rgb(var(--v-theme-surface-container-low));
    border-block-end: 1px solid rgb(var(--v-theme-surface-container));
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    color: rgb(var(--v-theme-on-surface-variant));
}

/*
 * Visually hidden, not `display: none`: a hidden live region is a live region that never
 * announces. The visible text beside it is `aria-hidden` so the same words are not read twice.
 */
.wl-status__line {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

.wl-status__bolt {
    color: rgb(var(--v-theme-primary));
}

.wl-status__item {
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

.wl-status__subject {
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
}

.wl-status__bar {
    flex: 0 1 200px;
    inline-size: 200px;
    min-inline-size: 64px;
}

/* Monospace, like every engine readout in the application, so the digits do not jitter. */
.wl-status__readout {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
    font-variant-numeric: tabular-nums;
}

/* Right-aligned on the line, and still right-aligned when a narrow window wraps them. */
.wl-status__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-inline-start: auto;
}

.wl-status__action {
    flex: 0 0 auto;
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
}
</style>
