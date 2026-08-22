import { describe, expect, it } from "vitest";

import {
    fail,
    ok,
    type Answer,
    type AttachOptions,
    type ConsoleExit,
    type ConsoleLine,
    type ConsoleSession,
    type InstanceStatus,
    type ServerTransport,
} from "../transport/types.js";
import { ConsoleSupervisor, type ConsoleSessionEvent } from "./session.js";

/** A controllable fake timer scheduler: nothing fires until the test says so. */
function fakeScheduler() {
    const pending: { callback: () => void; cancelled: boolean }[] = [];
    return {
        scheduleTimer: (callback: () => void, _delayMs: number) => {
            const entry = { callback, cancelled: false };
            pending.push(entry);
            return {
                cancel: () => {
                    entry.cancelled = true;
                },
            };
        },
        /** Fires the oldest still-pending timer. */
        fireNext(): void {
            const entry = pending.find((item) => !item.cancelled);
            if (entry === undefined) throw new Error("no pending timer to fire");
            pending.splice(pending.indexOf(entry), 1);
            entry.callback();
        },
        /**
         * Fires every timer pending RIGHT NOW (a snapshot), in order - never one newly
         * scheduled as a side effect of firing another. Several independent loops (the
         * status poll and the reconnect backoff) can both have a timer queued at once,
         * and a test driving "time" forward should advance all of them, not just
         * whichever happened to be scheduled first.
         */
        fireAllDue(): void {
            const due = pending.splice(0, pending.length);
            for (const entry of due) {
                if (!entry.cancelled) entry.callback();
            }
        },
        pendingCount(): number {
            return pending.filter((item) => !item.cancelled).length;
        },
    };
}

/** One in-flight fake `ConsoleSession`, controllable by the test. */
function makeControllableSession(): {
    session: ConsoleSession;
    push(line: ConsoleLine): void;
    end(exit: ConsoleExit): void;
} {
    const lineQueue: ConsoleLine[] = [];
    const waiters: ((result: IteratorResult<ConsoleLine>) => void)[] = [];
    let ended: ConsoleExit | null = null;
    let resolveClosed!: (exit: ConsoleExit) => void;
    const closed = new Promise<ConsoleExit>((resolve) => {
        resolveClosed = resolve;
    });

    const lines: AsyncIterable<ConsoleLine> = {
        [Symbol.asyncIterator]() {
            return {
                async next(): Promise<IteratorResult<ConsoleLine>> {
                    if (lineQueue.length > 0) return { value: lineQueue.shift() as ConsoleLine, done: false };
                    if (ended !== null) return { value: undefined, done: true };
                    return new Promise((resolve) => waiters.push(resolve));
                },
            };
        },
    };

    const session: ConsoleSession = {
        id: `underlying-${Math.random().toString(36).slice(2)}`,
        lines,
        send: async () => ok(undefined),
        closed,
        detach: () => {
            if (ended === null) {
                ended = { reason: "detached", followerExitCode: null };
                for (const waiter of waiters.splice(0)) waiter({ value: undefined, done: true });
            }
        },
    };

    return {
        session,
        push(line) {
            const waiter = waiters.shift();
            if (waiter) waiter({ value: line, done: false });
            else lineQueue.push(line);
        },
        end(exit) {
            ended = exit;
            for (const waiter of waiters.splice(0)) waiter({ value: undefined, done: true });
            resolveClosed(exit);
        },
    };
}

/** A `ServerTransport` whose `attach()`/`status()` the test scripts one call at a time. */
function fakeTransport() {
    const attachResults: Answer<{ push(line: ConsoleLine): void; end(exit: ConsoleExit): void; session: ConsoleSession }>[] = [];
    const statusResults: Answer<InstanceStatus>[] = [];

    const transport: ServerTransport = {
        ref: { kind: "local-process", serverDir: "/srv" },
        capabilities: { canCreate: false, canLifecycle: true, canWriteFiles: true, canDestroy: false, console: "rcon" },
        probe: async () => fail("unsupported", "not exercised"),
        create: async () => fail("unsupported", "not exercised"),
        start: async () => fail("unsupported", "not exercised"),
        stop: async () => fail("unsupported", "not exercised"),
        status: async () => {
            const next = statusResults.shift();
            return next ?? ok({ state: "running", running: true, startedAt: null, exitCode: null, checkedAt: "now" });
        },
        attach: async (_options?: AttachOptions) => {
            const next = attachResults.shift();
            if (next === undefined) throw new Error("test forgot to queue an attach() result");
            if (!next.ok) return next;
            return ok(next.value.session);
        },
        fileList: async () => fail("unsupported", "not exercised"),
        fileRead: async () => fail("unsupported", "not exercised"),
        fileWrite: async () => fail("unsupported", "not exercised"),
        fileDelete: async () => fail("unsupported", "not exercised"),
        dirEnsure: async () => fail("unsupported", "not exercised"),
    };

    return {
        transport,
        /** Queues a successful attach, returning the controls for the fake session it built. */
        queueLiveAttach() {
            const controllable = makeControllableSession();
            attachResults.push({ ok: true, value: { ...controllable } });
            return controllable;
        },
        queueFailedAttach(code: "unreachable" | "not-running") {
            attachResults.push(fail(code, "attach failed"));
        },
        queueStatus(status: Answer<InstanceStatus>) {
            statusResults.push(status);
        },
    };
}

async function flush(): Promise<void> {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

const LINE_A: ConsoleLine = { stream: "stdout", text: "[Server] Starting", at: "t1" };
const LINE_B: ConsoleLine = { stream: "stdout", text: "[Server] Done", at: "t2" };

describe("ConsoleSupervisor: identity and basic delivery", () => {
    it("has a stable id that never changes for the life of the object", async () => {
        const fake = fakeTransport();
        fake.queueLiveAttach();
        const scheduler = fakeScheduler();
        const supervisor = new ConsoleSupervisor({ transport: fake.transport, scheduleTimer: scheduler.scheduleTimer });
        const idBefore = supervisor.id;
        supervisor.start();
        await flush();
        expect(supervisor.id).toBe(idBefore);
        expect(typeof supervisor.id).toBe("string");
        expect(supervisor.id.length).toBeGreaterThan(0);
        supervisor.close();
    });

    it("delivers live lines to listeners as they arrive", async () => {
        const fake = fakeTransport();
        const live = fake.queueLiveAttach();
        const scheduler = fakeScheduler();
        const supervisor = new ConsoleSupervisor({ transport: fake.transport, scheduleTimer: scheduler.scheduleTimer });
        const events: ConsoleSessionEvent[] = [];
        supervisor.onUpdate((event) => events.push(event));

        supervisor.start();
        await flush();
        expect(supervisor.state).toBe("live");

        live.push(LINE_A);
        await flush();
        live.push(LINE_B);
        await flush();

        const delivered = events.filter((event) => event.line !== null).map((event) => event.line?.text);
        expect(delivered).toEqual(["[Server] Starting", "[Server] Done"]);
        supervisor.close();
    });
});

describe("ConsoleSupervisor: de-duplication across a reconnect", () => {
    it("never re-delivers a line replayed by the tail after reconnecting", async () => {
        const fake = fakeTransport();
        const first = fake.queueLiveAttach();
        const scheduler = fakeScheduler();
        const supervisor = new ConsoleSupervisor({ transport: fake.transport, scheduleTimer: scheduler.scheduleTimer });
        const events: ConsoleSessionEvent[] = [];
        supervisor.onUpdate((event) => events.push(event));

        supervisor.start();
        await flush();
        first.push(LINE_A);
        await flush();

        // The follower drops (stream ends) - simulate a dropped connection, not a stop.
        const second = fake.queueLiveAttach();
        first.end({ reason: "stream-ended", followerExitCode: 0 });
        await flush();

        // A reconnect was scheduled; fire every pending timer to advance it (the
        // status poll's own recurring timer may also be pending at this point).
        expect(scheduler.pendingCount()).toBeGreaterThan(0);
        scheduler.fireAllDue();
        await flush();
        expect(supervisor.state).toBe("live");

        // The reconnect's tail replay re-sends the exact same (timestamp, text) line.
        second.push(LINE_A);
        await flush();
        second.push(LINE_B);
        await flush();

        const delivered = events.filter((event) => event.line !== null).map((event) => event.line?.text);
        // LINE_A appears exactly once despite being pushed twice, because its
        // (timestamp, text) key was already seen. LINE_B is new and comes through.
        expect(delivered).toEqual(["[Server] Starting", "[Server] Done"]);
    });
});

describe("ConsoleSupervisor: unreachable is never reported as stopped", () => {
    it("an unreachable attach failure reports 'unreachable', not 'stopped'", async () => {
        const fake = fakeTransport();
        fake.queueFailedAttach("unreachable");
        const scheduler = fakeScheduler();
        const supervisor = new ConsoleSupervisor({ transport: fake.transport, scheduleTimer: scheduler.scheduleTimer });
        supervisor.start();
        await flush();
        expect(supervisor.state).toBe("unreachable");
        expect(supervisor.state).not.toBe("stopped");
        supervisor.close();
    });

    it("a stream ending mid-session (drop) never reports 'stopped' on its own - only status() may", async () => {
        const fake = fakeTransport();
        const live = fake.queueLiveAttach();
        fake.queueLiveAttach(); // the reconnect attempt after the drop
        const scheduler = fakeScheduler();
        const supervisor = new ConsoleSupervisor({ transport: fake.transport, scheduleTimer: scheduler.scheduleTimer });
        supervisor.start();
        await flush();
        expect(supervisor.state).toBe("live");

        live.end({ reason: "unreachable", followerExitCode: null });
        await flush();

        // This is the exact bug this module exists to prevent: a dropped log stream
        // must read as "unreachable" or "reconnecting", never as "stopped".
        expect(supervisor.state).not.toBe("stopped");
        supervisor.close();
    });

    it("status() reporting not-running while attached genuinely sets 'stopped'", async () => {
        const fake = fakeTransport();
        fake.queueLiveAttach();
        // The first poll (during start()) sees the default running:true; queue the
        // not-running answer for the SECOND poll so it never races the initial attach.
        fake.queueStatus(ok({ state: "running", running: true, startedAt: null, exitCode: null, checkedAt: "t0" }));
        fake.queueStatus(ok({ state: "exited", running: false, startedAt: null, exitCode: 0, checkedAt: "t1" }));
        const scheduler = fakeScheduler();
        const supervisor = new ConsoleSupervisor({ transport: fake.transport, scheduleTimer: scheduler.scheduleTimer, statusPollMs: 1 });
        supervisor.start();
        await flush();
        expect(supervisor.state).toBe("live");

        scheduler.fireAllDue();
        await flush();
        expect(supervisor.state).toBe("stopped");
        supervisor.close();
    });

    it("a failed status() probe (transport unreachable) never overwrites the current state as stopped", async () => {
        const fake = fakeTransport();
        fake.queueLiveAttach();
        fake.queueStatus(ok({ state: "running", running: true, startedAt: null, exitCode: null, checkedAt: "t0" }));
        fake.queueStatus(fail("unreachable", "daemon did not answer"));
        const scheduler = fakeScheduler();
        const supervisor = new ConsoleSupervisor({ transport: fake.transport, scheduleTimer: scheduler.scheduleTimer, statusPollMs: 1 });
        supervisor.start();
        await flush();
        expect(supervisor.state).toBe("live");

        scheduler.fireAllDue();
        await flush();
        // The console itself is live; a status probe that could not even reach the
        // daemon must not be read as "the server stopped".
        expect(supervisor.state).toBe("live");
        supervisor.close();
    });
});

describe("ConsoleSupervisor: send() delegates to the live underlying session", () => {
    it("refuses to send when there is no live session", async () => {
        const fake = fakeTransport();
        fake.queueFailedAttach("unreachable");
        const scheduler = fakeScheduler();
        const supervisor = new ConsoleSupervisor({ transport: fake.transport, scheduleTimer: scheduler.scheduleTimer });
        supervisor.start();
        await flush();
        const result = await supervisor.send("say hi");
        expect(result.ok).toBe(false);
        supervisor.close();
    });

    it("forwards send() to the live session's own send() once attached", async () => {
        const fake = fakeTransport();
        const live = fake.queueLiveAttach();
        const scheduler = fakeScheduler();
        const supervisor = new ConsoleSupervisor({ transport: fake.transport, scheduleTimer: scheduler.scheduleTimer });
        supervisor.start();
        await flush();
        expect(supervisor.state).toBe("live");

        const result = await supervisor.send("say hi");
        expect(result.ok).toBe(true);
        void live;
        supervisor.close();
    });
});

describe("ConsoleSupervisor: close() stops the loop for good", () => {
    it("emits a final 'closed' state and cancels pending timers", async () => {
        const fake = fakeTransport();
        fake.queueLiveAttach();
        const scheduler = fakeScheduler();
        const supervisor = new ConsoleSupervisor({ transport: fake.transport, scheduleTimer: scheduler.scheduleTimer });
        const events: ConsoleSessionEvent[] = [];
        supervisor.onUpdate((event) => events.push(event));
        supervisor.start();
        await flush();

        supervisor.close();
        expect(events.at(-1)?.state).toBe("closed");

        // A listener added after close() gets nothing further - the listener set was
        // cleared, proving there is truly nothing left running.
        let calledAfterClose = false;
        supervisor.onUpdate(() => {
            calledAfterClose = true;
        });
        await flush();
        expect(calledAfterClose).toBe(false);
    });
});
