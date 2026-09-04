import { computed, shallowRef } from "vue";
import type { ComputedRef, ShallowRef } from "vue";
import type { BlueMapApp } from "@worldlens/viewer";
import type { BlueMapAppState } from "@worldlens/viewer";
import type { MapViewerData } from "@worldlens/viewer";
import type { MarkerSetData } from "@worldlens/viewer";

/**
 * Single shared handle on the live viewer.
 *
 * Upstream reached the one BlueMapApp instance through `this.$bluemap` on every component.
 * The port keeps that single-instance model but hands it out through this module instead of a
 * global property, because the app is torn down and rebuilt whenever the active server profile
 * changes. `shallowRef` is deliberate: `BlueMapApp` owns three.js objects that must never be
 * wrapped in a deep reactive proxy. Its `appState`, `mapViewer.data` and marker data are
 * already individually reactive (the viewer builds them through `makeReactive`), so reading
 * them through these computeds is reactive all the way down.
 *
 * Components MUST NOT keep their own copy of anything reachable from here. `appState.controls`
 * in particular is read by the control bar, the settings menu, the position input and the zoom
 * buttons at once; a local mirror desynchronises the moment any one of them writes.
 */
export const blueMapApp: ShallowRef<BlueMapApp | null> = shallowRef(null);

/**
 * The exact world point the terrain menu's "Build command here" action was clicked at, or
 * null when nothing has been picked (or the picked point has been consumed).
 *
 * Honest about what it is NOT: a click-to-position seam into the loaded map, and nothing more.
 * There is no data linking a BlueMap profile to a specific managed Minecraft server in this
 * app - `ServerProfile` (stores/profiles.ts) carries no server id - so a point picked here is
 * a real, editable coordinate for the command builder to prefill, never proof that any
 * particular managed server is "this same world". Surfaces reading this value must say so
 * plainly rather than silently assuming a send target.
 */
export const mapCommandPoint: ShallowRef<{ x: number; y: number; z: number } | null> = shallowRef(null);

/** Coordinate currently reported by the map while a command builder is picking a corner. */
export const mapPickPoint: ShallowRef<{ x: number; y: number; z: number } | null> = shallowRef(null);

let mapPickEnabled = false;
const mapPickPoints: { x: number; y: number; z: number }[] = [];

/** Replaces the live instance (or clears it). Called by MapView, which owns the lifecycle. */
export function setBlueMapApp(instance: BlueMapApp | null): void {
    if (blueMapApp.value) blueMapApp.value.onMapCoordinatePick = null;
    // Optional the same way materialShell is, and for the same reason recorded just below:
    // a test double and an embedding host both hand over an app that does not carry every
    // member this store reaches through. Optional chaining on the object alone does not help
    // here - the object is present and the method is not - so the call itself is optional.
    blueMapApp.value?.setMapCoordinatePreview?.([]);
    blueMapApp.value = instance;
    // The shell is optional on this instance: a test double, and an embedding host that
        // supplies its own chrome, both hand over an app with no material shell at all.
        // Assigning through it unconditionally threw for every one of them, which read as the
        // theme setting being broken rather than as a missing guard here.
    if (instance?.materialShell) {
        instance.materialShell.onBuildCommandHere = (point: { x: number; y: number; z: number }) => {
            mapCommandPoint.value = point;
        };
    }
    if (instance) {
        instance.onMapCoordinatePick = (point: { x: number; y: number; z: number }) => {
            if (mapPickEnabled) {
                mapPickPoints.push(point);
                if (mapPickPoints.length > 2) mapPickPoints.splice(0, mapPickPoints.length - 2);
                instance.setMapCoordinatePreview?.(mapPickPoints);
                mapPickPoint.value = point;
            }
        };
    }
}

export function setMapCoordinatePicking(enabled: boolean): void {
    mapPickEnabled = enabled;
    if (!enabled) {
        mapPickPoints.splice(0, mapPickPoints.length);
        mapPickPoint.value = null;
        blueMapApp.value?.setMapCoordinatePreview?.([]);
    }
}

/** Reactive `appState`: controls, menu, maps, theme, screenshot, debug. Null before load. */
export const appState: ComputedRef<BlueMapAppState | null> = computed(
    () => blueMapApp.value?.appState ?? null,
);

/** Reactive `mapViewer.data`: mapState, map, uniforms, view distances, super-sampling. */
export const mapViewerData: ComputedRef<MapViewerData | null> = computed(
    () => blueMapApp.value?.mapViewer.data ?? null,
);

/** Reactive root marker set data (the recursive tree the marker menu walks). */
export const markerSetData: ComputedRef<MarkerSetData | null> = computed(
    () => blueMapApp.value?.mapViewer.markers.data ?? null,
);

/**
 * `"unloaded" | "loading" | "loaded" | "errored"`. Drives the centred map-state message and
 * gates every control that would otherwise touch a map that is not there.
 */
export const mapState: ComputedRef<string> = computed(
    () => mapViewerData.value?.mapState ?? "unloaded",
);

/** Upstream's `showMapMenu`: the map is at least far enough along to accept interaction. */
export const showMapMenu: ComputedRef<boolean> = computed(
    () => mapState.value === "loading" || mapState.value === "loaded",
);
