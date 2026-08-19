import type { RenderSummary, WorldBridge } from "../world/worldBridge.js";
import { loadTargets, type TargetStorage } from "./remoteTargets.js";
import type {
    RemoteHostMapRequest,
    RemoteHostingBridge,
    RemoteHostingRecord,
    RemoteTarget,
} from "./hostingBridge.js";

/** The two real lists the hosting surface can choose from. */
export interface RemoteHostingChoices {
    readonly targets: readonly RemoteTarget[];
    readonly renders: readonly RenderSummary[];
    /** Existing publications, newest first, as persisted by the main process. */
    readonly hostingRecords: readonly RemoteHostingRecord[];
}

/**
 * Read hosting choices from the same stores used by the render flow.
 *
 * Saved machines are local, non-secret target records. Completed renders are obtained from
 * the preload's `render:list` IPC channel; this deliberately does not manufacture a sample
 * target or map when either source is unavailable. A render is eligible only when the main
 * process says it finished and retained a real map data root.
 */
export async function loadRemoteHostingChoices(
    world: Pick<WorldBridge, "listRenders"> | null,
    storage: TargetStorage | null = defaultStorage(),
    hosting: Pick<RemoteHostingBridge, "remoteHostingRecords"> | null = null,
): Promise<RemoteHostingChoices> {
    const targets = loadTargets(storage);
    const hostingRecords = await readHostingRecords(hosting);
    if (world === null) return { targets, renders: [], hostingRecords };

    try {
        const summaries = await world.listRenders();
        return {
            targets,
            renders: summaries.filter(
                (summary) => summary.outcome === "finished" && summary.dataRoot !== null && summary.maps.length > 0,
            ),
            hostingRecords,
        };
    } catch {
        // The picker must remain honest when render storage is unavailable. Saved targets
        // are still usable, but a map list that was not read is not replaced with guesses.
        return { targets, renders: [], hostingRecords };
    }
}

/** Convert one completed render into the hosting request's map shape. */
export function hostingMapsForRender(summary: RenderSummary): RemoteHostMapRequest[] {
    if (summary.outcome !== "finished" || summary.dataRoot === null) return [];
    return summary.maps.map((map) => ({
        id: map.id,
        world: map.world,
        name: map.name,
        dimension: map.dimension,
    }));
}

/** Find the persisted publication belonging to a render, without inventing one. */
export function hostingRecordForRender(
    records: readonly RemoteHostingRecord[],
    renderId: string,
): RemoteHostingRecord | null {
    return records.find((record) => record.renderId === renderId) ?? null;
}

/** Plain-text local filtering for the target picker; regex mode belongs to the field UI. */
export function filterHostingTargets(
    targets: readonly RemoteTarget[],
    query: string,
): RemoteTarget[] {
    const needle = query.trim().toLocaleLowerCase();
    if (needle === "") return [...targets];
    return targets.filter((target) =>
        [target.label, target.host, target.user, target.workDir].some((value) =>
            value.toLocaleLowerCase().includes(needle),
        ),
    );
}

/** Plain-text local filtering for completed rendered maps. */
export function filterHostingRenders(
    renders: readonly RenderSummary[],
    query: string,
): RenderSummary[] {
    const needle = query.trim().toLocaleLowerCase();
    if (needle === "") return [...renders];
    return renders.filter((render) =>
        [render.renderId, render.dataRoot ?? "", ...render.maps.flatMap((map) => [map.id, map.name, map.world, map.dimension])].some(
            (value) => value.toLocaleLowerCase().includes(needle),
        ),
    );
}

function defaultStorage(): TargetStorage | null {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate === undefined ? null : candidate;
}

async function readHostingRecords(
    hosting: Pick<RemoteHostingBridge, "remoteHostingRecords"> | null,
): Promise<readonly RemoteHostingRecord[]> {
    if (hosting === null) return [];
    try {
        return await hosting.remoteHostingRecords();
    } catch {
        // A missing or unreadable hosting store is an empty, honest list. The caller can
        // still publish a finished render, but must not display a fabricated publication.
        return [];
    }
}
