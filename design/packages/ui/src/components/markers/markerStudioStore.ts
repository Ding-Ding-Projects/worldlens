/**
 * Where a person's own markers are kept.
 *
 * Local storage, beside the rest of this application's own per-visitor state, for the same
 * reason the profiles store is: these are markers about *your* world on *your* machine, and
 * sending them anywhere would be a surprise nobody asked for. Nothing here makes a network
 * request.
 *
 * ## Written through, not written back
 *
 * Every mutation persists immediately rather than on some later flush. A marker somebody
 * dropped and then closed the window on is a marker they will look for tomorrow, and "it
 * was going to save in a moment" is not a thing anybody can be told afterwards.
 *
 * ## A read that fails is not an empty studio
 *
 * Corrupt or unreadable storage reports itself. Answering an unreadable store with an empty
 * list would render as "you have no markers", which is the one wrong answer available: it
 * invites somebody to make them all again on top of the ones that are still there.
 */

import { computed, reactive, watch, type ComputedRef } from "vue";

import {
    createMarker,
    editMarker,
    markerSearchText,
    type MarkerDraft,
    type MarkerResult,
    type StudioMarker,
} from "./markerStudio.js";

/** Exported so a test can point a stand-in `localStorage` at the same key this store writes. */
export const MARKER_STORAGE_KEY = "worldlens-studio-markers";

interface StudioState {
    markers: StudioMarker[];
    /** Non-null when the stored markers could not be read. Never confused with "none". */
    failure: string | null;
}

function load(): StudioState {
    try {
        const raw = localStorage.getItem(MARKER_STORAGE_KEY);
        if (raw === null) return { markers: [], failure: null };
        const parsed = JSON.parse(raw) as { markers?: unknown };
        if (!Array.isArray(parsed.markers)) {
            return {
                markers: [],
                failure: "The saved markers are not in a shape this build recognises.",
            };
        }
        return { markers: parsed.markers as StudioMarker[], failure: null };
    } catch (error) {
        return {
            markers: [],
            failure: error instanceof Error ? error.message : String(error),
        };
    }
}

export const markerStudioStore = reactive<StudioState>(load());

let persisting = true;

watch(
    () => JSON.stringify(markerStudioStore.markers),
    (serialised) => {
        // A store that failed to read must not write over what it could not read: that
        // would turn "I could not parse your markers" into "your markers are gone", which
        // is the same failure one step further along and no longer recoverable.
        if (!persisting || markerStudioStore.failure !== null) return;
        try {
            localStorage.setItem(MARKER_STORAGE_KEY, JSON.stringify({ markers: JSON.parse(serialised) }));
        } catch {
            // A full or refused quota is not worth taking the studio down for; the markers
            // stay in memory and the next successful write catches up.
        }
    },
);

/** Stops persistence while a test rearranges the store, so one test cannot write another's. */
export function setMarkerPersistence(on: boolean): void {
    persisting = on;
}

/** Re-reads storage. Used after a test replaces `localStorage`, and by a restore. */
export function reloadMarkerStudio(): void {
    const fresh = load();
    markerStudioStore.markers.splice(0, markerStudioStore.markers.length, ...fresh.markers);
    markerStudioStore.failure = fresh.failure;
}

/** Every marker belonging to one map, newest first. */
export function markersFor(mapId: string): ComputedRef<readonly StudioMarker[]> {
    return computed(() =>
        markerStudioStore.markers
            .filter((marker) => marker.mapId === mapId)
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
}

export function addMarker(mapId: string, draft: MarkerDraft): MarkerResult {
    const made = createMarker(mapId, draft);
    if (made.ok) markerStudioStore.markers.push(made.marker);
    return made;
}

export function updateMarker(id: string, draft: MarkerDraft): MarkerResult {
    const index = markerStudioStore.markers.findIndex((marker) => marker.id === id);
    if (index < 0) {
        return {
            ok: false,
            problems: [{ field: "label", message: "That marker is no longer here." }],
        };
    }
    const edited = editMarker(markerStudioStore.markers[index]!, draft);
    if (edited.ok) markerStudioStore.markers.splice(index, 1, edited.marker);
    return edited;
}

export function removeMarker(id: string): void {
    const index = markerStudioStore.markers.findIndex((marker) => marker.id === id);
    if (index >= 0) markerStudioStore.markers.splice(index, 1);
}

/** Removes several at once, for the list's bulk action. Reports how many really went. */
export function removeMarkers(ids: readonly string[]): number {
    const wanted = new Set(ids);
    const before = markerStudioStore.markers.length;
    for (let index = markerStudioStore.markers.length - 1; index >= 0; index -= 1) {
        if (wanted.has(markerStudioStore.markers[index]!.id)) {
            markerStudioStore.markers.splice(index, 1);
        }
    }
    return before - markerStudioStore.markers.length;
}

export function setMarkerVisible(id: string, visible: boolean): void {
    const marker = markerStudioStore.markers.find((entry) => entry.id === id);
    if (marker !== undefined) {
        marker.visible = visible;
        marker.updatedAt = new Date().toISOString();
    }
}

/** The corpus a search field's regex builder previews against. */
export function markerCorpus(mapId: string): string {
    return markerStudioStore.markers
        .filter((marker) => marker.mapId === mapId)
        .map(markerSearchText)
        .join("\n");
}
