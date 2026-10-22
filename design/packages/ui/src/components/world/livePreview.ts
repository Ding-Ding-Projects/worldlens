import type { WorldBridge } from "./worldBridge.js";

/** Revalidate only an active local preview, without overlapping requests. */
export function followLivePreview(
    dataRoot: string,
    bridge: WorldBridge | null,
    refresh: () => Promise<void>,
): () => void {
    const match = /^\/local\/([^/]+)$/.exec(dataRoot);
    if (match === null || bridge === null) return () => {};
    const renderId = decodeURIComponent(match[1]!);
    let stopped = false;
    let wasActive = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = bridge.onRenderEvent((event) => {
        if (event.renderId === renderId && (event.type === "cancelled" || event.type === "failed"))
            stop();
    });
    function stop(): void {
        stopped = true;
        clearTimeout(timer);
        unsubscribe();
    }
    async function tick(): Promise<void> {
        try {
            const active = (await bridge!.activeRenders()).includes(renderId);
            if (stopped) return;
            if (active || wasActive) await refresh();
            if (!active) {
                stop();
                return;
            }
            wasActive = true;
        } catch {
            // Keep the existing map visible when a transient read cannot refresh it.
        }
        if (!stopped)
            timer = setTimeout(() => {
                void tick();
            }, 5000);
    }
    void tick();
    return stop;
}
