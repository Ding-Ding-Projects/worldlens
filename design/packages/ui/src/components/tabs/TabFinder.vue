<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCropFree, mdiTextSearchVariant } from "@mdi/js";
import { VBtn, VChip, VChipGroup, VDivider, VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import TabBulkClose from "./TabBulkClose.vue";
import TabPlanConfirm from "./TabPlanConfirm.vue";
import TabResultList from "./TabResultList.vue";
import { planSelectionClose, type TabClosePlan } from "./closePlans.js";
import type { TabStripState, TabWorkspaceState } from "./tabModel.js";
import {
    groupNameSample,
    searchAllTabs,
    searchGroups,
    searchStripTabs,
    stripSample,
    workspaceGroupCount,
    workspaceSample,
    workspaceTabCount,
    type GroupHit,
    type TabHit,
} from "./tabSearch.js";

/**
 * The searchable tab list: three of the contract's four searches, and both bulk
 * closes, on one anchored surface.
 *
 * The fourth - the per-group search - lives in each group's own menu, because
 * that is the only place where "this group" is unambiguous. Putting it here
 * would need a group picker, and a picker is exactly how a per-group search
 * quietly becomes a strip search with a filter.
 *
 * Each field below declares its own `query`, `regexMode` and `flags`. That is
 * three separate `createSettingMatcher` calls over three different corpora, and
 * three separate `ConfigSearchField`s each opening its own builder anchored to
 * itself. Nothing is shared, including the sample text the builders preview
 * against, which is deliberately the real corpus of that particular search so a
 * preview cannot promise a match the search then fails to return.
 *
 * The searches sit behind the design's scope chips rather than in a stack of
 * collapsible sections, so a person who opened this to close a batch of tabs reaches
 * the selection footer without scrolling past three result lists. The strip's own
 * search is the scope it opens on.
 */
const props = defineProps<{
    /** Every strip the application owns, which is what the master search covers. */
    workspace: TabWorkspaceState;
    /** The strip this surface was opened from. */
    strip: TabStripState;
}>();

const emit = defineEmits<{
    activate: [hit: TabHit];
    pin: [hit: TabHit];
    unpin: [hit: TabHit];
    ungroup: [hit: TabHit];
    close: [hit: TabHit];
    /** Reveal a group and put focus on its header, without changing its saved state. */
    "focus-group": [hit: GroupHit];
    /** Write the collapsed preference for a group. */
    "set-collapsed": [hit: GroupHit, collapsed: boolean];
    apply: [plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }];
}>();

const { t } = useI18n();

/* -------------------------------------------------------------------------- */
/* Search 1: this strip                                                        */
/* -------------------------------------------------------------------------- */

const stripQuery = ref("");
const stripRegex = ref(false);
const stripFlags = ref("i");

const stripHits = computed(() =>
    searchStripTabs(props.strip, createSettingMatcher(stripQuery.value, stripRegex.value, stripFlags.value)),
);

const stripSummary = computed(() =>
    t(
        "tabs.find.stripSummary",
        { shown: stripHits.value.length, total: props.strip.tabs.length },
        "Showing {shown} of {total}",
    ),
);

/* -------------------------------------------------------------------------- */
/* Search 4: every tab, everywhere                                             */
/* -------------------------------------------------------------------------- */

const allQuery = ref("");
const allRegex = ref(false);
const allFlags = ref("i");

const allHits = computed(() =>
    searchAllTabs(props.workspace, createSettingMatcher(allQuery.value, allRegex.value, allFlags.value)),
);

/**
 * How wide "everywhere" actually is, stated rather than implied.
 *
 * A master search that finds two results is telling the truth about a
 * single-window application, and saying how many windows and strips it looked
 * through is what makes that reading obvious instead of suspicious.
 */
const allSummary = computed(() =>
    t(
        "tabs.find.allSummary",
        {
            shown: allHits.value.length,
            total: workspaceTabCount(props.workspace),
            windows: new Set(props.workspace.strips.map((strip) => strip.windowId)).size,
            strips: props.workspace.strips.length,
        },
        "Showing {shown} of {total} tabs, across {windows} windows and {strips} strips",
    ),
);

/* -------------------------------------------------------------------------- */
/* Search 3: groups by name                                                    */
/* -------------------------------------------------------------------------- */

const groupQuery = ref("");
const groupRegex = ref(false);
const groupFlags = ref("i");

const groupHits = computed(() =>
    searchGroups(props.workspace, createSettingMatcher(groupQuery.value, groupRegex.value, groupFlags.value)),
);

const groupSummary = computed(() =>
    t(
        "tabs.find.groupSummary",
        { shown: groupHits.value.length, total: workspaceGroupCount(props.workspace) },
        "Showing {shown} of {total} groups",
    ),
);

/* -------------------------------------------------------------------------- */
/* Scopes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The design's four filter chips across the top of the card. Each chip is one of the
 * contract's searches (or the bulk close), and each keeps its own field, query, mode and
 * flags, so switching scope never carries a query from one search into another.
 *
 * "Tabs" is this strip's own search and the scope the card opens on; "Everywhere" is the
 * master search across every window and strip; "Groups" searches group names; "Bulk
 * close" holds both text closes. The per-group search still lives in each group's menu.
 */
type Scope = "strip" | "all" | "groups" | "close";
const scope = ref<Scope>("strip");

const scopes = computed<readonly { id: Scope; label: string }[]>(() => [
    { id: "strip", label: t("tabs.find.scope.tabs", "Tabs") },
    { id: "all", label: t("tabs.find.scope.everywhere", "Everywhere") },
    { id: "groups", label: t("tabs.find.scope.groups", "Groups") },
    { id: "close", label: t("tabs.find.scope.close", "Bulk close") },
]);

const panelId = useId();

/* -------------------------------------------------------------------------- */
/* The hand-picked bulk close                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Tabs ticked in the result list. Ticking is per strip, because the close it feeds is
 * scoped to the strip this card was opened from; a result from another strip in the
 * "Everywhere" scope shows no checkbox rather than one that could not be honoured.
 */
const selection = ref<string[]>([]);
const reviewing = ref(false);

watch(
    () => props.strip.tabs.map((tab) => tab.id).join("\n"),
    () => {
        const live = new Set(props.strip.tabs.map((tab) => tab.id));
        selection.value = selection.value.filter((id) => live.has(id));
    },
);

function toggleSelect(hit: TabHit): void {
    if (hit.stripId !== props.strip.id) return;
    selection.value = selection.value.includes(hit.tabId)
        ? selection.value.filter((id) => id !== hit.tabId)
        : [...selection.value, hit.tabId];
}

/** Inverts the selection over the rows on screen, never over tabs the search has hidden. */
function invertSelection(): void {
    const visible = (scope.value === "all" ? allHits.value : stripHits.value).filter(
        (hit) => hit.stripId === props.strip.id,
    );
    const visibleIds = new Set(visible.map((hit) => hit.tabId));
    const kept = selection.value.filter((id) => !visibleIds.has(id));
    const flipped = visible.filter((hit) => !selection.value.includes(hit.tabId)).map((hit) => hit.tabId);
    selection.value = [...kept, ...flipped];
}

const selectionPlan = (includePinned: boolean): TabClosePlan =>
    planSelectionClose(props.strip, selection.value, includePinned);

const bulkNote = computed(() =>
    selection.value.length === 0
        ? t(
              "tabs.find.bulkNote",
              "Selecting several and pressing Close previews exactly what would go before it does it.",
          )
        : t(
              "tabs.find.bulkSelected",
              { count: selection.value.length },
              "{count} selected. Pinned tabs are left out unless you include them in the preview.",
          ),
);

const bulkLabel = computed(() =>
    selection.value.length === 0
        ? t("tabs.find.closeNothing", "Close nothing")
        : t("tabs.find.closeSelected", { count: selection.value.length }, "Close {count} tabs..."),
);

function onReviewApply(plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }): void {
    emit("apply", plan, options);
    reviewing.value = false;
    selection.value = [];
}
</script>

<template>
    <div class="mb-tabs-finder" role="dialog" :aria-label="t('tabs.find.title', 'Find a tab')">
        <header class="mb-tabs-finder__head">
            <v-icon :icon="mdiTextSearchVariant" size="20" color="primary" aria-hidden="true" />
            <h3 class="mb-tabs-finder__title">{{ t("tabs.find.title", "Find a tab") }}</h3>
            <span class="mb-tabs-finder__where">
                {{ t("tabs.find.strip", { strip: strip.label }, "Search this strip: {strip}") }}
            </span>
        </header>

        <div class="mb-tabs-finder__scopes">
            <v-chip-group
                v-model="scope"
                mandatory
                selected-class="mb-tabs-finder__scope--on"
                :aria-label="t('tabs.find.scopes', 'What to search')"
            >
                <v-chip
                    v-for="entry in scopes"
                    :key="entry.id"
                    :value="entry.id"
                    class="mb-tabs-finder__scope"
                    variant="outlined"
                    size="small"
                    :aria-controls="panelId"
                >
                    {{ entry.label }}
                </v-chip>
            </v-chip-group>
        </div>

        <v-divider />

        <div :id="panelId" class="mb-tabs-finder__body">
            <!-- Search 1: this strip -->
            <template v-if="scope === 'strip'">
                <div class="mb-tabs-finder__field">
                    <ConfigSearchField
                        v-model="stripQuery"
                        v-model:regex="stripRegex"
                        v-model:flags="stripFlags"
                        :label="t('tabs.find.stripLabel', 'Search the tabs in this strip')"
                        :placeholder="t('tabs.find.hint', 'part of a tab label')"
                        :sample="stripSample(strip)"
                        :summary="stripSummary"
                    />
                </div>
                <TabResultList
                    :hits="stripHits"
                    :show-location="false"
                    :selected="selection"
                    :empty-message="
                        t('tabs.find.noneStrip', 'No tab in this strip has a label matching that search.')
                    "
                    @activate="emit('activate', $event)"
                    @pin="emit('pin', $event)"
                    @unpin="emit('unpin', $event)"
                    @ungroup="emit('ungroup', $event)"
                    @close="emit('close', $event)"
                    @toggle-select="toggleSelect"
                />
            </template>

            <!-- Search 4: every tab, everywhere -->
            <template v-else-if="scope === 'all'">
                <div class="mb-tabs-finder__field">
                    <ConfigSearchField
                        v-model="allQuery"
                        v-model:regex="allRegex"
                        v-model:flags="allFlags"
                        :label="t('tabs.find.allLabel', 'Search every open tab')"
                        :placeholder="t('tabs.find.hint', 'part of a tab label')"
                        :sample="workspaceSample(workspace)"
                        :summary="allSummary"
                    />
                </div>
                <TabResultList
                    :hits="allHits"
                    :empty-message="t('tabs.find.noneAll', 'No open tab anywhere has a label matching that search.')"
                    @activate="emit('activate', $event)"
                    @pin="emit('pin', $event)"
                    @unpin="emit('unpin', $event)"
                    @ungroup="emit('ungroup', $event)"
                    @close="emit('close', $event)"
                />
            </template>

            <!-- Search 3: groups by name -->
            <template v-else-if="scope === 'groups'">
                <div class="mb-tabs-finder__field">
                    <ConfigSearchField
                        v-model="groupQuery"
                        v-model:regex="groupRegex"
                        v-model:flags="groupFlags"
                        :label="t('tabs.find.groupsLabel', 'Search group names')"
                        :placeholder="t('tabs.find.groupHint', 'part of a group name')"
                        :sample="groupNameSample(workspace)"
                        :summary="groupSummary"
                    />
                </div>

                <p v-if="groupHits.length === 0" class="mb-tabs-finder__empty" role="status">
                    {{ t("tabs.find.noneGroups", "No group has a name matching that search.") }}
                </p>

                <ul v-else class="mb-tabs-finder__groups">
                    <li v-for="hit in groupHits" :key="`${hit.stripId}:${hit.groupId}`">
                        <v-btn
                            variant="text"
                            size="small"
                            block
                            class="mb-tabs-finder__group"
                            :prepend-icon="mdiCropFree"
                            @click="emit('focus-group', hit)"
                        >
                            {{ hit.name }}
                        </v-btn>
                        <div class="mb-tabs-finder__group-meta">
                            <v-chip
                                class="mb-tabs-finder__group-name"
                                size="x-small"
                                :color="hit.color"
                                variant="tonal"
                            >
                                {{ hit.name }}
                            </v-chip>
                            <v-chip size="x-small" variant="outlined">
                                {{ t("tabs.find.groupCount", { count: hit.tabCount }, "{count} tabs") }}
                            </v-chip>
                            <v-chip size="x-small" variant="outlined">{{ hit.windowLabel }}</v-chip>
                            <v-chip size="x-small" variant="outlined">{{ hit.stripLabel }}</v-chip>
                            <v-btn
                                variant="text"
                                size="x-small"
                                density="comfortable"
                                @click="emit('set-collapsed', hit, !hit.collapsed)"
                            >
                                {{
                                    hit.collapsed
                                        ? t("tabs.group.expand", "Expand")
                                        : t("tabs.group.collapse", "Collapse")
                                }}
                            </v-btn>
                        </div>
                    </li>
                </ul>
            </template>

            <!-- Both text bulk closes, scoped to this strip -->
            <div v-else class="mb-tabs-finder__close">
                <TabBulkClose :strip="strip" :group-id="null" @apply="(plan, options) => emit('apply', plan, options)" />
            </div>
        </div>

        <template v-if="scope === 'strip' || scope === 'all'">
            <v-divider />
            <div v-if="reviewing && selection.length > 0" class="mb-tabs-finder__review">
                <TabPlanConfirm
                    :strip="strip"
                    :title="t('tabs.find.reviewTitle', { count: selection.length }, 'Close the {count} selected tabs')"
                    :build="selectionPlan"
                    @apply="onReviewApply"
                />
                <v-btn variant="text" size="small" @click="reviewing = false">
                    {{ t("tabs.find.backToList", "Back to the list") }}
                </v-btn>
            </div>
            <footer class="mb-tabs-finder__foot">
                <p class="mb-tabs-finder__note" aria-live="polite">{{ bulkNote }}</p>
                <v-btn variant="outlined" size="small" class="mb-tabs-finder__invert" @click="invertSelection">
                    {{ t("tabs.find.invert", "Invert") }}
                </v-btn>
                <v-btn
                    variant="flat"
                    size="small"
                    :color="selection.length === 0 ? 'outline-variant' : 'error-container'"
                    :disabled="selection.length === 0"
                    :aria-expanded="reviewing ? 'true' : 'false'"
                    class="mb-tabs-finder__bulk"
                    @click="reviewing = true"
                >
                    {{ bulkLabel }}
                </v-btn>
            </footer>
        </template>
    </div>
</template>

<style>
/*
 * The design's tab finder: a 660px card on the surface-container role with the 28dp
 * extra-large corner, a header row, a row of scope chips, the 48dp result rows and a
 * selection footer, each band separated by an outline-variant divider.
 */
.mb-tabs-finder {
    /* This content is mounted inside the tab sheet, which is itself clamped to
       `calc(100vw - 16px)`. A fixed minimum used to overflow that sheet at phone
       widths before the sheet's own max-width could help. */
    box-sizing: border-box;
    width: min(660px, calc(100vw - 16px));
    min-width: 0;
    max-width: 660px;
    padding: 0;
    background: rgb(var(--v-theme-surface-container));
    color: rgb(var(--v-theme-on-surface));
}

.mb-tabs-finder .v-divider {
    border-color: rgb(var(--v-theme-outline-variant));
    opacity: 1;
}

.mb-tabs-finder__head {
    display: flex;
    align-items: center;
    gap: 12px;
    min-block-size: 56px;
    padding-inline: 20px;
}

.mb-tabs-finder__title {
    margin: 0;
    font-size: var(--md-sys-typescale-title-small-size);
    line-height: var(--md-sys-typescale-title-small-line-height);
    font-weight: var(--md-sys-typescale-title-small-weight);
}

.mb-tabs-finder__where {
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
    overflow-wrap: anywhere;
}

.mb-tabs-finder__scopes {
    padding: 4px 16px;
}

.mb-tabs-finder__scope.v-chip {
    border-color: rgb(var(--v-theme-outline-variant));
    color: rgb(var(--v-theme-on-surface-variant));
    font-weight: var(--md-sys-typescale-label-large-weight);
}

.mb-tabs-finder__scope.mb-tabs-finder__scope--on.v-chip {
    background: rgb(var(--v-theme-primary-container));
    border-color: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

.mb-tabs-finder__body {
    padding-block: 8px;
}

.mb-tabs-finder__field {
    padding: 4px 20px 8px;
}

.mb-tabs-finder__close {
    padding: 4px 20px 8px;
}

.mb-tabs-finder__groups {
    margin: 4px 0;
    padding: 0 12px;
    list-style: none;
    max-height: 340px;
    overflow-y: auto;
}

.mb-tabs-finder__group {
    justify-content: flex-start;
    text-transform: none;
    letter-spacing: normal;
}

.mb-tabs-finder__group-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding-inline: 8px;
    padding-block-end: 4px;
}

/* A group name is user-authored. Vuetify chips default to a single clipped line,
   which turns a narrow finder into a silent character cutter. Keep the compact
   chip, but let its full accessible text wrap inside the available row width. */
.mb-tabs-finder__group-name.v-chip {
    min-width: 0;
    max-width: 100%;
    height: auto;
}

.mb-tabs-finder__group-name .v-chip__content {
    white-space: normal;
    overflow-wrap: anywhere;
    padding-block: 2px;
}

.mb-tabs-finder__empty {
    margin: 0;
    padding: 8px 20px;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-tabs-finder__review {
    padding: 8px 20px 0;
}

.mb-tabs-finder__foot {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 20px;
}

.mb-tabs-finder__note {
    flex: 1 1 200px;
    min-inline-size: 0;
    margin: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    color: rgb(var(--v-theme-outline));
}

.mb-tabs-finder__invert.v-btn,
.mb-tabs-finder__bulk.v-btn {
    border-radius: var(--md-sys-shape-corner-full);
    text-transform: none;
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    min-block-size: 40px;
}

.mb-tabs-finder__invert.v-btn {
    border-color: rgb(var(--v-theme-outline));
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
