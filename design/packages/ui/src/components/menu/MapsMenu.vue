<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VIcon, VList, VListItem, VTooltip } from "vuetify/components";
import { mdiCircleMedium, mdiMapOutline } from "@mdi/js";
import type { BlueMapApp } from "@worldlens/viewer";
import MenuSearchBar from "./MenuSearchBar.vue";
import { useMenuSearch } from "./menuPrefs";
import { createMatcher } from "./regex";
import { useBlueMap } from "./useBlueMap";
import { isLocalProfile, profilesStore } from "../../stores/profiles.js";

/**
 * The Maps page. Replaces upstream `Menu/MapButton.vue` (one row per map) and the `v-for`
 * that produced them in `Menu/MainMenu.vue`.
 *
 * The sky dot keeps its per-map colour: that is functional data colour taken straight from
 * `map.skyColor`, not chrome, so it does not become an MD3 token.
 */
const props = defineProps<{ bluemap?: BlueMapApp | null }>();

const app = useBlueMap(() => props.bluemap);
const { t } = useI18n();

const search = useMenuSearch("maps");
const matcher = computed(() => createMatcher(search.query, search.regex, search.flags));

const maps = computed(() => app.value?.appState.maps ?? []);

/* -------------------------------------------------------------------------- */
/* Maps this machine has rendered, which are openable whether or not one is    */
/* currently loaded                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Every map this computer has already rendered, listed here so it can always be opened.
 *
 * Before this, a finished render was reachable from exactly one place: the "Open the map"
 * button on the render-result card, which is a transient surface that goes away. After it
 * had gone, the tiles were still on the disk and the profile was still in the store - and
 * the Maps page said "No map loaded." with nothing to press. A person who had rendered a
 * world yesterday had no route back to it short of rendering it again.
 *
 * These are the same `dataRoot`-carrying profiles `addLocalMap` writes when a render
 * finishes, so nothing new is stored and nothing is inferred: if it is in this list, this
 * machine really did render it and the tiles really are where the entry says.
 */
const renderedMaps = computed(() =>
    profilesStore.profiles.filter(isLocalProfile).map((profile) => ({
        id: profile.id,
        name: profile.name,
        dataRoot: profile.dataRoot ?? "",
        active: profilesStore.activeId === profile.id,
    })),
);

const visibleRendered = computed(() =>
    renderedMaps.value.filter(
        (rendered) => matcher.value.test(rendered.name) || matcher.value.test(rendered.id),
    ),
);

/**
 * Opens one, which means making its profile active rather than switching map inside the
 * profile already loaded.
 *
 * The distinction matters: `switchMap` moves between the dimensions of the map currently
 * open, and this moves between renders. Calling the first for the second is how a click
 * appears to do nothing at all.
 */
function openRendered(id: string): void {
    if (profilesStore.activeId === id) return;
    profilesStore.activeId = id;
}

const visibleMaps = computed(() =>
    maps.value.filter((map) => matcher.value.test(map.name) || matcher.value.test(map.id)),
);

const selectedMapId = computed(() => app.value?.mapViewer.data.map?.id ?? null);

const selection = computed<unknown[]>({
    get: () => (selectedMapId.value === null ? [] : [selectedMapId.value]),
    set: (value) => {
        const id = value[0];
        if (typeof id === "string") switchMap(id);
    },
});

const sample = computed(() => maps.value.map((map) => map.name).join("\n"));

const summary = computed(() => {
    if (!search.query) return "";
    // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n compiles
    // the fallback as a message too and consumes `{shown}` and `{total}` as its own named
    // parameters, so a later `replace` finds nothing left and the summary reads " of ".
    return t(
        "search.summary",
        { shown: visibleMaps.value.length, total: maps.value.length },
        "{shown} of {total}",
    );
});

function skyStyle(sky: { r: number; g: number; b: number }): Record<string, string> {
    const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
    return { color: `rgb(${channel(sky.r)}, ${channel(sky.g)}, ${channel(sky.b)})` };
}

function switchMap(mapId: string): void {
    const instance = app.value;
    if (!instance || mapId === selectedMapId.value) return;
    void instance.switchMap(mapId).catch((error: unknown) => {
        console.error("[BlueMap] Failed to switch map", error);
    });
}
</script>

<template>
    <div class="mb-maps-menu">
        <MenuSearchBar
            v-if="maps.length || renderedMaps.length"
            :state="search"
            :label="t('search.button', 'Search')"
            :placeholder="t('markers.searchPlaceholder', 'Search...')"
            :sample="sample"
            :summary="summary"
        />

        <!--
            The search bar is shown whenever there is anything at all to search, which now
            includes renders sitting on the disk with no map loaded in the viewer.
        -->
        <p v-if="!maps.length && !renderedMaps.length" class="mb-maps-menu__empty">
            {{ t("map.unloaded", "No map loaded.") }}
        </p>
        <p v-else-if="!maps.length" class="mb-maps-menu__empty">
            {{
                t(
                    "maps.noneLoadedButRendered",
                    "No map is open. The renders this computer has made are below.",
                )
            }}
        </p>

        <p v-else-if="!visibleMaps.length" class="mb-maps-menu__empty">
            {{ t("search.noMatch", "Nothing matches that search.") }}
        </p>

        <v-list
            v-else-if="maps.length"
            v-model:selected="selection"
            class="mb-maps-menu__list"
            density="compact"
            selectable
            mandatory
            select-strategy="single-independent"
            :aria-label="t('maps.title', 'Maps')"
        >
            <v-list-item
                v-for="map in visibleMaps"
                :key="map.id"
                :value="map.id"
                :title="map.name"
            >
                <template #prepend>
                    <v-icon
                        class="mb-maps-menu__sky"
                        :icon="mdiCircleMedium"
                        :style="skyStyle(map.skyColor)"
                        aria-hidden="true"
                    />
                </template>
                <v-tooltip activator="parent" location="end" :text="map.id" />
            </v-list-item>
        </v-list>

        <!--
            Renders this computer has made, always openable.

            Kept as its own list under its own heading rather than merged into the one above,
            because the two answer different questions: that list is the dimensions inside the
            map currently open, and this one is which render to open. Merging them would put
            "the nether" and "a world you rendered last Tuesday" in one list where selecting
            either does something different, which is the sort of list nobody trusts twice.
        -->
        <template v-if="renderedMaps.length">
            <p class="mb-maps-menu__heading">
                {{ t("maps.rendered", "Rendered on this computer") }}
            </p>
            <v-list
                class="mb-maps-menu__list"
                density="compact"
                :aria-label="t('maps.rendered', 'Rendered on this computer')"
            >
                <v-list-item
                    v-for="rendered in visibleRendered"
                    :key="rendered.id"
                    :title="rendered.name"
                    :subtitle="rendered.dataRoot"
                    :active="rendered.active"
                    @click="openRendered(rendered.id)"
                >
                    <template #prepend>
                        <v-icon :icon="mdiMapOutline" aria-hidden="true" />
                    </template>
                    <v-tooltip activator="parent" location="end" :text="rendered.dataRoot" />
                </v-list-item>
            </v-list>
            <p
                v-if="!visibleRendered.length"
                class="mb-maps-menu__empty"
            >
                {{ t("search.noMatch", "Nothing matches that search.") }}
            </p>
        </template>
    </div>
</template>

<style>
.mb-maps-menu__heading {
    margin: 12px 0 4px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.75;
}

/*
 * A map row's shape, tint, height, type ramps and - the whole point of this page - what the
 * *current* map looks like are the drawer's, stated once in `MenuSideSheet.vue`. Choosing a
 * map is the one selection in this menu a person makes on purpose and then wants to see from
 * across the room, and it is now an M3 filled `secondary-container` row rather than the
 * 10%-of-primary wash Vuetify paints over an active list item.
 *
 * The `rounded="lg"` that used to be on each row is gone with it: Vuetify's radius utilities
 * are `!important`, so a corner set by a prop is a corner no stylesheet can ever correct.
 */

/*
 * Two lines of empty-state prose in a 340px sheet, at the drawer's supporting-text ramp
 * rather than a body size within a point of the map names above it. The inline padding is
 * the row's 12px, so the sentence starts where the names it is explaining the absence of
 * would have.
 */
.mb-maps-menu__empty {
    margin: 0;
    padding: 12px 12px 16px;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-maps-menu__list .v-list-item__content {
    white-space: normal;
    overflow-wrap: anywhere;
}

/*
 * The sky dot is functional data colour - `map.skyColor`, straight off the map - so it is
 * deliberately not a theme role, and deliberately not swept into the selected row's
 * `currentColor` rule that the main menu's decorative glyphs follow. Changing it with the
 * selection would destroy the one thing it is there to say. Its size is the 21px the prototype
 * draws a row glyph at, so this page's leading column lines up with the root menu's rather
 * than sitting a few pixels in from it.
 *
 * `opacity: 1` is a correctness fix rather than a measurement. Vuetify dims every prepend
 * icon in a list to `--v-medium-emphasis-opacity`, which is 0.6 - so this dot has been
 * showing sixty per cent of each map's sky colour blended with the sheet behind it, which is
 * a different colour from that map's sky. A swatch that is not the value it stands for is
 * worse than no swatch, and this one would have gone on being wrong in a way no screenshot
 * reveals, because a slightly-too-dark blue still looks like a perfectly plausible sky.
 */
.mb-maps-menu__list .mb-maps-menu__sky {
    font-size: 21px;
    opacity: 1;
}
</style>
