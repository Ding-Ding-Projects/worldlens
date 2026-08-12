import { onBeforeUnmount, watch } from "vue";
import type { ComputedRef } from "vue";
import type { BlueMapApp, MarkerSetDataInput } from "@worldlens/viewer";

import { MARKER_STUDIO_SET_ID, toMarkerSetData } from "./markerStudio.js";
import { markerStudioStore } from "./markerStudioStore.js";

/**
 * Keeps a studio marker set drawn on the running viewer, in step with the store.
 *
 * `markerStudio.ts` already knows how to shape a person's markers as marker-set data; this
 * is the one place that actually hands that shape to the viewer. It exists because building
 * the data was never the missing half - the panel that opens the studio has done that for a
 * while - what was missing was anything that told `mapViewer.markers` the set existed at
 * all, so every marker somebody made sat in local storage and never reached the map.
 *
 * A single fixed set id, updated in place rather than replaced, is what keeps a change from
 * stacking a second copy on top of the first: `MarkerSet.updateMarkerSetFromData` either
 * creates that child set once or refreshes the one already there, exactly the same call
 * BlueMap's own marker-file loader makes on every poll.
 */
export function useStudioMarkerLayer(
    app: ComputedRef<BlueMapApp | null>,
    mapId: ComputedRef<string>,
): void {
    function sync(): void {
        const instance = app.value;
        if (instance === null) return;

        const data = toMarkerSetData(markerStudioStore.markers, mapId.value);
        // `toMarkerSetData` builds the shape the viewer's own marker-set input expects; the
        // cast is here rather than widening that function's return type, because that
        // function is deliberately kept free of any import from the viewer package.
        instance.mapViewer.markers.updateMarkerSetFromData(
            MARKER_STUDIO_SET_ID,
            data as MarkerSetDataInput,
        );
    }

    function teardown(): void {
        const instance = app.value;
        if (instance === null) return;

        const set = instance.mapViewer.markers.markerSets.get(MARKER_STUDIO_SET_ID);
        if (set !== undefined) instance.mapViewer.markers.remove(set);
    }

    // Re-synced on every store change (a marker added, edited, removed or toggled) and on
    // every map switch, since `toMarkerSetData` filters by map id and a set built for the
    // overworld has no business surviving a jump to the nether.
    watch(
        [() => JSON.stringify(markerStudioStore.markers), app, mapId],
        sync,
        { immediate: true },
    );

    onBeforeUnmount(teardown);
}
