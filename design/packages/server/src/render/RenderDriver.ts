/**
 * Drives the ported `RenderManager` from a map-update request — the first place outside
 * `packages/engine` that constructs a real render task and hands it to a real render
 * manager (issue #29: "nothing outside packages/engine drives the ported RenderManager").
 *
 * ## This is not a port of anything
 *
 * Upstream's web server has no route that triggers a render. Every upstream `MapRequestHandler`
 * route this package's `MapStorageHandler` mirrors is read-only; a real BlueMap instance
 * starts an update from a plugin command (`/bluemap update`) or a file-system watch, never
 * from an HTTP request. Worldlens's desktop app *is* the server, though, so "ask the
 * server to update a map" needs some entry point, and this is it — a deliberate addition,
 * not a deviation from a upstream behaviour that exists to mirror.
 *
 * What is **not** invented is what happens once asked. Upstream's own
 * `MapUpdatePreparationTask.updateMap(BmMap, RenderManager)` — used from a plugin command —
 * is exactly what this calls: it builds the real `MapUpdatePreparationTask`, which builds
 * the real `MapUpdateTask` once it has listed the map's regions, and schedules it onto the
 * real `RenderManager`. Nothing here re-implements region discovery, task construction or
 * scheduling; every rule that decides which regions render, in what order, and when the map
 * gets saved lives in `packages/engine` and stays there.
 */

import {
    MapUpdatePreparationTask,
    type BmMap,
    type RenderManager,
    type TileUpdateStrategy,
} from "@worldlens/engine";

export interface UpdateRequestResult {
    /**
     * The exact boolean returned by the selected `RenderManager` scheduler, relayed
     * exactly: `triggerUpdate` defaults to `scheduleRenderTask` (tail enqueue), while an
     * explicit `"next"` priority selects `scheduleRenderTaskNext`. Verified, not assumed:
     * neither `MapUpdatePreparationTask` nor `MapUpdateTask` overrides `equals` (only
     * `WorldRegionUpdateTask` does, by map id/region/strategy), and `RenderManager`'s
     * queue-containment check explicitly exempts the active head of the queue. Thus two
     * independently-built preparation passes for the same map can each be scheduled; this
     * is not a "the map was already stale" flag, and the next scheduler preserves the
     * active head while placing accepted work ahead of the remaining queue.
     */
    readonly scheduled: boolean;
    /** The queue position requested by this call, exposed so callers can narrate it honestly. */
    readonly priority: RenderTriggerPriority;
}

export interface UpdateBatchResult {
    readonly requested: number;
    readonly scheduled: number;
    readonly priority: RenderTriggerPriority;
}

export type RenderTriggerPriority = "tail" | "next";

export class RenderDriver {
    constructor(private readonly renderManager: RenderManager) {}

    getRenderManager(): RenderManager {
        return this.renderManager;
    }

    /**
     * upstream: `MapUpdatePreparationTask.updateMap(BmMap, RenderManager)` (or the
     * `TileUpdateStrategy` overload), called exactly as a plugin command would call it.
     */
    triggerUpdate(
        map: BmMap,
        force?: TileUpdateStrategy,
        priority: RenderTriggerPriority = "tail",
    ): UpdateRequestResult {
        const preparation =
            force === undefined
                ? MapUpdatePreparationTask.updateMap(map, this.renderManager)
                : MapUpdatePreparationTask.updateMap(map, force, this.renderManager);

        return {
            priority,
            scheduled:
                priority === "next"
                    ? this.renderManager.scheduleRenderTaskNext(preparation)
                    : this.renderManager.scheduleRenderTask(preparation),
        };
    }

    /**
     * Schedules a map batch with one call to the manager's batch primitive. The
     * next scheduler inserts each accepted task behind the active head while
     * retaining the caller's map order; repeatedly calling triggerUpdate would
     * reverse that order because every task targets the same index 1.
     */
    triggerUpdates(
        maps: readonly BmMap[],
        force?: TileUpdateStrategy,
        priority: RenderTriggerPriority = "tail",
    ): UpdateBatchResult {
        const preparations = maps.map((map) =>
            force === undefined
                ? MapUpdatePreparationTask.updateMap(map, this.renderManager)
                : MapUpdatePreparationTask.updateMap(map, force, this.renderManager),
        );
        const scheduled =
            priority === "next"
                ? this.renderManager.scheduleRenderTasksNext(...preparations)
                : this.renderManager.scheduleRenderTasks(...preparations);
        return { requested: maps.length, scheduled, priority };
    }

    /**
     * A status snapshot built entirely from `RenderManager`'s own bookkeeping —
     * `ProgressTracker` by way of `estimateCurrentRenderTaskTimeRemaining` — never invented.
     */
    getStatus(): RenderStatus {
        const currentTask = this.renderManager.getCurrentRenderTask();
        return {
            running: this.renderManager.isRunning(),
            queuedTaskCount: this.renderManager.getScheduledRenderTaskCount(),
            currentTaskDescription: currentTask?.getDescription() ?? null,
            currentTaskDetail: currentTask?.getDetail() ?? null,
            currentTaskProgress: currentTask?.estimateProgress() ?? null,
            estimatedTimeRemainingMs:
                currentTask === null ? null : this.renderManager.estimateCurrentRenderTaskTimeRemaining(),
        };
    }
}

export interface RenderStatus {
    readonly running: boolean;
    readonly queuedTaskCount: number;
    readonly currentTaskDescription: string | null;
    readonly currentTaskDetail: string | null;
    readonly currentTaskProgress: number | null;
    readonly estimatedTimeRemainingMs: number | null;
}
