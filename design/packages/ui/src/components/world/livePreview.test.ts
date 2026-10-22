import { afterEach, expect, it, vi } from "vitest";
import { followLivePreview } from "./livePreview.js";
import type { RenderEvent, WorldBridge } from "./worldBridge.js";

afterEach(() => vi.useRealTimers());
it("refreshes while active, refreshes final output once and stops", async () => {
    vi.useFakeTimers();
    let active = true;
    const unsubscribe = vi.fn();
    const bridge = {
        activeRenders: async () => (active ? ["render-a"] : []),
        onRenderEvent: () => unsubscribe,
    } as unknown as WorldBridge;
    const refresh = vi.fn(async () => {});
    const stop = followLivePreview("/local/render-a", bridge, refresh);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
    active = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(15000);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(unsubscribe).toHaveBeenCalled();
    stop();
});
it("stops on failed or cancelled renders and on disposal", async () => {
    vi.useFakeTimers();
    let listener!: (event: RenderEvent) => void;
    const bridge = {
        activeRenders: async () => ["render-a"],
        onRenderEvent: (fn: typeof listener) => {
            listener = fn;
            return () => {};
        },
    } as unknown as WorldBridge;
    const refresh = vi.fn(async () => {});
    const stop = followLivePreview("/local/render-a", bridge, refresh);
    await vi.advanceTimersByTimeAsync(0);
    listener({ type: "cancelled", renderId: "render-a", at: "now" });
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
});
it("leaves remote and already completed maps alone", async () => {
    const refresh = vi.fn(async () => {});
    followLivePreview("/remote/example", null, refresh)();
    const bridge = {
        activeRenders: async () => [],
        onRenderEvent: () => () => {},
    } as unknown as WorldBridge;
    followLivePreview("/local/finished", bridge, refresh);
    await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();
});
