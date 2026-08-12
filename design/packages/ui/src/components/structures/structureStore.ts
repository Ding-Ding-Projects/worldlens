/**
 * Where discovered structure files and their renders are kept.
 *
 * Local storage, beside the rest of this application's own per-visitor state, for the same
 * reason the marker studio's store is: a scan of somebody's world and the renders made from
 * it are about *their* world on *their* machine, and there is no reason either one should
 * leave it. Nothing here makes a network request.
 *
 * ## A read that fails is not an empty list
 *
 * Corrupt or unreadable storage reports itself through {@link StructureState.failure}.
 * Answering an unreadable store with an empty list would render as "this world has no
 * structures and nothing was ever rendered", which is the one wrong answer available - it
 * invites somebody to re-render everything on top of records that are still there, just
 * unread.
 */

import { reactive, watch } from "vue";

import type { RenderedStructure, StructureFile } from "./structureModel.js";

/** Exported so a test can point a stand-in `localStorage` at the same key this store writes. */
export const STRUCTURE_STORAGE_KEY = "worldlens-structures";

interface StructureState {
    discovered: StructureFile[];
    rendered: RenderedStructure[];
    /** Non-null when the stored records could not be read. Never confused with "none". */
    failure: string | null;
}

function isStructureFile(value: unknown): value is StructureFile {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record["id"] === "string" &&
        typeof record["name"] === "string" &&
        typeof record["namespace"] === "string" &&
        typeof record["path"] === "string" &&
        typeof record["sizeBytes"] === "number"
    );
}

function isRenderedStructure(value: unknown): value is RenderedStructure {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record["id"] === "string" &&
        typeof record["structureId"] === "string" &&
        typeof record["name"] === "string" &&
        typeof record["dataRoot"] === "string" &&
        typeof record["renderedAt"] === "string"
    );
}

function load(): StructureState {
    try {
        const raw = localStorage.getItem(STRUCTURE_STORAGE_KEY);
        if (raw === null) return { discovered: [], rendered: [], failure: null };
        const parsed = JSON.parse(raw) as { discovered?: unknown; rendered?: unknown };
        if (!Array.isArray(parsed.discovered) || !parsed.discovered.every(isStructureFile)) {
            return {
                discovered: [],
                rendered: [],
                failure: "The saved structure list is not in a shape this build recognises.",
            };
        }
        if (!Array.isArray(parsed.rendered) || !parsed.rendered.every(isRenderedStructure)) {
            return {
                discovered: [],
                rendered: [],
                failure: "The saved renders are not in a shape this build recognises.",
            };
        }
        return { discovered: parsed.discovered, rendered: parsed.rendered, failure: null };
    } catch (error) {
        return {
            discovered: [],
            rendered: [],
            failure: error instanceof Error ? error.message : String(error),
        };
    }
}

export const structureStore = reactive<StructureState>(load());

let persisting = true;

watch(
    () => JSON.stringify({ discovered: structureStore.discovered, rendered: structureStore.rendered }),
    (serialised) => {
        // A store that failed to read must not write over what it could not read: that would
        // turn "I could not parse your structures" into "your structures are gone", which is
        // the same failure one step further along and no longer recoverable.
        if (!persisting || structureStore.failure !== null) return;
        try {
            localStorage.setItem(STRUCTURE_STORAGE_KEY, serialised);
        } catch {
            // A full or refused quota is not worth taking the list down for; state stays in
            // memory and the next successful write catches up.
        }
    },
);

/** Stops persistence while a test rearranges the store, so one test cannot write another's. */
export function setStructurePersistence(on: boolean): void {
    persisting = on;
}

/** Re-reads storage. Used after a test replaces `localStorage`, and by a restore. */
export function reloadStructureStore(): void {
    const fresh = load();
    structureStore.discovered.splice(0, structureStore.discovered.length, ...fresh.discovered);
    structureStore.rendered.splice(0, structureStore.rendered.length, ...fresh.rendered);
    structureStore.failure = fresh.failure;
}

/** Replaces the discovered list wholesale, as a fresh scan of the world reports it. */
export function setDiscoveredStructures(files: readonly StructureFile[]): void {
    structureStore.discovered.splice(0, structureStore.discovered.length, ...files);
}

/**
 * Records a render, replacing any earlier render of the same structure.
 *
 * "One render per structure" is enforced here rather than only in the UI: a second call for
 * a structure that already has a render is a re-render, not a second entry in the list, so
 * whatever called this can always trust that the list holds at most one row per structure.
 */
export function recordRender(rendered: RenderedStructure): void {
    const index = structureStore.rendered.findIndex((entry) => entry.structureId === rendered.structureId);
    if (index >= 0) structureStore.rendered.splice(index, 1, rendered);
    else structureStore.rendered.push(rendered);
}

/** Removes several rendered structures at once, for the list's bulk action. */
export function removeRenderedStructures(ids: readonly string[]): number {
    const wanted = new Set(ids);
    const before = structureStore.rendered.length;
    for (let index = structureStore.rendered.length - 1; index >= 0; index -= 1) {
        if (wanted.has(structureStore.rendered[index]!.id)) {
            structureStore.rendered.splice(index, 1);
        }
    }
    return before - structureStore.rendered.length;
}

/** The render already made from this structure, if any. */
export function renderedFor(structureId: string): RenderedStructure | null {
    return structureStore.rendered.find((entry) => entry.structureId === structureId) ?? null;
}
