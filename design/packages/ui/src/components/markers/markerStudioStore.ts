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
    draftFrom,
    editMarker,
    markerSearchText,
    importStudioMarkers,
    exportStudioMarkers,
    type MarkerDraft,
    type MarkerResult,
    type StudioMarker,
} from "./markerStudio.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

/** Exported so a test can point a stand-in `localStorage` at the same key this store writes. */
export const MARKER_STORAGE_KEY = "worldlens-studio-markers";
export const MARKER_STORAGE_VERSION = 1;

interface StudioState {
    markers: StudioMarker[];
    /** Unsaved draft rendered in the viewer, without entering durable storage. */
    preview: StudioMarker | null;
    /** Non-null when the stored markers could not be read. Never confused with "none". */
    failure: string | null;
}

type MarkerMutation = "created" | "updated" | "duplicated" | "deleted" | "imported" | "restored";
function recordMarkerMutation(action: MarkerMutation, markers: readonly StudioMarker[]): void {
    recordAppSetting("markerStudio", { action, label: `Marker studio ${action} (${markers.length} markers)`, markers });
}

function load(): StudioState {
    try {
        const raw = localStorage.getItem(MARKER_STORAGE_KEY);
        if (raw === null) return { markers: [], failure: null, preview: null };
        const parsed = JSON.parse(raw) as { marker?: unknown; version?: unknown; markers?: unknown };
        if (parsed.marker !== "worldlens-marker-studio" || parsed.version !== MARKER_STORAGE_VERSION || !Array.isArray(parsed.markers)) {
            return { markers: [], failure: "The saved markers are not in a shape this build recognises.", preview: null };
        }
        // Validate through the pure model one map at a time. A bad entry must not be
        // partially applied, and unknown fields remain in `extra`.
        const rawMarkers = parsed.markers as StudioMarker[];
        const markers: StudioMarker[] = [];
        for (const marker of rawMarkers) {
            const imported = importStudioMarkers(JSON.stringify({ marker: "worldlens-marker-studio", version: 1, mapId: marker.mapId, markers: [marker] }), marker.mapId);
            if (imported.errors.length > 0) return { markers: [], failure: "The saved markers contain invalid data.", preview: null };
            markers.push(...imported.markers);
        }
        return { markers, failure: null, preview: null };
    } catch (error) {
        return {
            markers: [],
            failure: error instanceof Error ? error.message : String(error),
            preview: null,
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
            const markers = JSON.parse(serialised) as StudioMarker[];
            localStorage.setItem(MARKER_STORAGE_KEY, JSON.stringify({ marker: "worldlens-marker-studio", version: MARKER_STORAGE_VERSION, markers }));
            recordMarkerMutation("updated", markers);
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
    markerStudioStore.preview = fresh.preview;
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
    if (made.ok) { markerStudioStore.markers.push(made.marker); recordMarkerMutation("created", markerStudioStore.markers); }
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
    if (edited.ok) { markerStudioStore.markers.splice(index, 1, edited.marker); recordMarkerMutation("updated", markerStudioStore.markers); }
    return edited;
}

/**
 * Duplicate one marker through the same validated model path as creation.
 *
 * The copy gets a fresh identity and timestamps, while retaining the source map and
 * editable fields. Keeping this in the store (rather than cloning in the component)
 * means map filtering and the viewer layer see the exact same mutation.
 */
export function duplicateMarker(id: string): MarkerResult {
    const source = markerStudioStore.markers.find((marker) => marker.id === id);
    if (source === undefined) {
        return {
            ok: false,
            problems: [{ field: "label", message: "That marker is no longer here." }],
        };
    }

    const draft = draftFrom(source);
    draft.label = `${source.label} (copy)`;
    const copied = createMarker(source.mapId, draft);
    if (copied.ok) { markerStudioStore.markers.push(copied.marker); recordMarkerMutation("duplicated", markerStudioStore.markers); }
    return copied;
}

export function removeMarker(id: string): void {
    const index = markerStudioStore.markers.findIndex((marker) => marker.id === id);
    if (index >= 0) { markerStudioStore.markers.splice(index, 1); recordMarkerMutation("deleted", markerStudioStore.markers); }
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
    const removed = before - markerStudioStore.markers.length;
    if (removed > 0) recordMarkerMutation("deleted", markerStudioStore.markers);
    return removed;
}

export function setMarkerVisible(id: string, visible: boolean): void {
    const marker = markerStudioStore.markers.find((entry) => entry.id === id);
    if (marker !== undefined) {
        marker.visible = visible;
        marker.updatedAt = new Date().toISOString();
        recordMarkerMutation("updated", markerStudioStore.markers);
    }
}

/** The corpus a search field's regex builder previews against. */
export function markerCorpus(mapId: string): string {
    return markerStudioStore.markers
        .filter((marker) => marker.mapId === mapId)
        .map(markerSearchText)
        .join("\n");
}

/** Complete map-scoped export; the envelope is versioned by the pure model. */
export function exportMarkers(mapId: string): string {
    return exportStudioMarkers(mapId, markerStudioStore.markers.filter((marker) => marker.mapId === mapId));
}

/** Import is additive and id-safe: an incoming id already present is not overwritten. */
export function importMarkers(raw: string, mapId: string): { markers: StudioMarker[]; errors: string[] } {
    if (markerStudioStore.failure !== null) return { markers: [], errors: ["The marker store could not be read; nothing was written."] };
    const result = importStudioMarkers(raw, mapId);
    if (result.errors.length === 0) {
        const ids = new Set(markerStudioStore.markers.map((marker) => marker.id));
        markerStudioStore.markers.push(...result.markers.filter((marker) => !ids.has(marker.id)));
        recordMarkerMutation("imported", markerStudioStore.markers);
    }
    return result;
}

/** Restore is append-only: the restored snapshot becomes a new history mutation. */
export function restoreMarkers(markers: readonly StudioMarker[]): boolean {
    if (markerStudioStore.failure !== null || markers.length > 500) return false;
    markerStudioStore.markers.splice(
        0,
        markerStudioStore.markers.length,
        ...markers.map((marker) => ({
            ...marker,
            position: { ...marker.position },
            points: marker.points?.map((point) => ({ ...point })),
            extra: marker.extra ? { ...marker.extra } : undefined,
        })),
    );
    recordMarkerMutation("restored", markerStudioStore.markers);
    return true;
}
