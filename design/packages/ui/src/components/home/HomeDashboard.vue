<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiChevronRight,
    mdiCompassOutline,
    mdiFolderMultipleOutline,
    mdiMagnify,
    mdiMapPlus,
    mdiServerNetwork,
} from "@mdi/js";
import { VIcon } from "vuetify/components";
import { profilesStore, isLocalProfile } from "../../stores/profiles.js";
import { productDisplayName } from "../../stores/productName.js";
import { resolveMeta, type CatalogueMetaSources } from "../shell/catalogueMeta.js";
import { resolveCatalogues, type ResolvedCatalogue } from "../shell/catalogueSearch.js";
import type { CatalogueId } from "../shell/featureTargets.js";
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
 * Home, rebuilt around what is actually happening rather than what could theoretically happen.
 *
 * The two things this replaces - `HomeScreen.vue` and `HomeCatalogues.vue` - are both, at heart,
 * an index: a big list of every capability, grouped and searchable. An index is what a
 * documentation site is, and that reading is exactly the complaint this rewrite answers. Neither
 * component is deleted; both stay in the tree, unreferenced, so reverting this file is a one-line
 * change in `App.vue` rather than a recovery project. The old layout is also tagged
 * `homepage-catalogues-v1` for the same reason.
 *
 * ### The shape
 *
 * A first-time install with nothing saved gets a genuinely different screen: one welcome, one
 * obvious next step, no rows of anything because there is nothing to show a row of.
 * `hasReturningUserContent` decides that once, from real data, and the template branches on the
 * result rather than rendering every section and letting it read empty.
 *
 * A returning install gets three big actions up top - the only three a person opens this page
 * for often enough to deserve a full-size button - and then real content: renders that are
 * actually moving right now with an actual progress bar, and the maps and servers this machine
 * actually knows about, each one openable directly rather than described in a paragraph.
 *
 * Discoverability of the other ~80 features does not disappear; it moves. The command palette
 * already reaches every one of them, and every settings surface already carries its own regex
 * search. What Home keeps is one row of six catalogue names at the very bottom, each one line,
 * so "what else does this do" is a click away without being the layout.
 */
const props = withDefaults(
    defineProps<{
        /** Live values for the catalogue-strip meta and project/render counts. */
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
    /** The compact catalogue strip at the foot of the page. */
    openCatalogue: [id: CatalogueId];
}>();

const { t } = useI18n();

const productName = productDisplayName;

const projectCount = computed(() => props.metaSources.projectCount ?? 0);

const runningRows = computed(() => inProgressRenders(props.renderRows));
const runningOverflow = computed(() => inProgressRendersOverflow(props.renderRows));

const savedProfiles = computed(() => recentProfiles(profilesStore.profiles));
const savedProfilesOverflow = computed(() => recentProfilesOverflow(profilesStore.profiles));

const returning = computed(() =>
    hasReturningUserContent(profilesStore.profiles, props.renderRows, projectCount.value),
);

/** The six catalogues, reduced to just what the footer strip needs: id, title, icon. */
const catalogues = computed<readonly ResolvedCatalogue[]>(() =>
    resolveCatalogues(
        t as never,
        (feature) => resolveMeta(feature.metaResolver, props.metaSources, t as never),
        props.restrictedModeActive,
    ),
);

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
                <p class="wl-dash__overline">{{ productName }}</p>
                <h1 class="wl-dash__title">
                    {{
                        returning
                            ? t("shell.home.dashboard.titleReturning", "Welcome back")
                            : t("shell.home.dashboard.titleFresh", "Let's make your first map")
                    }}
                </h1>
            </header>

            <!--
                Three actions and they are the whole navigational weight of the top of this page.
                "New map" is filled because it is the one thing most people are here for; the
                other two are outlined so they read as options rather than competing primaries.
            -->
            <div class="wl-dash__actions">
                <button type="button" class="wl-action wl-action--primary mb-interactive" @click="emit('newMap')">
                    <v-icon :icon="mdiMapPlus" size="20" />
                    <span>{{ t("shell.home.dashboard.newMap", "New map") }}</span>
                </button>
                <button
                    type="button"
                    class="wl-action mb-interactive"
                    @click="emit('walkMeThrough')"
                >
                    <v-icon :icon="mdiCompassOutline" size="20" />
                    <span>{{ t("shell.home.dashboard.guide", "Walk me through it") }}</span>
                </button>
                <button type="button" class="wl-action mb-interactive" @click="emit('openPalette')">
                    <v-icon :icon="mdiMagnify" size="20" />
                    <span>{{ t("shell.home.dashboard.search", "Search everything") }}</span>
                </button>
            </div>

            <!--
                Nothing yet: no cards, no rows, no counts. `hasReturningUserContent` is what
                decides this, and it is decided once from real data rather than the layout
                showing three empty sections and hoping that reads as "nothing yet" on its own.
            -->
            <p v-if="!returning" class="wl-dash__welcome">
                {{
                    t(
                        "shell.home.dashboard.welcomeBody",
                        "Nothing is rendered or saved on this machine yet. New map starts one from a world you already have; the guide walks through the whole thing if you would rather be shown.",
                    )
                }}
            </p>

            <!-- Real content, only once there is some. -->
            <div v-else class="wl-dash__content">
                <section v-if="runningRows.length > 0" class="wl-panel" aria-labelledby="wl-dash-progress-title">
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
                                        :class="{ 'wl-render-row__fill--indeterminate': displayPercent(row.percent) === null }"
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
                                    <span class="wl-profile-row__meta">{{ profileMeta(profile) }}</span>
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
                    v-if="runningRows.length === 0 && savedProfiles.length === 0 && projectCount > 0"
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
                    <button type="button" class="wl-action mb-interactive" @click="emit('newMap')">
                        <v-icon :icon="mdiFolderMultipleOutline" size="18" />
                        <span>{{ t("shell.home.dashboard.openProjects", "Open projects") }}</span>
                    </button>
                </section>
            </div>

            <!--
                Everything else, in one line. Discoverability did not go away - the palette and
                every settings search already reach all of it - this is just no longer the
                layout's whole reason to exist.
            -->
            <nav
                class="wl-dash__catalogueStrip"
                :aria-label="t('shell.home.dashboard.browseAll', 'Browse everything')"
            >
                <button
                    v-for="catalogue in catalogues"
                    :key="catalogue.id"
                    type="button"
                    class="wl-strip-chip mb-interactive"
                    @click="emit('openCatalogue', catalogue.id)"
                >
                    <v-icon :icon="catalogue.definition.icon" size="16" />
                    <span>{{ catalogue.title }}</span>
                </button>
            </nav>
        </div>
    </div>
</template>

<style scoped>
.wl-dash {
    block-size: 100%;
    overflow-y: auto;
    background: rgb(var(--v-theme-background));
}

.wl-dash__inner {
    max-inline-size: 860px;
    margin-inline: auto;
    padding: 40px 48px 48px;
}

@media (max-width: 900px) {
    .wl-dash__inner {
        padding-inline: 20px;
    }
}

.wl-dash__overline {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant)));
}

.wl-dash__title {
    margin: 8px 0 24px;
    font-size: 2rem;
    line-height: 40px;
    font-weight: 400;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

/* -------------------------------------------------------------------------- */
/* Primary actions                                                            */
/* -------------------------------------------------------------------------- */

.wl-dash__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-block-end: 8px;
}

.wl-action {
    min-block-size: 48px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding-inline: 20px;
    border-radius: var(--md-sys-shape-corner-full, 999px);
    border: 1px solid rgb(var(--v-theme-outline-variant));
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-surface));
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
}

.wl-action:hover {
    background: rgb(var(--v-theme-surface-container-high, var(--v-theme-surface-container)));
}

.wl-action:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}

.wl-action--primary {
    border-color: transparent;
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
}

.wl-action--primary:hover {
    background: rgb(var(--v-theme-primary));
    opacity: 0.92;
}

/*
 * Regression: v2-09-rail-7-jobs-320.png captured a real horizontal scrollbar on the Home page
 * body at a 320px window - this row of three buttons was the cause. `flex-wrap: wrap` alone
 * was not a strong enough guarantee at the narrowest supported width, where even one button
 * wrapping onto its own line still leaves three buttons' worth of `white-space: nowrap` content
 * width in play. Below 600px the row stops wrapping and stacks instead: full width, one button
 * per line, which is the M3 pattern this project already uses elsewhere for a primary-action
 * row that cannot fit its siblings (see `AppSettings.vue`'s own single-column collapse).
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
/* First-run welcome                                                          */
/* -------------------------------------------------------------------------- */

.wl-dash__welcome {
    margin: 24px 0 0;
    max-inline-size: 62ch;
    font-size: 0.9375rem;
    line-height: 22px;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

/* -------------------------------------------------------------------------- */
/* Real content                                                               */
/* -------------------------------------------------------------------------- */

.wl-dash__content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-block-start: 32px;
}

.wl-panel {
    border-radius: var(--md-sys-shape-corner-lg, 16px);
    border: 1px solid rgb(var(--v-theme-outline-variant));
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    padding: 20px;
}

.wl-panel__title {
    margin: 0 0 12px;
    font-size: 1rem;
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
}

.wl-panel__body {
    margin: 0 0 14px;
    font-size: 0.875rem;
    line-height: 21px;
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-panel__overflow {
    margin: 10px 0 0;
    font-size: 0.8125rem;
    color: rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant)));
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
    gap: 14px;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: inherit;
    text-align: start;
    cursor: pointer;
}

.wl-render-row:hover,
.wl-profile-row:hover {
    background: rgb(var(--v-theme-surface-container-high, var(--v-theme-surface-container)));
}

.wl-render-row:focus-visible,
.wl-profile-row:focus-visible {
    outline: 2px solid currentColor;
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
    font-size: 0.875rem;
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-render-row__meta,
.wl-profile-row__meta {
    font-size: 0.75rem;
    color: rgb(var(--v-theme-on-surface-variant));
    overflow-wrap: anywhere;
}

.wl-render-row__bar {
    flex: 0 0 96px;
    inline-size: 96px;
    block-size: 6px;
    border-radius: 999px;
    background: rgb(var(--v-theme-surface-variant));
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
    border-radius: 999px;
    background: rgb(var(--v-theme-primary));
}

.wl-render-row__fill--indeterminate {
    inline-size: 40%;
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
    border-radius: var(--md-sys-shape-corner-md, 12px);
    background: rgb(var(--v-theme-secondary-container, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-secondary-container, var(--v-theme-on-surface)));
}

/* -------------------------------------------------------------------------- */
/* Foot strip                                                                 */
/* -------------------------------------------------------------------------- */

.wl-dash__catalogueStrip {
    margin-block-start: 40px;
    padding-block-start: 20px;
    border-block-start: 1px solid rgb(var(--v-theme-outline-variant));
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.wl-strip-chip {
    min-block-size: 44px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding-inline: 14px;
    border-radius: var(--md-sys-shape-corner-full, 999px);
    border: 1px solid rgb(var(--v-theme-outline-variant));
    background: none;
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: 0.8125rem;
    cursor: pointer;
    white-space: nowrap;
}

.wl-strip-chip:hover {
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-surface));
}

.wl-strip-chip:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}
</style>
