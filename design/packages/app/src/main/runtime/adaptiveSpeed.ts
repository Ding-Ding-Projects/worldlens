import { cpus, freemem, totalmem } from "node:os";
import type { SpeedLevelNumber } from "./speedControl.js";

export type AdaptiveReason =
    "off" | "sampling" | "pressure" | "idle" | "light" | "steady" | "unavailable" | "apply-failed";
export interface AdaptiveState {
    enabled: boolean;
    level: SpeedLevelNumber | null;
    reason: AdaptiveReason;
}
export interface PressureSample {
    cpuBusy: number;
    freeMemory: number;
    freeBytes: number;
    lagMs: number;
    idleSeconds: number;
}
export interface AdaptiveOptions {
    sample: (lagMs: number) => PressureSample | null;
    apply: (level: SpeedLevelNumber) => Promise<boolean>;
    now?: () => number;
    intervalMs?: number;
}

/** No activity contents or process inventory are collected. CPU is a delta, not load average. */
export function createHostPressureSampler(
    idleSeconds: () => number,
): (lagMs: number) => PressureSample | null {
    const counters = () =>
        cpus().reduce(
            (sum, cpu) => ({
                idle: sum.idle + cpu.times.idle,
                total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
            }),
            { idle: 0, total: 0 },
        );
    let previous = counters();
    return (lagMs) => {
        const current = counters();
        const delta = current.total - previous.total;
        const busy = delta > 0 ? 1 - (current.idle - previous.idle) / delta : NaN;
        previous = current;
        const idle = idleSeconds();
        const free = freemem();
        const total = totalmem();
        if (
            ![busy, idle, free, total].every(Number.isFinite) ||
            delta <= 0 ||
            total <= 0 ||
            idle < 0
        )
            return null;
        return {
            cpuBusy: Math.max(0, Math.min(1, busy)),
            freeMemory: free / total,
            freeBytes: free,
            lagMs,
            idleSeconds: idle,
        };
    };
}

/** One owned timer per opted-in render; no overlap, no automatic restarts. */
export class AdaptiveSpeedController {
    private timer: ReturnType<typeof setTimeout> | undefined;
    private stopped = false;
    private candidate: SpeedLevelNumber | null = null;
    private streak = 0;
    private changedAt = -Infinity;
    private state: AdaptiveState = { enabled: true, level: null, reason: "sampling" };
    constructor(private readonly options: AdaptiveOptions) {}
    snapshot(): AdaptiveState {
        return { ...this.state };
    }
    start(): void {
        if (!this.stopped && this.timer === undefined) this.schedule();
    }
    stop(): void {
        this.stopped = true;
        clearTimeout(this.timer);
        this.timer = undefined;
        this.state.enabled = false;
    }
    private schedule(): void {
        const due = performance.now() + (this.options.intervalMs ?? 5000);
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.tick(Math.max(0, performance.now() - due)).finally(() => {
                if (!this.stopped) this.schedule();
            });
        }, this.options.intervalMs ?? 5000);
        this.timer.unref?.();
    }
    async tick(lagMs = 0): Promise<void> {
        if (this.stopped) return;
        let sample: PressureSample | null;
        try {
            sample = this.options.sample(lagMs);
        } catch {
            sample = null;
        }
        if (sample === null) {
            this.state.reason = "unavailable";
            this.candidate = null;
            this.streak = 0;
            return;
        }
        // Saturation caused by the render itself is not pressure while the user is idle.
        const pressure =
            sample.freeMemory < 0.12 ||
            sample.freeBytes < 512 * 1024 * 1024 ||
            sample.lagMs > 180 ||
            (sample.idleSeconds < 15 && sample.cpuBusy > 0.88);
        const level: SpeedLevelNumber = pressure
            ? 1
            : sample.idleSeconds >= 60
              ? 3
              : sample.cpuBusy < 0.55
                ? 3
                : 2;
        const reason: AdaptiveReason = pressure
            ? "pressure"
            : sample.idleSeconds >= 60
              ? "idle"
              : sample.cpuBusy < 0.55
                ? "light"
                : "steady";
        if (this.candidate === level) this.streak++;
        else {
            this.candidate = level;
            this.streak = 1;
        }
        const now = this.options.now?.() ?? Date.now();
        if (this.streak < (pressure ? 2 : 4) || now - this.changedAt < 20000) return;
        if (this.state.level === level) {
            this.state.reason = reason;
            return;
        }
        try {
            const applied = await this.options.apply(level);
            if (this.stopped) return;
            this.state = {
                enabled: true,
                level: applied ? level : this.state.level,
                reason: applied ? reason : "apply-failed",
            };
        } catch {
            if (!this.stopped) this.state.reason = "apply-failed";
        }
        this.changedAt = now;
    }
}
