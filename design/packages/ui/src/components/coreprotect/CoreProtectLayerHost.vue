<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiPause, mdiPlay, mdiStop } from "@mdi/js";
import { VBtn, VIcon } from "vuetify/components";
import type { MarkerSetDataInput } from "@worldlens/viewer";
import { useBlueMap } from "../menu/useBlueMap.js";
import { HIGHLIGHT_SET_ID, highlightData } from "./coreprotectModel.js";
import { clockNow, coreprotect, pause, play, stopReplay, visibleChanges } from "./coreprotectStore.js";

/**
 * Draws the CoreProtect highlight layer on the running map at shell lifetime, and shows a
 * small replay bar over the map while there is something to replay. The map keeps rendering
 * as usual underneath; the layer is redrawn whenever the filter, the replay cursor or a
 * watched file changes.
 */
const props = defineProps<{ mapVisible: boolean }>();
const { t } = useI18n();
const app = useBlueMap();

const words = computed(() => ({
    place: t("cp.word.place", "placed"),
    break: t("cp.word.break", "broke"),
    click: t("cp.word.click", "used"),
    kill: t("cp.word.kill", "killed"),
}));

const layer = computed(() =>
    coreprotect.meta && coreprotect.showOnMap
        ? highlightData(visibleChanges(), { label: t("cp.layer", { file: coreprotect.fileName ?? "" }, "CoreProtect: {file}"), now: clockNow(), fadeSeconds: coreprotect.fadeSeconds, words: words.value })
        : null,
);

function remove(): void {
    const instance = app.value;
    const set = instance?.mapViewer.markers.markerSets.get(HIGHLIGHT_SET_ID);
    if (instance && set) instance.mapViewer.markers.remove(set);
}

watch(
    [layer, app],
    () => {
        const instance = app.value;
        if (!instance) return;
        if (!layer.value) return remove();
        instance.mapViewer.markers.updateMarkerSetFromData(HIGHLIGHT_SET_ID, layer.value.data as unknown as MarkerSetDataInput);
    },
    { immediate: true },
);
onBeforeUnmount(remove);

const showBar = computed(() => props.mapVisible && coreprotect.meta !== null && coreprotect.showOnMap && coreprotect.changes.length > 0);
const timeText = computed(() => {
    const at = coreprotect.replay.cursor;
    return at === null ? t("cp.bar.all", { count: coreprotect.changes.length }, "All {count} changes") : new Date(at * 1000).toLocaleString();
});
</script>

<template>
    <div v-if="showBar" class="wl-cp-bar" role="region" :aria-label="t('cp.bar.label', 'CoreProtect replay')" data-test="cp-bar">
        <VBtn icon size="small" variant="tonal" :aria-label="coreprotect.replay.playing ? t('cp.pause', 'Pause') : t('cp.play', 'Play back')" @click="coreprotect.replay.playing ? pause() : play()">
            <VIcon :icon="coreprotect.replay.playing ? mdiPause : mdiPlay" />
        </VBtn>
        <VBtn v-if="coreprotect.replay.cursor !== null" icon size="small" variant="text" :aria-label="t('cp.stop', 'Show every change')" @click="stopReplay()"><VIcon :icon="mdiStop" /></VBtn>
        <span class="wl-cp-bar__time" aria-live="polite">{{ timeText }}</span>
        <span class="wl-cp-bar__count">{{ t("cp.bar.drawn", { drawn: layer?.drawn ?? 0 }, "{drawn} highlighted") }}</span>
        <span v-if="coreprotect.watching" class="wl-cp-bar__live">{{ t("cp.live", "Watching") }}</span>
    </div>
</template>

<style scoped>
.wl-cp-bar {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 6;
    display: flex; align-items: center; gap: 10px; padding: 6px 14px 6px 8px; border-radius: 999px;
    background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
    max-width: calc(100vw - 32px); flex-wrap: wrap;
}
.wl-cp-bar__time { font-variant-numeric: tabular-nums; font-weight: 500; }
.wl-cp-bar__count { font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-cp-bar__live { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: rgb(var(--v-theme-primary)); }
</style>
