import { existsSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { watch, type FSWatcher } from "chokidar";
import type { Vector2i } from "@worldlens/shared";
import { WatchService } from "../../util/WatchService.js";
import { logDebug } from "./MCAUtil.js";
import { RegionType } from "./region/RegionType.js";

interface Waiter {
    resolve: (events: Vector2i[] | null) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout | null;
}

interface ReadyWaiter {
    resolve: () => void;
    reject: (error: Error) => void;
}

/** upstream: FileHelper.awaitExistence's re-check granularity (it watches the parent-folder; the port polls) */
const EXISTENCE_CHECK_INTERVAL_MS = 1000;

/**
 * Windows' `fs.watch` backend can assert when a chokidar directory watcher receives a
 * newly-created child event (`src\\win\\fs-event.c`, `_wcsnicmp(filename, dir, dirlen)`). This
 * is a process-level abort, not an ordinary watcher error: nothing catches it, the whole
 * process dies, and in the product that means the application disappears while a map is being
 * watched. So the affected runtime needs the safe polling backend. Keep the native watcher
 * everywhere else: polling is deliberately a compatibility fallback, not the default, because
 * this service may watch one folder per map.
 *
 * ## Why the bound moved from 26 to 24
 *
 * It was written as `major >= 26` when the abort was first seen on a Node 26 runtime. That was
 * the version somebody happened to be running, not the version the bug starts at, and the
 * difference stayed invisible because continuous integration pins Node 22 and runs no tests at
 * all, so nothing on a hosted runner has ever executed this path.
 *
 * Observed directly: Node **24.19.0** on win32 aborts with exactly that assertion, reproducibly,
 * from `MCAWorldRegionWatchService.test.ts`. It took down the whole `engine` and `server` test
 * runs, which read as two mysteriously empty suites rather than as a crash.
 *
 * The bound is therefore the lowest version observed to abort, not a guess at the true floor.
 * Node 22 and 23 are **not** verified here either way, and this comment says so rather than
 * implying they were cleared. If one of them is ever seen aborting, move the bound down again
 * and record the observation the same way; the cost of being wrong in that direction is a
 * process abort, while the cost of polling one folder too eagerly is a 100ms timer.
 */
export function usesPollingForCurrentRuntime(
    platform: string = process.platform,
    nodeVersion: string = process.versions.node,
): boolean {
    const major = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);
    return platform === "win32" && Number.isFinite(major) && major >= 24;
}

const WINDOWS_FS_WATCH_POLL_INTERVAL_MS = 100;

/**
 * How long a polling watcher gets to report the self-probe file before it is treated as mute
 * and re-armed. The measured first-event latency of a healthy polling watcher is ~115 ms at a
 * 100 ms interval (issue #176), so fifty times that is slack for a slow disk, not a race.
 */
const DEFAULT_PROBE_DEADLINE_MS = 5_000;

/** How many times a mute polling watcher is torn down and recreated before giving up. */
const DEFAULT_MAX_REARMS = 3;

const PROBE_FILE_PREFIX = ".worldlens-watch-probe-";

/**
 * What the service currently knows about whether its watcher is actually delivering events.
 *
 * `state` is `pending` until the watcher is known to work, `armed` once it is, and `failed`
 * once every re-arm attempt produced a watcher that never reported the self-probe. `probe`
 * says how `armed` was reached: `observed` is the only value that proves delivery; `unavailable`
 * means the region folder could not be written, so nothing could be proven either way and the
 * watcher is trusted; `not-applicable` is the native backend, which is not the affected
 * runtime and is not probed.
 */
export interface RegionWatchLiveness {
    readonly state: "pending" | "armed" | "failed";
    readonly polling: boolean;
    readonly rearmCount: number;
    readonly lastEventAt: number | null;
    readonly probe: "not-applicable" | "pending" | "observed" | "unavailable" | "missed";
}

/**
 * The optional liveness seam a {@link WatchService} may expose. `MapUpdateService` checks for
 * it structurally, so a watch service without it keeps working exactly as before.
 */
export interface RegionWatchLivenessReporter {
    getLiveness(): RegionWatchLiveness;
    /** Called at most once, when re-arming has been exhausted. Returns an unsubscribe. */
    onArmFailure(listener: (liveness: RegionWatchLiveness) => void): () => void;
}

/** Rejection reason for `whenReady()` once a polling watcher could not be armed. */
export class RegionWatchArmFailedError extends Error {
    readonly liveness: RegionWatchLiveness;

    constructor(regionFolder: string, liveness: RegionWatchLiveness) {
        super(
            `The polling region-watcher for '${regionFolder}' never reported its self-probe after ` +
                `${liveness.rearmCount} re-arm attempt(s); region-file changes will not be observed.`,
        );
        this.name = "RegionWatchArmFailedError";
        this.liveness = liveness;
    }
}

export interface MCAWorldRegionWatchServiceOptions {
    /** Defaults to {@link usesPollingForCurrentRuntime}. Tests force it on to exercise the probe. */
    usePolling?: boolean;
    pollIntervalMs?: number;
    probeDeadlineMs?: number;
    maxRearms?: number;
    /** Test seam: build the chokidar watcher. Defaults to chokidar's `watch`. */
    createWatcher?: (path: string, options: Parameters<typeof watch>[1]) => FSWatcher;
    /** Diagnostic sink for arm/re-arm decisions; defaults to the engine's debug log. */
    onDiagnostic?: (message: string) => void;
}

/**
 * Watches a region-folder for changed region-files and provides the changed
 * region-positions in batches.
 *
 * upstream: implemented on java.nio's WatchService; this port uses chokidar. Differences
 * that follow from that:
 * <ul>
 * <li>Like upstream ({@code ensureInitialization} / {@code FileHelper.awaitExistence}),
 * the directory-watch is only registered once the region-folder exists — until then its
 * existence is re-checked every second (upstream watches the parent-folder instead of
 * polling; chokidar's own handling of not-yet-existing paths is unreliable). Upstream
 * runs that check inside the blocking poll/take calls; the port re-checks on a timer so
 * the promise-based poll/take can resolve as soon as events arrive.</li>
 * <li>Upstream consumes events in batches per WatchKey, where repeated events on the
 * same file are coalesced (the event's count is incremented instead). The port queues
 * incoming events and coalesces repeats per region-position while they are pending; a
 * poll/take drains the whole queue as one batch.</li>
 * <li>A polling watcher (the Windows + Node ≥ 24 fallback) can become ready and then never
 * deliver anything (issue #176): `take()` waits forever, the run loop that owns it never
 * exits, and the only warning that existed fired on exit. So after `ready`, a polling watcher
 * is proven live by writing one probe file into the region folder and waiting for the watcher
 * to report it. A watcher that does not is torn down and recreated, a bounded number of times;
 * after that the service reports `failed` through {@link RegionWatchLivenessReporter} so the
 * owner can say so instead of waiting silently. The native backend is not probed: it is not the
 * affected runtime, and its first-event latency is single-digit milliseconds.</li>
 * </ul>
 */
export class MCAWorldRegionWatchService
    implements WatchService<Vector2i>, RegionWatchLivenessReporter
{
    private readonly regionFolder: string;
    private readonly polling: boolean;
    private readonly pollIntervalMs: number;
    private readonly probeDeadlineMs: number;
    private readonly maxRearms: number;
    private readonly createWatcher: (
        path: string,
        options: Parameters<typeof watch>[1],
    ) => FSWatcher;
    private readonly diagnostic: (message: string) => void;

    private watcher: FSWatcher | null = null;
    private existenceTimer: NodeJS.Timeout | null = null;
    private probeTimer: NodeJS.Timeout | null = null;
    private probeFile: string | null = null;
    private probeSerial = 0;

    /** pending region-positions, coalesced by position while not yet consumed */
    private readonly pending = new Map<string, Vector2i>();
    private readonly waiters: Waiter[] = [];
    private readonly readyWaiters: ReadyWaiter[] = [];
    private readonly armFailureListeners: Array<(liveness: RegionWatchLiveness) => void> = [];
    private closed = false;

    private state: RegionWatchLiveness["state"] = "pending";
    private probe: RegionWatchLiveness["probe"];
    private rearmCount = 0;
    private lastEventAt: number | null = null;

    constructor(regionFolder: string, options: MCAWorldRegionWatchServiceOptions = {}) {
        this.regionFolder = regionFolder;
        this.polling = options.usePolling ?? usesPollingForCurrentRuntime();
        this.pollIntervalMs = options.pollIntervalMs ?? WINDOWS_FS_WATCH_POLL_INTERVAL_MS;
        this.probeDeadlineMs = options.probeDeadlineMs ?? DEFAULT_PROBE_DEADLINE_MS;
        this.maxRearms = options.maxRearms ?? DEFAULT_MAX_REARMS;
        this.createWatcher = options.createWatcher ?? watch;
        this.diagnostic = options.onDiagnostic ?? logDebug;
        this.probe = this.polling ? "pending" : "not-applicable";
        this.ensureInitialization();
    }

    poll(): Vector2i[] | null;
    poll(timeoutMs: number): Promise<Vector2i[] | null>;
    poll(timeoutMs?: number): Vector2i[] | null | Promise<Vector2i[] | null> {
        if (timeoutMs === undefined) {
            if (this.closed) throw new WatchService.ClosedException();
            return this.drain();
        }

        if (this.closed) return Promise.reject(new WatchService.ClosedException());

        const immediate = this.drain();
        if (immediate !== null) return Promise.resolve(immediate);

        return new Promise((resolve, reject) => {
            const waiter: Waiter = {
                resolve,
                reject,
                timer: setTimeout(() => {
                    const index = this.waiters.indexOf(waiter);
                    if (index >= 0) this.waiters.splice(index, 1);
                    resolve(null);
                }, timeoutMs),
            };
            this.waiters.push(waiter);
        });
    }

    take(): Promise<Vector2i[]> {
        if (this.closed) return Promise.reject(new WatchService.ClosedException());

        const immediate = this.drain();
        if (immediate !== null) return Promise.resolve(immediate);

        return new Promise((resolve, reject) => {
            this.waiters.push({
                resolve: (events) => resolve(events ?? []),
                reject,
                timer: null,
            });
        });
    }

    /**
     * Resolves once the watcher is known to report changes: chokidar's initial scan has
     * completed and, on the polling backend, the self-probe was observed (or could not be
     * written, in which case the watcher is trusted). Rejects with
     * {@link RegionWatchArmFailedError} once re-arming has been exhausted. Upstream registers
     * its java.nio watcher synchronously; the port needs this explicit seam because chokidar
     * becomes ready asynchronously.
     */
    whenReady(): Promise<void> {
        if (this.closed) return Promise.reject(new WatchService.ClosedException());
        if (this.state === "armed") return Promise.resolve();
        if (this.state === "failed")
            return Promise.reject(
                new RegionWatchArmFailedError(this.regionFolder, this.getLiveness()),
            );

        return new Promise((resolve, reject) => {
            this.readyWaiters.push({ resolve, reject });
        });
    }

    getLiveness(): RegionWatchLiveness {
        return {
            state: this.state,
            polling: this.polling,
            rearmCount: this.rearmCount,
            lastEventAt: this.lastEventAt,
            probe: this.probe,
        };
    }

    onArmFailure(listener: (liveness: RegionWatchLiveness) => void): () => void {
        if (this.state === "failed") {
            queueMicrotask(() => listener(this.getLiveness()));
            return () => {};
        }
        this.armFailureListeners.push(listener);
        return () => {
            const index = this.armFailureListeners.indexOf(listener);
            if (index >= 0) this.armFailureListeners.splice(index, 1);
        };
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;

        if (this.existenceTimer !== null) {
            clearInterval(this.existenceTimer);
            this.existenceTimer = null;
        }
        this.clearProbe();

        // upstream: waiting poll/take calls get a ClosedWatchServiceException,
        // re-thrown as WatchService.ClosedException
        for (const waiter of this.waiters.splice(0)) {
            if (waiter.timer !== null) clearTimeout(waiter.timer);
            waiter.reject(new WatchService.ClosedException());
        }
        for (const waiter of this.readyWaiters.splice(0))
            waiter.reject(new WatchService.ClosedException());
        this.armFailureListeners.length = 0;
        this.pending.clear();

        await this.watcher?.close();
    }

    /** upstream: ensureInitialization — registers the watch once the region-folder exists */
    private ensureInitialization(): void {
        if (this.closed || this.watcher !== null) return;

        if (!existsSync(this.regionFolder)) {
            this.existenceTimer ??= setInterval(() => {
                if (this.closed || !existsSync(this.regionFolder)) return;
                if (this.existenceTimer !== null) {
                    clearInterval(this.existenceTimer);
                    this.existenceTimer = null;
                }
                this.ensureInitialization();
            }, EXISTENCE_CHECK_INTERVAL_MS);
            return;
        }

        const watcher = this.createWatcher(this.regionFolder, {
            // like upstream's watch-registration, only changes *after* the watch started
            // are reported — chokidar's initial scan is suppressed
            ignoreInitial: true,
            depth: 0,
            ...(this.polling ? { usePolling: true, interval: this.pollIntervalMs } : {}),
        });
        this.watcher = watcher;

        watcher.on("all", (event, path) => {
            if (this.watcher === watcher) this.handleEvent(event, path);
        });
        watcher.once("ready", () => {
            if (this.closed || this.watcher !== watcher) return;
            if (this.polling) this.startProbe();
            else this.markArmed();
        });

        // upstream surfaces watcher-failures as IOExceptions from poll/take; chokidar
        // reports them asynchronously — they are logged and the service keeps watching
        watcher.on("error", (error) => {
            logDebug(
                `Unexpected exception in region-watchservice ('${this.regionFolder}'): ${String(error)}`,
            );
        });
    }

    /**
     * Prove the polling watcher delivers: write one probe file, wait for the watcher to report
     * it. The probe name can never parse as a region file, so it is filtered before the
     * region-position path and never reaches a consumer.
     */
    private startProbe(): void {
        this.probeSerial += 1;
        const file = join(
            this.regionFolder,
            `${PROBE_FILE_PREFIX}${process.pid}-${this.probeSerial}`,
        );
        try {
            writeFileSync(file, String(Date.now()));
        } catch (error) {
            // A folder this process cannot write to cannot be probed. Nothing is proven either
            // way, so the watcher is trusted and the liveness report says so.
            this.diagnostic(
                `Region-watchservice ('${this.regionFolder}') could not write its liveness probe ` +
                    `(${String(error)}); trusting the polling watcher unproven.`,
            );
            this.probe = "unavailable";
            this.markArmed();
            return;
        }

        this.probeFile = file;
        this.probeTimer = setTimeout(() => void this.onProbeMissed(), this.probeDeadlineMs);
        if (typeof this.probeTimer.unref === "function") this.probeTimer.unref();
    }

    private clearProbe(): void {
        if (this.probeTimer !== null) {
            clearTimeout(this.probeTimer);
            this.probeTimer = null;
        }
        if (this.probeFile !== null) {
            const file = this.probeFile;
            this.probeFile = null;
            try {
                rmSync(file, { force: true });
            } catch {
                /* the probe is a few bytes; a leftover is harmless and never a region file */
            }
        }
    }

    private async onProbeMissed(): Promise<void> {
        if (this.closed || this.state !== "pending") return;
        this.probeTimer = null;
        this.clearProbe();

        const mute = this.watcher;
        this.watcher = null;
        if (mute !== null) {
            try {
                await mute.close();
            } catch (error) {
                this.diagnostic(
                    `Region-watchservice ('${this.regionFolder}') failed to close a mute watcher: ${String(error)}`,
                );
            }
        }
        if (this.closed) return;

        if (this.rearmCount < this.maxRearms) {
            this.rearmCount += 1;
            this.diagnostic(
                `Region-watchservice ('${this.regionFolder}') polling watcher reported nothing within ` +
                    `${this.probeDeadlineMs}ms; re-arming (attempt ${this.rearmCount} of ${this.maxRearms}).`,
            );
            this.ensureInitialization();
            return;
        }

        this.probe = "missed";
        this.state = "failed";
        const liveness = this.getLiveness();
        this.diagnostic(
            `Region-watchservice ('${this.regionFolder}') never armed after ${this.rearmCount} re-arm ` +
                `attempt(s); region-file changes will not be observed.`,
        );
        for (const waiter of this.readyWaiters.splice(0))
            waiter.reject(new RegionWatchArmFailedError(this.regionFolder, liveness));
        for (const listener of this.armFailureListeners.splice(0)) listener(liveness);
    }

    private markArmed(): void {
        if (this.closed || this.state !== "pending") return;
        this.state = "armed";
        for (const waiter of this.readyWaiters.splice(0)) waiter.resolve();
    }

    private handleEvent(event: string, path: string): void {
        if (this.closed) return;

        const name = basename(path);
        if (name.startsWith(PROBE_FILE_PREFIX)) {
            // Only this service's own live probe counts, and only once: a stale probe from an
            // earlier process, or the unlink of our own, proves nothing.
            if (
                this.probeFile !== null &&
                name === basename(this.probeFile) &&
                (event === "add" || event === "change")
            ) {
                this.lastEventAt = Date.now();
                this.probe = "observed";
                this.clearProbe();
                this.markArmed();
            }
            return;
        }

        // ENTRY_CREATE / ENTRY_MODIFY / ENTRY_DELETE
        if (event !== "add" && event !== "change" && event !== "unlink") return;

        const pos = RegionType.regionForFileName(name);
        if (pos === null) return;

        this.lastEventAt = Date.now();
        this.pending.set(pos.getX() + "," + pos.getY(), pos);
        this.deliver();
    }

    /** hands the pending batch to the longest-waiting poll/take call, if any */
    private deliver(): void {
        if (this.pending.size === 0) return;

        const waiter = this.waiters.shift();
        if (waiter === undefined) return;

        if (waiter.timer !== null) clearTimeout(waiter.timer);
        waiter.resolve(this.drain());
    }

    private drain(): Vector2i[] | null {
        if (this.pending.size === 0) return null;

        const events = [...this.pending.values()];
        this.pending.clear();
        return events;
    }
}
