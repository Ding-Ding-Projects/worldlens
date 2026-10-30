<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCameraOutline,
    mdiCrosshairsGps,
    mdiFullscreen,
    mdiAccountMultipleOutline,
    mdiInformationOutline,
    mdiLayersOutline,
    mdiMapMarkerOutline,
    mdiRefresh,
    mdiTune,
} from "@mdi/js";
import { VList } from "vuetify/components";
import type { BlueMapApp, MarkerSetData } from "@worldlens/viewer";
import { productDisplayName } from "../../stores/productName.js";
import InfoPage from "./InfoPage.vue";
import MapsMenu from "./MapsMenu.vue";
import MenuOption from "./MenuOption.vue";
import MenuSearchField from "./MenuSearchField.vue";
import MenuSideSheet from "./MenuSideSheet.vue";
import SettingsMenu from "./SettingsMenu.vue";
import { useMenuSearch } from "./menuPrefs";
import { createMatcher } from "./regex";
import { provideBlueMap, useBlueMap, useBlueMapTheme } from "./useBlueMap";

/**
 * MD3 port of upstream `Menu/MainMenu.vue`: the router for the side menu.
 *
 * The page stack itself is unchanged - it is still `appState.menu` (the viewer's own
 * `MainMenu` object), so the control bar, the marker menu and this component all push and
 * pop the same stack. Pages are opened with a title *thunk*, exactly as upstream does, so
 * an open page re-translates its heading when the language changes instead of freezing in
 * the old one.
 *
 * The Markers page is a slot: it lives in the marker components, not here.
 */
const props = defineProps<{ bluemap?: BlueMapApp | null }>();

/**
 * The Info page's "Browse the documentation" button lives two components below the shell,
 * exactly where the changelog fold does - and for the same reason `revealRequests.ts` exists
 * for the changelog, this cannot call the shell's `revealPage` directly. Unlike the changelog,
 * though, the docs browser is a real shell tab rather than a fold inside this menu, so the
 * fix is the ordinary one: forward the event up, the way `MarkerMenu`'s marker set already
 * flows down through this component's own `markers` slot in the other direction.
 *
 * The Info page's "Take the tour" button forwards the same way, for the same reason: the
 * tour overlay is mounted at the shell, not here.
 */
const emit = defineEmits<{ "open-docs": []; "open-tutorial": [] }>();

const app = useBlueMap(() => props.bluemap);
provideBlueMap(app);
useBlueMapTheme(app);

const { t } = useI18n();

const menu = computed(() => app.value?.appState.menu ?? null);
const page = computed(() => menu.value?.currentPage() ?? null);
const isOpen = computed(() => menu.value?.isOpen ?? false);
const canGoBack = computed(() => (menu.value?.pageStack.length ?? 0) > 1);

// Closing the last page empties the stack, and `currentPage()` then returns the "-" null
// page. Holding the last real title keeps the heading readable during the close animation.
const lastTitle = ref(t("menu.title", "Menu"));
watch(page, (value) => {
    if (value && value.id !== "-") lastTitle.value = value.title;
});

/**
 * A page title that is safe to render.
 *
 * The viewer's own menu pages carry their titles as translation KEYS, and a key that has no
 * entry in the active catalogue arrives here as the literal string - so the heading rendered
 * as "menu.title" on screen, which is the kind of defect that looks like a missing feature
 * rather than a missing string.
 *
 * A title is treated as a key only when it looks like one: dotted, no whitespace, and
 * lower-case at the front. A real heading like "Take Screenshot" can never match that, so
 * nothing legitimate is sent through translation and quietly changed.
 */
function resolveTitle(value: string): string {
    const looksLikeKey = /^[a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(value);
    if (!looksLikeKey) return value;

    // The last segment, spaced and capitalised, is a far better last resort than the key
    // itself: "menu.title" reads as "Title" rather than as something broken.
    const leaf = value.split(".").pop() ?? value;
    const humanised = leaf.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
    const translated = t(value, humanised);
    return translated === value ? humanised : translated;
}

const title = computed(() => {
    const current = page.value;
    // The root page is the prototype's "Map menu": upstream's generic "Menu" names no surface.
    if (current?.id === "root") return t("menu.mapMenu", "Map menu");
    if (current && current.id !== "-") return resolveTitle(current.title);
    return resolveTitle(lastTitle.value);
});

const pageId = computed(() => page.value?.id ?? null);

const fullscreenAvailable = computed(() => document.fullscreenEnabled);

/**
 * Why "Go Fullscreen" is dimmed, when it is.
 *
 * A disabled `MenuOption` on its own tells nobody anything: a screen reader hears "Go
 * Fullscreen, dimmed" and a sighted person sees a greyed-out row, and neither learns
 * anything a click would not have told them anyway. `document.fullscreenEnabled` is false
 * when the browser itself refuses the Fullscreen API here - most often because this page
 * is embedded in a frame nobody granted the permission to - which is a fact about the
 * browser, not a bug in this app, so the reason is named rather than left as a mystery.
 * Empty while the option is enabled: `MenuOption` only renders a tooltip when it has text.
 */
const fullscreenTooltip = computed(() =>
    fullscreenAvailable.value
        ? ""
        : t("goFullscreen.unavailable", "Fullscreen is not available in this browser."),
);

function openPage(id: string, titleKey: string, fallback: string, data: object = {}): void {
    menu.value?.openPage(id, () => t(titleKey, fallback), data);
}

function openMarkers(): void {
    const instance = app.value;
    if (!instance) return;
    instance.appState.menu.openPage("markers", () => t("markers.title", "Markers"), {
        markerSet: instance.mapViewer.markers.data,
    });
}

/**
 * The live player set, when the map has one. The prototype lists Players as its own row, which is
 * where the control bar's old player-list jump now lives.
 */
const playerMarkerSet = computed<MarkerSetData | null>(
    () =>
        app.value?.mapViewer?.markers?.data?.markerSets.find((set) => set.id === "bm-players") ??
        null,
);

function openPlayers(): void {
    const instance = app.value;
    const set = playerMarkerSet.value;
    if (!instance || !set) return;
    instance.appState.menu.openPage("markers", () => t("players.title", "Players"), {
        markerSet: set,
    });
}

/** Marker sets a person can open, skipping the two upstream treats as internal. */
function countSets(set: MarkerSetData | null | undefined): number {
    if (!set) return 0;
    return set.markerSets.filter(
        (child) => child.id !== "bm-players" && child.id !== "bm-popup-set",
    ).length;
}

/*
 * The prototype's trailing meta on each root row. Plain numbers, so no sentence has to be
 * pluralised in two languages for a count that is self-explanatory beside its own label.
 */
const mapsMeta = computed(() => String(app.value?.appState.maps?.length ?? 0));
const markersMeta = computed(() => String(countSets(app.value?.mapViewer?.markers?.data)));
const playersMeta = computed(() => String(playerMarkerSet.value?.markers.length ?? 0));
const infoMeta = computed(() => appVersion.value ?? "");

/**
 * The desktop application's own version, for the Info row's meta and the footer. Asked of the
 * preload bridge once; a browser build has none and shows nothing rather than a guess.
 */
const appVersion = ref<string | null>(null);
onMounted(() => {
    const read = (globalThis as { worldlens?: { getVersion?: () => Promise<string> } }).worldlens
        ?.getVersion;
    if (typeof read !== "function") return;
    void read()
        .then((value) => {
            const trimmed = value.trim();
            if (trimmed.length > 0) appVersion.value = trimmed;
        })
        .catch(() => {
            // The Info page itself reports a failing version channel; the meta just stays empty.
        });
});

const footer = computed(() => {
    const engine = app.value?.settings?.version;
    const version = appVersion.value;
    const product = version
        ? t("info.appVersion", { name: productDisplayName, version }, "{name} {version}")
        : productDisplayName;
    if (!engine || engine === "?") return product;
    return t("menu.footer", { app: product, engine }, "{app} · BlueMap {engine} engine");
});

/*
 * The prototype's "Search this menu" field over the root rows. It filters the rows by their
 * label and keeps the full regex builder the other menu pages carry.
 */
const rootSearch = useMenuSearch("root");
const rootMatcher = computed(() =>
    createMatcher(rootSearch.query, rootSearch.regex, rootSearch.flags),
);
function shown(label: string): boolean {
    return rootMatcher.value.test(label);
}

const labels = computed(() => ({
    maps: t("maps.button", "Maps"),
    markers: t("markers.button", "Markers"),
    players: t("players.title", "Players"),
    settings: t("menu.viewerSettings", "Viewer settings"),
    info: t("info.button", "Info"),
    fullscreen: t("goFullscreen.button", "Go Fullscreen"),
    reset: t("resetCamera.button", "Reset Camera"),
    screenshot: t("screenshot.button", "Take Screenshot"),
    update: t("updateMap.button", "Update Map"),
}));
const rootSample = computed(() => Object.values(labels.value).join("\n"));
const nothingShown = computed(
    () =>
        rootSearch.query !== "" &&
        !Object.entries(labels.value).some(
            ([key, label]) => (key !== "players" || playerMarkerSet.value !== null) && shown(label),
        ),
);

function goBack(): void {
    menu.value?.closePage();
}

function closeAll(): void {
    menu.value?.closeAll();
}

function goFullscreen(): void {
    void document.body.requestFullscreen().catch((error: unknown) => {
        console.warn("[BlueMap] Fullscreen was refused", error);
    });
}

function resetCamera(): void {
    app.value?.resetCamera();
}

function takeScreenshot(): void {
    app.value?.takeScreenshot();
}

function updateMap(): void {
    void app.value?.updateMap();
}
</script>

<template>
    <MenuSideSheet
        v-if="app"
        :open="isOpen"
        :title="title"
        :back="canGoBack"
        @back="goBack"
        @close="closeAll"
    >
        <!--
            The glyph on each row is the prototype's, and every one of them is decoration:
            `MenuOption` marks it `aria-hidden`, no two rows are told apart by their icon
            alone, and the label is unchanged - so nothing here needs a catalogue entry and
            nothing here renders differently in one language than another.
        -->
        <template v-if="pageId === 'root'">
            <MenuSearchField
                v-model="rootSearch.query"
                v-model:regex="rootSearch.regex"
                v-model:flags="rootSearch.flags"
                class="mb-main-menu__search"
                :placeholder="t('menu.searchPlaceholder', 'Search this menu')"
                :sample="rootSample"
            />
            <p v-if="nothingShown" class="mb-main-menu__empty">
                {{ t("search.noMatch", "Nothing matches that search.") }}
            </p>
            <!--
                The prototype's nine rows, in its order: places to go (each with its live count),
                then things to do here. The glyph on each row is decoration: `MenuOption` marks
                it `aria-hidden` and no two rows are told apart by their icon alone.
            -->
            <v-list class="mb-main-menu__root" density="compact" nav>
                <MenuOption
                    v-if="shown(labels.maps)"
                    :icon="mdiLayersOutline"
                    :meta="mapsMeta"
                    @action="openPage('maps', 'maps.title', 'Maps')"
                >
                    {{ labels.maps }}
                </MenuOption>
                <MenuOption
                    v-if="shown(labels.markers)"
                    :icon="mdiMapMarkerOutline"
                    :meta="markersMeta"
                    @action="openMarkers"
                >
                    {{ labels.markers }}
                </MenuOption>
                <MenuOption
                    v-if="playerMarkerSet && shown(labels.players)"
                    :icon="mdiAccountMultipleOutline"
                    :meta="playersMeta"
                    @action="openPlayers"
                >
                    {{ labels.players }}
                </MenuOption>
                <MenuOption
                    v-if="shown(labels.settings)"
                    :icon="mdiTune"
                    @action="openPage('settings', 'settings.title', 'Settings')"
                >
                    {{ labels.settings }}
                </MenuOption>
                <MenuOption
                    v-if="shown(labels.info)"
                    :icon="mdiInformationOutline"
                    :meta="infoMeta"
                    @action="openPage('info', 'info.title', 'Info')"
                >
                    {{ labels.info }}
                </MenuOption>
                <MenuOption
                    v-if="shown(labels.fullscreen)"
                    :icon="mdiFullscreen"
                    :disabled="!fullscreenAvailable"
                    :tooltip="fullscreenTooltip"
                    @action="goFullscreen"
                >
                    {{ labels.fullscreen }}
                </MenuOption>
                <MenuOption
                    v-if="shown(labels.reset)"
                    :icon="mdiCrosshairsGps"
                    @action="resetCamera"
                >
                    {{ labels.reset }}
                </MenuOption>
                <MenuOption
                    v-if="shown(labels.screenshot)"
                    :icon="mdiCameraOutline"
                    @action="takeScreenshot"
                >
                    {{ labels.screenshot }}
                </MenuOption>
                <MenuOption
                    v-if="shown(labels.update)"
                    :icon="mdiRefresh"
                    :tooltip="t('updateMap.tooltip', 'Clear Tile Cache')"
                    @action="updateMap"
                >
                    {{ labels.update }}
                </MenuOption>
            </v-list>
        </template>

        <MapsMenu v-else-if="pageId === 'maps'" />

        <!--
          The Markers page belongs to the marker components. The shell fills this slot with
          <MarkerSetMenu>; `page` carries the `markerSet` the page was opened with.
        -->
        <slot v-else-if="pageId === 'markers'" name="markers" :page="page" :menu="menu">
            <p class="mb-main-menu__empty">
                {{ t("markers.title", "Markers") }}
            </p>
        </slot>

        <SettingsMenu v-else-if="pageId === 'settings'" />

        <InfoPage
            v-else-if="pageId === 'info'"
            @open-docs="emit('open-docs')"
            @open-tutorial="emit('open-tutorial')"
        />

        <template #footer>{{ footer }}</template>
    </MenuSideSheet>
</template>

<style>
/*
 * The search block sits on the sheet's own 8px inset plus 4px, the prototype's 12px from the
 * sheet edge, with 8px before the first row.
 */
.v-application .mb-side-sheet .mb-main-menu__search {
    padding: 4px 4px 8px;
}

/*
 * An empty state is a sentence about why there is nothing here, so it takes the drawer's
 * supporting-text ramp rather than a body size an eighth larger than the row titles above
 * it. `mb-footnote` is the shared class for exactly this and is not used here only because
 * it carries a 26px bottom margin sized for a 900px page.
 */
.mb-main-menu__empty {
    margin: 0;
    padding: 12px 12px 16px;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
