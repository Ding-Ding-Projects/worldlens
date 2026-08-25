import type * as http from "node:http";
import type { HttpHandler } from "../http/HttpServer.js";

/**
 * `GET /bridge/events` - every push channel, over one stream.
 *
 * ## One stream, not twenty-two
 *
 * The bridge has 22 push channels. Opening an `EventSource` per channel is the obvious
 * shape and it does not work: browsers cap concurrent HTTP/1.1 connections to one origin at
 * around six, so twenty-two would exhaust the pool, stall the rest of the application's own
 * requests behind them, and do it in a way that looks like the server being slow.
 *
 * So they are multiplexed: the SSE `event:` field carries the channel name and the client
 * demultiplexes. The cost is real and worth naming - one stalled reader now loses every push
 * channel at once rather than one - which is why the replay below is not optional.
 *
 * ## Replay, because a network connection is not an IPC channel
 *
 * Electron's IPC never drops. A browser's does: a laptop sleeps, a tunnel reconnects, a proxy
 * times an idle stream out. SSE has a built-in answer that costs almost nothing to support -
 * every event carries an `id:`, and the browser resends the last one it saw as
 * `Last-Event-ID` when it reconnects by itself. So a short ring buffer lets a reconnecting
 * client catch up on what it missed.
 *
 * When a client has been away longer than the buffer, it is told so rather than being
 * quietly handed an incomplete stream: a single `bridge:resync` event, whose only meaning is
 * "you have missed events, ask for current state rather than trusting what you have". A
 * progress bar that silently stops at 40% because three events fell on the floor is worse
 * than one that jumps, because the user reads it as a hang.
 */
export interface BridgeEventOptions {
    /**
     * Subscribes to the application's push events, and returns the unsubscribe.
     *
     * Injected rather than imported so this package keeps knowing nothing about the feature
     * modules whose events it carries.
     */
    readonly subscribe: (listener: (channel: string, payload: unknown) => void) => () => void;
    /**
     * How many past events to keep for a reconnecting client.
     *
     * Sized against a burst rather than a session: what it has to cover is the seconds a
     * reconnect takes, not the hours a tab stays open. Keeping vastly more would trade real
     * memory for the illusion that a long absence can be recovered from, which `bridge:resync`
     * exists to say honestly instead.
     */
    readonly replayDepth?: number;
}

const DEFAULT_REPLAY_DEPTH = 200;

/** SSE requires each `data:` line to be sent separately, so multi-line JSON stays valid. */
function formatEvent(id: number, channel: string, payload: unknown): string {
    const data = JSON.stringify(payload ?? null);
    const lines = data
        .split("\n")
        .map((line) => `data: ${line}`)
        .join("\n");
    return `id: ${String(id)}\nevent: ${channel}\n${lines}\n\n`;
}

interface Connection {
    readonly response: http.ServerResponse;
}

export class BridgeEventHandler implements HttpHandler {
    readonly #connections = new Set<Connection>();
    readonly #replay: { id: number; channel: string; payload: unknown }[] = [];
    readonly #replayDepth: number;
    #nextId = 1;
    #unsubscribe: (() => void) | null = null;

    constructor(private readonly options: BridgeEventOptions) {
        this.#replayDepth = options.replayDepth ?? DEFAULT_REPLAY_DEPTH;
    }

    /** Start carrying events. Idempotent, so wiring it twice cannot double every event. */
    start(): void {
        this.#unsubscribe ??= this.options.subscribe((channel, payload) => {
            this.#publish(channel, payload);
        });
    }

    /** Stop carrying events and close every open stream. */
    close(): void {
        this.#unsubscribe?.();
        this.#unsubscribe = null;
        for (const connection of this.#connections) connection.response.end();
        this.#connections.clear();
    }

    /** How many clients are attached. A diagnostic, and what the tests assert on. */
    connectionCount(): number {
        return this.#connections.size;
    }

    #publish(channel: string, payload: unknown): void {
        const id = this.#nextId++;
        this.#replay.push({ id, channel, payload });
        while (this.#replay.length > this.#replayDepth) this.#replay.shift();
        const frame = formatEvent(id, channel, payload);
        for (const connection of [...this.#connections]) {
            // Never let one dead socket stop the fan-out to the living ones.
            try {
                connection.response.write(frame);
            } catch {
                this.#connections.delete(connection);
            }
        }
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/bridge/events") return false;
        if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
            res.end("The event stream accepts GET.");
            return true;
        }

        res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache, no-store",
            connection: "keep-alive",
            // Without this a reverse proxy buffers the stream and every event arrives in one
            // batch at the end, which is indistinguishable from the feature not working.
            "x-accel-buffering": "no",
            "x-content-type-options": "nosniff",
        });
        res.flushHeaders();

        const connection: Connection = { response: res };
        this.#connections.add(connection);
        req.on("close", () => this.#connections.delete(connection));

        // A reconnecting browser sends this by itself; the query parameter is for a client
        // that reconnects deliberately rather than being reconnected by the browser.
        const lastSeenHeader = req.headers["last-event-id"];
        const lastSeenRaw =
            (typeof lastSeenHeader === "string" ? lastSeenHeader : null) ??
            url.searchParams.get("lastEventId");
        const lastSeen = lastSeenRaw === null ? null : Number.parseInt(lastSeenRaw, 10);

        if (lastSeen !== null && Number.isFinite(lastSeen)) {
            const oldestHeld = this.#replay[0]?.id ?? this.#nextId;
            if (lastSeen + 1 < oldestHeld) {
                // Missed more than is held. Say so; do not pretend the gap did not happen.
                res.write(
                    formatEvent(this.#nextId - 1, "bridge:resync", {
                        missedFrom: lastSeen + 1,
                        oldestAvailable: oldestHeld,
                    }),
                );
            } else {
                for (const event of this.#replay) {
                    if (event.id > lastSeen)
                        res.write(formatEvent(event.id, event.channel, event.payload));
                }
            }
        }
        return true;
    }
}
