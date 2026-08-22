<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCameraOutline,
    mdiCogOutline,
    mdiCrosshairsGps,
    mdiFullscreen,
    mdiInformationOutline,
    mdiMapMarkerOutline,
    mdiMapOutline,
    mdiRefresh,
} from "@mdi/js";
import { VDivider, VList } from "vuetify/components";
import type { BlueMapApp } from "@worldlens/viewer";
import InfoPage from "./InfoPage.vue";
import MapsMenu from "./MapsMenu.vue";
import MenuOption from "./MenuOption.vue";
import MenuSideSheet from "./MenuSideSheet.vue";
import SettingsMenu from "./SettingsMenu.vue";
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
    fullscreenAvailable.value ? "" : t("goFullscreen.unavailable", "Fullscreen is not available in this browser."),
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
        <v-list v-if="pageId === 'root'" class="mb-main-menu__root" density="compact" nav>
            <MenuOption submenu :icon="mdiMapOutline" @action="openPage('maps', 'maps.title', 'Maps')">
                {{ t("maps.button", "Maps") }}
            </MenuOption>
            <MenuOption submenu :icon="mdiMapMarkerOutline" @action="openMarkers">
                {{ t("markers.button", "Markers") }}
            </MenuOption>
            <MenuOption
                submenu
                :icon="mdiCogOutline"
                @action="openPage('settings', 'settings.title', 'Settings')"
            >
                {{ t("settings.button", "Settings") }}
            </MenuOption>
            <MenuOption
                submenu
                :icon="mdiInformationOutline"
                @action="openPage('info', 'info.title', 'Info')"
            >
                {{ t("info.button", "Info") }}
            </MenuOption>

            <v-divider class="mb-main-menu__rule" />

            <MenuOption
                :icon="mdiFullscreen"
                :disabled="!fullscreenAvailable"
                :tooltip="fullscreenTooltip"
                @action="goFullscreen"
            >
                {{ t("goFullscreen.button", "Go Fullscreen") }}
            </MenuOption>
            <MenuOption :icon="mdiCrosshairsGps" @action="resetCamera">
                {{ t("resetCamera.button", "Reset Camera") }}
            </MenuOption>
            <MenuOption :icon="mdiCameraOutline" @action="takeScreenshot">
                {{ t("screenshot.button", "Take Screenshot") }}
            </MenuOption>
            <MenuOption
                :icon="mdiRefresh"
                :tooltip="t('updateMap.tooltip', 'Clear Tile Cache')"
                @action="updateMap"
            >
                {{ t("updateMap.button", "Update Map") }}
            </MenuOption>
        </v-list>

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
    </MenuSideSheet>
</template>

<style>
/*
 * The two blocks of this menu are "places to go" and "things to do here", which is a real
 * division and not a decorative one. It is drawn as a hairline in the one colour every other
 * edge in the drawer uses; Vuetify's divider arrives at 0.12 opacity of a border colour,
 * which over a bright terrain render is invisible.
 *
 * `mb-section-rule` from `prototypeSurface.scss` is the richer form of this and is
 * deliberately not used: it exists to carry an uppercase label, and neither of these two
 * blocks has a name that is not already obvious from its own four rows.
 */
.v-application .mb-main-menu__rule.v-divider {
    margin-block: 8px;
    border-color: rgb(var(--v-theme-outline-variant));
    opacity: 1;
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
