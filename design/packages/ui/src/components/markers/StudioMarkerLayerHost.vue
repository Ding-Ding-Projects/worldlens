<script setup lang="ts">
import { computed } from "vue";
import { useBlueMap } from "../menu/useBlueMap.js";
import { useStudioMarkerLayer } from "./useStudioMarkerLayer.js";

/**
 * Owns the user marker layer at shell lifetime rather than menu lifetime. The marker menu is
 * intentionally transient; tying the layer to it made closing the menu remove markers from
 * the map even though the local studio still held them.
 */
const app = useBlueMap();
const mapId = computed(() => app.value?.mapViewer.data.map?.id ?? "no-map");

useStudioMarkerLayer(app, mapId);
</script>

<template><span aria-hidden="true" class="mb-studio-marker-layer-host" /></template>
