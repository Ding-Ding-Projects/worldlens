/**
 * @vitest-environment jsdom
 *
 * The composable proves the wiring, not the model: `markerStudio.test.ts` (via the model's
 * own tests) already covers `toMarkerSetData`'s filtering rules. What was actually missing
 * was anything that handed that shape to the viewer at all, so these tests stand in for the
 * viewer with a plain object shaped exactly like `MarkerSet` and watch what gets called on
 * it - the same defect this whole task exists to close, proven the other way round.
 */

import { computed, defineComponent, nextTick, ref, shallowRef } from "vue";
import type { Ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";

import { MARKER_STUDIO_SET_ID } from "./markerStudio.js";
import { markerStudioStore, setMarkerPersistence } from "./markerStudioStore.js";
import { useStudioMarkerLayer } from "./useStudioMarkerLayer.js";
import type { StudioMarker } from "./markerStudio.js";

/** A stand-in for `BlueMapApp` carrying only what the composable touches. */
function makeFakeApp() {
    const sets = new Map<string, { data: { markers: Record<string, unknown> } }>();
    const updateCalls: Array<{ id: string; data: unknown }> = [];
    const removedIds: string[] = [];

    const markers = {
        markerSets: sets,
        updateMarkerSetFromData(id: string, data: { markers?: Record<string, unknown> }): void {
            updateCalls.push({ id, data });
            sets.set(id, { data: { markers: data.markers ?? {} } });
        },
        remove(set: { data: { markers: Record<string, unknown> } }): void {
            for (const [id, value] of sets) {
                if (value === set) {
                    sets.delete(id);
                    removedIds.push(id);
                }
            }
        },
    };

    return {
        app: { mapViewer: { markers } } as unknown as import("@worldlens/viewer").BlueMapApp,
        sets,
        updateCalls,
        removedIds,
    };
}

function makeMarker(overrides: Partial<StudioMarker> = {}): StudioMarker {
    return {
        id: overrides.id ?? "marker-1",
        mapId: overrides.mapId ?? "overworld",
        label: overrides.label ?? "Home",
        detail: overrides.detail ?? "",
        position: overrides.position ?? { x: 1, y: 2, z: 3 },
        colour: overrides.colour ?? "#4f8cff",
        visible: overrides.visible ?? true,
        createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
        updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    };
}

/** Hosts the composable so its `onBeforeUnmount` teardown has a real component to ride on. */
function mountHost(appRef: { value: unknown }, mapIdRef: Ref<string>) {
    const Host = defineComponent({
        setup() {
            useStudioMarkerLayer(
                computed(() => appRef.value as import("@worldlens/viewer").BlueMapApp | null),
                computed(() => mapIdRef.value),
            );
            return () => null;
        },
    });
    return mount(Host);
}

beforeEach(() => {
    setMarkerPersistence(false);
    markerStudioStore.markers.splice(0, markerStudioStore.markers.length);
    markerStudioStore.failure = null;
});

describe("useStudioMarkerLayer", () => {
    it("does nothing when there is no app", async () => {
        markerStudioStore.markers.push(makeMarker());
        const appRef = shallowRef<unknown>(null);
        const mapIdRef = ref("overworld");
        const wrapper = mountHost(appRef, mapIdRef);
        await nextTick();

        // Nothing to assert on a viewer that was never handed anything: the point is that
        // mounting with no app does not throw.
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
    });

    it("puts a visible marker into the set", async () => {
        const { app, sets } = makeFakeApp();
        markerStudioStore.markers.push(makeMarker({ id: "m1", label: "Base" }));
        const appRef = shallowRef<unknown>(app);
        const mapIdRef = ref("overworld");
        const wrapper = mountHost(appRef, mapIdRef);
        await nextTick();

        const set = sets.get(MARKER_STUDIO_SET_ID);
        expect(set).toBeDefined();
        expect(Object.keys(set!.data.markers)).toEqual(["m1"]);
        wrapper.unmount();
    });

    it("leaves a hidden marker out of the set", async () => {
        const { app, sets } = makeFakeApp();
        markerStudioStore.markers.push(makeMarker({ id: "m1", visible: false }));
        const appRef = shallowRef<unknown>(app);
        const mapIdRef = ref("overworld");
        const wrapper = mountHost(appRef, mapIdRef);
        await nextTick();

        const set = sets.get(MARKER_STUDIO_SET_ID);
        expect(Object.keys(set!.data.markers)).toEqual([]);
        wrapper.unmount();
    });

    it("updates the set when the store changes", async () => {
        const { app, sets } = makeFakeApp();
        markerStudioStore.markers.push(makeMarker({ id: "m1" }));
        const appRef = shallowRef<unknown>(app);
        const mapIdRef = ref("overworld");
        const wrapper = mountHost(appRef, mapIdRef);
        await nextTick();

        markerStudioStore.markers.push(makeMarker({ id: "m2", label: "Second" }));
        await nextTick();

        const set = sets.get(MARKER_STUDIO_SET_ID);
        expect(Object.keys(set!.data.markers).sort()).toEqual(["m1", "m2"]);
        wrapper.unmount();
    });

    it("swaps the contents when the map id changes", async () => {
        const { app, sets } = makeFakeApp();
        markerStudioStore.markers.push(
            makeMarker({ id: "over-1", mapId: "overworld" }),
            makeMarker({ id: "nether-1", mapId: "nether" }),
        );
        const appRef = shallowRef<unknown>(app);
        const mapIdRef = ref("overworld");
        const wrapper = mountHost(appRef, mapIdRef);
        await nextTick();

        expect(Object.keys(sets.get(MARKER_STUDIO_SET_ID)!.data.markers)).toEqual(["over-1"]);

        mapIdRef.value = "nether";
        await nextTick();

        expect(Object.keys(sets.get(MARKER_STUDIO_SET_ID)!.data.markers)).toEqual(["nether-1"]);
        wrapper.unmount();
    });

    it("never stacks a second set on repeated syncs", async () => {
        const { app, sets, updateCalls } = makeFakeApp();
        markerStudioStore.markers.push(makeMarker({ id: "m1" }));
        const appRef = shallowRef<unknown>(app);
        const mapIdRef = ref("overworld");
        const wrapper = mountHost(appRef, mapIdRef);
        await nextTick();

        // Touch the store's timestamp without changing membership, forcing a second sync.
        markerStudioStore.markers[0]!.updatedAt = "2026-01-02T00:00:00.000Z";
        await nextTick();
        markerStudioStore.markers[0]!.label = "Base (renamed)";
        await nextTick();

        expect(sets.size).toBe(1);
        expect(updateCalls.filter((call) => call.id === MARKER_STUDIO_SET_ID).length).toBeGreaterThan(1);
        wrapper.unmount();
    });

    it("removes the set on unmount", async () => {
        const { app, sets, removedIds } = makeFakeApp();
        markerStudioStore.markers.push(makeMarker({ id: "m1" }));
        const appRef = shallowRef<unknown>(app);
        const mapIdRef = ref("overworld");
        const wrapper = mountHost(appRef, mapIdRef);
        await nextTick();

        expect(sets.has(MARKER_STUDIO_SET_ID)).toBe(true);
        wrapper.unmount();

        expect(removedIds).toContain(MARKER_STUDIO_SET_ID);
        expect(sets.has(MARKER_STUDIO_SET_ID)).toBe(false);
    });
});
