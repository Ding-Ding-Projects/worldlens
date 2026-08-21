/**
 * `PauseGate`'s own state machine, tested with no backup, no disk and no network anywhere
 * near it - the same isolation `archive.ts`'s and `split.ts`'s own tests get, for the same
 * reason: this is the one piece of the whole feature simple enough to prove exhaustively.
 *
 * Written under the same workflow note as `split.resume.test.ts`: not run as part of this
 * task, only written, following the neighbouring `*.test.ts` convention in this directory.
 */

import { describe, expect, it, vi } from "vitest";
import { createPauseGate } from "./pauseGate.js";

describe("createPauseGate", () => {
    it("does nothing at a boundary when nothing was requested", async () => {
        const gate = createPauseGate();
        expect(gate.state()).toBe("running");
        // Resolves immediately - proven by racing it against a timer rather than trusting
        // that it merely "looks fast".
        const raced = await Promise.race([
            gate.waitAtBoundary().then(() => "boundary"),
            new Promise((resolve) => setTimeout(() => resolve("timeout"), 20)),
        ]);
        expect(raced).toBe("boundary");
    });

    it("moves to pausing on request, then to paused only once a boundary is actually reached", async () => {
        const states: string[] = [];
        const gate = createPauseGate((state) => states.push(state));

        gate.requestPause();
        expect(gate.state()).toBe("pausing");

        const boundary = gate.waitAtBoundary();
        // The gate must report "paused" synchronously, before the boundary promise
        // settles - a caller (`runner.ts#pauseBoundary`) persists the durable record and
        // emits the `paused` event based on this transition, and must not be racing the
        // gate to find out it already happened.
        expect(gate.state()).toBe("paused");

        gate.resume();
        await boundary;
        expect(gate.state()).toBe("running");
        expect(states).toEqual(["pausing", "paused", "running"]);
    });

    it("withdrawing the request before a boundary is reached is not an error and parks nothing", async () => {
        const gate = createPauseGate();
        gate.requestPause();
        gate.resume();
        expect(gate.state()).toBe("running");

        // The withdrawal must actually take: a boundary reached after this must not
        // pause at all, which is the exact "Resume clicked before Pause finished landing"
        // race this gate exists to get right rather than merely hoping is rare.
        const raced = await Promise.race([
            gate.waitAtBoundary().then(() => "boundary"),
            new Promise((resolve) => setTimeout(() => resolve("timeout"), 20)),
        ]);
        expect(raced).toBe("boundary");
    });

    it("a Stop (abort) while paused wakes the boundary with a rejection, not a silent hang", async () => {
        const gate = createPauseGate();
        gate.requestPause();
        const controller = new AbortController();
        const boundary = gate.waitAtBoundary(controller.signal);
        expect(gate.state()).toBe("paused");

        controller.abort(new Error("stopped"));
        await expect(boundary).rejects.toThrow("stopped");
    });

    it("resume() after abort does not resolve the already-rejected boundary a second time", async () => {
        const gate = createPauseGate();
        gate.requestPause();
        const controller = new AbortController();
        const boundary = gate.waitAtBoundary(controller.signal);
        controller.abort();
        await expect(boundary).rejects.toThrow();

        // Must not throw, hang, or resurrect the already-settled promise above - this is
        // exactly the defensive "filter the dead waiter out" behaviour `pauseGate.ts`
        // documents for this case.
        expect(() => gate.resume()).not.toThrow();
    });

    it("multiple requestPause() calls before a boundary do not stack", async () => {
        const onStateChange = vi.fn();
        const gate = createPauseGate(onStateChange);
        gate.requestPause();
        gate.requestPause();
        gate.requestPause();
        // Only the first call actually changes anything - a repeated click on a disabled
        // "Pausing..." button (which the UI already disables) must not be observable as
        // three separate transitions.
        expect(onStateChange).toHaveBeenCalledTimes(1);
    });
});
