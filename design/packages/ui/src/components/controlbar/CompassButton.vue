<script setup lang="ts">
import { computed } from "vue";
import { mdiNavigation } from "@mdi/js";
import { VIcon } from "vuetify/components";
import { animate, EasingFunctions } from "@worldlens/viewer";
import type { Animation, BlueMapApp } from "@worldlens/viewer";
import IconButton from "./IconButton.vue";
import { prefersReducedMotion, useControlBarApp } from "./useControlBarApp.js";

/**
 * MD3 replacement for upstream `ControlBar/Compass.vue`.
 *
 * The needle rotates live with `controlsManager.data.rotation`; clicking it eases the camera
 * rotation back to north over 300ms. The needle is the prototype's navigation arrow in the
 * primary role, pointing at north, so the heading is readable at a glance.
 */
const props = withDefaults(
    defineProps<{
        /** Accessible name and tooltip text (upstream `compass.tooltip`). */
        label: string;
        app?: BlueMapApp | null;
    }>(),
    { app: null },
);

const app = useControlBarApp(() => props.app);

/**
 * Module level, exactly as upstream: a second click cancels the first animation instead of two
 * of them fighting over the same rotation value. A per-instance ref would change that the
 * moment the bar is re-mounted (which happens on every server-profile switch).
 */
let animation: Animation | undefined;

const controls = computed(() => app.value?.mapViewer.controlsManager.data ?? null);
const rotation = computed(() => controls.value?.rotation ?? 0);

const needleStyle = computed(() => ({ transform: `rotate(${-rotation.value}rad)` }));

/** Camera heading in whole degrees, normalised to 0..359 for the tooltip. */
const heading = computed(() => {
    const degrees = Math.round((rotation.value * 180) / Math.PI);
    return ((degrees % 360) + 360) % 360;
});

function faceNorth(event: MouseEvent): void {
    event.preventDefault();

    const data = controls.value;
    if (!data) return;

    if (animation) animation.cancel();
    animation = undefined;

    if (prefersReducedMotion()) {
        data.rotation = 0;
        return;
    }

    const startRotation = data.rotation;
    animation = animate((t) => {
        data.rotation = startRotation * (1 - EasingFunctions.easeOutQuad!(t));
    }, 300);
}
</script>

<template>
    <IconButton
        v-if="controls"
        class="mb-cb-compass"
        :label="props.label"
        :tooltip="`${props.label} (${heading}°)`"
        @action="faceNorth"
    >
        <template #icon>
            <v-icon
                class="mb-cb-compass__needle"
                :icon="mdiNavigation"
                :style="needleStyle"
                aria-hidden="true"
            />
        </template>
    </IconButton>
</template>

<style>
.v-application .mb-cb-compass .mb-cb-compass__needle {
    /* The title-large step, a touch larger than the glyphs beside it: the heading has to read at a glance. */
    font-size: var(--md-sys-typescale-title-large-size);
    color: rgb(var(--v-theme-primary));
    /* No transition: the needle tracks the camera every frame, so easing it would lag. */
}
</style>
