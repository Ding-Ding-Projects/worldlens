import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { atomicMove, createDirectories, type BmMap, type RenderManager, type RenderTask } from "@worldlens/engine";

/** Runtime policy for retaining the render queue across process restarts. */
export interface RenderQueuePersistenceOptions {
    /** The versioned queue file used for startup reconciliation and later saves. */
    readonly file: string;
    /** The live maps used to resolve serialized task references. */
    readonly maps: ReadonlyMap<string, BmMap>;
    /** Periodic save cadence. Set to `0` to disable periodic saves. */
    readonly intervalMs?: number;
    /** Reports persistence failures without making rendering fail. */
    readonly onError?: (message: string, error: unknown) => void;
}

/**
 * Coordinates RenderManager queue persistence at the server boundary.
 *
 * Startup load is deliberately separate from save scheduling: reconciliation must happen
 * before callers begin adding new work. Saves take a snapshot synchronously, serialize to a
 * unique sibling staging file, then atomically rename that complete file into place. A second
 * request while one save is active records only that another pass is needed; it never overlaps
 * writes or publishes an older snapshot after a newer one.
 */
export class RenderQueuePersistence {
    readonly #renderManager: RenderManager;
    readonly #file: string;
    readonly #maps: ReadonlyMap<string, BmMap>;
    readonly #intervalMs: number;
    readonly #onError: (message: string, error: unknown) => void;

    #timer: ReturnType<typeof setInterval> | undefined;
    #saveInFlight: Promise<void> | undefined;
    #saveRequested = false;
    #closed = false;

    constructor(renderManager: RenderManager, options: RenderQueuePersistenceOptions) {
        this.#renderManager = renderManager;
        this.#file = resolve(options.file);
        this.#maps = options.maps;
        this.#intervalMs = options.intervalMs ?? 30_000;
        this.#onError = options.onError ?? ((message, error) => console.error(message, error));
    }

    /** Loads and reconciles the saved queue, then starts periodic persistence. */
    async start(): Promise<number> {
        if (this.#closed) throw new Error("RenderQueuePersistence is already closed");

        const restored = await this.#renderManager.loadRenderTaskQueue(this.#file, this.#maps);
        if (this.#intervalMs > 0) {
            this.#timer = setInterval(() => this.requestSave(), this.#intervalMs);
        }
        return restored;
    }

    /** Coalesces a save request with any currently active save. */
    requestSave(): void {
        if (this.#closed) return;
        this.#saveRequested = true;
        if (this.#saveInFlight === undefined) void this.#flushRequestedSave();
    }

    /** Waits for the current save and any coalesced follow-up save to finish. */
    async flush(): Promise<void> {
        this.requestSave();
        await this.#drainSaves();
    }

    /** Stops periodic saves and durably writes the final queue snapshot. */
    async shutdown(): Promise<void> {
        if (this.#closed) return;
        this.#closed = true;
        if (this.#timer !== undefined) clearInterval(this.#timer);
        this.#timer = undefined;
        this.#saveRequested = true;
        await this.#drainSaves();
    }

    async #drainSaves(): Promise<void> {
        while (this.#saveRequested || this.#saveInFlight !== undefined) {
            if (this.#saveInFlight === undefined) void this.#flushRequestedSave();
            const save = this.#saveInFlight;
            if (save !== undefined) await save;
        }
    }

    async #flushRequestedSave(): Promise<void> {
        if (this.#saveInFlight !== undefined || !this.#saveRequested) return;
        this.#saveRequested = false;
        const save = this.#saveQueue();
        this.#saveInFlight = save;
        try {
            await save;
        } finally {
            this.#saveInFlight = undefined;
            if (this.#saveRequested) void this.#flushRequestedSave();
        }
    }

    async #saveQueue(): Promise<void> {
        const target = this.#file;
        const staging = `${target}.staging-${randomUUID()}`;
        const tasks = this.#renderManager
            .getScheduledRenderTasks()
            .filter((task: RenderTask) => task.hasMoreWork());

        try {
            await createDirectories(dirname(target));
            await this.#renderManager.saveRenderTaskQueue(staging, this.#maps, tasks);
            await atomicMove(staging, target);
        } catch (error) {
            this.#onError(`Failed to persist render-task queue '${target}'`, error);
        } finally {
            await rm(staging, { force: true }).catch(() => undefined);
        }
    }
}
