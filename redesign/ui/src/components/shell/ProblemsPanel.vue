<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertCircleOutline, mdiAlertOutline, mdiClose, mdiInformationOutline } from "@mdi/js";
import { VBtn, VIcon } from "vuetify/components";
import { severityLabel, type Problem, type ProblemSeverity } from "./problemsAdapter.js";
import type { FeatureTarget } from "./featureTargets.js";

/**
 * Every unresolved problem in one place, docked to the bottom of the content.
 *
 * ### It reflows, it does not cover
 *
 * Docked into the layout rather than floated over it. A panel that covered the bottom of the
 * screen would hide the Save button on the surface the problem is about, which is the one control
 * the reader is heading for. The destination above it gets less height and keeps all of its
 * controls.
 *
 * ### The inline error stays where it is
 *
 * This is an aggregate, never a replacement. A field that is invalid still says so beside itself;
 * this exists so somebody who is not looking at that field can find out. Remove the inline error
 * in favour of this and the panel becomes the only way to discover a problem, which is strictly
 * worse than where this project started.
 *
 * ### Severity is icon plus word plus role
 *
 * Never colour alone. Each row names its severity in text next to an icon, so the distinction
 * survives a monochrome display, a contrast theme and a reader who cannot see red.
 */
const props = withDefaults(
    defineProps<{
        problems: readonly Problem[];
        open: boolean;
        /** Stable id used by the StatusStrip disclosure button. */
        panelId?: string;
    }>(),
    { panelId: "worldlens-problems-panel" },
);

const emit = defineEmits<{
    "update:open": [open: boolean];
    remedy: [target: FeatureTarget];
}>();

const { t } = useI18n();

const ICONS: Record<ProblemSeverity, string> = {
    error: mdiAlertCircleOutline,
    warning: mdiAlertOutline,
    info: mdiInformationOutline,
};

const title = computed(() =>
    t(
        "problems.title",
        { count: String(props.problems.length) },
        "Problems ({count})",
    ),
);
</script>

<template>
    <section
        v-if="open"
        :id="panelId"
        class="wl-problems mb-interactive"
        role="region"
        :aria-label="title"
    >
        <header class="wl-problems__head">
            <h2 class="wl-problems__title">{{ title }}</h2>
            <v-btn
                :icon="mdiClose"
                variant="text"
                size="small"
                density="comfortable"
                :aria-label="t('problems.close', 'Close the problems panel')"
                @click="emit('update:open', false)"
            />
        </header>

        <!--
            One scroll region, owned here, and it scrolls rather than clipping: a capped height
            with hidden overflow deletes whatever sits past the cap with no scrollbar to say so.
        -->
        <ul class="wl-problems__list">
            <li v-for="problem in problems" :key="problem.id" class="wl-problem">
                <span class="wl-problem__severity">
                    <v-icon :icon="ICONS[problem.severity]" size="18" />
                    <!-- The word, not only the icon and never only the colour. -->
                    <span class="wl-problem__severity-word">
                        {{ severityLabel(problem.severity, t) }}
                    </span>
                </span>

                <span class="wl-problem__text">
                    <span class="wl-problem__source">{{ problem.source }}</span>
                    <span class="wl-problem__message">{{ problem.message }}</span>
                    <span class="wl-problem__meaning">{{ problem.meaning }}</span>
                </span>

                <!--
                    Only where a real destination exists. A generic Fix that dismissed the row
                    would teach the reader that this panel's actions do nothing.
                -->
                <v-btn
                    v-if="problem.remedy"
                    class="wl-problem__remedy"
                    variant="tonal"
                    size="small"
                    @click="emit('remedy', problem.remedy.target)"
                >
                    {{ problem.remedy.label }}
                </v-btn>
            </li>
        </ul>

        <p v-if="problems.length === 0" class="wl-problems__empty">
            {{ t("problems.empty", "Nothing is wrong right now.") }}
        </p>
    </section>
</template>

<style scoped>
.wl-problems {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    max-block-size: 40vh;
    border-block-start: 1px solid rgb(var(--v-theme-outline-variant));
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
}

.wl-problems__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px 6px 16px;
    min-block-size: 48px;
}

.wl-problems__title {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-on-surface-variant));
    min-inline-size: 0;
}

.wl-problems__list {
    list-style: none;
    margin: 0;
    padding: 0 0 8px;
    overflow-y: auto;
    min-block-size: 0;
}

/*
 * Wraps rather than scrolling sideways. At a narrow width the remedy drops below the text
 * instead of pushing the row past the edge, which is the difference between a cramped panel and
 * a horizontal scrollbar on the whole shell.
 */
.wl-problem {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 16px;
    border-block-start: 1px solid rgb(var(--v-theme-outline-variant));
}

.wl-problem__severity {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
    min-inline-size: 92px;
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-problem__severity-word {
    font-size: 0.75rem;
    font-weight: 600;
}

.wl-problem__text {
    flex: 1 1 320px;
    /* The flex child that shrinks, so a long dotted path wraps instead of hard-clipping. */
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.wl-problem__source {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant)));
    overflow-wrap: anywhere;
}

.wl-problem__message {
    font-size: 0.875rem;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-problem__meaning {
    max-inline-size: 68ch;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-problem__remedy {
    flex: 0 0 auto;
}

.wl-problems__empty {
    margin: 0;
    padding: 12px 16px 20px;
    font-size: 0.875rem;
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
