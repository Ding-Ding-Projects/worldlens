import { EventEmitter } from "node:events";
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FSWatcher } from "chokidar";
import { afterEach, describe, expect, it } from "vitest";
import { WatchService } from "../../util/WatchService.js";
import {
    MCAWorldRegionWatchService,
    RegionWatchArmFailedError,
    type RegionWatchLiveness,
} from "./MCAWorldRegionWatchService.js";

/*
 * Issue #176: on the polling backend a chokidar watcher can report `ready` and then never
 * deliver a single event. The service now proves a polling watcher live with a self-probe and
 * re-arms a mute one a bounded number of times; these cases cover the probe on a real polling
 * watcher, the mute path through a fake watcher that only ever says `ready`, and the native
 * backend staying unprobed.
 */

/** A watcher that becomes ready and then stays silent forever - the exact shape #176 observed. */
class MuteWatcher extends EventEmitter {
    static created: MuteWatcher[] = [];
    closed = false;

    constructor() {
        super();
        MuteWatcher.created.push(this);
        queueMicrotask(() => this.emit("ready"));
    }

    async close(): Promise<void> {
        this.closed = true;
    }
}

describe("MCAWorldRegionWatchService liveness (issue #176)", () => {
    let tempDir = "";
    let service: MCAWorldRegionWatchService | null = null;

    function createTempDir(): string {
        tempDir = mkdtempSync(join(tmpdir(), "bluemap-watch-liveness-"));
        return tempDir;
    }

    afterEach(async () => {
        await service?.close();
        service = null;
        MuteWatcher.created = [];
        if (tempDir.length > 0) {
            try {
                chmodSync(tempDir, 0o700);
            } catch {
                /* already writable */
            }
            rmSync(tempDir, { recursive: true, force: true });
        }
        tempDir = "";
    });

    it("the native backend is not probed and reports armed on ready", async () => {
        const regionFolder = createTempDir();
        service = new MCAWorldRegionWatchService(regionFolder, { usePolling: false });
        expect(service.getLiveness()).toMatchObject({
            state: "pending",
            polling: false,
            probe: "not-applicable",
        });

        await service.whenReady();
        expect(service.getLiveness()).toMatchObject({
            state: "armed",
            polling: false,
            probe: "not-applicable",
            rearmCount: 0,
        });
        expect(readdirSync(regionFolder)).toEqual([]);
    });

    it(
        "a healthy polling watcher observes the self-probe, cleans it up and still delivers region events",
        { timeout: 20000 },
        async () => {
            const regionFolder = createTempDir();
            service = new MCAWorldRegionWatchService(regionFolder, {
                usePolling: true,
                pollIntervalMs: 50,
                probeDeadlineMs: 10000,
            });

            await service.whenReady();
            const liveness = service.getLiveness();
            expect(liveness).toMatchObject({
                state: "armed",
                polling: true,
                probe: "observed",
                rearmCount: 0,
            });
            expect(liveness.lastEventAt).not.toBeNull();
            // the probe never reaches a consumer and does not stay behind in the world folder
            expect(service.poll()).toBeNull();
            expect(
                readdirSync(regionFolder).filter((name) =>
                    name.startsWith(".worldlens-watch-probe-"),
                ),
            ).toEqual([]);

            const take = service.take();
            writeFileSync(join(regionFolder, "r.3.4.mca"), "data");
            const batch = await take;
            expect(batch.map((pos) => pos.getX() + "," + pos.getY())).toEqual(["3,4"]);
        },
    );

    it("a mute polling watcher is re-armed a bounded number of times, then reported as failed", async () => {
        const regionFolder = createTempDir();
        const diagnostics: string[] = [];
        const failures: RegionWatchLiveness[] = [];
        service = new MCAWorldRegionWatchService(regionFolder, {
            usePolling: true,
            probeDeadlineMs: 40,
            maxRearms: 2,
            createWatcher: () => new MuteWatcher() as unknown as FSWatcher,
            onDiagnostic: (message) => diagnostics.push(message),
        });
        service.onArmFailure((liveness) => failures.push(liveness));

        const ready = service.whenReady();
        await expect(ready).rejects.toBeInstanceOf(RegionWatchArmFailedError);

        // one initial watcher plus one per re-arm, every mute one closed before its successor
        expect(MuteWatcher.created).toHaveLength(3);
        expect(MuteWatcher.created.map((watcher) => watcher.closed)).toEqual([true, true, true]);

        const liveness = service.getLiveness();
        expect(liveness).toMatchObject({
            state: "failed",
            polling: true,
            probe: "missed",
            rearmCount: 2,
        });
        expect(failures).toEqual([liveness]);
        expect(diagnostics.filter((line) => line.includes("re-arming"))).toHaveLength(2);
        expect(diagnostics.some((line) => line.includes("never armed after 2"))).toBe(true);

        // a late subscriber learns the verdict too, and no probe file is left behind
        const late: RegionWatchLiveness[] = [];
        service.onArmFailure((value) => late.push(value));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(late).toEqual([liveness]);
        expect(readdirSync(regionFolder)).toEqual([]);

        // whenReady after the verdict rejects immediately with the same reason
        await expect(service.whenReady()).rejects.toBeInstanceOf(RegionWatchArmFailedError);
        // take() still waits rather than throwing: the consumer decides what a failed arm means
        const waiting = service.take();
        await service.close();
        await expect(waiting).rejects.toBeInstanceOf(WatchService.ClosedException);
    });

    it("closing during the probe wait cancels re-arming and rejects the readiness wait", async () => {
        const regionFolder = createTempDir();
        service = new MCAWorldRegionWatchService(regionFolder, {
            usePolling: true,
            probeDeadlineMs: 10000,
            createWatcher: () => new MuteWatcher() as unknown as FSWatcher,
        });
        const ready = service.whenReady();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await service.close();

        await expect(ready).rejects.toBeInstanceOf(WatchService.ClosedException);
        expect(MuteWatcher.created).toHaveLength(1);
        expect(service.getLiveness().state).toBe("pending");
        expect(readdirSync(regionFolder)).toEqual([]);
    });

    it("a region folder this process cannot write to is trusted unproven instead of failed", async () => {
        if (process.platform === "win32" || process.getuid?.() === 0) {
            // chmod does not restrict the owner on Windows, and root bypasses it everywhere
            return;
        }
        const regionFolder = createTempDir();
        chmodSync(regionFolder, 0o500);
        const diagnostics: string[] = [];
        service = new MCAWorldRegionWatchService(regionFolder, {
            usePolling: true,
            probeDeadlineMs: 40,
            onDiagnostic: (message) => diagnostics.push(message),
        });

        await service.whenReady();
        expect(service.getLiveness()).toMatchObject({
            state: "armed",
            probe: "unavailable",
            rearmCount: 0,
        });
        expect(
            diagnostics.some((line) => line.includes("could not write its liveness probe")),
        ).toBe(true);
        expect(existsSync(regionFolder)).toBe(true);
    });
});
