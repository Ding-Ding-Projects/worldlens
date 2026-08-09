<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronRight, mdiMapPlus } from "@mdi/js";
import { VBtn, VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { resolveMeta, type CatalogueMetaSources } from "./catalogueMeta.js";
import {
    catalogueSampleText,
    createCatalogueMatcher,
    filterCatalogues,
    flattenFeatures,
    resolveCatalogues,
    type ResolvedCatalogue,
    type ResolvedFeature,
} from "./catalogueSearch.js";
import type { CatalogueFeatureDefinition, CatalogueId } from "./featureTargets.js";

/**
 * Home: a heading, a search field, and five cards.
 *
 * That is the whole page, and the restraint is the point. The pre-rewrite Home was a tile grid
 * that grew a row every time the application grew a capability, so it answered "what can this do"
 * by making somebody read forty tiles. Five cards answer it in five words, and the catalogue page
 * behind each one answers it properly.
 *
 * ### The hero has three actions and they do three different things
 *
 * The card body opens the Make a map catalogue. **New map** opens the project editor. **Or walk me
 * through it** opens the guide. All three live inside one card, so every one of them stops
 * propagation - without that, pressing New map would also fire the card body underneath it and
 * the person would land on the catalogue they did not ask for, one frame after the editor they
 * did. `HomeCatalogues.test.ts` asserts each fires alone.
 *
 * ### Counts come from array lengths
 *
 * Every card header shows `features.length`. Never a literal, and never a number typed into a
 * translation string, so a feature added to the manifest is counted by the card the same commit.
 */
const props = withDefaults(
    defineProps<{
        /** Live values for the row metas. Absent fields simply render no meta. */
        metaSources?: CatalogueMetaSources;
        /** Removes the rows the restricted-mode contract requires to be absent. */
        restrictedModeActive?: boolean;
    }>(),
    { metaSources: () => ({}), restrictedModeActive: false },
);

const emit = defineEmits<{
    openCatalogue: [id: CatalogueId];
    activateFeature: [feature: CatalogueFeatureDefinition];
    /** The two hero actions, which are jobs rather than catalogue rows. */
    newMap: [];
    walkMeThrough: [];
}>();

const { t } = useI18n();

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

/**
 * Resolved at render time rather than once at setup, so a language-mode change or a funny-level
 * slider moves this page's copy with everything else. `computed` is what makes that free.
 */
const catalogues = computed(() =>
    resolveCatalogues(
        t as never,
        (feature) => resolveMeta(feature.metaResolver, props.metaSources, t as never),
        props.restrictedModeActive,
    ),
);

const allFeatures = computed(() => flattenFeatures(catalogues.value));

const matcher = computed(() => createCatalogueMatcher(query.value, regexMode.value, flags.value));

const shown = computed<readonly ResolvedCatalogue[]>(() =>
    filterCatalogues(catalogues.value, matcher.value),
);

const matchCount = computed(() =>
    shown.value.reduce((total, catalogue) => total + catalogue.features.length, 0),
);

const searching = computed(() => matcher.value.active);

/** The hero is the first catalogue. Named rather than indexed, so reordering cannot silently
 * promote a different card to hero and change what the primary button does. */
const hero = computed(() => shown.value.find((catalogue) => catalogue.id === "make") ?? null);

const rest = computed(() => shown.value.filter((catalogue) => catalogue.id !== "make"));

const summary = computed(() =>
    searching.value
        ? t(
              "home.search.summary",
              { shown: String(matchCount.value), total: String(allFeatures.value.length) },
              "{shown} of {total} features",
          )
        : "",
);

/** At most four, always. A card that listed everything would be the tile grid again. */
function preview(catalogue: ResolvedCatalogue): readonly ResolvedFeature[] {
    return catalogue.features.slice(0, 4);
}

function countLabel(catalogue: ResolvedCatalogue): string {
    return t(
        "home.card.count",
        { count: String(catalogue.features.length) },
        "{count} features",
    );
}
</script>

<template>
    <div class="wl-home">
        <div class="wl-home__inner">
            <header class="wl-home__header">
                <h1 class="wl-home__title">{{ t("home.title", "What would you like to do?") }}</h1>
                <p class="wl-home__lede">
                    {{
                        t(
                            "home.lede",
                            "Everything this application can do, in five places. Open one to see what is inside it.",
                        )
                    }}
                </p>
            </header>

            <!--
                The same search component every other surface in this application uses, so the
                anchored regex builder is here for free rather than being a second, weaker filter
                that happens to look the same.
            -->
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                class="wl-home__search"
                :label="t('home.search.label', 'Search everything')"
                :placeholder="t('home.search.placeholder', 'Try: mask, backup, Cantonese, publish')"
                :sample="catalogueSampleText(allFeatures)"
                :summary="summary"
            />

            <!--
                Searching does not create a sixth card and does not collapse the grid: the five
                cards stay five cards and each says honestly how much of it matched. A grid that
                reflowed from five to two and back while somebody typed is a worse answer to "what
                matched" than a card reading zero.
            -->
            <section
                v-if="hero"
                class="wl-card wl-card--hero"
                :aria-labelledby="`wl-card-title-${hero.id}`"
            >
                <button
                    type="button"
                    class="wl-card__body"
                    @click="emit('openCatalogue', hero.id)"
                >
                    <span class="wl-card__head">
                        <span class="wl-card__avatar wl-card__avatar--hero">
                            <v-icon :icon="hero.definition.icon" size="24" />
                        </span>
                        <span :id="`wl-card-title-${hero.id}`" class="wl-card__title wl-card__title--hero">
                            {{ hero.title }}
                        </span>
                        <span class="wl-card__count">{{ countLabel(hero) }}</span>
                    </span>
                    <span class="wl-card__blurb">{{ hero.blurb }}</span>
                </button>

                <ul class="wl-card__preview">
                    <li v-for="feature in preview(hero)" :key="feature.definition.key">
                        <v-icon :icon="mdiChevronRight" size="14" />
                        <span>{{ feature.name }}</span>
                    </li>
                </ul>

                <!--
                    Outside the card body button, not inside it: a button inside a button is
                    invalid markup that browsers repair in ways nobody can predict, and the stopped
                    propagation below is the behavioural half of the same fix.
                -->
                <div class="wl-card__actions">
                    <v-btn
                        class="mb-interactive"
                        color="primary"
                        variant="flat"
                        :prepend-icon="mdiMapPlus"
                        @click.stop="emit('newMap')"
                    >
                        {{ t("home.hero.newMap", "New map") }}
                    </v-btn>
                    <v-btn class="mb-interactive" variant="text" @click.stop="emit('walkMeThrough')">
                        {{ t("home.hero.guide", "Or walk me through it") }}
                    </v-btn>
                </div>
            </section>

            <div class="wl-home__grid">
                <section
                    v-for="catalogue in rest"
                    :key="catalogue.id"
                    class="wl-card"
                    :aria-labelledby="`wl-card-title-${catalogue.id}`"
                >
                    <button
                        type="button"
                        class="wl-card__body"
                        @click="emit('openCatalogue', catalogue.id)"
                    >
                        <span class="wl-card__head">
                            <span class="wl-card__avatar">
                                <v-icon :icon="catalogue.definition.icon" size="22" />
                            </span>
                            <span :id="`wl-card-title-${catalogue.id}`" class="wl-card__title">
                                {{ catalogue.title }}
                            </span>
                            <span class="wl-card__count">{{ countLabel(catalogue) }}</span>
                        </span>
                        <span class="wl-card__blurb">{{ catalogue.blurb }}</span>
                    </button>

                    <ul class="wl-card__preview">
                        <li v-for="feature in preview(catalogue)" :key="feature.definition.key">
                            <v-icon :icon="mdiChevronRight" size="14" />
                            <span>{{ feature.name }}</span>
                        </li>
                    </ul>
                </section>
            </div>

            <p v-if="searching && matchCount === 0" class="wl-home__empty" role="status">
                {{
                    t(
                        "home.search.none",
                        { query },
                        "Nothing matches “{query}”. Try a shorter word, or turn the regular expression off.",
                    )
                }}
            </p>
        </div>
    </div>
</template>

<style scoped>
/*
 * One scroll region, owned here. The shell body never scrolls, so this is the only thing on the
 * page that does - which is what keeps a wheel gesture from being swallowed by a nested wrapper.
 */
.wl-home {
    block-size: 100%;
    overflow-y: auto;
    background: rgb(var(--v-theme-background));
}

.wl-home__inner {
    max-inline-size: 1010px;
    margin-inline: auto;
    padding: 32px 48px 48px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

@media (max-width: 900px) {
    .wl-home__inner {
        padding-inline: 20px;
    }
}

.wl-home__title {
    font-size: 2rem;
    line-height: 1.25;
    font-weight: 400;
    margin: 0;
    color: rgb(var(--v-theme-on-surface));
}

.wl-home__lede {
    margin: 8px 0 0;
    max-inline-size: 68ch;
    font-size: 0.875rem;
    line-height: 1.5;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-home__search {
    max-inline-size: 520px;
}

.wl-home__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
}

.wl-card {
    display: flex;
    flex-direction: column;
    border-radius: var(--md-sys-shape-corner-lg, 16px);
    border: 1px solid rgb(var(--v-theme-outline-variant));
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    overflow: hidden;
}

.wl-card--hero {
    border-color: transparent;
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

.wl-card__body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 18px 18px 12px;
    background: none;
    border: 0;
    text-align: start;
    cursor: pointer;
    color: inherit;
    min-block-size: 48px;
}

.wl-card__body:hover {
    background: rgba(var(--v-theme-on-surface), 0.05);
}

.wl-card__body:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.wl-card__head {
    display: flex;
    align-items: center;
    gap: 12px;
    /* min-inline-size: 0 on the flex child is what stops a long translated title hard-clipping
       instead of wrapping - the defect this project has fixed in a dozen other card titles. */
    min-inline-size: 0;
}

.wl-card__avatar {
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    flex: 0 0 auto;
    border-radius: var(--md-sys-shape-corner-md, 12px);
    background: rgb(var(--v-theme-secondary-container, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-secondary-container, var(--v-theme-on-surface)));
}

.wl-card__avatar--hero {
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
}

.wl-card__title {
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: 1.0625rem;
    font-weight: 500;
    overflow-wrap: anywhere;
}

.wl-card__title--hero {
    font-size: 1.375rem;
}

.wl-card__count {
    flex: 0 0 auto;
    font-size: 0.75rem;
    opacity: 0.85;
}

.wl-card__blurb {
    max-inline-size: 68ch;
    font-size: 0.875rem;
    line-height: 1.5;
    opacity: 0.9;
    text-wrap: pretty;
}

/*
 * Explanatory, not navigational: these name what is inside the card so the card does not have to
 * be opened to be understood. They are deliberately not four more buttons - four nested controls
 * inside a card that is itself a control is how a keyboard user ends up pressing Tab nine times
 * to get past Home.
 */
.wl-card__preview {
    list-style: none;
    margin: 0;
    padding: 0 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.8125rem;
    opacity: 0.8;
}

.wl-card__preview li {
    display: flex;
    align-items: center;
    gap: 4px;
    min-inline-size: 0;
}

.wl-card__preview span {
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

.wl-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 18px 18px;
}

.wl-home__empty {
    margin: 0;
    padding: 24px 0;
    font-size: 0.875rem;
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
