<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mdiClose, mdiPin, mdiPinOffOutline, mdiTab, mdiTabUnselected } from "@mdi/js";
import { VBtn, VCheckboxBtn, VChip, VIcon, VList, VListItem } from "vuetify/components";
import { actionsFor, type TabHit } from "./tabSearch.js";

/**
 * The rows a tab search returns, wherever the search was run from.
 *
 * Shared by the strip search, the per-group search and the master search, which
 * is the point: a result row means the same thing and offers the same actions
 * whichever field produced it. What differs between those searches is the scope,
 * and the scope is a property of the query rather than of the row.
 *
 * **Every row says where it is.** Two tabs called "Settings" in two windows are
 * otherwise indistinguishable, so the window, the strip, the group and the
 * pinned state are chips beside the label rather than something a person has to
 * infer. `showLocation` turns the window and strip chips off for a search that
 * cannot leave one strip, where repeating them on every row is noise.
 *
 * **A result in a collapsed group says so, and activating it does not un-collapse
 * the group permanently.** The host adds the group to its runtime revealed set;
 * the saved preference is untouched. See `isGroupExpanded` in `tabModel.ts`.
 *
 * **Only the valid actions are drawn.** `actionsFor` decides, so an unpinned tab
 * never shows an Unpin that would do nothing. A control that cannot perform its
 * labelled action is a defect in this project, not a greyed-out convenience.
 */
const props = withDefaults(
    defineProps<{
        hits: readonly TabHit[];
        /** Shown in place of the list when the search matched nothing. */
        emptyMessage: string;
        /** False for a search that cannot leave one strip, where the chips repeat. */
        showLocation?: boolean;
        /**
         * Ticked tab ids, when the host offers a hand-picked bulk close. Null hides the
         * checkboxes entirely, which is what the group menu's own search wants.
         */
        selected?: readonly string[] | null;
    }>(),
    { showLocation: true, selected: null },
);

const emit = defineEmits<{
    /** Select this tab, reveal it if it is inside a collapsed group, and focus it. */
    activate: [hit: TabHit];
    pin: [hit: TabHit];
    unpin: [hit: TabHit];
    ungroup: [hit: TabHit];
    close: [hit: TabHit];
    /** Tick or untick a row for the hand-picked bulk close. */
    "toggle-select": [hit: TabHit];
}>();

const { t } = useI18n();

function act(action: string, hit: TabHit): void {
    if (action === "activate") emit("activate", hit);
    else if (action === "pin") emit("pin", hit);
    else if (action === "unpin") emit("unpin", hit);
    else if (action === "ungroup") emit("ungroup", hit);
    else if (action === "close") emit("close", hit);
}

function isSelected(hit: TabHit): boolean {
    return props.selected?.includes(hit.tabId) ?? false;
}

/**
 * The trailing word the design prints on every row. Pinned outranks the rest because
 * it is the one state a bulk close treats differently; a collapsed group is said next,
 * because it is the one that explains why the tab is not visible on the strip.
 */
function stateOf(hit: TabHit): string {
    if (hit.pinned) return t("tabs.find.pinned", "pinned");
    if (hit.groupCollapsed) return t("tabs.find.collapsedShort", "collapsed");
    return t("tabs.find.open", "open");
}
</script>

<template>
    <p v-if="hits.length === 0" class="mb-tabs-results__empty" role="status">{{ emptyMessage }}</p>

    <v-list v-else class="mb-tabs-results" density="comfortable" bg-color="transparent">
        <v-list-item
            v-for="hit in hits"
            :key="`${hit.stripId}:${hit.tabId}`"
            class="mb-tabs-results__row"
            :class="{ 'mb-tabs-results__row--selected': isSelected(hit) }"
        >
            <template #prepend>
                <v-checkbox-btn
                    v-if="selected !== null"
                    class="mb-tabs-results__check"
                    :model-value="isSelected(hit)"
                    color="primary"
                    density="compact"
                    :aria-label="t('tabs.find.select', { label: hit.label }, 'Select {label} for closing')"
                    @update:model-value="emit('toggle-select', hit)"
                />
                <v-icon class="mb-tabs-results__icon" :icon="hit.icon ?? mdiTab" size="20" aria-hidden="true" />
            </template>

            <v-btn
                class="mb-tabs-results__go"
                variant="text"
                color="on-surface"
                size="small"
                block
                :title="hit.label"
                @click="emit('activate', hit)"
            >
                <span class="mb-tabs-results__label">{{ hit.label }}</span>
            </v-btn>

            <div class="mb-tabs-results__meta">
                <v-chip v-if="showLocation" size="x-small" variant="outlined">{{ hit.windowLabel }}</v-chip>
                <v-chip v-if="showLocation" size="x-small" variant="outlined">{{ hit.stripLabel }}</v-chip>
                <v-chip v-if="hit.groupCollapsed" size="x-small" variant="outlined">
                    {{ t("tabs.find.collapsed", "in a collapsed group") }}
                </v-chip>
            </div>

            <template #append>
                <v-chip
                    class="mb-tabs-results__group-name"
                    :class="{ 'mb-tabs-results__group-name--none': hit.groupName === null }"
                    size="small"
                    variant="flat"
                    :color="hit.groupName === null ? 'surface-container-highest' : 'primary-container'"
                >
                    {{ hit.groupName ?? t("tabs.find.noGroup", "no group") }}
                </v-chip>
                <span class="mb-tabs-results__state">
                    <v-icon v-if="hit.pinned" :icon="mdiPin" size="12" aria-hidden="true" />
                    {{ stateOf(hit) }}
                </span>

                <template v-for="action in actionsFor(hit)" :key="action">
                    <v-btn
                        v-if="action === 'pin'"
                        :icon="mdiPin"
                        :aria-label="t('tabs.action.pin', { label: hit.label }, 'Pin {label}')"
                        variant="text"
                        size="x-small"
                        density="comfortable"
                        class="mb-tabs-results__action"
                        @click="act(action, hit)"
                    />
                    <v-btn
                        v-else-if="action === 'unpin'"
                        :icon="mdiPinOffOutline"
                        :aria-label="t('tabs.action.unpin', { label: hit.label }, 'Unpin {label}')"
                        variant="text"
                        size="x-small"
                        density="comfortable"
                        class="mb-tabs-results__action"
                        @click="act(action, hit)"
                    />
                    <v-btn
                        v-else-if="action === 'ungroup'"
                        :icon="mdiTabUnselected"
                        :aria-label="
                            t('tabs.action.ungroup', { label: hit.label }, 'Take {label} out of its group')
                        "
                        variant="text"
                        size="x-small"
                        density="comfortable"
                        class="mb-tabs-results__action"
                        @click="act(action, hit)"
                    />
                    <v-btn
                        v-else-if="action === 'close'"
                        :icon="mdiClose"
                        :aria-label="t('tabs.action.close', { label: hit.label }, 'Close {label}')"
                        variant="text"
                        size="x-small"
                        density="comfortable"
                        class="mb-tabs-results__action"
                        @click="act(action, hit)"
                    />
                </template>
            </template>
        </v-list-item>
    </v-list>
</template>

<style>
/*
 * One result per 48dp row, as the design's finder draws it: a selection checkbox, the tab's
 * own icon, the label, its group as a tonal chip, and the tab's state in outline text. The
 * per-row actions sit at the end and reveal on hover or focus so the resting row reads as the
 * design's, without taking the actions away from a keyboard user.
 */
.mb-tabs-results.v-list {
    margin: 0;
    padding: 0;
    max-height: 340px;
    overflow-y: auto;
}

.mb-tabs-results__row.v-list-item {
    min-block-size: 48px;
    padding-inline: 20px;
    gap: 0;
}

.mb-tabs-results__row--selected.v-list-item {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

.mb-tabs-results__row .v-list-item__prepend {
    gap: 12px;
}

.mb-tabs-results__row .v-list-item__prepend > .v-icon {
    margin-inline-end: 12px;
    opacity: 1;
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-tabs-results__row .v-list-item__append {
    gap: 8px;
}

.mb-tabs-results__go.v-btn {
    justify-content: flex-start;
    text-transform: none;
    letter-spacing: normal;
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: var(--md-sys-typescale-body-large-weight);
    color: rgb(var(--v-theme-on-surface));
    padding-inline: 4px;
}

.mb-tabs-results__label {
    /* This span is a flex item inside Vuetify's `.v-btn__content`, so its default
       `min-width: auto` kept it from shrinking -- the ellipsis below never fired, and
       `.v-btn`'s own overflow clipped the label mid-glyph instead. `min-width: 0` is
       the same shrink floor `.mb-tabs-strip__label` in TabStrip.vue already sets. */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mb-tabs-results__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding-inline: 4px;
}

.mb-tabs-results__meta:empty {
    display: none;
}

/* Tab-group names are user-authored and can be longer than a compact result row.
   Wrap inside the chip instead of inheriting Vuetify's single-line hard clip. */
.mb-tabs-results__group-name.v-chip {
    min-width: 0;
    max-width: 100%;
    height: auto;
    font-size: var(--md-sys-typescale-label-small-size);
}

.mb-tabs-results__group-name .v-chip__content {
    white-space: normal;
    overflow-wrap: anywhere;
    padding-block: 2px;
}

.mb-tabs-results__state {
    inline-size: 64px;
    text-align: end;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
}

.mb-tabs-results__action.v-btn {
    opacity: 0;
}

.mb-tabs-results__row:hover .mb-tabs-results__action.v-btn,
.mb-tabs-results__row:focus-within .mb-tabs-results__action.v-btn {
    opacity: 1;
}

.mb-tabs-results__empty {
    margin: 0;
    padding: 12px 20px;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
