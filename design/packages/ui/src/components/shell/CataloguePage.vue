<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowLeft, mdiChevronRight } from "@mdi/js";
import { VBtn, VDivider, VIcon, VListItem } from "vuetify/components";
import { catalogueTone, takeCatalogueGroup } from "../home/catalogueTone.js";
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
 * One catalogue, as a list rather than as more cards - the approved prototype's catalogue page.
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

const tone = computed(() => catalogueTone(props.catalogueId));

const countLabel = computed(() =>
    t("shell.home.card.count", { count: String(totalCount.value) }, "{count} features"),
);

function groupCount(count: number): string {
    return count === 1
        ? t("shell.catalogue.group.countOne", "1 feature")
        : t("shell.home.card.count", { count: String(count) }, "{count} features");
}

/** The DOM id of a group heading, so a Home chip can land on it. */
function groupAnchor(key: string): string {
    return `wl-group-${props.catalogueId}-${key.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
}

onMounted(() => {
    const key = takeCatalogueGroup(props.catalogueId);
    if (key === null) return;
    void nextTick(() => {
        const heading = document.getElementById(groupAnchor(key));
        heading?.scrollIntoView?.({ block: "start" });
        heading?.focus({ preventScroll: true });
    });
});

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
            A text button that says where it goes. It is the only way out of this page that does
            not go through the rail, so naming the destination is the whole job.
        -->
        <div class="wl-catalogue__backrow">
            <v-btn
                class="wl-back mb-interactive"
                variant="text"
                size="small"
                :prepend-icon="mdiArrowLeft"
                @click="emit('back')"
            >
                {{ t("shell.catalogue.back", "All catalogues") }}
            </v-btn>
        </div>

        <div class="wl-catalogue__inner">
            <header v-if="catalogue" class="wl-catalogue__header">
                <span class="wl-catalogue__avatar" :class="`wl-catalogue__avatar--${tone.tile}`">
                    <v-icon :icon="tone.icon" size="30" />
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
                density="default"
                :label="t('shell.catalogue.search.label', 'Search this list')"
                :sample="catalogueSampleText(catalogue.features)"
                :summary="summary"
            >
                <template #meta>
                    <span class="wl-catalogue__search-meta">{{ countLabel }}</span>
                </template>
            </ConfigSearchField>

            <section v-for="group in groups" :key="group.key" class="wl-group">
                <!--
                    A heading, a rule that fills the gap, and the count on the right. The rule is
                    what makes a divided list read as sections rather than as one long run of rows
                    with the occasional bold word in it.
                -->
                <div class="wl-group__head">
                    <h2 :id="groupAnchor(group.key)" class="wl-group__name" tabindex="-1">
                        {{ group.heading }}
                    </h2>
                    <v-divider class="wl-group__rule" />
                    <span class="wl-group__count">{{ groupCount(group.features.length) }}</span>
                </div>

                <ul class="wl-group__rows">
                    <li v-for="feature in group.features" :key="feature.definition.key">
                        <v-list-item
                            class="wl-row mb-interactive"
                            rounded="0"
                            role="button"
                            link
                            :ripple="false"
                            @click="emit('activateFeature', feature.definition)"
                        >
                            <template #prepend>
                                <span class="wl-row__icon">
                                    <v-icon :icon="feature.definition.icon" size="20" />
                                </span>
                            </template>
                            <span class="wl-row__name">
                                <!--
                                    Text nodes, never v-html. The corpus is translated copy and a
                                    query somebody typed, and no highlight is worth an injection
                                    surface.
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
                            <template #append>
                                <v-icon class="wl-row__chevron" :icon="mdiChevronRight" size="20" />
                            </template>
                        </v-list-item>
                    </li>
                </ul>
            </section>

            <p v-if="catalogue && shownCount === 0" class="wl-catalogue__empty" role="status">
                {{
                    t(
                        "shell.catalogue.search.none",
                        { query },
                        "Nothing in this list matches “{query}”.",
                    )
                }}
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
    padding: 16px 48px 0;
}

.wl-catalogue__inner {
    max-inline-size: 1106px;
    padding: 16px 48px 48px;
}

@media (max-width: 900px) {
    .wl-catalogue__backrow,
    .wl-catalogue__inner {
        padding-inline: 16px;
    }
}

.wl-catalogue .v-btn.wl-back {
    text-transform: none;
    letter-spacing: normal;
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: var(--md-sys-typescale-body-medium-size);
}

.wl-back:focus-visible,
.wl-row:focus-visible,
.wl-group__name:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.wl-catalogue__header {
    display: flex;
    align-items: flex-start;
    gap: 16px;
}

.wl-catalogue__avatar {
    inline-size: 56px;
    block-size: 56px;
    flex: 0 0 56px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-large);
}

.wl-catalogue__avatar--primary {
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
}

.wl-catalogue__avatar--secondary {
    background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}

.wl-catalogue__avatar--tertiary {
    background: rgb(var(--v-theme-tertiary-container));
    color: rgb(var(--v-theme-on-tertiary-container));
}

.wl-catalogue__avatar--neutral {
    background: rgb(var(--v-theme-surface-container-high));
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-catalogue__heading {
    /* The flex child that can shrink, so a long translated title wraps instead of hard-clipping. */
    min-inline-size: 0;
}

.wl-catalogue__title {
    margin: 0;
    font-size: var(--md-sys-typescale-headline-large-size);
    line-height: var(--md-sys-typescale-headline-large-line-height);
    font-weight: 400;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.wl-catalogue__blurb {
    margin: 8px 0 0;
    max-inline-size: 68ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 21px;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-catalogue__search {
    margin-block-start: 24px;
}

.wl-catalogue__search :deep(.v-field) {
    min-block-size: 48px;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-surface-container));
}

.wl-catalogue__search :deep(.v-field__outline) {
    --v-field-border-opacity: 1;
    color: rgb(var(--v-theme-outline-variant));
}

.wl-catalogue__search :deep(.v-field--focused .v-field__outline) {
    color: rgb(var(--v-theme-primary));
}

.wl-catalogue__search-meta {
    flex: 0 0 auto;
    margin-inline-end: 8px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
    white-space: nowrap;
}

.wl-group {
    margin-block-start: 32px;
}

.wl-group__head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-block-end: 8px;
}

/*
 * Primary, not on-surface-variant. The heading is the one thing on this page that has to be
 * findable while scanning past forty rows, and the colour is doing that work rather than
 * decoration - it is paired with size, weight and tracking, never carrying the distinction alone.
 */
.wl-group__name {
    margin: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
    min-inline-size: 0;
    scroll-margin-block-start: 16px;
}

.wl-group__rule {
    flex: 1 1 auto;
}

.wl-group__count {
    flex: 0 0 auto;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
}

.wl-group__rows {
    list-style: none;
    margin: 0;
    padding: 0;
}

/*
 * `prototypeSurface.scss` draws every list item inside a shell layer as an outlined card row;
 * these are rows of a divided list, so they reset that surface.
 */
.wl-catalogue .v-list-item.wl-row {
    margin: 0;
    border: 0;
    border-block-end: 1px solid rgb(var(--v-theme-surface-container));
    border-radius: 0;
    background: transparent;
    min-block-size: 0;
}

.wl-catalogue .v-list-item.wl-row {
    /* 16px vertical against a 40px tile puts the row past 68px, comfortably over the 48px minimum
       without a fixed height that would clip a wrapped bilingual name. */
    padding: 16px 12px;
}

.wl-row :deep(.v-list-item__prepend) {
    margin-inline-end: 16px;
}

.wl-row :deep(.v-list-item__prepend > .v-list-item__spacer) {
    display: none;
}

.wl-row__icon {
    flex: 0 0 40px;
    inline-size: 40px;
    block-size: 40px;
    display: grid;
    place-items: center;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-surface-container));
    border: 1px solid rgb(var(--v-theme-outline-variant));
    color: rgb(var(--v-theme-on-surface-variant));
}

.wl-row__name {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 12px;
    min-inline-size: 0;
}

.wl-row__label {
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

/* Wraps below the name at narrow widths rather than squeezing it. */
.wl-row__meta {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
}

.wl-row__blurb {
    display: block;
    margin-block-start: 4px;
    max-inline-size: 78ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

.wl-row__chevron {
    color: rgb(var(--v-theme-outline));
}

.wl-row__hit {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
    border-radius: var(--md-sys-shape-corner-extra-small);
    padding-inline: 1px;
}

.wl-catalogue__empty {
    margin: 24px 0 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
