<script setup lang="ts">
/**
 * One catalogue, drawn from the resolved definition rather than a list of its own, so every feature
 * the application declares appears here - including the ones this checkout's capability gate
 * removes, which are absent rather than shown greyed out, per the shared restricted-mode rule.
 *
 * The search bar is the existing one: `ConfigSearchField`, the same matcher, the same anchored
 * regex builder every other search bar in this application uses, and the same four-scope search
 * pattern. It is used as a component rather than hand-rolled, because `ConfigRegexBuilder` on its
 * own has no `v-model`/`anchored` contract to bind to - its real props are `pattern`, `flags` and
 * `sample`, all required, wired up inside a `v-menu` exactly the way `ConfigSearchField` already
 * does it.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowLeft, mdiChevronRight } from "@mdi/js";
import { VIcon } from "vuetify/components";
import ConfigSearchField from "../components/config/ConfigSearchField.vue";
import type { CatalogueFeatureDefinition } from "../components/shell/index.js";
import {
    catalogueSampleText,
    createCatalogueMatcher,
    filterCatalogues,
    groupFeatures,
    type ResolvedCatalogue,
} from "../components/shell/catalogueSearch.js";
import { KID_FEATURE_LABELS, kidAccessibleName, kidCatalogueLabel, kidLabel } from "./kidLabels.js";
import { useKidMode } from "./kidMode.js";

const props = defineProps<{ catalogue: ResolvedCatalogue }>();
const emit = defineEmits<{ back: []; activate: [feature: CatalogueFeatureDefinition] }>();

const { t } = useI18n();
const kid = useKidMode();

const query = ref("");
const regex = ref(false);
const flags = ref("i");

const matcher = computed(() => createCatalogueMatcher(query.value, regex.value, flags.value));

/**
 * `filterCatalogues` never drops a catalogue with zero matches (Home relies on that so its five
 * cards never reflow to four), so this always has exactly one entry for the one catalogue it was
 * given - but the return type is still `ResolvedCatalogue[]`, and with
 * `noUncheckedIndexedAccess: true` a bare `[0]` types as possibly `undefined`. The fallback below
 * is never actually reached; it exists so the type-checker's own honesty is satisfied without a
 * non-null assertion.
 */
const shown = computed<ResolvedCatalogue>(() => filterCatalogues([props.catalogue], matcher.value)[0] ?? props.catalogue);

/** The real grouping helper every other catalogue page uses, rather than a hand-rolled `Map`. */
const groups = computed(() => groupFeatures(shown.value));

const sample = computed(() => catalogueSampleText(props.catalogue.features));
</script>

<template>
    <section class="wl-kid-cat">
        <header class="wl-kid-cat__head">
            <button class="wl-kid-cat__back" type="button" :aria-label="t('shell.catalogue.back', 'All five catalogues')" @click="emit('back')">
                <v-icon :icon="mdiArrowLeft" size="24" aria-hidden="true" />
            </button>
            <h1>{{ kidCatalogueLabel(props.catalogue.id, props.catalogue.title) }}</h1>
            <p>{{ props.catalogue.title }} · {{ props.catalogue.features.length }}</p>
            <ConfigSearchField
                v-model="query"
                v-model:regex="regex"
                v-model:flags="flags"
                class="wl-kid-cat__search"
                :label="t('kid.search', 'Look for something…')"
                :sample="sample"
                density="comfortable"
            />
        </header>

        <div v-for="group in groups" :key="group.key" class="wl-kid-cat__group">
            <h2>{{ group.heading }} <span>{{ group.features.length }}</span></h2>
            <ul>
                <li v-for="feature in group.features" :key="feature.definition.key">
                    <button type="button" :aria-label="kidAccessibleName(feature.name, KID_FEATURE_LABELS)" @click="emit('activate', feature.definition)">
                        <v-icon :icon="feature.definition.icon" size="26" aria-hidden="true" />
                        <span class="wl-kid-cat__labels">
                            <strong>{{ kidLabel(feature.name, KID_FEATURE_LABELS, kid.labelStyle.value).primary }}</strong>
                            <em v-if="kidLabel(feature.name, KID_FEATURE_LABELS, kid.labelStyle.value).secondary">
                                {{ kidLabel(feature.name, KID_FEATURE_LABELS, kid.labelStyle.value).secondary }}
                            </em>
                            <!-- The shipped blurb stays: it is the product's own voice and the article's first sentence. -->
                            <small>{{ feature.blurb }}</small>
                        </span>
                        <span v-if="feature.meta" class="wl-kid-cat__meta">{{ feature.meta }}</span>
                        <v-icon class="wl-kid-cat__chevron" :icon="mdiChevronRight" size="22" aria-hidden="true" />
                    </button>
                </li>
            </ul>
        </div>
    </section>
</template>

<style scoped>
.wl-kid-cat { padding: 16px 24px 28px; overflow: auto; }
.wl-kid-cat__head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.wl-kid-cat__head h1 { margin: 0; font-size: 34px; font-weight: 800; }
.wl-kid-cat__head p { margin: 0; font-size: 18px; color: rgb(var(--v-theme-outline)); }
.wl-kid-cat__back { min-width: var(--wl-kid-target-min); min-height: var(--wl-kid-target-min); border: 0; border-radius: var(--wl-kid-radius-md); background: rgb(var(--v-theme-surface-container-lowest)); cursor: pointer; display: grid; place-items: center; }
.wl-kid-cat__search { flex: 1 1 260px; margin-left: auto; }
.wl-kid-cat__group { margin-top: 18px; }
.wl-kid-cat__group h2 { font-size: 21px; color: rgb(var(--v-theme-secondary)); }
.wl-kid-cat__group ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; }
.wl-kid-cat__group button { width: 100%; min-height: 88px; display: flex; align-items: center; gap: 13px; padding: 13px 15px; border: 0; border-radius: var(--wl-kid-radius-md); background: rgb(var(--v-theme-surface-container-lowest)); box-shadow: var(--wl-kid-press); font: inherit; text-align: left; cursor: pointer; }
.wl-kid-cat__labels { display: flex; flex-direction: column; min-width: 0; }
.wl-kid-cat__labels strong { font-size: 22px; font-weight: 800; }
.wl-kid-cat__labels em { font-style: normal; font-size: 15px; color: rgb(var(--v-theme-outline)); }
.wl-kid-cat__labels small { font-size: 15px; color: rgb(var(--v-theme-on-surface-variant)); text-wrap: pretty; }
.wl-kid-cat__meta { font-family: var(--wl-kid-mono); font-size: 13px; color: rgb(var(--v-theme-outline)); }
.wl-kid-cat__chevron { flex-shrink: 0; color: rgb(var(--v-theme-outline)); }
</style>
