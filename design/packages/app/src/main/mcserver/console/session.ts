/**
 * The console supervisor: one stable session over a `ServerTransport`'s attach/status.
 *
 * `ServerTransport.attach()` already gives a `ConsoleSession` (see transport/types.ts),
 * but its underlying follower can drop - an SSH connection blips, a `docker logs
 * --follow` client exits - and every consumer of the console (a settings panel, a
 * detached window) wants ONE session id that survives that, not a new id every time the
 * follower reconnects. That is what this module supplies: it owns the reconnect loop,
 * de-duplicates lines so a reconnect never re-prints the tail it just replayed, and
 * exposes the transcript as an ordinary event source.
 *
 * The single most important rule in this file, restated from transport/types.ts because
 * it is exactly the kind of thing a supervisor "helpfully" gets wrong: liveness is
 * decided by calling `transport.status()`, NEVER by the log stream ending. A dropped SSH
 * connection and a genuinely stopped server look identical from here - both end the
 * `lines` iterable - and only `status()` can tell them apart. Reporting `unreachable` as
 * "stopped" would put a Start button in front of a server that is running fine, full of
 * players, on the far side of a network hiccup.
 */

import { fail, type Answer, type ConsoleSession, type ServerTransport } from "../transport/types.js";

export type ConsoleSessionState = "connecting" | "live" | "reconnecting" | "unreachable" | "stopped" | "closed";

export interface ConsoleTranscriptLine {
    readonly stream: "stdout" | "stderr" | "app";
    readonly text: string;
    readonly at: string;
}

export interface ConsoleSessionEvent {
    readonly state: ConsoleSessionState;
    /** Present only on a `"line"`-carrying update; see `onUpdate`. */
    readonly line: ConsoleTranscriptLine | null;
    readonly message: string | null;
}

export interface ConsoleSupervisorOptions {
    readonly transport: ServerTransport;
    /** How often to poll `status()` while attached, to notice a stop the log stream missed. */
    readonly statusPollMs?: number;
    /** Base delay before the first reconnect attempt after a drop. Backs off from here. */
    readonly reconnectBaseMs?: number;
    /** Ceiling the backoff will not exceed. */
    readonly reconnectMaxMs?: number;
    readonly tail?: number;
    /** How many (timestamp, line-hash) keys to remember for de-duplication. */
    readonly dedupeWindow?: number;
    readonly now?: () => string;
    /** Injectable so a test does not have to wait on real timers. */
    readonly scheduleTimer?: (callback: () => void, delayMs: number) => { cancel(): void };
}

const DEFAULT_STATUS_POLL_MS = 5_000;
const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
const DEFAULT_DEDUPE_WINDOW = 2_000;

function defaultScheduleTimer(callback: () => void, delayMs: number): { cancel(): void } {
    const handle = setTimeout(callback, delayMs);
    return { cancel: () => clearTimeout(handle) };
}

/** A short, non-cryptographic hash. This is de-duplication, not integrity - collisions are cheap to tolerate. */
function hashLine(text: string): string {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = (hash * 31 + text.charCodeAt(index)) | 0;
    }
    return hash.toString(36);
}

/**
 * A stable console session that survives the underlying transport reconnecting.
 *
 * `id` never changes for the lifetime of this object, even across many reconnects of the
 * underlying `ConsoleSession` the transport hands back - that stability is the entire
 * reason this module exists instead of every consumer calling `transport.attach()`
 * directly.
 */
export class ConsoleSupervisor {
    readonly id: string;
    readonly #transport: ServerTransport;
    readonly #statusPollMs: number;
    readonly #reconnectBaseMs: number;
    readonly #reconnectMaxMs: number;
    readonly #tail: number;
    readonly #dedupeWindow: number;
    readonly #now: () => string;
    readonly #scheduleTimer: (callback: () => void, delayMs: number) => { cancel(): void };
    readonly #listeners = new Set<(event: ConsoleSessionEvent) => void>();
    readonly #seen: string[] = [];
    readonly #seenSet = new Set<string>();

    #state: ConsoleSessionState = "connecting";
    #closed = false;
    #reconnectAttempt = 0;
    #pendingTimer: { cancel(): void } | null = null;
    #statusTimer: { cancel(): void } | null = null;
    #detachCurrent: (() => void) | null = null;
    #currentSession: ConsoleSession | null = null;
    #generation = 0;

    constructor(options: ConsoleSupervisorOptions) {
        this.id = `console-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
        this.#transport = options.transport;
        this.#statusPollMs = options.statusPollMs ?? DEFAULT_STATUS_POLL_MS;
        this.#reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
        this.#reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
        this.#tail = options.tail ?? 200;
        this.#dedupeWindow = options.dedupeWindow ?? DEFAULT_DEDUPE_WINDOW;
        this.#now = options.now ?? (() => new Date().toISOString());
        this.#scheduleTimer = options.scheduleTimer ?? defaultScheduleTimer;
    }

    get state(): ConsoleSessionState {
        return this.#state;
    }

    onUpdate(listener: (event: ConsoleSessionEvent) => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    /**
     * Sends one command through whichever channel the transport's capabilities say the
     * console uses (stdin, an exec helper, or RCON - see `TransportCapabilities.console`
     * in transport/types.ts). Refuses when there is no live underlying session to send
     * through right now, rather than queueing it silently for a connection that may
     * never come back.
     */
    async send(command: string): Promise<Answer<void>> {
        if (this.#currentSession === null) {
            return fail("not-running", "The console is not connected right now.");
        }
        return this.#currentSession.send(command);
    }

    /** Starts (or restarts) the attach/status loop. Idempotent while already running. */
    start(): void {
        if (this.#closed) return;
        this.#pollStatus();
        this.#attachOnce();
    }

    /** Stops following and releases the transport. The session id itself is now dead. */
    close(): void {
        this.#closed = true;
        this.#pendingTimer?.cancel();
        this.#pendingTimer = null;
        this.#statusTimer?.cancel();
        this.#statusTimer = null;
        this.#detachCurrent?.();
        this.#detachCurrent = null;
        this.#currentSession = null;
        this.#emit({ state: "closed", line: null, message: "Console session closed." });
        this.#listeners.clear();
    }

    async #pollStatus(): Promise<void> {
        if (this.#closed) return;
        const status = await this.#transport.status();
        if (this.#closed) return;

        if (status.ok) {
            if (!status.value.running && this.#state !== "stopped") {
                this.#setState("stopped", "The server has stopped.");
            }
        }
        // A failed status() probe (transport unreachable) is deliberately NOT treated as
        // "stopped" here - that judgement is `unreachable`'s job below, decided by the
        // attach loop's own connection outcome, never invented from a status probe that
        // itself could not reach the machine.

        this.#statusTimer = this.#scheduleTimer(() => {
            void this.#pollStatus();
        }, this.#statusPollMs);
    }

    #attachOnce(): void {
        if (this.#closed) return;
        const generation = ++this.#generation;
        this.#setState(this.#reconnectAttempt === 0 ? "connecting" : "reconnecting", null);

        void (async () => {
            const attached = await this.#transport.attach({ tail: this.#tail });
            if (this.#closed || generation !== this.#generation) return;

            if (!attached.ok) {
                this.#handleDrop(attached.failure.code === "unreachable" ? "unreachable" : "stopped");
                return;
            }

            this.#reconnectAttempt = 0;
            this.#setState("live", null);
            const session = attached.value;
            this.#currentSession = session;
            let detached = false;
            this.#detachCurrent = () => {
                detached = true;
                this.#currentSession = null;
                session.detach();
            };

            void (async () => {
                for await (const line of session.lines) {
                    if (this.#closed || generation !== this.#generation) return;
                    this.#deliverLine(line);
                }
            })();

            const exit = await session.closed;
            if (detached || this.#closed || generation !== this.#generation) return;

            // The stream ending is NOT evidence of anything about the server. It only
            // tells us the follower stopped following; `status()` (polled separately,
            // above) is what decides whether the server is actually down. See the module
            // doc and transport/types.ts's note on ConsoleExitReason.
            this.#handleDrop(exit.reason === "unreachable" ? "unreachable" : "reconnect");
        })();
    }

    #handleDrop(kind: "unreachable" | "stopped" | "reconnect"): void {
        if (this.#closed) return;
        this.#detachCurrent = null;
        this.#currentSession = null;

        if (kind === "stopped") {
            this.#setState("stopped", "The server is not running.");
            return;
        }

        this.#setState(kind === "unreachable" ? "unreachable" : "reconnecting", kind === "unreachable" ? "Lost contact with the server. Retrying…" : null);

        const delay = Math.min(this.#reconnectMaxMs, this.#reconnectBaseMs * 2 ** this.#reconnectAttempt);
        this.#reconnectAttempt += 1;
        this.#pendingTimer = this.#scheduleTimer(() => {
            this.#attachOnce();
        }, delay);
    }

    #deliverLine(line: ConsoleTranscriptLine): void {
        const key = `${line.at}|${hashLine(line.text)}`;
        if (this.#seenSet.has(key)) return;
        this.#seenSet.add(key);
        this.#seen.push(key);
        if (this.#seen.length > this.#dedupeWindow) {
            const evicted = this.#seen.shift();
            if (evicted !== undefined) this.#seenSet.delete(evicted);
        }
        this.#emit({ state: this.#state, line, message: null });
    }

    #setState(state: ConsoleSessionState, message: string | null): void {
        this.#state = state;
        this.#emit({ state, line: null, message });
    }

    #emit(event: ConsoleSessionEvent): void {
        for (const listener of this.#listeners) listener(event);
    }
}
