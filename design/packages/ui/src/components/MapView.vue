<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { BlueMapApp } from "@worldlens/viewer";
import { activeProfile, profileDataRoot } from "../stores/profiles.js";
import { appState, blueMapApp, mapCommandPoint, mapCommandPlayer, setBlueMapApp } from "../stores/bluemap.js";
import { schoolModeRestriction, useSchoolMode } from "./setup/index.js";
import CommandBuilder from "./mcserver/CommandBuilder.vue";
import MarkerStudio from "./markers/MarkerStudio.vue";
import { VBtn, VCard, VCardText, VCardTitle, VMenu, VList, VListItem, VToolbar } from "vuetify/components";
import { useI18n } from "vue-i18n";
import { followLivePreview } from "./world/livePreview.js";
import { resolveWorldBridge } from "./world/worldBridge.js";

/**
 * Owns the viewer's lifecycle and nothing else.
 *
 * Everything the chrome needs to read now comes from `stores/bluemap` rather than from this
 * component's exposed refs, because upstream's components all talk to one `$bluemap` instance
 * and a per-component mirror of `appState` desynchronises the moment two of them write.
 */
const error = ref<string | null>(null);
const { t } = useI18n();
const markersOpen = ref(false);
const markerEditor = ref<InstanceType<typeof MarkerStudio> | null>(null);
const contextOpen = ref(false);
const contextTarget = ref<[number, number]>([0, 0]);
const contextPoint = ref<{x:number; y:number; z:number} | null>(null);
/** The map menu drawer is open; the tools step aside to its right edge rather than under it. */
const mapMenuOpen = computed(() => appState.value?.menu.isOpen ?? false);
const currentMapId = computed(() => blueMapApp.value?.mapViewer.data.map?.id ?? "");
function showMarkers() { markersOpen.value = true; }
function showCommands() {
    mapCommandPoint.value = contextPoint.value ? { ...contextPoint.value } : null;
    commandBuilderOpen.value = true; contextOpen.value = false;
}
let stopLivePreview = () => {};
let disposed = false;
const schoolMode = useSchoolMode();

/**
 * The map's own "Build command here" action (see materialShell.ts's terrain menu) reports a
 * world point through `stores/bluemap.mapCommandPoint`. This component owns turning that one
 * signal into the command builder opening, pre-filled, right where the click happened - the
 * whole point being that the user never types an X/Y/Z. There is deliberately no `serverId`
 * here: a BlueMap profile and a managed Minecraft server are two different, unlinked records
 * in this app (see the comment on `mapCommandPoint`), so the builder opened from the map can
 * compose and copy a command but honestly cannot claim a server to send it to.
 */
const commandBuilderOpen = ref(false);
const managedServerId = computed(() => (activeProfile() as (ReturnType<typeof activeProfile> & { serverId?: string }) | null)?.serverId);
watch(mapCommandPoint, (point) => {
    if (point) commandBuilderOpen.value = true;
});
watch(commandBuilderOpen, (open) => {
    if (!open) { mapCommandPoint.value = null; mapCommandPlayer.value = null; }
});

/**
 * This package translates its shared-mode snapshot into the viewer's plain presentation contract.
 * The viewer receives only this value: it does not import Vue, the preload bridge, or the shared
 * record implementation.
 */
function viewerPresentationRestriction() {
    const restriction = schoolModeRestriction();
    return { languageAndToneRestricted: restriction.ready && restriction.active };
}

watch(
    schoolMode.enabled,
    () => blueMapApp.value?.setPresentationRestriction(viewerPresentationRestriction()),
    { flush: "sync" },
);

onMounted(async () => {
    const container = document.getElementById("map-container");
    const profile = activeProfile();
    if (!container || !profile) return;
    try {
        const app = new BlueMapApp(container, {
            dataRoot: profileDataRoot(profile),
            allowRemoteInjection: () => profile.trustCustomizations,
            presentationRestriction: viewerPresentationRestriction(),
            // This application draws its own control bar, search, coordinates, settings
            // and command palette, so the viewer must not draw a second set on top.
            chrome: "embedded",
        });
        setBlueMapApp(app);
        const contextHost = app as BlueMapApp & { onMapContextMenu: ((detail: { hit: { point: { x:number; y:number; z:number } } | null; data: object }) => boolean) | null };
        contextHost.onMapContextMenu = (detail) => {
            if (!detail.hit?.point) return false;
            contextPoint.value = { x: detail.hit.point.x, y: detail.hit.point.y, z: detail.hit.point.z };
            const screen = detail.data as { screenX?: number; screenY?: number };
            contextTarget.value = [screen.screenX ?? 0, screen.screenY ?? 0];
            contextOpen.value = true;
            return true;
        };
        await app.load();
        if (disposed) { app.dispose(); return; }
        stopLivePreview = followLivePreview(profileDataRoot(profile), resolveWorldBridge(), async () => {
            const map = app.mapViewer.map;
            if (disposed || map === null) return;
            for (const manager of [map.hiresTileManager, ...(map.lowresTileManager ?? [])]) {
                if (disposed || app.mapViewer.map !== map) return;
                await manager?.refreshVisibleTiles();
            }
        });
    } catch (e) {
        error.value = String(e);
    }
});

onUnmounted(() => {
    disposed = true;
    stopLivePreview();
    blueMapApp.value?.dispose();
    setBlueMapApp(null);
    const container = document.getElementById("map-container");
    if (container) container.innerHTML = "";
});
</script>

<template>
    <v-alert v-if="error" type="error" class="ma-4 mb-interactive" variant="tonal">
        {{ error }}
    </v-alert>
    <CommandBuilder v-model="commandBuilderOpen" v-bind="managedServerId ? { serverId: managedServerId } : {}" :initial-point="mapCommandPoint" @use-command="commandBuilderOpen = false" />
    <VToolbar v-if="currentMapId" class="map-workspace-tools mb-interactive" :class="{ 'map-workspace-tools--beside-menu': mapMenuOpen }" density="compact" color="surface-container" :aria-label="t('map.tools', 'Map tools')">
        <VBtn variant="text" @click="showMarkers">{{ t('markers.studio.title', 'Markers') }}</VBtn>
        <VBtn variant="text" @click="markersOpen = true; $nextTick(() => markerEditor?.startArea())">{{ t('map.drawArea', 'Draw area') }}</VBtn>
        <VBtn variant="text" @click="showCommands">{{ t('map.commands', 'Commands') }}</VBtn>
    </VToolbar>
    <VCard v-if="markersOpen && currentMapId" class="map-workspace-markers mb-interactive" elevation="4">
        <VCardTitle class="d-flex align-center">{{ t('markers.studio.title', 'Marker studio') }}<VBtn class="ml-auto" variant="text" @click="markersOpen = false">{{ t('common.close', 'Close') }}</VBtn></VCardTitle>
        <VCardText><MarkerStudio ref="markerEditor" :map-id="currentMapId" :camera-position="contextPoint" /></VCardText>
    </VCard>
    <VMenu v-model="contextOpen" :target="contextTarget" :close-on-content-click="true">
        <VList><VListItem :title="t('markers.studio.add', 'Add a marker')" @click="showMarkers(); $nextTick(() => markerEditor?.startNew())" /><VListItem :title="t('map.commands', 'Commands')" @click="showCommands" /></VList>
    </VMenu>
</template>

<style scoped>
/*
 * The map's own tools pill, in the same surface language as the control bar's pills: a
 * `surface-container` pill with an `outline-variant` hairline at elevation level 2, 16px off the
 * map's corner. This element is positioned against `v-main`, which spans the whole window, so the
 * 80px application rail (`AppRail.vue`) is added to the inset. While the map menu drawer (340px)
 * is open it moves to the drawer's right edge so the drawer's footer is never covered and the
 * tools stay reachable.
 */
.map-workspace-tools { position: absolute; left: 96px; bottom: 16px; width: auto; max-width: calc(100% - 112px); z-index: 20; border-radius: var(--md-sys-shape-corner-full); border: 1px solid rgb(var(--v-theme-outline-variant)); box-shadow: var(--md-sys-elevation-shadow-level2); padding-inline: 4px; }
.map-workspace-tools--beside-menu { left: 436px; max-width: calc(100% - 452px); }
.map-workspace-tools :deep(.v-btn) { text-transform: none; letter-spacing: normal; }
.map-workspace-markers { position: absolute; right: 12px; top: 80px; bottom: 88px; width: min(440px, calc(100% - 24px)); overflow: auto; z-index: 21; }
</style>
