<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowRight,
    mdiChevronRight,
    mdiCompassOutline,
    mdiConsoleLine,
    mdiFolderMultipleOutline,
    mdiMapPlus,
    mdiServerNetwork,
    mdiCreationOutline,
} from "@mdi/js";
import { VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { generationDialogOpen } from "../mcserver/generationWorkflow.js";
import { workflowText } from "../mcserver/workflowText.js";
import { profilesStore, isLocalProfile } from "../../stores/profiles.js";
import { resolveMeta, type CatalogueMetaSources } from "../shell/catalogueMeta.js";
import {
    catalogueSampleText,
    createCatalogueMatcher,
    filterCatalogues,
    flattenFeatures,
    resolveCatalogues,
    type ResolvedCatalogue,
    type ResolvedFeature,
} from "../shell/catalogueSearch.js";
import type { CatalogueFeatureDefinition, CatalogueId } from "../shell/featureTargets.js";
import type { ActiveRenderRow } from "../renders/activeRenders.js";
import {
    displayPercent,
    hasReturningUserContent,
    inProgressRenders,
    inProgressRendersOverflow,
    recentProfiles,
    recentProfilesOverflow,
} from "./homeDashboardModel.js";

/**
 * Home: one centred column that answers "what are you here to do?" in the order a person asks it.
 *
 * ### The shape, top to bottom
 *
 * 1. A headline and one supporting line.
 * 2. A 56px pill search field over every catalogue feature, with the same anchored regex builder
 *    every other search bar here carries (`ConfigSearchField`). Typing filters the cards below in
 *    place; the command palette stays one text button away for settings and open tabs.
 * 3. The "Make a map" hero on primary-container: one filled primary action (**New map**) and one
 *    text action (**Walk me through it**). Exactly one filled button, so the page has one obvious
 *    next step. "Generate and start project" used to sit beside them as a second filled button; it
 *    now lives in the Make a map card as a tonal action, with the same handler as before.
 * 4. Real content, only when there is some: renders in progress, saved maps and servers, drafts.
 * 5. The six catalogues as cards: title, feature count, description, the first four features as
 *    working links, and an "All N features" link that opens the catalogue page.
 *
 * ### Every link is the real activation path
 *
 * A feature link emits `activateFeature` with the manifest row, exactly as `CataloguePage` and the
 * command palette do, so the shell routes it through `ShellNavigation.activateFeature` - the one
 * activation function. Nothing here decides where a feature lives.
 *
 * `HomeScreen.vue` and `HomeCatalogues.vue` stay in the tree, unreferenced, as before.
 */
const props = withDefaults(
    defineProps<{
        /** Live values for the catalogue metas and project/render counts. */
        metaSources?: CatalogueMetaSources;
        /** Rows currently on `App.vue`'s render aggregator - starting, running, offer, or done. */
        renderRows?: readonly ActiveRenderRow[];
        /** Removes the rows the restricted-mode contract requires to be absent. */
        restrictedModeActive?: boolean;
    }>(),
    { metaSources: () => ({}), renderRows: () => [], restrictedModeActive: false },
);

const emit = defineEmits<{
    /** Opens the project editor to start a fresh map. */
    newMap: [];
    /** Opens the guided walkthrough. */
    walkMeThrough: [];
    /** Opens the command palette, already focused on search. */
    openPalette: [];
    /** A render row was activated; the key identifies it on the shared aggregator. */
    openRender: [key: string];
    /** A saved profile was activated; the id identifies it in the profile store. */
    openMap: [profileId: string];
    /** A card's "All N features" link: opens that catalogue's page inside Home. */
    openCatalogue: [id: CatalogueId];
    /** A card's feature link: the same row `CataloguePage` emits, for the shell to activate. */
    activateFeature: [feature: CatalogueFeatureDefinition];
}>();

const { t } = useI18n();

/** How many feature links each card shows before its "All N features" link. */
const PREVIEW_LIMIT = 4;

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const projectCount = computed(() => props.metaSources.projectCount ?? 0);

const runningRows = computed(() => inProgressRenders(props.renderRows));
const runningOverflow = computed(() => inProgressRendersOverflow(props.renderRows));

const savedProfiles = computed(() => recentProfiles(profilesStore.profiles));
const savedProfilesOverflow = computed(() => recentProfilesOverflow(profilesStore.profiles));

const returning = computed(() =>
    hasReturningUserContent(profilesStore.profiles, props.renderRows, projectCount.value),
);

/** Resolved at render time so a language-mode or funny-level change moves this copy too. */
const catalogues = computed<readonly ResolvedCatalogue[]>(() =>
    resolveCatalogues(
        t as never,
        (feature) => resolveMeta(feature.metaResolver, props.metaSources, t as never),
        props.restrictedModeActive,
    ),
);

const allFeatures = computed(() => flattenFeatures(catalogues.value));

const matcher = computed(() => createCatalogueMatcher(query.value, regexMode.value, flags.value));

const searching = computed(() => matcher.value.active);

/** Every card stays on screen while searching; each holds only its matching rows. */
const shown = computed<readonly ResolvedCatalogue[]>(() =>
    filterCatalogues(catalogues.value, matcher.value),
);

const matchCount = computed(() =>
    shown.value.reduce((total, catalogue) => total + catalogue.features.length, 0),
);

const summary = computed(() =>
    searching.value
        ? t(
              "shell.home.search.summary",
              { shown: String(matchCount.value), total: String(allFeatures.value.length) },
              "{shown} of {total} features",
          )
        : "",
);

/** The hero names the Make a map catalogue by id, so reordering cannot change what it says. */
const makeCatalogue = computed(
    () => catalogues.value.find((catalogue) => catalogue.id === "make") ?? null,
);

/** Unfiltered size, for the "All N features" link: the page behind it lists all of them. */
function totalFor(id: CatalogueId): number {
    return catalogues.value.find((catalogue) => catalogue.id === id)?.features.length ?? 0;
}

function preview(catalogue: ResolvedCatalogue): readonly ResolvedFeature[] {
    return catalogue.features.slice(0, PREVIEW_LIMIT);
}

function countLabel(catalogue: ResolvedCatalogue): string {
    return t(
        "shell.home.card.count",
        { count: String(catalogue.features.length) },
        "{count} features",
    );
}

function allLabel(id: CatalogueId): string {
    return t("shell.home.card.all", { count: String(totalFor(id)) }, "All {count} features");
}

/** The same label and handler `GenerationEntry.vue` uses, drawn as a tonal card action. */
const generationLabel = computed(() =>
    workflowText("Generate and start project", "產生世界並建立專案"),
);

function openGeneration(): void {
    generationDialogOpen.value = true;
}

function renderTitle(row: ActiveRenderRow): string {
    return row.worldLabel || row.projectLabel;
}

function renderMeta(row: ActiveRenderRow): string {
    const percent = displayPercent(row.percent);
    if (percent !== null) {
        return t("shell.home.dashboard.renderPercent", { percent: String(percent) }, "{percent}%");
    }
    if (row.state === "offer") {
        return t("shell.home.dashboard.renderOffer", "Found running · tap to reattach");
    }
    return t("shell.home.dashboard.renderWorking", "Working…");
}

function profileMeta(profile: (typeof profilesStore.profiles)[number]): string {
    return isLocalProfile(profile)
        ? t("shell.home.dashboard.profileLocal", "Rendered on this computer")
        : profile.url || t("shell.home.dashboard.profileRemote", "Remote server");
}
</script>

<template>
    <div class="wl-dash">
        <div class="wl-dash__inner">
            <header class="wl-dash__header">
                <h1 class="wl-dash__title">
                    {{ t("shell.home.title", "What are you here to do?") }}
                </h1>
                <p class="wl-dash__lede">
                    {{
                        t(
                            "shell.home.dashboard.lede",
                            { count: String(allFeatures.length) },
                            "Search all {count} features, start a map, or open one of the catalogues below.",
                        )
                    }}
                </p>
            </header>

            <!--
                The one search on Home. `ConfigSearchField` brings the anchored regex builder with
                it, bound to this field's own query, mode and flags; the palette is a separate,
                labelled text button rather than a second field that looks the same.
            -->
            <div class="wl-dash__searchRow">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    class="wl-dash__search"
                    density="default"
                    :label="t('shell.home.search.label', 'Search everything')"
                    :placeholder="
                        t('shell.home.search.placeholder', 'Try: mask, backup, Cantonese, publish')
                    "
                    :sample="catalogueSampleText(allFeatures)"
                    :summary="summary"
                />
                <button
                    type="button"
                    class="wl-text-btn wl-dash__palette mb-interactive"
                    @click="emit('openPalette')"
                >
                    <v-icon :icon="mdiConsoleLine" size="18" />
                    <span>{{ t("palette.title", "Command palette") }}</span>
                </button>
            </div>

            <!--
                The hero. One filled button and one text button, nothing else competing: the
                filled one is the thing most people open this page for.
            -->
            <section class="wl-hero" aria-labelledby="wl-dash-hero-title">
                <span class="wl-hero__avatar" aria-hidden="true">
                    <v-icon :icon="mdiMapPlus" size="28" />
                </span>
                <div class="wl-hero__text">
                    <h2 id="wl-dash-hero-title" class="wl-hero__title">
                        {{ makeCatalogue?.title ?? t("shell.home.hero.newMap", "New map") }}
                    </h2>
                    <!--
                        A fresh install gets the welcome sentence; a returning one gets the
                        catalogue's own description. `hasReturningUserContent` decides, once.
                    -->
                    <p v-if="!returning" class="wl-hero__body wl-dash__welcome">
                        {{
                            t(
                                "shell.home.dashboard.welcomeBody",
                                "Nothing is rendered or saved on this machine yet. New map starts one from a world you already have; the guide walks through the whole thing if you would rather be shown.",
                            )
                        }}
                    </p>
                    <p v-else-if="makeCatalogue" class="wl-hero__body">
                        {{ makeCatalogue.blurb }}
                    </p>
                    <div class="wl-dash__actions">
                        <button
                            type="button"
                            class="wl-action wl-action--primary mb-interactive"
                            @click="emit('newMap')"
                        >
                            <v-icon :icon="mdiMapPlus" size="18" />
                            <span>{{ t("shell.home.dashboard.newMap", "New map") }}</span>
                        </button>
                        <button
                            type="button"
                            class="wl-action wl-action--text mb-interactive"
                            @click="emit('walkMeThrough')"
                        >
                            <v-icon :icon="mdiCompassOutline" size="18" />
                            <span>{{ t("shell.home.dashboard.guide", "Walk me through it") }}</span>
                        </button>
                    </div>
                </div>
            </section>

            <!-- Real content, only once there is some. -->
            <div v-if="returning" class="wl-dash__content">
                <section
                    v-if="runningRows.length > 0"
                    class="wl-panel"
                    aria-labelledby="wl-dash-progress-title"
                >
                    <h2 id="wl-dash-progress-title" class="wl-panel__title">
                        {{ t("shell.home.dashboard.inProgress", "In progress") }}
                    </h2>
                    <ul class="wl-render-list">
                        <li v-for="row in runningRows" :key="row.key">
                            <button
                                type="button"
                                class="wl-render-row mb-interactive"
                                @click="emit('openRender', row.key)"
                            >
                                <span class="wl-render-row__text">
                                    <span class="wl-render-row__title">{{ renderTitle(row) }}</span>
                                    <span class="wl-render-row__meta">{{ renderMeta(row) }}</span>
                                </span>
                                <span
                                    class="wl-render-row__bar"
                                    role="progressbar"
                                    :aria-valuenow="displayPercent(row.percent) ?? undefined"
                                    aria-valuemin="0"
                                    aria-valuemax="100"
                                    :aria-label="renderTitle(row)"
                                >
                                    <span
                                        class="wl-render-row__fill"
                                        :class="{
                                            'wl-render-row__fill--indeterminate':
                                                displayPercent(row.percent) === null,
                                        }"
                                        :style="
                                            displayPercent(row.percent) !== null
                                                ? { inlineSize: `${displayPercent(row.percent)}%` }
                                                : undefined
                                        "
                                    />
                                </span>
                                <v-icon :icon="mdiChevronRight" size="18" />
                            </button>
                        </li>
                    </ul>
                    <p v-if="runningOverflow > 0" class="wl-panel__overflow">
                        {{
                            t(
                                "shell.home.dashboard.renderOverflow",
                                { count: String(runningOverflow) },
                                "+{count} more running",
                            )
                        }}
                    </p>
                </section>

                <section
                    v-if="savedProfiles.length > 0"
                    class="wl-panel"
                    aria-labelledby="wl-dash-maps-title"
                >
                    <h2 id="wl-dash-maps-title" class="wl-panel__title">
                        {{ t("shell.home.dashboard.mapsAndServers", "Your maps & servers") }}
                    </h2>
                    <ul class="wl-profile-list">
                        <li v-for="profile in savedProfiles" :key="profile.id">
                            <button
                                type="button"
                                class="wl-profile-row mb-interactive"
                                @click="emit('openMap', profile.id)"
                            >
                                <span class="wl-profile-row__avatar">
                                    <v-icon :icon="mdiServerNetwork" size="18" />
                                </span>
                                <span class="wl-profile-row__text">
                                    <span class="wl-profile-row__title">{{ profile.name }}</span>
                                    <span class="wl-profile-row__meta">{{
                                        profileMeta(profile)
                                    }}</span>
                                </span>
                                <v-icon :icon="mdiChevronRight" size="18" />
                            </button>
                        </li>
                    </ul>
                    <p v-if="savedProfilesOverflow > 0" class="wl-panel__overflow">
                        {{
                            t(
                                "shell.home.dashboard.profileOverflow",
                                { count: String(savedProfilesOverflow) },
                                "+{count} more",
                            )
                        }}
                    </p>
                </section>

                <section
                    v-if="
                        runningRows.length === 0 && savedProfiles.length === 0 && projectCount > 0
                    "
                    class="wl-panel"
                    aria-labelledby="wl-dash-drafts-title"
                >
                    <h2 id="wl-dash-drafts-title" class="wl-panel__title">
                        {{ t("shell.home.dashboard.drafts", "Pick up where you left off") }}
                    </h2>
                    <p class="wl-panel__body">
                        {{
                            t(
                                "shell.home.dashboard.draftsBody",
                                { count: String(projectCount) },
                                "You have {count} project drafts waiting for their first render.",
                            )
                        }}
                    </p>
                    <button
                        type="button"
                        class="wl-text-btn wl-panel__action mb-interactive"
                        @click="emit('newMap')"
                    >
                        <v-icon :icon="mdiFolderMultipleOutline" size="18" />
                        <span>{{ t("shell.home.dashboard.openProjects", "Open projects") }}</span>
                    </button>
                </section>
            </div>

            <!--
                The six catalogues. The grid answers to its own container width rather than the
                window, so the rail's extended and compact widths both get the right column count.
            -->
            <section
                class="wl-dash__catalogues"
                :aria-label="t('shell.home.dashboard.browseAll', 'Browse everything')"
            >
                <div class="wl-card-grid">
                    <article
                        v-for="catalogue in shown"
                        :key="catalogue.id"
                        class="wl-card"
                        :class="{ 'wl-card--empty': searching && catalogue.features.length === 0 }"
                        :data-catalogue="catalogue.id"
                        :aria-labelledby="`wl-dash-card-${catalogue.id}`"
                    >
                        <header class="wl-card__head">
                            <span class="wl-card__avatar" aria-hidden="true">
                                <v-icon :icon="catalogue.definition.icon" size="20" />
                            </span>
                            <span class="wl-card__heading">
                                <h3 :id="`wl-dash-card-${catalogue.id}`" class="wl-card__title">
                                    {{ catalogue.title }}
                                </h3>
                                <span class="wl-card__count">{{ countLabel(catalogue) }}</span>
                            </span>
                        </header>
                        <p class="wl-card__blurb">{{ catalogue.blurb }}</p>

                        <ul v-if="catalogue.features.length > 0" class="wl-card__links">
                            <li v-for="feature in preview(catalogue)" :key="feature.definition.key">
                                <button
                                    type="button"
                                    class="wl-card__link mb-interactive"
                                    :data-feature="feature.definition.key"
                                    :title="feature.blurb"
                                    @click="emit('activateFeature', feature.definition)"
                                >
                                    <v-icon
                                        class="wl-card__linkIcon"
                                        :icon="feature.definition.icon"
                                        size="18"
                                    />
                                    <span class="wl-card__linkLabel">{{ feature.name }}</span>
                                </button>
                            </li>
                        </ul>

                        <div class="wl-card__foot">
                            <!--
                                "Generate and start project" was a second filled button in the
                                hero. It belongs to making a map, so it lives on that card now,
                                tonal, opening the same dialog with the same handler.
                            -->
                            <button
                                v-if="catalogue.id === 'make'"
                                type="button"
                                class="wl-tonal-btn wl-card__generate mb-interactive"
                                @click="openGeneration"
                            >
                                <v-icon :icon="mdiCreationOutline" size="18" />
                                <span>{{ generationLabel }}</span>
                            </button>
                            <button
                                type="button"
                                class="wl-text-btn wl-card__all mb-interactive"
                                @click="emit('openCatalogue', catalogue.id)"
                            >
                                <span>{{ allLabel(catalogue.id) }}</span>
                                <v-icon :icon="mdiArrowRight" size="18" />
                            </button>
                        </div>
                    </article>
                </div>

                <p v-if="searching && matchCount === 0" class="wl-dash__empty" role="status">
                    {{
                        t(
                            "shell.home.search.none",
                            { query },
                            "Nothing matches “{query}”. Try a shorter word, or turn the regular expression off.",
                        )
                    }}
                </p>
            </section>
        </div>
    </div>
</template>

<style scoped>
/*
 * One scroll region, owned here. Every number below is on the 4/8 grid, and every colour,
 * corner, type step and duration is a design-system token - nothing here leans on the
 * prototype sheet's off-grid values.
 */
.wl-dash {
    block-size: 100%;
    overflow-y: auto;
    background: rgb(var(--v-theme-background));
}

.wl-dash__inner {
    max-inline-size: 1000px;
    margin-inline: auto;
    padding: 40px 48px 48px;
    display: flex;
    flex-direction: column;
    gap: 24px;
}

@media (max-width: 900px) {
    .wl-dash__inner {
        padding-inline: 16px;
    }
}

/* -------------------------------------------------------------------------- */
/* Headline                                                                   */
/* -------------------------------------------------------------------------- */

.wl-dash__title {
    margin: 0;
    font-size: var(--md-sys-typescale-headline-large-size);
    line-height: var(--md-sys-typescale-headline-large-line-height);
    font-weight: var(--md-sys-typescale-headline-large-weight);
    letter-spacing: var(--md-sys-typescale-headline-large-tracking);
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-dash__lede {
    margin: 8px 0 0;
    max-inline-size: 64ch;
    font-size: var(--md-sys-typescale-body-large-size);
    line-height: var(--md-sys-typescale-body-large-line-height);
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

/* -------------------------------------------------------------------------- */
/* Search: a 56px pill on surface-container-high                              */
/* -------------------------------------------------------------------------- */

.wl-dash__searchRow {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 16px;
}

.wl-dash__search {
    flex: 1 1 320px;
    min-inline-size: 0;
}

.wl-dash__search :deep(.v-field) {
    min-block-size: 56px;
    border-radius: var(--md-sys-shape-corner-full);
    background: rgb(var(--v-theme-surface-container-high));
    padding-inline: 8px 4px;
}

/* The pill is a filled surface: the outlined variant's border pieces and notch would draw a
   rectangle-in-a-pill. Focus is shown by the outline below instead. */
.wl-dash__search :deep(.v-field__outline) {
    display: none;
}

.wl-dash__search :deep(.v-field--focused) {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 0;
}

.wl-dash__search :deep(.v-field--error) {
    outline: 2px solid rgb(var(--v-theme-error));
}

/* The label stays the field's accessible name, visually replaced by the always-visible
   placeholder, which is what a search pill shows. */
.wl-dash__search :deep(.v-label.v-field-label) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

.wl-dash__search :deep(.v-field input::placeholder) {
    opacity: 1;
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-dash__search :deep(.v-field__input) {
    min-block-size: 56px;
    padding-block: 0;
    align-items: center;
    font-size: var(--md-sys-typescale-body-large-size);
}

.wl-dash__palette {
    flex: 0 0 auto;
    margin-block-start: 4px;
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

.wl-action,
.wl-text-btn,
.wl-tonal-btn {
    min-block-size: 48px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding-inline: 16px 24px;
    border: 0;
    border-radius: var(--md-sys-shape-corner-full);
    background: none;
    font-size: var(--md-sys-typescale-label-large-size);
    line-height: var(--md-sys-typescale-label-large-line-height);
    font-weight: var(--md-sys-typescale-label-large-weight);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--md-sys-motion-duration-short4)
        var(--md-sys-motion-easing-standard);
}

@media (prefers-reduced-motion: reduce) {
    .wl-action,
    .wl-text-btn,
    .wl-tonal-btn {
        transition: none;
    }
}

.wl-action:focus-visible,
.wl-text-btn:focus-visible,
.wl-tonal-btn:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}

.wl-action--primary {
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
    box-shadow: var(--md-sys-elevation-shadow-level0);
}

.wl-action--primary:hover {
    box-shadow: var(--md-sys-elevation-shadow-level1);
}

/* A text button sitting on primary-container takes that surface's own "on" colour. */
.wl-action--text {
    padding-inline: 12px 16px;
    color: rgb(var(--v-theme-on-primary-container));
}

.wl-action--text:hover {
    background: rgba(var(--v-theme-on-primary-container), 0.08);
}

.wl-text-btn {
    padding-inline: 12px 16px;
    color: rgb(var(--v-theme-primary));
}

.wl-text-btn:hover {
    background: rgba(var(--v-theme-primary), 0.08);
}

.wl-tonal-btn {
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.wl-tonal-btn:hover {
    box-shadow: var(--md-sys-elevation-shadow-level1);
}

/*
 * Regression: v2-09-rail-7-jobs-320.png captured a real horizontal scrollbar on the Home page
 * body at a 320px window - the hero's action row was the cause. Below 600px the row stacks:
 * full width, one button per line, so `white-space: nowrap` labels can never push the page
 * sideways.
 */
@media (max-width: 600px) {
    .wl-dash__actions {
        flex-direction: column;
        align-items: stretch;
    }

    .wl-action {
        inline-size: 100%;
        justify-content: center;
    }
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

.wl-hero {
    display: flex;
    align-items: flex-start;
    gap: 24px;
    padding: 32px;
    border-radius: var(--md-sys-shape-corner-extra-large);
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

@media (max-width: 600px) {
    .wl-hero {
        flex-direction: column;
        gap: 16px;
        padding: 24px 16px;
    }
}

.wl-hero__avatar {
    flex: 0 0 56px;
    inline-size: 56px;
    block-size: 56px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-large);
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
}

.wl-hero__text {
    flex: 1 1 auto;
    min-inline-size: 0;
}

.wl-hero__title {
    margin: 0;
    font-size: var(--md-sys-typescale-headline-small-size);
    line-height: var(--md-sys-typescale-headline-small-line-height);
    font-weight: var(--md-sys-typescale-headline-small-weight);
    letter-spacing: var(--md-sys-typescale-headline-small-tracking);
    overflow-wrap: anywhere;
}

.wl-hero__body {
    margin: 8px 0 0;
    max-inline-size: 64ch;
    font-size: var(--md-sys-typescale-body-large-size);
    line-height: var(--md-sys-typescale-body-large-line-height);
    text-wrap: pretty;
}

.wl-dash__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 24px;
}

/* -------------------------------------------------------------------------- */
/* Real content                                                               */
/* -------------------------------------------------------------------------- */

.wl-dash__content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
    gap: 16px;
}

.wl-panel {
    min-inline-size: 0;
    border-radius: var(--md-sys-shape-corner-large);
    border: 1px solid rgb(var(--v-theme-outline-variant));
    background: rgb(var(--v-theme-surface-container));
    padding: 16px;
}

.wl-panel__title {
    margin: 0 0 8px;
    font-size: var(--md-sys-typescale-title-medium-size);
    line-height: var(--md-sys-typescale-title-medium-line-height);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    color: rgb(var(--v-theme-on-surface));
}

.wl-panel__body {
    margin: 0 0 8px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-panel__action {
    margin-inline-start: -12px;
}

.wl-panel__overflow {
    margin: 8px 0 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-render-list,
.wl-profile-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.wl-render-row,
.wl-profile-row {
    inline-size: 100%;
    min-block-size: 48px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px;
    border: 0;
    border-radius: var(--md-sys-shape-corner-medium);
    background: none;
    color: inherit;
    text-align: start;
    cursor: pointer;
}

.wl-render-row:hover,
.wl-profile-row:hover {
    background: rgb(var(--v-theme-surface-container-high));
}

.wl-render-row:focus-visible,
.wl-profile-row:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.wl-render-row__text,
.wl-profile-row__text {
    flex: 1 1 auto;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.wl-render-row__title,
.wl-profile-row__title {
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-render-row__meta,
.wl-profile-row__meta {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-on-surface-variant));
    overflow-wrap: anywhere;
}

.wl-render-row__bar {
    flex: 0 0 96px;
    inline-size: 96px;
    block-size: 4px;
    border-radius: var(--md-sys-shape-corner-full);
    background: rgb(var(--v-theme-surface-container-highest));
    overflow: hidden;
}

@media (max-width: 560px) {
    .wl-render-row__bar {
        display: none;
    }
}

.wl-render-row__fill {
    display: block;
    block-size: 100%;
    border-radius: var(--md-sys-shape-corner-full);
    background: rgb(var(--v-theme-primary));
}

.wl-render-row__fill--indeterminate {
    inline-size: 40%;
    /* material-exempt: an indeterminate sweep is a progress signal, not a transition; its period is longer than the motion ladder by design. */
    animation: wl-indeterminate 1.4s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
    .wl-render-row__fill--indeterminate {
        animation: none;
        inline-size: 60%;
    }
}

@keyframes wl-indeterminate {
    0% {
        margin-inline-start: 0%;
    }
    50% {
        margin-inline-start: 60%;
    }
    100% {
        margin-inline-start: 0%;
    }
}

.wl-profile-row__avatar {
    flex: 0 0 32px;
    inline-size: 32px;
    block-size: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

/* -------------------------------------------------------------------------- */
/* Catalogue cards                                                            */
/* -------------------------------------------------------------------------- */

/* The grid's column count follows this section's own width, not the window's. */
.wl-dash__catalogues {
    container: home-catalogues / inline-size;
}

.wl-card-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
}

@container home-catalogues (min-width: 520px) {
    .wl-card-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@container home-catalogues (min-width: 840px) {
    .wl-card-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
}

.wl-card {
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-radius: var(--md-sys-shape-corner-large);
    border: 1px solid rgb(var(--v-theme-outline-variant));
    background: rgb(var(--v-theme-surface-container));
    color: rgb(var(--v-theme-on-surface));
}

.wl-card__head {
    display: flex;
    align-items: center;
    gap: 12px;
    min-inline-size: 0;
}

.wl-card__avatar {
    flex: 0 0 40px;
    inline-size: 40px;
    block-size: 40px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.wl-card__heading {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
}

.wl-card__title {
    margin: 0;
    font-size: var(--md-sys-typescale-title-medium-size);
    line-height: var(--md-sys-typescale-title-medium-line-height);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking);
    overflow-wrap: anywhere;
}

.wl-card__count {
    font-size: var(--md-sys-typescale-label-medium-size);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    letter-spacing: var(--md-sys-typescale-label-medium-tracking);
    color: rgb(var(--v-theme-on-surface-variant));
    white-space: nowrap;
}

.wl-card__blurb {
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-card__links {
    list-style: none;
    margin: 0 -8px;
    padding: 0;
    display: flex;
    flex-direction: column;
}

.wl-card__link {
    inline-size: 100%;
    min-block-size: 40px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border: 0;
    border-radius: var(--md-sys-shape-corner-small);
    background: none;
    color: rgb(var(--v-theme-on-surface));
    text-align: start;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    cursor: pointer;
}

.wl-card__link:hover {
    background: rgb(var(--v-theme-surface-container-high));
}

.wl-card__link:hover .wl-card__linkLabel {
    text-decoration: underline;
}

.wl-card__link:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.wl-card__linkIcon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
}

.wl-card__linkLabel {
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

.wl-card__foot {
    margin-block-start: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.wl-card__all {
    margin-inline-start: -12px;
}

/* The bilingual label carries a line break between its two languages. */
.wl-card__generate {
    white-space: pre-line;
    text-align: start;
    max-inline-size: 100%;
}

.wl-dash__empty {
    margin: 16px 0 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
