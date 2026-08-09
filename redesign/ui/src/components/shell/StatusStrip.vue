<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertCircleOutline, mdiProgressClock } from "@mdi/js";
import { VBtn, VIcon, VProgressLinear } from "vuetify/components";

/**
 * One reflowing line under the title bar, and only when there is something to say.
 *
 * ### It reads the same source the Renders chip reads
 *
 * The active-render count comes from the shell's existing `createActiveRenders` aggregation,
 * passed in. Not a second subscription: two aggregations would each poll on their own schedule and
 * the strip and the job chip would start disagreeing about how many renders are running, which is
 * the one thing a persistent indicator must never do.
 *
 * The **Work rail badge is a different number** and always was. It counts open jobs. Conflating
 * the two is the specific mistake the design called out, because "three things are running" and
 * "three things are open" answer different questions and are equal only by coincidence.
 *
 * ### It never floats
 *
 * A line in the layout, above the content, reflowing it. Not a toast, not a floating badge, not an
 * absolutely positioned overlay. When there is nothing to report it renders nothing at all rather
 * than an empty bar reserving height for a message that is not there.
 *
 * ### Announced politely, and not on every tick
 *
 * `role="status"` with a polite live region, and the announced text deliberately excludes the
 * progress percentage. A render emits progress several times a second; announcing each one turns a
 * status line into a screen reader reading numbers continuously and drowning everything else. The
 * bar shows the movement; the live region announces only when the sentence itself changes.
 */
const props = withDefaults(
    defineProps<{
        /** Starting, running or offered - the same rows the Renders chip counts. */
        runningRenderCount?: number;
        /** 0 to 1 across everything in flight, or null when nothing reports progress. */
        renderProgress?: number | null;
        /** Unresolved problems, from the Problems adapter. */
        problemCount?: number;
        /** Whether the Problems panel is already showing, for `aria-expanded`. */
        problemsOpen?: boolean;
    }>(),
    { runningRenderCount: 0, renderProgress: null, problemCount: 0, problemsOpen: false },
);

const emit = defineEmits<{
    openRenders: [];
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
const progressPercent = computed(() =>
    props.renderProgress === null || props.renderProgress === undefined
        ? null
        : Math.round(props.renderProgress * 100),
);

const hasRenders = computed(() => props.runningRenderCount > 0);
const hasProblems = computed(() => props.problemCount > 0);

/** Nothing to say means nothing on screen, not an empty bar holding height. */
const visible = computed(() => hasRenders.value || hasProblems.value);

const renderText = computed(() =>
    t(
        "status.renders",
        { count: String(props.runningRenderCount) },
        "{count} rendering",
    ),
);

const problemText = computed(() =>
    t(
        "status.problems",
        { count: String(props.problemCount) },
        "{count} problems",
    ),
);

/**
 * The announced sentence, without the percentage.
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

/**
 * At most one action, and the more urgent one wins.
 *
 * A strip with two competing buttons is a second navigation model in a single line of text. A
 * problem is a thing that is wrong; a render is a thing that is fine and simply takes time, so a
 * problem takes the action when both are present.
 */
const primaryAction = computed<"problems" | "renders" | null>(() => {
    if (hasProblems.value) return "problems";
    if (hasRenders.value) return "renders";
    return null;
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

        <span v-if="hasRenders" class="wl-status__item" aria-hidden="true">
            <v-icon :icon="mdiProgressClock" size="16" />
            <span>{{ renderText }}</span>
            <v-progress-linear
                v-if="progressPercent !== null"
                class="wl-status__bar"
                :model-value="progressPercent"
                color="primary"
                height="4"
                rounded
            />
        </span>

        <span v-if="hasProblems" class="wl-status__item" aria-hidden="true">
            <v-icon :icon="mdiAlertCircleOutline" size="16" />
            <span>{{ problemText }}</span>
        </span>

        <v-btn
            v-if="primaryAction === 'problems'"
            class="wl-status__action"
            variant="text"
            size="small"
            :aria-expanded="problemsOpen ? 'true' : 'false'"
            @click="emit('toggleProblems')"
        >
            {{ t("status.action.problems", "Show problems") }}
        </v-btn>
        <v-btn
            v-else-if="primaryAction === 'renders'"
            class="wl-status__action"
            variant="text"
            size="small"
            @click="emit('openRenders')"
        >
            {{ t("status.action.renders", "Open renders") }}
        </v-btn>
    </div>
</template>

<style scoped>
/*
 * In the layout, reflowing what is under it. Never `position: fixed` and never `absolute`: a
 * status line that floated would be a toast with a different name, and the whole point of the
 * rewrite is that nothing appears over content unprompted.
 */
.wl-status {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 16px;
    padding: 4px 16px;
    min-block-size: 32px;
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border-block-end: 1px solid rgb(var(--v-theme-outline-variant));
    font-size: 0.75rem;
    color: rgb(var(--v-theme-on-surface-variant));
}

/*
 * Visually hidden, not `display: none`: a hidden live region is a live region that never
 * announces. The visible chips beside it are `aria-hidden` so the same words are not read twice.
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

.wl-status__item {
    display: flex;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
}

.wl-status__bar {
    inline-size: 96px;
}

.wl-status__action {
    margin-inline-start: auto;
}
</style>
