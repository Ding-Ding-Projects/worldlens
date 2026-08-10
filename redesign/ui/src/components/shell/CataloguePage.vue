<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowLeft, mdiChevronRight } from "@mdi/js";
import { VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { resolveMeta, type CatalogueMetaSources } from "./catalogueMeta.js";
import {
    catalogueSampleText,
    createCatalogueMatcher,
    filterFeatures,
    findMatchRange,
    groupFeatures,
    resolveCatalogues,
    type ResolvedCatalogue,
} from "./catalogueSearch.js";
import type { CatalogueFeatureDefinition, CatalogueId } from "./featureTargets.js";

/**
 * One catalogue, as a list rather than as more cards.
 *
 * Home is five cards because five is a glance. A catalogue is up to thirty-eight rows, and
 * thirty-eight cards is a wall - so this is a back link, a header, a search field, and a divided
 * list under group headings. Each row is a single button spanning the full width: icon, name,
 * live meta, one sentence, chevron.
 *
 * ### One row, one target
 *
 * The whole row is the control. Splitting it into a name link and a separate chevron button would
 * double the tab stops on a page that already has thirty-eight of them, for two controls that go
 * to the same place. 18 px of vertical padding is what makes the effective target comfortably
 * past 48 px without a fixed height that would clip a wrapped bilingual name.
 *
 * ### Highlighting without injecting anything
 *
 * A match is emphasised by splitting the string around the matched range and rendering the parts
 * as text nodes. Never `v-html`: the corpus here includes translated copy and a user-typed query,
 * and there is no version of this feature worth an injection surface.
 */
const props = withDefaults(
    defineProps<{
        catalogueId: CatalogueId;
        metaSources?: CatalogueMetaSources;
        restrictedModeActive?: boolean;
    }>(),
    { metaSources: () => ({}), restrictedModeActive: false },
);

const emit = defineEmits<{
    back: [];
    activateFeature: [feature: CatalogueFeatureDefinition];
}>();

const { t } = useI18n();

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const catalogue = computed<ResolvedCatalogue | null>(
    () =>
        resolveCatalogues(
            t as never,
            (feature) => resolveMeta(feature.metaResolver, props.metaSources, t as never),
            props.restrictedModeActive,
        ).find((entry) => entry.id === props.catalogueId) ?? null,
);

const matcher = computed(() => createCatalogueMatcher(query.value, regexMode.value, flags.value));

/**
 * Filter first, then group. The other order leaves a heading standing over nothing, which reads
 * as a section that failed to load rather than as one with no matches.
 */
const groups = computed(() => {
    const current = catalogue.value;
    if (current === null) return [];
    return groupFeatures({
        ...current,
        features: filterFeatures(current.features, matcher.value),
    });
});

const shownCount = computed(() =>
    groups.value.reduce((total, group) => total + group.features.length, 0),
);

const totalCount = computed(() => catalogue.value?.features.length ?? 0);

const summary = computed(() =>
    matcher.value.active
        ? t(
              "shell.catalogue.search.summary",
              { shown: String(shownCount.value), total: String(totalCount.value) },
              "{shown} of {total}",
          )
        : "",
);

/** The three pieces a highlighted name splits into, or one piece when nothing matched. */
function segments(text: string): readonly { readonly text: string; readonly hit: boolean }[] {
    const range = matcher.value.active
        ? findMatchRange(text, query.value, regexMode.value, flags.value)
        : null;
    if (range === null || range === undefined) return [{ text, hit: false }];
    const [start, end] = range;
    if (start < 0 || end <= start || end > text.length) return [{ text, hit: false }];
    return [
        { text: text.slice(0, start), hit: false },
        { text: text.slice(start, end), hit: true },
        { text: text.slice(end), hit: false },
    ].filter((part) => part.text.length > 0);
}
</script>

<template>
    <div class="wl-catalogue">
        <!--
            A pill, not a bare chevron, and it says where it goes. It is the only way out of this
            page that does not go through the rail, so naming the destination is the whole job.
        -->
        <div class="wl-catalogue__backrow">
            <button type="button" class="wl-back mb-interactive" @click="emit('back')">
                <v-icon :icon="mdiArrowLeft" size="18" />
                <span>{{ t("shell.catalogue.back", "All five catalogues") }}</span>
            </button>
        </div>

        <div class="wl-catalogue__inner">
            <header v-if="catalogue" class="wl-catalogue__header">
                <span class="wl-catalogue__avatar">
                    <v-icon :icon="catalogue.definition.icon" size="30" />
                </span>
                <div class="wl-catalogue__heading">
                    <h1 class="wl-catalogue__title">{{ catalogue.title }}</h1>
                    <p class="wl-catalogue__blurb">{{ catalogue.blurb }}</p>
                </div>
            </header>

            <ConfigSearchField
                v-if="catalogue"
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                class="wl-catalogue__search"
                :label="t('shell.catalogue.search.label', 'Search this list')"
                :sample="catalogueSampleText(catalogue.features)"
                :summary="summary"
            />

            <section v-for="group in groups" :key="group.key" class="wl-group">
                <!--
                    A heading, a rule that fills the gap, and the count on the right. The rule is
                    what makes a divided list read as sections rather than as one long run of rows
                    with the occasional bold word in it.
                -->
                <div class="wl-group__head">
                    <h2 class="wl-group__name">{{ group.heading }}</h2>
                    <span class="wl-group__rule" aria-hidden="true"></span>
                    <span class="wl-group__count">{{ group.features.length }}</span>
                </div>

                <ul class="wl-group__rows">
                    <li v-for="feature in group.features" :key="feature.definition.key">
                        <button
                            type="button"
                            class="wl-row mb-interactive"
                            @click="emit('activateFeature', feature.definition)"
                        >
                            <span class="wl-row__icon">
                                <v-icon :icon="feature.definition.icon" size="20" />
                            </span>
                            <span class="wl-row__text">
                                <span class="wl-row__name">
                                    <!--
                                        Text nodes, never v-html. The corpus is translated copy and
                                        a query somebody typed, and no highlight is worth an
                                        injection surface.
                                    -->
                                    <span class="wl-row__label">
                                        <template
                                            v-for="(part, index) in segments(feature.name)"
                                            :key="index"
                                        >
                                            <mark v-if="part.hit" class="wl-row__hit">{{
                                                part.text
                                            }}</mark>
                                            <template v-else>{{ part.text }}</template>
                                        </template>
                                    </span>
                                    <span v-if="feature.meta" class="wl-row__meta">{{
                                        feature.meta
                                    }}</span>
                                </span>
                                <span class="wl-row__blurb">{{ feature.blurb }}</span>
                            </span>
                            <v-icon class="wl-row__chevron" :icon="mdiChevronRight" size="20" />
                        </button>
                    </li>
                </ul>
            </section>

            <p v-if="catalogue && shownCount === 0" class="wl-catalogue__empty" role="status">
                {{ t("shell.catalogue.search.none", { query }, "Nothing in this list matches “{query}”.") }}
            </p>
        </div>
    </div>
</template>

<style scoped>
.wl-catalogue {
    block-size: 100%;
    overflow-y: auto;
    background: rgb(var(--v-theme-background));
}

.wl-catalogue__backrow {
    padding: 18px 48px 0;
}

.wl-catalogue__inner {
    max-inline-size: 1010px;
    padding: 16px 48px 48px;
}

@media (max-width: 900px) {
    .wl-catalogue__backrow,
    .wl-catalogue__inner {
        padding-inline: 20px;
    }
}

.wl-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    /* 32px tall, and the surrounding 18px of page padding is what carries the target: this is a
       back link in open space rather than a control packed against a neighbour. */
    block-size: 32px;
    padding: 0 14px 0 10px;
    border: 0;
    border-radius: 16px;
    background: none;
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: 0.8125rem;
    cursor: pointer;
}

.wl-back:hover {
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
}

.wl-back:focus-visible,
.wl-row:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.wl-catalogue__header {
    display: flex;
    align-items: flex-start;
    gap: 18px;
}

.wl-catalogue__avatar {
    inline-size: 56px;
    block-size: 56px;
    flex: 0 0 56px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-lg, 16px);
    background: rgb(var(--v-theme-secondary-container, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-secondary-container, var(--v-theme-on-surface)));
}

.wl-catalogue__heading {
    /* The flex child that can shrink, so a long translated title wraps instead of hard-clipping. */
    min-inline-size: 0;
}

.wl-catalogue__title {
    margin: 0;
    font-size: 1.875rem;
    line-height: 38px;
    font-weight: 400;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-catalogue__blurb {
    margin: 6px 0 0;
    max-inline-size: 68ch;
    font-size: 0.875rem;
    line-height: 21px;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-catalogue__search {
    margin-block-start: 22px;
}

.wl-group {
    margin-block-start: 30px;
}

.wl-group__head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding-block-end: 8px;
}

/*
 * Primary, not on-surface-variant. The heading is the one thing on this page that has to be
 * findable while scanning past forty rows, and the colour is doing that work rather than
 * decoration - it is paired with size, weight and tracking, never carrying the distinction alone.
 */
.wl-group__name {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
    min-inline-size: 0;
}

.wl-group__rule {
    flex: 1 1 auto;
    block-size: 1px;
    background: rgb(var(--v-theme-outline-variant));
}

.wl-group__count {
    flex: 0 0 auto;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant)));
}

.wl-group__rows {
    list-style: none;
    margin: 0;
    padding: 0;
}

.wl-row {
    inline-size: 100%;
    display: flex;
    align-items: center;
    gap: 18px;
    /* 15px vertical against a 38px icon puts the row at 68px, comfortably past the 48px minimum
       without a fixed height that would clip a wrapped bilingual name. */
    padding: 15px 12px;
    border: 0;
    border-block-end: 1px solid rgb(var(--v-theme-outline-variant));
    background: none;
    text-align: start;
    cursor: pointer;
    color: inherit;
}

.wl-row:hover {
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
}

.wl-row__icon {
    flex: 0 0 38px;
    inline-size: 38px;
    block-size: 38px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    background: rgb(var(--v-theme-surface-container, var(--v-theme-surface)));
    border: 1px solid rgb(var(--v-theme-outline-variant));
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-row__text {
    flex: 1 1 auto;
    /* The flex child that can shrink. Without this the name hard-clips instead of wrapping,
       which is the exact defect this project has fixed in a dozen other flexed titles. */
    min-inline-size: 0;
}

.wl-row__name {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 10px;
    min-inline-size: 0;
}

.wl-row__label {
    font-size: 0.9375rem;
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

/* Wraps below the name at narrow widths rather than squeezing it, which is why it is a flex
   sibling with wrapping allowed rather than an absolutely positioned suffix. */
.wl-row__meta {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant)));
}

.wl-row__blurb {
    display: block;
    margin-block-start: 3px;
    max-inline-size: 78ch;
    font-size: 0.8125rem;
    line-height: 19px;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-row__chevron {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant)));
}

.wl-row__hit {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
    border-radius: 3px;
    padding-inline: 1px;
}

.wl-catalogue__empty {
    margin: 24px 0 0;
    font-size: 0.875rem;
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
