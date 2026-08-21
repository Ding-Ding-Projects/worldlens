/**
 * The in-memory half of "pause": a gate a running backup checks at its own clean
 * boundaries, and nowhere else.
 *
 * This is deliberately **not** an `AbortSignal`. Aborting throws, and throwing is how
 * "stop" already works (`BackupRunner#cancel`) - unwinding the whole call stack, closing
 * whatever file handle happens to be open, and leaving the safety net (delete anything
 * this attempt itself wrote that never finished) to clean up. Pause has no failure to
 * unwind: the operation is meant to still be sitting there, mid-phase, ready to carry on
 * with no redo at all the moment somebody asks it to. So it is a plain, cooperative
 * `await`, checked only at the handful of places in `runner.ts`, `archive.ts` and
 * `split.ts` that are already provably safe to sit still at - between files while
 * packing, between parts while splitting, between assets while uploading. Nowhere else
 * ever calls into this, which is what keeps "safe boundary" true rather than aspirational:
 * there is no code path that can pause mid-file, mid-part or mid-upload, because there is
 * no code path that even asks.
 *
 * ## Why `resume()` while still "pausing" is not an error
 *
 * `requestPause()` sets intent; the boundary check is what actually parks the operation.
 * Calling `resume()` in the gap between the two - the operation has been asked to pause
 * but has not reached a boundary yet - simply withdraws the request. Nothing was ever
 * waiting, so there is nothing to wake up. Getting this wrong (treating `resume()` before
 * `paused` as a no-op that leaves `pauseRequested` set) is exactly the decorative-control
 * bug the interface must not have: a Resume button that appears to work and does not.
 */

export type PauseGateState = "running" | "pausing" | "paused";

export interface PauseGate {
    /** The gate's own view of itself right now. Never asks the operation anything. */
    readonly state: () => PauseGateState;
    /** Asks the operation to stop at its next boundary. A no-op if already requested/paused. */
    readonly requestPause: () => void;
    /** Withdraws a pending request, or wakes an operation already parked at a boundary. */
    readonly resume: () => void;
    /**
     * Called at a clean boundary. Resolves immediately when nothing was requested;
     * otherwise parks until `resume()` is called, or the operation is aborted out from
     * under the pause (a Stop while paused must still work - see `runner.ts`).
     */
    readonly waitAtBoundary: (signal?: AbortSignal) => Promise<void>;
}

/**
 * Builds one gate for one running operation.
 *
 * `onStateChange` fires on every transition, including the one this module itself makes
 * internally when a boundary is actually reached (`pausing` -> `paused`) - the caller uses
 * it to emit a `paused` event and persist the durable pause record, both of which must
 * happen only once the operation is genuinely sitting still, not the instant somebody
 * clicked Pause.
 */
export function createPauseGate(onStateChange?: (state: PauseGateState) => void): PauseGate {
    let pauseRequested = false;
    let paused = false;
    // At most one waiter matters in practice - one boundary is paused on at a time - but
    // this is a list rather than a single slot so a stray second call can never silently
    // drop a resolver and hang a boundary forever.
    let waiters: Array<() => void> = [];

    const currentState = (): PauseGateState => (paused ? "paused" : pauseRequested ? "pausing" : "running");
    const notify = (): void => onStateChange?.(currentState());

    return {
        state: currentState,

        requestPause(): void {
            if (pauseRequested || paused) return;
            pauseRequested = true;
            notify();
        },

        resume(): void {
            if (!pauseRequested && !paused) return;
            pauseRequested = false;
            const wasPaused = paused;
            paused = false;
            notify();
            if (wasPaused) {
                const resolvers = waiters;
                waiters = [];
                for (const resolve of resolvers) resolve();
            }
        },

        async waitAtBoundary(signal?: AbortSignal): Promise<void> {
            // The whole gate, in one sentence: if nothing was asked for, do not stop.
            if (!pauseRequested) return;
            paused = true;
            notify();
            await new Promise<void>((resolve, reject) => {
                waiters.push(resolve);
                if (signal === undefined) return;
                const onAbort = (): void => {
                    // A Stop that arrives while paused must still stop. Removing this
                    // waiter from the list keeps a later resume() call from resolving a
                    // promise whose caller has already moved on via rejection.
                    waiters = waiters.filter((waiter) => waiter !== resolve);
                    reject(signal.reason instanceof Error ? signal.reason : new Error("Aborted while paused."));
                };
                signal.addEventListener("abort", onAbort, { once: true });
            });
        },
    };
}
