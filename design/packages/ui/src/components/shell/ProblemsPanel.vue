<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertCircleOutline, mdiAlertOutline, mdiClose, mdiInformationOutline } from "@mdi/js";
import { VBtn, VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { severityLabel, type Problem, type ProblemSeverity } from "./problemsAdapter.js";
import type { FeatureTarget } from "./featureTargets.js";

/**
 * Every unresolved problem in one place, docked to the bottom of the content.
 *
 * ### It sits beside the rail, never over it
 *
 * A card pinned to the bottom of the content column, inset 16px, as the approved design draws
 * it. It never covers the rail, it is closed with its own button or the status strip's toggle,
 * and it only opens because somebody asked for it, so it is never in the way of a Save button
 * nobody chose to hide.
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
 *
 * ### It carries its own search
 *
 * The approved design puts a search bar in the panel's header, and this project's rule is that
 * every search bar is the shared `ConfigSearchField` with its anchored regex builder. It
 * matches what each row shows - severity, source, message and meaning - and plain text stays
 * the default.
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

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

function haystack(problem: Problem): string {
    return [
        severityLabel(problem.severity, t),
        problem.source,
        problem.message,
        problem.meaning,
    ].join("\n");
}

const shown = computed(() =>
    props.problems.filter((problem) => matcher.value.test(haystack(problem))),
);

const sample = computed(() => props.problems.map(haystack).join("\n"));

const title = computed(() =>
    t("problems.title", { count: String(props.problems.length) }, "Problems ({count})"),
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
            <v-icon
                class="wl-problems__icon"
                :icon="mdiAlertCircleOutline"
                size="20"
                aria-hidden="true"
            />
            <h2 class="wl-problems__title">{{ title }}</h2>
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                class="wl-problems__search"
                :label="t('problems.search', 'Search problems')"
                :sample="sample"
            />
            <span class="wl-problems__spacer" />
            <v-btn
                :icon="mdiClose"
                variant="text"
                density="comfortable"
                class="wl-problems__close"
                :aria-label="t('problems.close', 'Close the problems panel')"
                @click="emit('update:open', false)"
            />
        </header>

        <!--
            One scroll region, owned here, and it scrolls rather than clipping: a capped height
            with hidden overflow deletes whatever sits past the cap with no scrollbar to say so.
        -->
        <ul class="wl-problems__list">
            <li v-for="problem in shown" :key="problem.id" class="wl-problem">
                <v-icon
                    class="wl-problem__icon"
                    :class="`wl-problem__icon--${problem.severity}`"
                    :icon="ICONS[problem.severity]"
                    size="20"
                    aria-hidden="true"
                />

                <span class="wl-problem__text">
                    <span class="wl-problem__message">{{ problem.message }}</span>
                    <span class="wl-problem__severity">
                        <!-- The word, not only the icon and never only the colour. -->
                        <span class="wl-problem__severity-word">{{
                            severityLabel(problem.severity, t)
                        }}</span>
                        <span aria-hidden="true">·</span>
                        <span class="wl-problem__source">{{ problem.source }}</span>
                    </span>
                    <span class="wl-problem__meaning">{{ problem.meaning }}</span>
                </span>

                <!--
                    Only where a real destination exists. A generic Fix that dismissed the row
                    would teach the reader that this panel's actions do nothing.
                -->
                <v-btn
                    v-if="problem.remedy"
                    class="wl-problem__remedy"
                    variant="outlined"
                    color="primary"
                    @click="emit('remedy', problem.remedy.target)"
                >
                    {{ problem.remedy.label }}
                </v-btn>
            </li>
        </ul>

        <p v-if="problems.length === 0" class="wl-problems__empty">
            {{ t("problems.empty", "Nothing is wrong right now.") }}
        </p>
        <p v-else-if="shown.length === 0" class="wl-problems__empty" role="status">
            {{ t("problems.noMatch", "No problem matches this search.") }}
        </p>
    </section>
</template>

<style scoped>
/*
 * The approved design's problems card: surface-container, the large corner, an outline-variant
 * hairline and the level-3 shadow, inset 16px from the content's edges. It still sits in the
 * layout rather than over it, so the destination above it reflows and keeps its Save button.
 */
.wl-problems {
    /* Its siblings in the content column are absolutely positioned layers, so the panel
       pins itself to the column's bottom edge and stacks above them, as the design's card
       sits over the bottom of the content with 16px clear on every side. */
    position: relative;
    z-index: 2;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    min-block-size: min(280px, 40vh);
    max-block-size: 40vh;
    margin: auto 16px 16px 8px;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-large);
    background: rgb(var(--v-theme-surface-container));
    box-shadow: var(--md-sys-elevation-shadow-level3);
    overflow: hidden;
}

.wl-problems__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 8px 18px;
    min-block-size: 60px;
    border-block-end: 1px solid rgb(var(--v-theme-outline-variant));
}

.wl-problems__icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-error));
}

.wl-problems__title {
    margin: 0;
    font-size: var(--md-sys-typescale-title-medium-size);
    line-height: var(--md-sys-typescale-title-medium-line-height, 1.5rem);
    font-weight: var(--md-sys-typescale-title-medium-weight, 500);
    color: rgb(var(--v-theme-on-surface));
    min-inline-size: 0;
}

.wl-problems__search {
    flex: 1 1 240px;
    max-inline-size: 360px;
    margin-inline-start: 10px;
}

.wl-problems__search :deep(.v-field) {
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-surface));
}

.wl-problems__search :deep(.v-field__outline) {
    --v-field-border-opacity: 1;
    color: rgb(var(--v-theme-outline-variant));
}

.wl-problems__spacer {
    flex: 1 1 auto;
}

.wl-problems__close {
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-problems__list {
    list-style: none;
    margin: 0;
    padding: 8px 0;
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
    gap: 14px;
    padding: 14px 18px;
}

.wl-problem + .wl-problem {
    border-block-start: 1px solid rgb(var(--v-theme-surface-container-high));
}

.wl-problem__icon {
    flex: 0 0 auto;
    margin-block-start: 1px;
}

.wl-problem__icon--error {
    color: rgb(var(--v-theme-error));
}

.wl-problem__icon--warning {
    color: rgb(var(--v-theme-tertiary));
}

.wl-problem__icon--info {
    color: rgb(var(--v-theme-primary));
}

.wl-problem__text {
    flex: 1 1 320px;
    /* The flex child that shrinks, so a long dotted path wraps instead of hard-clipping. */
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.wl-problem__message {
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-problem__severity {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.5;
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-problem__severity-word {
    font-weight: 500;
}

.wl-problem__source {
    overflow-wrap: anywhere;
}

.wl-problem__meaning {
    max-inline-size: 76ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.5;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-problem__remedy {
    flex: 0 0 auto;
    min-block-size: 40px;
    border-radius: var(--md-sys-shape-corner-full);
    text-transform: none;
    letter-spacing: normal;
}

.wl-problems__empty {
    margin: 0;
    padding: 16px 18px 20px;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
