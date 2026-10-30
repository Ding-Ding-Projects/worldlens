<script setup lang="ts">
import GenerationEntry from "../mcserver/GenerationEntry.vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiBookOpenPageVariantOutline, mdiChevronRight, mdiServerNetwork } from "@mdi/js";
import {
    VBtn,
    VCard,
    VChip,
    VDivider,
    VIcon,
    VListItem,
    VProgressLinear,
} from "vuetify/components";
import { ALL_DESCRIPTORS, CLI_FLAGS } from "@worldlens/config";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { DOCS_ARTICLES } from "../docs/docsContent.js";
import { profilesStore, isLocalProfile } from "../../stores/profiles.js";
import { productDisplayName } from "../../stores/productName.js";
import { resolveMeta, type CatalogueMetaSources } from "../shell/catalogueMeta.js";
import {
    catalogueSampleText,
    createCatalogueMatcher,
    filterFeatures,
    findMatchRange,
    flattenFeatures,
    groupFeatures,
    resolveCatalogues,
    type ResolvedCatalogue,
    type ResolvedFeature,
} from "../shell/catalogueSearch.js";
import type {
    CatalogueFeatureDefinition,
    CatalogueId,
    FeatureTarget,
} from "../shell/featureTargets.js";
import type { ActiveRenderRow } from "../renders/activeRenders.js";
import { catalogueTone, requestCatalogueGroup } from "./catalogueTone.js";
import {
    displayPercent,
    hasReturningUserContent,
    inProgressRenders,
    inProgressRendersOverflow,
    recentProfiles,
    recentProfilesOverflow,
} from "./homeDashboardModel.js";

/**
 * Home: the approved prototype's "What are you here to do?" page.
 *
 * ### The shape
 *
 * An overline with the product's own name, the question, and one paragraph carrying the live
 * feature count. Under it, one search field that reaches every catalogue feature, every
 * configuration setting and every bundled article, with the regex builder anchored inside it.
 * Then the six catalogues: Make a map as a full-width hero on `primary-container` with its two
 * actions and one chip per group, and the other five as two-column cards, each naming its first
 * four features.
 *
 * ### Every visible name is a real control
 *
 * The card header opens the catalogue page; each of the four feature names under it activates
 * that feature through the same `activateFeature` path the catalogue page uses; each hero chip
 * opens Make a map scrolled to that group. A pointer press anywhere else on a card opens its
 * catalogue too, and the header is the keyboard and screen-reader equivalent of that press, so no
 * control is nested inside another one's accessible role.
 *
 * ### What is happening on this machine
 *
 * The prototype draws no panel for renders in progress, saved maps or project drafts. They stay,
 * below the catalogue cards under "On this machine", together with "Generate and start project"
 * and the command palette, because each of them is a real route somebody may already depend on.
 * `hasReturningUserContent` still decides whether the panels render at all, so a fresh install
 * gets the actions without three empty boxes.
 */
const props = withDefaults(
    defineProps<{
        /** Live values for the catalogue meta and the project and map counts. */
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
    /** A catalogue card or hero chip. */
    openCatalogue: [id: CatalogueId];
    /** A feature name on a card or in the search results. */
    activateFeature: [feature: CatalogueFeatureDefinition];
    /** A setting or an article in the search results, which has a target but no manifest row. */
    activateTarget: [target: FeatureTarget];
}>();

const { t } = useI18n();

const productName = productDisplayName;

/* -------------------------------------------------------------------------- */
/* Catalogues                                                                 */
/* -------------------------------------------------------------------------- */

const catalogues = computed<readonly ResolvedCatalogue[]>(() =>
    resolveCatalogues(
        t as never,
        (feature) => resolveMeta(feature.metaResolver, props.metaSources, t as never),
        props.restrictedModeActive,
    ),
);

const allFeatures = computed(() => flattenFeatures(catalogues.value));

/** Named rather than indexed, so reordering the manifest cannot promote another card to hero. */
const hero = computed(() => catalogues.value.find((catalogue) => catalogue.id === "make") ?? null);
const cards = computed(() => catalogues.value.filter((catalogue) => catalogue.id !== "make"));

/** Make a map's own groups, in the order its page lists them, with their live row counts. */
const heroGroups = computed(() => (hero.value === null ? [] : groupFeatures(hero.value)));

/** At most four. A card that listed everything would be the catalogue page again. */
function preview(catalogue: ResolvedCatalogue): readonly ResolvedFeature[] {
    return catalogue.features.slice(0, 4);
}

function countLabel(catalogue: ResolvedCatalogue): string {
    const features = t(
        "shell.home.card.count",
        { count: String(catalogue.features.length) },
        "{count} features",
    );
    const maps = props.metaSources.profileCount ?? 0;
    if (catalogue.id !== "maps" || maps === 0) return features;
    return `${features} · ${t("shell.home.card.mapsCount", { count: String(maps) }, "{count} maps")}`;
}

function openGroup(groupKey: string): void {
    requestCatalogueGroup("make", groupKey);
    emit("openCatalogue", "make");
}

/* -------------------------------------------------------------------------- */
/* Search: features, settings and articles                                    */
/* -------------------------------------------------------------------------- */

interface SettingEntry {
    readonly key: string;
    readonly name: string;
    readonly where: string;
    readonly blurb: string;
    readonly screen: string;
}

const SCREEN_FOR_FILE: Readonly<Record<string, string>> = {
    core: "core",
    webapp: "webapp",
    webserver: "webserver",
    plugin: "plugin",
    map: "maps",
    "storage-file": "storages",
    "storage-sql": "storages",
};

/**
 * Every BlueMap setting the options editor renders - each config file's fields, plus the run
 * flags - which is the same corpus and the same count the "Options editor" row's meta reports.
 */
const SETTINGS: readonly SettingEntry[] = [
    ...ALL_DESCRIPTORS.flatMap((descriptor) =>
        descriptor.fields.map((field) => ({
            key: `${descriptor.id}:${field.path}`,
            name: field.label,
            where: `${descriptor.title} · ${field.path}`,
            blurb: field.doc,
            screen: SCREEN_FOR_FILE[descriptor.id] ?? "core",
        })),
    ),
    ...CLI_FLAGS.map((flag) => ({
        key: `run:${flag.long}`,
        name: flag.label,
        where: `--${flag.long}`,
        blurb: flag.description,
        screen: "run",
    })),
];

/** How many rows of each kind the results show before saying how many more there are. */
const RESULT_LIMIT = 8;

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createCatalogueMatcher(query.value, regexMode.value, flags.value));
const searching = computed(() => matcher.value.active);

const featureHits = computed(() => filterFeatures(allFeatures.value, matcher.value));
const settingHits = computed(() =>
    searching.value
        ? SETTINGS.filter((entry) =>
              matcher.value.test(`${entry.name}\n${entry.where}\n${entry.blurb}`),
          )
        : [],
);
const articleHits = computed(() =>
    searching.value
        ? DOCS_ARTICLES.filter((article) => matcher.value.test(`${article.title}\n${article.id}`))
        : [],
);

const totalHits = computed(
    () => featureHits.value.length + settingHits.value.length + articleHits.value.length,
);

const countsLabel = computed(() =>
    t(
        "shell.home.search.counts",
        {
            features: String(allFeatures.value.length),
            settings: String(SETTINGS.length),
            articles: String(DOCS_ARTICLES.length),
        },
        "{features} features · {settings} settings · {articles} articles",
    ),
);

const summary = computed(() =>
    searching.value
        ? t(
              "shell.home.search.summary",
              { shown: String(featureHits.value.length), total: String(allFeatures.value.length) },
              "{shown} of {total} features",
          )
        : "",
);

const searchSample = computed(() => catalogueSampleText(allFeatures.value));

function more(count: number): string {
    return t("shell.home.results.more", { count: String(count) }, "+{count} more");
}

/** Text nodes around the matched range - never `v-html`, since the query is user-typed. */
function segments(text: string): readonly { readonly text: string; readonly hit: boolean }[] {
    const range = searching.value
        ? findMatchRange(text, query.value, regexMode.value, flags.value)
        : null;
    if (range === null) return [{ text, hit: false }];
    const [start, end] = range;
    if (start < 0 || end <= start || end > text.length) return [{ text, hit: false }];
    return [
        { text: text.slice(0, start), hit: false },
        { text: text.slice(start, end), hit: true },
        { text: text.slice(end), hit: false },
    ].filter((part) => part.text.length > 0);
}

function openSetting(entry: SettingEntry): void {
    emit("activateTarget", { kind: "overlay", overlay: "config", reveal: entry.screen });
}

function openArticle(articleId: string): void {
    emit("activateTarget", { kind: "docs", articleId });
}

/* -------------------------------------------------------------------------- */
/* On this machine                                                            */
/* -------------------------------------------------------------------------- */

const projectCount = computed(() => props.metaSources.projectCount ?? 0);

const runningRows = computed(() => inProgressRenders(props.renderRows));
const runningOverflow = computed(() => inProgressRendersOverflow(props.renderRows));

const savedProfiles = computed(() => recentProfiles(profilesStore.profiles));
const savedProfilesOverflow = computed(() => recentProfilesOverflow(profilesStore.profiles));

const returning = computed(() =>
    hasReturningUserContent(profilesStore.profiles, props.renderRows, projectCount.value),
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
                    {{ t("shell.home.title", "What are you here to do?") }}
                </h1>
                <p class="wl-dash__lede">
                    {{
                        t(
                            "shell.home.lede",
                            { count: String(allFeatures.length) },
                            "All {count} things this application does live in one of the six catalogues below, grouped by the job they belong to. Nothing is hidden behind a menu you have to already know about, and every catalogue opens a page that names everything in it, one line each.",
                        )
                    }}
                </p>
            </header>

            <!--
                The shared search field, so the anchored regex builder is the same one every other
                search bar here opens. The counts sit inside it, before the builder, as in the
                approved design.
            -->
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                class="wl-dash__search"
                density="default"
                :label="
                    t('shell.home.search.everything', 'Search every feature, setting and article')
                "
                :sample="searchSample"
                :summary="summary"
            >
                <template #meta>
                    <span class="wl-dash__search-meta">{{ countsLabel }}</span>
                </template>
            </ConfigSearchField>

            <!-- Search results replace the cards while a query is active. -->
            <div v-if="searching" class="wl-results" role="region" :aria-label="summary">
                <section v-if="featureHits.length > 0" class="wl-results__group">
                    <div class="wl-section-head">
                        <h2 class="wl-section-head__name">
                            {{ t("shell.home.results.features", "Features") }}
                        </h2>
                        <v-divider class="wl-section-head__rule" />
                        <span class="wl-section-head__count">{{ featureHits.length }}</span>
                    </div>
                    <ul class="wl-rows">
                        <li
                            v-for="feature in featureHits.slice(0, RESULT_LIMIT)"
                            :key="feature.definition.key"
                        >
                            <v-list-item
                                class="wl-result wl-plain mb-interactive"
                                rounded="0"
                                role="button"
                                link
                                :ripple="false"
                                @click="emit('activateFeature', feature.definition)"
                            >
                                <template #prepend>
                                    <span class="wl-row-tile">
                                        <v-icon :icon="feature.definition.icon" size="20" />
                                    </span>
                                </template>
                                <span class="wl-result__name">
                                    <template
                                        v-for="(part, index) in segments(feature.name)"
                                        :key="index"
                                    >
                                        <mark v-if="part.hit" class="wl-hit">{{ part.text }}</mark>
                                        <template v-else>{{ part.text }}</template>
                                    </template>
                                </span>
                                <span class="wl-result__meta"
                                    >{{ feature.catalogueTitle }} · {{ feature.group }}</span
                                >
                                <span class="wl-result__blurb">{{ feature.blurb }}</span>
                                <template #append>
                                    <v-icon class="wl-chevron" :icon="mdiChevronRight" size="20" />
                                </template>
                            </v-list-item>
                        </li>
                    </ul>
                    <p v-if="featureHits.length > RESULT_LIMIT" class="wl-results__more">
                        {{ more(featureHits.length - RESULT_LIMIT) }}
                    </p>
                </section>

                <section v-if="settingHits.length > 0" class="wl-results__group">
                    <div class="wl-section-head">
                        <h2 class="wl-section-head__name">
                            {{ t("shell.home.results.settings", "Settings") }}
                        </h2>
                        <v-divider class="wl-section-head__rule" />
                        <span class="wl-section-head__count">{{ settingHits.length }}</span>
                    </div>
                    <ul class="wl-rows">
                        <li v-for="entry in settingHits.slice(0, RESULT_LIMIT)" :key="entry.key">
                            <v-list-item
                                class="wl-result wl-plain mb-interactive"
                                rounded="0"
                                role="button"
                                link
                                :ripple="false"
                                @click="openSetting(entry)"
                            >
                                <template #prepend>
                                    <span class="wl-row-tile">
                                        <v-icon :icon="catalogueTone('setup').icon" size="20" />
                                    </span>
                                </template>
                                <span class="wl-result__name">
                                    <template
                                        v-for="(part, index) in segments(entry.name)"
                                        :key="index"
                                    >
                                        <mark v-if="part.hit" class="wl-hit">{{ part.text }}</mark>
                                        <template v-else>{{ part.text }}</template>
                                    </template>
                                </span>
                                <span class="wl-result__meta wl-result__meta--mono">{{
                                    entry.where
                                }}</span>
                                <template #append>
                                    <v-icon class="wl-chevron" :icon="mdiChevronRight" size="20" />
                                </template>
                            </v-list-item>
                        </li>
                    </ul>
                    <p v-if="settingHits.length > RESULT_LIMIT" class="wl-results__more">
                        {{ more(settingHits.length - RESULT_LIMIT) }}
                    </p>
                </section>

                <section v-if="articleHits.length > 0" class="wl-results__group">
                    <div class="wl-section-head">
                        <h2 class="wl-section-head__name">
                            {{ t("shell.home.results.articles", "Articles") }}
                        </h2>
                        <v-divider class="wl-section-head__rule" />
                        <span class="wl-section-head__count">{{ articleHits.length }}</span>
                    </div>
                    <ul class="wl-rows">
                        <li v-for="article in articleHits.slice(0, RESULT_LIMIT)" :key="article.id">
                            <v-list-item
                                class="wl-result wl-plain mb-interactive"
                                rounded="0"
                                role="button"
                                link
                                :ripple="false"
                                @click="openArticle(article.id)"
                            >
                                <template #prepend>
                                    <span class="wl-row-tile">
                                        <v-icon :icon="mdiBookOpenPageVariantOutline" size="20" />
                                    </span>
                                </template>
                                <span class="wl-result__name">
                                    <template
                                        v-for="(part, index) in segments(article.title)"
                                        :key="index"
                                    >
                                        <mark v-if="part.hit" class="wl-hit">{{ part.text }}</mark>
                                        <template v-else>{{ part.text }}</template>
                                    </template>
                                </span>
                                <span class="wl-result__meta wl-result__meta--mono">{{
                                    article.file
                                }}</span>
                                <template #append>
                                    <v-icon class="wl-chevron" :icon="mdiChevronRight" size="20" />
                                </template>
                            </v-list-item>
                        </li>
                    </ul>
                    <p v-if="articleHits.length > RESULT_LIMIT" class="wl-results__more">
                        {{ more(articleHits.length - RESULT_LIMIT) }}
                    </p>
                </section>

                <p v-if="totalHits === 0" class="wl-results__empty" role="status">
                    {{
                        t(
                            "shell.home.search.none",
                            { query },
                            "Nothing matches “{query}”. Try a shorter word, or turn the regular expression off.",
                        )
                    }}
                </p>
            </div>

            <!--
                The six catalogues: the hero spans both columns, the other five sit two by two.
                A fixed two rather than an auto-fit, so the hero never gains a sibling beside it.
            -->
            <div v-else class="wl-dash__grid">
                <v-card
                    v-if="hero"
                    class="wl-hero"
                    color="primary-container"
                    variant="flat"
                    :ripple="false"
                    @click="emit('openCatalogue', hero.id)"
                >
                    <div class="wl-hero__row">
                        <div class="wl-hero__main">
                            <v-list-item
                                class="wl-hero__head wl-plain mb-interactive"
                                role="button"
                                link
                                :ripple="false"
                                :aria-label="hero.title"
                                @click.stop="emit('openCatalogue', hero.id)"
                            >
                                <template #prepend>
                                    <span class="wl-tile wl-tile--hero wl-tile--primary">
                                        <v-icon :icon="catalogueTone('make').icon" size="30" />
                                    </span>
                                </template>
                                <span class="wl-hero__title">{{ hero.title }}</span>
                                <span class="wl-hero__blurb">{{ hero.blurb }}</span>
                            </v-list-item>
                            <div
                                class="wl-hero__chips"
                                role="group"
                                :aria-label="t('shell.home.hero.sections', 'What is inside')"
                            >
                                <v-chip
                                    v-for="group in heroGroups"
                                    :key="group.key"
                                    class="wl-hero__chip mb-interactive"
                                    variant="outlined"
                                    size="small"
                                    :ripple="false"
                                    @click.stop="openGroup(group.key)"
                                >
                                    {{ group.heading }} · {{ group.features.length }}
                                </v-chip>
                            </div>
                        </div>
                        <div class="wl-hero__actions">
                            <v-btn
                                class="wl-action wl-action--primary mb-interactive"
                                variant="flat"
                                size="large"
                                @click.stop="emit('newMap')"
                            >
                                {{ t("shell.home.hero.newMap", "New map") }}
                            </v-btn>
                            <v-btn
                                class="wl-action wl-action--secondary mb-interactive"
                                variant="outlined"
                                @click.stop="emit('walkMeThrough')"
                            >
                                {{ t("shell.home.hero.guide", "Or walk me through it") }}
                            </v-btn>
                        </div>
                    </div>
                </v-card>

                <v-card
                    v-for="catalogue in cards"
                    :key="catalogue.id"
                    class="wl-card"
                    variant="flat"
                    :ripple="false"
                    @click="emit('openCatalogue', catalogue.id)"
                >
                    <v-list-item
                        class="wl-card__head wl-plain mb-interactive"
                        role="button"
                        link
                        :ripple="false"
                        @click.stop="emit('openCatalogue', catalogue.id)"
                    >
                        <template #prepend>
                            <span
                                class="wl-tile"
                                :class="`wl-tile--${catalogueTone(catalogue.id).tile}`"
                            >
                                <v-icon :icon="catalogueTone(catalogue.id).icon" size="22" />
                            </span>
                        </template>
                        <span class="wl-card__title">{{ catalogue.title }}</span>
                        <template #append>
                            <span class="wl-card__count">{{ countLabel(catalogue) }}</span>
                        </template>
                    </v-list-item>
                    <p class="wl-card__blurb">{{ catalogue.blurb }}</p>
                    <ul class="wl-card__features">
                        <li v-for="feature in preview(catalogue)" :key="feature.definition.key">
                            <v-list-item
                                class="wl-card__feature wl-plain mb-interactive"
                                role="button"
                                link
                                density="compact"
                                :ripple="false"
                                @click.stop="emit('activateFeature', feature.definition)"
                            >
                                <template #prepend>
                                    <v-icon class="wl-chevron" :icon="mdiChevronRight" size="16" />
                                </template>
                                {{ feature.name }}
                            </v-list-item>
                        </li>
                    </ul>
                </v-card>
            </div>

            <!--
                Not in the approved design's frame, and kept on purpose: what is moving on this
                machine right now, and the two starts that are not a catalogue row.
            -->
            <section class="wl-machine" aria-labelledby="wl-dash-machine-title">
                <div class="wl-section-head">
                    <h2 id="wl-dash-machine-title" class="wl-section-head__name">
                        {{ t("shell.home.machine.title", "On this machine") }}
                    </h2>
                    <v-divider class="wl-section-head__rule" />
                </div>

                <div class="wl-dash__actions">
                    <GenerationEntry />
                    <v-btn
                        class="wl-action mb-interactive"
                        variant="outlined"
                        @click="emit('openPalette')"
                    >
                        {{ t("shell.home.machine.palette", "Open the command palette") }}
                    </v-btn>
                </div>

                <div v-if="returning" class="wl-dash__content">
                    <v-card
                        v-if="runningRows.length > 0"
                        class="wl-panel"
                        variant="flat"
                        tag="section"
                        aria-labelledby="wl-dash-progress-title"
                    >
                        <h3 id="wl-dash-progress-title" class="wl-panel__title">
                            {{ t("shell.home.dashboard.inProgress", "In progress") }}
                        </h3>
                        <ul class="wl-rows">
                            <li v-for="row in runningRows" :key="row.key">
                                <v-list-item
                                    class="wl-render-row wl-plain mb-interactive"
                                    rounded="0"
                                    role="button"
                                    link
                                    :ripple="false"
                                    @click="emit('openRender', row.key)"
                                >
                                    <span class="wl-result__name">{{ renderTitle(row) }}</span>
                                    <span class="wl-result__meta">{{ renderMeta(row) }}</span>
                                    <template #append>
                                        <v-progress-linear
                                            class="wl-render-row__bar"
                                            color="primary"
                                            rounded
                                            height="6"
                                            :model-value="displayPercent(row.percent) ?? 0"
                                            :indeterminate="displayPercent(row.percent) === null"
                                            :aria-label="renderTitle(row)"
                                        />
                                        <v-icon
                                            class="wl-chevron"
                                            :icon="mdiChevronRight"
                                            size="18"
                                        />
                                    </template>
                                </v-list-item>
                            </li>
                        </ul>
                        <p v-if="runningOverflow > 0" class="wl-results__more">
                            {{
                                t(
                                    "shell.home.dashboard.renderOverflow",
                                    { count: String(runningOverflow) },
                                    "+{count} more running",
                                )
                            }}
                        </p>
                    </v-card>

                    <v-card
                        v-if="savedProfiles.length > 0"
                        class="wl-panel"
                        variant="flat"
                        tag="section"
                        aria-labelledby="wl-dash-maps-title"
                    >
                        <h3 id="wl-dash-maps-title" class="wl-panel__title">
                            {{ t("shell.home.dashboard.mapsAndServers", "Your maps & servers") }}
                        </h3>
                        <ul class="wl-rows">
                            <li v-for="profile in savedProfiles" :key="profile.id">
                                <v-list-item
                                    class="wl-profile-row wl-plain mb-interactive"
                                    rounded="0"
                                    role="button"
                                    link
                                    :ripple="false"
                                    @click="emit('openMap', profile.id)"
                                >
                                    <template #prepend>
                                        <span class="wl-row-tile wl-tile--secondary">
                                            <v-icon :icon="mdiServerNetwork" size="18" />
                                        </span>
                                    </template>
                                    <span class="wl-result__name">{{ profile.name }}</span>
                                    <span class="wl-result__meta wl-profile-row__meta">{{
                                        profileMeta(profile)
                                    }}</span>
                                    <template #append>
                                        <v-icon
                                            class="wl-chevron"
                                            :icon="mdiChevronRight"
                                            size="18"
                                        />
                                    </template>
                                </v-list-item>
                            </li>
                        </ul>
                        <p v-if="savedProfilesOverflow > 0" class="wl-results__more">
                            {{
                                t(
                                    "shell.home.dashboard.profileOverflow",
                                    { count: String(savedProfilesOverflow) },
                                    "+{count} more",
                                )
                            }}
                        </p>
                    </v-card>

                    <v-card
                        v-if="
                            runningRows.length === 0 &&
                            savedProfiles.length === 0 &&
                            projectCount > 0
                        "
                        class="wl-panel"
                        variant="flat"
                        tag="section"
                        aria-labelledby="wl-dash-drafts-title"
                    >
                        <h3 id="wl-dash-drafts-title" class="wl-panel__title">
                            {{ t("shell.home.dashboard.drafts", "Pick up where you left off") }}
                        </h3>
                        <p class="wl-panel__body">
                            {{
                                t(
                                    "shell.home.dashboard.draftsBody",
                                    { count: String(projectCount) },
                                    "You have {count} project drafts waiting for their first render.",
                                )
                            }}
                        </p>
                        <v-btn
                            class="wl-drafts-open mb-interactive"
                            variant="tonal"
                            @click="emit('newMap')"
                        >
                            {{ t("shell.home.dashboard.openProjects", "Open projects") }}
                        </v-btn>
                    </v-card>
                </div>
            </section>
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
    max-inline-size: 1106px;
    padding: 36px 48px 48px;
}

@media (max-width: 900px) {
    .wl-dash__inner {
        padding-inline: 16px;
    }
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

.wl-dash__overline {
    margin: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-outline));
}

.wl-dash__title {
    margin: 8px 0 8px;
    font-size: var(--md-sys-typescale-headline-large-size);
    line-height: var(--md-sys-typescale-headline-large-line-height);
    font-weight: 400;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-dash__lede {
    margin: 0 0 20px;
    max-inline-size: 68ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 21px;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

.wl-dash__search {
    margin-block-end: 24px;
}

.wl-dash__search :deep(.v-field) {
    min-block-size: 52px;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-surface-container));
}

.wl-dash__search :deep(.v-field__outline) {
    --v-field-border-opacity: 1;
    color: rgb(var(--v-theme-outline-variant));
}

.wl-dash__search :deep(.v-field--focused .v-field__outline) {
    color: rgb(var(--v-theme-primary));
}

.wl-dash__search-meta {
    flex: 0 0 auto;
    margin-inline-end: 8px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
    white-space: nowrap;
}

/* The counts give way before the field's own label and controls do. */
@media (max-width: 640px) {
    .wl-dash__search-meta {
        display: none;
    }
}

/* -------------------------------------------------------------------------- */
/* Grid                                                                       */
/* -------------------------------------------------------------------------- */

.wl-dash__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
}

@media (max-width: 760px) {
    .wl-dash__grid {
        grid-template-columns: minmax(0, 1fr);
    }
}

.wl-tile {
    inline-size: 40px;
    block-size: 40px;
    flex: 0 0 40px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-medium);
}

.wl-tile--hero {
    inline-size: 56px;
    block-size: 56px;
    flex-basis: 56px;
    border-radius: var(--md-sys-shape-corner-large);
}

.wl-tile--primary {
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
}

.wl-tile--secondary {
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.wl-tile--tertiary {
    background: rgb(var(--v-theme-tertiary-container));
    color: rgb(var(--v-theme-on-tertiary-container));
}

.wl-tile--neutral {
    background: rgb(var(--v-theme-surface-container-high));
    color: rgb(var(--v-theme-on-surface-variant));
}

/*
 * List items used as plain rows. `prototypeSurface.scss` draws every list item inside a shell
 * layer as an outlined card row; these are rows inside a card or a divided list, so they reset
 * that surface (the extra `.v-list-item` class is what outranks the shared rule).
 */
.wl-dash .v-list-item.wl-plain {
    margin: 0;
    border: 0;
    background: transparent;
    min-block-size: 0;
}

.wl-dash .v-list-item.wl-hero__head,
.wl-dash .v-list-item.wl-card__head,
.wl-dash .v-list-item.wl-card__feature {
    padding: 0;
    border-radius: var(--md-sys-shape-corner-small);
}

.wl-hero__head :deep(.v-list-item__overlay),
.wl-card__head :deep(.v-list-item__overlay) {
    display: none;
}

.wl-hero__head:focus-visible,
.wl-card__head:focus-visible,
.wl-card__feature:focus-visible,
.wl-hero__chip:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}

/* Hero ---------------------------------------------------------------------- */

.wl-hero {
    grid-column: 1 / -1;
    padding: 24px;
    border-radius: var(--md-sys-shape-corner-large);
    color: rgb(var(--v-theme-on-primary-container));
}

.wl-hero__row {
    display: flex;
    align-items: center;
    gap: 24px;
}

.wl-hero__main {
    flex: 1 1 auto;
    min-inline-size: 0;
}

.wl-hero__head :deep(.v-list-item__prepend) {
    align-self: center;
    margin-inline-end: 24px;
}

.wl-hero__head :deep(.v-list-item__spacer) {
    display: none;
}

.wl-hero__title {
    display: block;
    margin: 0;
    font-size: var(--md-sys-typescale-title-large-size);
    line-height: var(--md-sys-typescale-title-large-line-height);
    font-weight: 500;
    color: rgb(var(--v-theme-on-primary-container));
    overflow-wrap: anywhere;
}

.wl-hero__blurb {
    display: block;
    margin: 4px 0 0;
    max-inline-size: 62ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 21px;
    color: rgb(var(--v-theme-on-primary-container));
    opacity: 0.88;
    text-wrap: pretty;
}

.wl-hero__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 12px;
    /* Aligned with the text column, past the 56px tile and its 24px gap. */
    padding-inline-start: 80px;
}

.wl-hero__chip {
    color: rgb(var(--v-theme-on-primary-container));
    border-color: rgba(var(--v-theme-on-primary-container), 0.5);
}

.wl-hero__actions {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
}

.wl-action {
    text-transform: none;
    letter-spacing: normal;
}

.wl-dash .v-btn.wl-action--primary {
    min-block-size: 44px;
    background: rgb(var(--v-theme-on-primary-container));
    color: rgb(var(--v-theme-on-primary));
    font-size: var(--md-sys-typescale-title-medium-size);
}

.wl-dash .v-btn.wl-action--secondary {
    color: rgb(var(--v-theme-on-primary-container));
    border-color: rgba(var(--v-theme-on-primary-container), 0.55);
}

@media (max-width: 760px) {
    .wl-hero__row {
        flex-direction: column;
        align-items: stretch;
    }

    .wl-hero__chips {
        padding-inline-start: 0;
    }
}

/* Cards --------------------------------------------------------------------- */

.wl-card {
    padding: 20px;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-large);
    background: rgb(var(--v-theme-surface-container));
    color: rgb(var(--v-theme-on-surface));
    min-inline-size: 0;
}

.wl-card:hover {
    background: rgb(var(--v-theme-surface-container-high));
}

.wl-card :deep(> .v-card__overlay) {
    display: none;
}

.wl-card__head :deep(.v-list-item__prepend) {
    margin-inline-end: 12px;
}

.wl-card__head :deep(.v-list-item__prepend > .v-list-item__spacer) {
    display: none;
}

.wl-card__title {
    display: block;
    margin: 0;
    font-size: var(--md-sys-typescale-title-medium-size);
    line-height: var(--md-sys-typescale-title-medium-line-height);
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-card__count {
    margin-inline-start: 12px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
    white-space: nowrap;
}

.wl-card__blurb {
    margin: 12px 0 12px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-card__features {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
}

.wl-dash .v-list-item.wl-card__feature {
    min-block-size: 24px;
    padding-block: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-card__feature:hover {
    color: rgb(var(--v-theme-on-surface));
}

.wl-card__feature :deep(.v-list-item__prepend) {
    margin-inline-end: 8px;
}

.wl-card__feature :deep(.v-list-item__prepend > .v-list-item__spacer) {
    display: none;
}

.wl-chevron {
    color: rgb(var(--v-theme-outline));
}

/* -------------------------------------------------------------------------- */
/* Section heads, shared with the catalogue page's anatomy                     */
/* -------------------------------------------------------------------------- */

.wl-section-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-block-end: 8px;
}

.wl-section-head__name {
    margin: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
}

.wl-section-head__rule {
    flex: 1 1 auto;
}

.wl-section-head__count {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
}

/* -------------------------------------------------------------------------- */
/* Rows: search results and the machine panels                                */
/* -------------------------------------------------------------------------- */

.wl-rows {
    list-style: none;
    margin: 0;
    padding: 0;
}

.wl-results__group + .wl-results__group {
    margin-block-start: 24px;
}

.wl-dash .v-list-item.wl-result,
.wl-dash .v-list-item.wl-render-row,
.wl-dash .v-list-item.wl-profile-row {
    padding: 12px;
    border-block-end: 1px solid rgb(var(--v-theme-surface-container));
    border-radius: 0;
}

.wl-result:focus-visible,
.wl-render-row:focus-visible,
.wl-profile-row:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.wl-result :deep(.v-list-item__prepend > .v-list-item__spacer),
.wl-profile-row :deep(.v-list-item__prepend > .v-list-item__spacer) {
    display: none;
}

.wl-result :deep(.v-list-item__prepend),
.wl-profile-row :deep(.v-list-item__prepend) {
    margin-inline-end: 16px;
}

.wl-row-tile {
    inline-size: 40px;
    block-size: 40px;
    flex: 0 0 40px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-surface-container));
    border: 1px solid rgb(var(--v-theme-outline-variant));
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-profile-row .wl-row-tile {
    border-color: transparent;
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.wl-result__name {
    margin-inline-end: 12px;
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-result__meta {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
    overflow-wrap: anywhere;
}

.wl-result__meta--mono {
    font-family: "Roboto Mono", ui-monospace, monospace;
}

.wl-result__blurb {
    display: block;
    margin-block-start: 4px;
    max-inline-size: 78ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-hit {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
    border-radius: var(--md-sys-shape-corner-extra-small);
}

.wl-results__more,
.wl-results__empty {
    margin: 12px 0 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
}

/* -------------------------------------------------------------------------- */
/* On this machine                                                            */
/* -------------------------------------------------------------------------- */

.wl-machine {
    margin-block-start: 40px;
}

.wl-dash__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-block-start: 8px;
}

/*
 * Regression: v2-09-rail-7-jobs-320.png captured a horizontal scrollbar on Home at a 320px
 * window, caused by a row of buttons that did not wrap. Below 600px the row stacks instead:
 * full width, one button per line.
 */
@media (max-width: 600px) {
    .wl-dash__actions {
        flex-direction: column;
        align-items: stretch;
    }

    .wl-action {
        inline-size: 100%;
    }
}

.wl-dash__content {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-block-start: 16px;
}

@media (max-width: 760px) {
    .wl-dash__content {
        grid-template-columns: minmax(0, 1fr);
    }
}

.wl-panel {
    padding: 20px;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-large);
    background: rgb(var(--v-theme-surface-container));
}

.wl-panel__title {
    margin: 0 0 8px;
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
}

.wl-panel__body {
    margin: 0 0 16px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-render-row__bar {
    inline-size: 96px;
    margin-inline-end: 12px;
}

@media (max-width: 560px) {
    .wl-render-row__bar {
        display: none;
    }
}
</style>
