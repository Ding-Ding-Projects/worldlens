<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowCollapseAll, mdiChevronDown, mdiEarth } from "@mdi/js";
import { VBtn, VDivider, VIcon, VSheet, VTooltip } from "vuetify/components";
import type { BlueMapApp } from "@worldlens/viewer";
import { activeProfile, isLocalProfile } from "../../stores/profiles.js";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import CompassButton from "./CompassButton.vue";
import ControlsSwitch from "./ControlsSwitch.vue";
import DayNightSwitch from "./DayNightSwitch.vue";
import IconButton from "./IconButton.vue";
import MenuButton from "./MenuButton.vue";
import PositionInput from "./PositionInput.vue";
import { useControlBarApp } from "./useControlBarApp.js";

/**
 * MD3 replacement for upstream `ControlBar/ControlBar.vue`: the persistent chrome over the map.
 *
 * The layout is the approved prototype's. Top left, two separate surfaces: the round menu
 * button, and a map chip naming the world being viewed (the profile), the map inside it and
 * whether it is served from this computer or from a remote BlueMap. The chip opens the map list.
 * Top right, one pill holding the day/night switch, the view modes, reset camera, the live
 * coordinates in monospace and the compass, in three groups split by vertical dividers.
 *
 * Upstream's marker-list and player-list jumps used to sit beside the menu button. The prototype
 * puts them in the map menu instead (its Markers and Players rows, each with a live count), and
 * `MainMenu.vue` now carries both rows with the same handlers, so neither became unreachable.
 *
 * The surfaces are separate on purpose: the gap between them stays click-through and the map is
 * still draggable under the middle of the screen, which is what upstream got from a
 * `pointer-events: none` root with each button opting back in. A phone keeps only the menu
 * button, the coordinates and the compass; everything marked "thin hide" is reached through the
 * side menu below 576px.
 *
 * ### Appearance
 *
 * The whole bar is one `AppearanceTarget`, under `controlbar.bar`. A right-click anywhere the
 * bar actually paints reaches its **Edit appearance...** command; the transparent gaps stay
 * click-through to the map, because `pointer-events: none` there means there is nothing to
 * right-click in the first place.
 */
const props = withDefaults(defineProps<{ app?: BlueMapApp | null }>(), { app: null });

const app = useControlBarApp(() => props.app);
const { t } = useI18n();

const appState = computed(() => app.value?.appState ?? null);
const viewer = computed(() => app.value?.mapViewer.data ?? null);

/** Upstream `showMapMenu`: the map is at least far enough along to accept interaction. */
const showMapMenu = computed(
    () => viewer.value?.mapState === "loading" || viewer.value?.mapState === "loaded",
);

const menuOpen = computed(() => appState.value?.menu.isOpen ?? false);

/** Upstream `showViewControls`: one available view is not a switch. */
const showViewControls = computed(() => (viewer.value?.map?.views.length ?? 0) > 1);

/**
 * What the map chip says. The world is the profile (the thing somebody chose on Servers), the
 * second line is the map inside it, and the last word says where the tiles come from, which is
 * the one fact about a map that changes what "Update map" and "live players" can mean.
 */
const chipTitle = computed(() => activeProfile()?.name ?? viewer.value?.map?.name ?? "");
const chipMeta = computed(() => {
    const profile = activeProfile();
    const parts: string[] = [];
    const mapName = viewer.value?.map?.name;
    if (mapName && mapName !== chipTitle.value) parts.push(mapName);
    if (profile) {
        parts.push(
            isLocalProfile(profile)
                ? t("controlbar.source.local", "local")
                : t("controlbar.source.remote", "remote"),
        );
    }
    return parts.join(" · ");
});

function openMenu(): void {
    appState.value?.menu.reOpenPage();
}

/**
 * Page titles are passed as functions, which `MainMenu.openPage` stores behind a getter: an
 * open menu heading then re-translates when the language changes instead of freezing in the
 * language it was opened in.
 */
function openMaps(): void {
    appState.value?.menu.openPage("maps", () => t("maps.title", "Maps"));
}

function resetCamera(): void {
    app.value?.resetCamera();
}
</script>

<template>
    <AppearanceTarget
        v-if="app"
        id="controlbar.bar"
        :label="t('appearance.target.controlbar.bar', 'The map control bar')"
        as="div"
    >
        <div class="mb-cb">
            <div class="mb-cb__start">
                <v-sheet
                    class="mb-cb__cluster mb-cb__cluster--menu"
                    color="surface-container"
                    rounded="pill"
                >
                    <MenuButton
                        :label="t('menu.tooltip', 'Menu')"
                        :close="menuOpen"
                        :expanded="menuOpen"
                        @action="openMenu"
                    />
                </v-sheet>
                <v-btn
                    v-if="showMapMenu && chipTitle"
                    class="mb-cb__map mb-cb__thin-hide"
                    variant="flat"
                    color="surface-container"
                    rounded="pill"
                    @click="openMaps"
                >
                    <v-icon class="mb-cb__map-globe" :icon="mdiEarth" aria-hidden="true" />
                    <span class="mb-cb__map-name">{{ chipTitle }}</span>
                    <span v-if="chipMeta" class="mb-cb__map-meta">{{ chipMeta }}</span>
                    <v-icon class="mb-cb__map-expand" :icon="mdiChevronDown" aria-hidden="true" />
                    <v-tooltip
                        activator="parent"
                        location="bottom"
                        :open-delay="400"
                        :text="t('maps.tooltip', 'Map-List')"
                    />
                </v-btn>
            </div>

            <v-sheet
                v-if="showMapMenu"
                class="mb-cb__cluster mb-cb__cluster--end"
                color="surface-container"
                rounded="pill"
            >
                <DayNightSwitch
                    class="mb-cb__thin-hide"
                    :app="app"
                    :label="t('lighting.dayNightSwitch.tooltip', 'Day/Night')"
                />
                <template v-if="showViewControls">
                    <v-divider class="mb-cb__rule mb-cb__thin-hide" vertical />
                    <ControlsSwitch class="mb-cb__thin-hide" :app="app" />
                </template>
                <v-divider class="mb-cb__rule mb-cb__thin-hide" vertical />
                <IconButton
                    class="mb-cb__thin-hide"
                    :icon="mdiArrowCollapseAll"
                    :label="t('resetCamera.tooltip', 'Reset Camera & Position')"
                    @action="resetCamera"
                />
                <PositionInput class="mb-cb__position" :app="app" />
                <CompassButton :app="app" :label="t('compass.tooltip', 'Compass / Face North')" />
            </v-sheet>
        </div>
    </AppearanceTarget>
</template>

<style>
/*
 * Everything below is deliberately unscoped and namespaced under `.mb-cb-`: the bar has to
 * reach into Vuetify's own component internals (field padding, icon-button box) and a scoped
 * block cannot do that without `:deep()` on every rule.
 */
.mb-cb {
    position: fixed;
    /*
     * Below the application's own title bar, not over it. AppTitleBar publishes
     * --mb-titlebar-height on the document element in the desktop build (the same
     * property #map-container reads); anchored at a literal 0 this bar floated over
     * the window chrome. A browser build sets no property and keeps the whole viewport.
     */
    top: var(--mb-titlebar-height, 0px);
    right: 0;
    left: 0;
    z-index: 3;

    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    /* The prototype's 16px inset from the map's edges. */
    padding: 16px;
    /* Respect notches / rounded display corners without clipping the first button. */
    padding-top: max(16px, env(safe-area-inset-top));
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));

    /*
     * The bar floats over the map. Only the solid surfaces take pointer input, so the gaps
     * between them stay draggable, exactly as upstream's `pointer-events: none` root with
     * per-button opt-in did. `.mb-main { pointer-events: none }` in App.vue means anything
     * added here must opt back in explicitly.
     */
    pointer-events: none;

    /* The prototype's 36px buttons inside a 48px pill, raised to the 40px hit-target floor. */
    --mb-cb-size: 40px;
    --mb-cb-height: 48px;
}

/* Touch pointers get the 48px target the accessibility guidance asks for. */
@media (pointer: coarse) {
    .mb-cb {
        --mb-cb-size: 48px;
        --mb-cb-height: 56px;
    }
}

.mb-cb__start {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

/*
 * One `surface-container` pill with an `outline-variant` hairline, from the approved prototype.
 * `surface` alone was the same colour as the window behind it, so on the map the cluster read
 * as a shadow with buttons in it rather than as a control that had an edge - the border is what
 * makes it a pill over a lit 3D scene rather than a smudge on one.
 */
.v-application .mb-cb .mb-cb__cluster {
    pointer-events: auto;

    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    block-size: var(--mb-cb-height);
    padding-inline: 4px;

    border-radius: var(--md-sys-shape-corner-full);
    border: 1px solid rgb(var(--v-theme-outline-variant));
    color: rgb(var(--v-theme-on-surface));
    /* MD3 elevation level 2. */
    box-shadow: var(--md-sys-elevation-shadow-level2);
}

/* The menu button is its own round surface, exactly one button plus its ring. */
.v-application .mb-cb .mb-cb__cluster--menu {
    inline-size: var(--mb-cb-height);
    justify-content: center;
    padding: 0;
}

/*
 * The map chip: globe, world name, the map and its source in the variant colour, and the
 * expand affordance that says it opens a list. A real tonal-surface button, as tall as the menu
 * button beside it, with the same hairline and elevation as every other surface on the bar.
 */
.v-application .mb-cb .mb-cb__map.v-btn {
    pointer-events: auto;
    block-size: var(--mb-cb-height);
    min-inline-size: 0;
    max-inline-size: min(28rem, 40vw);
    padding-inline: 16px 12px;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    box-shadow: var(--md-sys-elevation-shadow-level2);
    text-transform: none;
    letter-spacing: normal;
}

.mb-cb__map .v-btn__content {
    gap: 10px;
    min-width: 0;
}

.mb-cb__map .mb-cb__map-globe {
    font-size: var(--md-sys-typescale-title-large-size);
    color: rgb(var(--v-theme-primary));
}

.mb-cb__map-name {
    font-size: var(--md-sys-typescale-title-small-size);
    line-height: var(--md-sys-typescale-title-small-line-height);
    font-weight: var(--md-sys-typescale-title-small-weight);
    color: rgb(var(--v-theme-on-surface));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mb-cb__map-meta {
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    font-weight: 400;
    color: rgb(var(--v-theme-outline));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mb-cb__map .mb-cb__map-expand {
    font-size: var(--md-sys-typescale-title-large-size);
    color: rgb(var(--v-theme-outline));
}

/* The prototype's 24px hairlines between the lighting, view and camera groups. */
.v-application .mb-cb .mb-cb__rule.v-divider {
    align-self: center;
    block-size: 24px;
    min-height: 24px;
    margin-inline: 4px;
    border-color: rgb(var(--v-theme-outline-variant));
    opacity: 1;
}

/*
 * `flex: 0 1 auto` on purpose: a growing end cluster would paint its surface across the whole
 * remaining width and swallow the click-through gap in the middle of the bar.
 */
.mb-cb__cluster--end {
    flex: 0 1 auto;
}

.mb-cb__position {
    flex: 0 1 auto;
    min-width: 9rem;
    margin-inline: 4px;
}

/*
 * The coordinates are the one thing on this bar somebody might retype, so they are monospace -
 * the same rule the rest of this application follows for paths, keys, digests and shortcuts.
 * Tabular figures too: without them a coordinate counting down through 1000 jitters sideways as
 * the digit widths change, which is exactly the thing a live readout must not do.
 */
.mb-cb__position input,
.mb-cb__position .v-field__prefix {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
}

/*
 * `flex: 0 0 auto` so a narrow viewport squeezes the coordinate fields, which can take it,
 * rather than deforming the round buttons below their hit target.
 */
.mb-cb-btn.v-btn--icon {
    flex: 0 0 auto;
    width: var(--mb-cb-size, 40px);
    height: var(--mb-cb-size, 40px);
    min-width: var(--mb-cb-size, 40px);
}

@media (max-width: 575.98px) {
    /*
     * This is the mobile information architecture, not a cosmetic tweak: below this width the
     * bar keeps only the menu button, the coordinates and the compass, and everything else is
     * reached through the side menu. Edge to edge on a solid surface, as upstream.
     */
    .mb-cb {
        flex-wrap: nowrap;
        gap: 0;
        padding: 0;
        padding-top: env(safe-area-inset-top);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);

        pointer-events: auto;
        background: rgb(var(--v-theme-surface));
        color: rgb(var(--v-theme-on-surface));
        box-shadow: var(--md-sys-elevation-shadow-level2);
    }

    .v-application .mb-cb .mb-cb__cluster {
        border-radius: 0;
        border: none;
        background: none;
        box-shadow: none;
    }

    .mb-cb__cluster--end {
        flex: 1 1 auto;
        justify-content: flex-end;
    }

    .mb-cb__position {
        flex: 1 1 auto;
        max-width: none;
    }

    /*
     * `!important` because Vuetify's own `.v-btn { display: inline-grid }` has the same
     * specificity and there is no guaranteed stylesheet order between the two.
     */
    .mb-cb__thin-hide {
        display: none !important;
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-cb *,
    .mb-cb *::before,
    .mb-cb *::after {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
    }
}
</style>
