<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronRight } from "@mdi/js";
import { VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { productDisplayName } from "../../stores/productName.js";
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

/** The user own chosen name for this application, or the shipped one. */
const productName = productDisplayName;

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

/**
 * The hero's own group headings, deduplicated in first-appearance order.
 *
 * Derived from the manifest rather than listed, so a group added to Make a map appears here in
 * the same commit that adds it. First-appearance rather than sorted, because the order the rows
 * are declared in is the order somebody reads them on the catalogue page - and a chip row that
 * disagreed with the page behind it would be worse than no chips.
 */
const heroGroups = computed<readonly string[]>(() => {
    const current = hero.value;
    if (current === null) return [];
    const seen = new Set<string>();
    const order: string[] = [];
    for (const feature of current.definition.features) {
        const heading = t(feature.groupKey, feature.groupFallback);
        if (seen.has(heading)) continue;
        seen.add(heading);
        order.push(heading);
    }
    return order;
});

const summary = computed(() =>
    searching.value
        ? t(
              "shell.home.search.summary",
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
        "shell.home.card.count",
        { count: String(catalogue.features.length) },
        "{count} features",
    );
}
</script>

<template>
    <div class="wl-home">
        <div class="wl-home__inner">
            <header class="wl-home__header">
                <!--
                    The product's own name as an overline. It is the one place the shell says what
                    it is without leaning on a window title, and it is the user's chosen name
                    rather than the shipped one - renaming the application renames this.
                -->
                <p class="wl-home__overline">{{ productName }}</p>
                <h1 class="wl-home__title">
                    {{ t("shell.home.title", "What are you here to do?") }}
                </h1>
                <p class="wl-home__lede">
                    {{
                        t(
                            "shell.home.lede",
                            { count: String(allFeatures.length) },
                            "All {count} things this application does live in one of the five catalogues below, grouped by the job they belong to.",
                        )
                    }}
                </p>
            </header>

            <!--
                The same search component every other surface here uses, so the anchored regex
                builder comes with it rather than being a second, weaker filter that looks alike.
            -->
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                class="wl-home__search"
                :label="t('shell.home.search.label', 'Search everything')"
                :placeholder="
                    t('shell.home.search.placeholder', 'Try: mask, backup, Cantonese, publish')
                "
                :sample="catalogueSampleText(allFeatures)"
                :summary="summary"
            />

            <!--
                Two columns, hero spanning both. Deliberately a fixed two rather than an auto-fit:
                five cards in an auto-fit grid reflow between three-and-two and two-and-three on a
                few pixels of window width, and the hero stops reading as the one thing a newcomer
                is here for the moment a sibling lands beside it.
            -->
            <div class="wl-home__grid">
                <section v-if="hero" class="wl-hero" :aria-labelledby="`wl-card-title-${hero.id}`">
                    <button
                        type="button"
                        class="wl-hero__body mb-interactive"
                        @click="emit('openCatalogue', hero.id)"
                    >
                        <span class="wl-hero__avatar">
                            <v-icon :icon="hero.definition.icon" size="30" />
                        </span>
                        <span class="wl-hero__text">
                            <span :id="`wl-card-title-${hero.id}`" class="wl-hero__title">
                                {{ hero.title }}
                            </span>
                            <span class="wl-hero__blurb">{{ hero.blurb }}</span>
                            <!--
                                The catalogue's own group headings, as chips. Explanatory rather
                                than navigational: they say what shape the catalogue has before it
                                is opened, which is the question a card exists to answer.
                            -->
                            <span class="wl-hero__chips">
                                <span v-for="group in heroGroups" :key="group" class="wl-chip">
                                    {{ group }}
                                </span>
                            </span>
                        </span>
                    </button>

                    <!--
                        Outside the card body, never inside it: a button inside a button is invalid
                        markup that browsers repair unpredictably, and the stopped propagation is
                        the behavioural half of the same fix.
                    -->
                    <div class="wl-hero__actions">
                        <button
                            type="button"
                            class="wl-hero__primary mb-interactive"
                            @click.stop="emit('newMap')"
                        >
                            {{ t("shell.home.hero.newMap", "New map") }}
                        </button>
                        <button
                            type="button"
                            class="wl-hero__secondary mb-interactive"
                            @click.stop="emit('walkMeThrough')"
                        >
                            {{ t("shell.home.hero.guide", "Or walk me through it") }}
                        </button>
                    </div>
                </section>

                <section
                    v-for="catalogue in rest"
                    :key="catalogue.id"
                    class="wl-card"
                    :aria-labelledby="`wl-card-title-${catalogue.id}`"
                >
                    <button
                        type="button"
                        class="wl-card__body mb-interactive"
                        @click="emit('openCatalogue', catalogue.id)"
                    >
                        <span class="wl-card__head">
                            <span
                                class="wl-card__avatar"
                                :class="`wl-card__avatar--${catalogue.id}`"
                            >
                                <v-icon :icon="catalogue.definition.icon" size="22" />
                            </span>
                            <span :id="`wl-card-title-${catalogue.id}`" class="wl-card__title">
                                {{ catalogue.title }}
                            </span>
                            <span class="wl-card__count">{{ countLabel(catalogue) }}</span>
                        </span>
                        <span class="wl-card__blurb">{{ catalogue.blurb }}</span>
                        <!--
                            Explanatory, capped at four. Deliberately not four more buttons: four
                            nested controls inside a card that is itself a control is how a
                            keyboard user ends up pressing Tab nine times to get past Home.
                        -->
                        <span class="wl-card__preview">
                            <span
                                v-for="feature in preview(catalogue)"
                                :key="feature.definition.key"
                                class="wl-card__preview-row"
                            >
                                <v-icon :icon="mdiChevronRight" size="16" />
                                <span>{{ feature.name }}</span>
                            </span>
                        </span>
                    </button>
                </section>
            </div>

            <p v-if="searching && matchCount === 0" class="wl-home__empty" role="status">
                {{
                    t(
                        "shell.home.search.none",
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
    padding: 30px 48px 48px;
}

@media (max-width: 900px) {
    .wl-home__inner {
        padding-inline: 20px;
    }
}

.wl-home__overline {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant)));
}

.wl-home__title {
    margin: 8px 0 6px;
    font-size: 2rem;
    line-height: 40px;
    font-weight: 400;
    color: rgb(var(--v-theme-on-surface));
}

.wl-home__lede {
    margin: 0 0 20px;
    max-inline-size: 68ch;
    font-size: 0.875rem;
    line-height: 21px;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-home__search {
    margin-block-end: 26px;
}

.wl-home__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
}

/* One column below the two-column measure, so a card is never narrower than its own prose. */
@media (max-width: 860px) {
    .wl-home__grid {
        grid-template-columns: 1fr;
    }
}

/* -------------------------------------------------------------------------- */
/* The hero                                                                   */
/* -------------------------------------------------------------------------- */

.wl-hero {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 22px;
    padding: 24px 26px;
    border-radius: var(--md-sys-shape-corner-lg, 16px);
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

@media (max-width: 860px) {
    .wl-hero {
        flex-direction: column;
        align-items: stretch;
    }
}

.wl-hero__body {
    flex: 1 1 auto;
    min-inline-size: 0;
    display: flex;
    align-items: flex-start;
    gap: 18px;
    background: none;
    border: 0;
    padding: 0;
    text-align: start;
    cursor: pointer;
    color: inherit;
}

.wl-hero__body:focus-visible,
.wl-card__body:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 4px;
    border-radius: 8px;
}

.wl-hero__avatar {
    inline-size: 56px;
    block-size: 56px;
    flex: 0 0 56px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-lg, 16px);
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
}

.wl-hero__text {
    flex: 1 1 auto;
    /* The flex child that can shrink. Without it a long translated title hard-clips instead of
       wrapping - the defect this project has fixed in a dozen other flexed titles. */
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
}

.wl-hero__title {
    font-size: 1.375rem;
    font-weight: 500;
    overflow-wrap: anywhere;
}

.wl-hero__blurb {
    margin-block-start: 4px;
    max-inline-size: 62ch;
    font-size: 0.875rem;
    line-height: 21px;
    opacity: 0.88;
    text-wrap: pretty;
}

.wl-hero__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-block-start: 14px;
}

.wl-chip {
    font-size: 0.75rem;
    padding: 5px 11px;
    border-radius: var(--md-sys-shape-corner-full, 999px);
    border: 1px solid currentColor;
    opacity: 0.72;
}

.wl-hero__actions {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
}

/*
 * The only filled primary action on Home, because making a map is the one thing a newcomer is
 * here for. It fills with the container's own `on-` role rather than the page-level primary,
 * which would vanish into the card behind it.
 */
.wl-hero__primary {
    block-size: 44px;
    padding-inline: 26px;
    border: 0;
    border-radius: 22px;
    background: rgb(var(--v-theme-on-primary-container));
    color: rgb(var(--v-theme-primary-container));
    font-size: 0.9375rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
}

.wl-hero__secondary {
    /* 36px is under the 48px minimum on its own, so the row gap plus the hero's own padding is
       what carries the target: the two actions sit in a 44 + 8 + 36 column inside 24px padding,
       and neither has a neighbour within 8px of its own hit area. */
    block-size: 36px;
    padding-inline: 22px;
    border: 1px solid currentColor;
    border-radius: 18px;
    background: none;
    color: inherit;
    font-size: 0.8125rem;
    white-space: nowrap;
    cursor: pointer;
}

.wl-hero__primary:focus-visible,
.wl-hero__secondary:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}

/* -------------------------------------------------------------------------- */
/* The other four                                                             */
/* -------------------------------------------------------------------------- */

.wl-card {
    border-radius: var(--md-sys-shape-corner-lg, 16px);
    border: 1px solid rgb(var(--v-theme-outline-variant));
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    overflow: hidden;
}

.wl-card__body {
    inline-size: 100%;
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: none;
    border: 0;
    text-align: start;
    cursor: pointer;
    color: inherit;
}

.wl-card__body:hover {
    background: rgb(var(--v-theme-surface-container-high, var(--v-theme-surface-container)));
}

.wl-card__head {
    display: flex;
    align-items: center;
    gap: 12px;
    min-inline-size: 0;
}

.wl-card__avatar {
    inline-size: 40px;
    block-size: 40px;
    flex: 0 0 40px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-md, 12px);
    background: rgb(var(--v-theme-secondary-container, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-secondary-container, var(--v-theme-on-surface)));
}

/*
 * Sharing is tertiary, which is the same distinction the rest of this application already draws:
 * the share and unsaved-changes emphasis is tertiary everywhere else it appears, so a share
 * catalogue wearing the secondary role would be the one place that disagreed.
 */
.wl-card__avatar--share {
    background: rgb(var(--v-theme-tertiary-container, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-tertiary-container, var(--v-theme-on-surface)));
}

/*
 * The contrast scheme promises a literal 21:1 reading surface, not only an AA one. Alpha on the
 * hero copy and chips composites the black foreground into grey; the secondary yellow avatar is
 * high-contrast but not the claimed maximum. Keep the semantic distinction in the ordinary
 * themes and promote these contrast-only states to existing black/white container roles.
 */
:global(.v-theme--contrast) .wl-hero__blurb,
:global(.v-theme--contrast) .wl-chip {
    opacity: 1;
}

:global(.v-theme--contrast) .wl-card__avatar:not(.wl-card__avatar--share) {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

.wl-card__title {
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: 1.0625rem;
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-card__count {
    flex: 0 0 auto;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant)));
}

.wl-card__blurb {
    margin: 13px 0 14px;
    font-size: 0.8125rem;
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-card__preview {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.8125rem;
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-card__preview-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-inline-size: 0;
}

.wl-card__preview-row :deep(.v-icon) {
    color: rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant)));
}

.wl-card__preview-row span {
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

.wl-home__empty {
    margin: 24px 0 0;
    font-size: 0.875rem;
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
