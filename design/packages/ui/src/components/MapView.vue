<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { BlueMapApp } from "@worldlens/viewer";
import { activeProfile, profileDataRoot } from "../stores/profiles.js";
import { blueMapApp, mapCommandPoint, setBlueMapApp } from "../stores/bluemap.js";
import { schoolModeRestriction, useSchoolMode } from "./setup/index.js";
import CommandBuilder from "./mcserver/CommandBuilder.vue";

/**
 * Owns the viewer's lifecycle and nothing else.
 *
 * Everything the chrome needs to read now comes from `stores/bluemap` rather than from this
 * component's exposed refs, because upstream's components all talk to one `$bluemap` instance
 * and a per-component mirror of `appState` desynchronises the moment two of them write.
 */
const error = ref<string | null>(null);
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
watch(mapCommandPoint, (point) => {
    if (point) commandBuilderOpen.value = true;
});
watch(commandBuilderOpen, (open) => {
    if (!open) mapCommandPoint.value = null;
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
        await app.load();
    } catch (e) {
        error.value = String(e);
    }
});

onUnmounted(() => {
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
    <CommandBuilder v-model="commandBuilderOpen" :initial-point="mapCommandPoint" @use-command="commandBuilderOpen = false" />
</template>
