import { describe, it, expect, vi } from "vitest";
import { AdaptiveSpeedController, type PressureSample } from "./adaptiveSpeed.js";
const idle: PressureSample = { cpuBusy: .99, freeMemory: .5, freeBytes: 4e9, lagMs: 0, idleSeconds: 120 };
function setup(sample = idle) {
    let now = 0;
    let current = sample;
    const apply = vi.fn(async () => true);
    const control = new AdaptiveSpeedController({ sample: () => current, apply, now: () => now });
    return { control, apply, change: (value: PressureSample) => { current = value; }, tick: async (n: number) => { for (let i=0;i<n;i++) { now += 5000; await control.tick(); } } };
}
describe("adaptive scheduling", () => {
    it("does not mistake the idle render's own CPU saturation for pressure", async () => {
        const f = setup(); await f.tick(3); expect(f.apply).not.toHaveBeenCalled();
        await f.tick(1); expect(f.apply).toHaveBeenCalledWith(3);
        expect(f.control.snapshot().reason).toBe("idle");
    });
    it("backs off for active saturation with hysteresis and observes cooldown before recovery", async () => {
        const f = setup({ ...idle, idleSeconds: 0 }); await f.tick(1); expect(f.apply).not.toHaveBeenCalled();
        await f.tick(1); expect(f.apply).toHaveBeenLastCalledWith(1);
        f.change(idle); await f.tick(3); expect(f.apply).toHaveBeenCalledTimes(1);
        await f.tick(1); expect(f.apply).toHaveBeenLastCalledWith(3);
    });
    it("backs off even while idle when memory or responsiveness is under pressure", async () => {
        for (const change of [{ freeMemory: .05 }, { freeBytes: 200e6 }, { lagMs: 250 }]) {
            const f = setup({ ...idle, ...change }); await f.tick(2); expect(f.apply).toHaveBeenCalledWith(1);
        }
    });
    it("keeps an unavailable measurement honest and stops owned callbacks", async () => {
        const apply = vi.fn(async () => true);
        const controller = new AdaptiveSpeedController({ sample: () => null, apply });
        await controller.tick(); expect(controller.snapshot().reason).toBe("unavailable");
        controller.stop(); await controller.tick(); expect(apply).not.toHaveBeenCalled();
    });
    it("does not publish an in-flight result after stop", async () => {
        let resolve!: (ok: boolean) => void;
        const control = new AdaptiveSpeedController({ sample: () => ({ ...idle, lagMs: 300 }), apply: () => new Promise(r => { resolve = r; }) });
        await control.tick(); const pending = control.tick(); control.stop(); resolve(true); await pending;
        expect(control.snapshot().enabled).toBe(false); expect(control.snapshot().level).toBeNull();
    });
    it("reports application failure without claiming a level", async () => {
        const control = new AdaptiveSpeedController({ sample: () => ({ ...idle, lagMs: 300 }), apply: async () => false });
        await control.tick(); await control.tick(); expect(control.snapshot()).toEqual({ enabled: true, level: null, reason: "apply-failed" });
    });
    it("releases its timer on stop", () => {
        vi.useFakeTimers(); const f = setup(); f.control.start(); expect(vi.getTimerCount()).toBe(1);
        f.control.stop(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers();
    });
});
