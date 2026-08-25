import type { BridgeTransport } from "./transport.js";

/**
 * The browser end of the bridge: `fetch` for calls, one `EventSource` for every push channel.
 *
 * This is the whole reason the factory was extracted. The object the renderer talks to is
 * built from the same 800 lines whether it is running in Electron or in a tab; only this file
 * differs from the preload's transport, and it is about a hundred lines.
 *
 * ## What is deliberately not attempted here
 *
 * **Cancelling a call by aborting the fetch.** It would look like it works and it does not.
 * Aborting the request tears down this side of the conversation; the handler on the server
 * carries straight on rendering. Every cancellable operation in this application already has
 * its own cancel channel for exactly this reason, and those are what the interface calls. An
 * abort here would leave a render running under a progress bar that has given up, which is
 * worse than no cancellation at all because it reports success at stopping.
 *
 * **Retrying a failed call.** A bridge call is not necessarily idempotent - `render:start`
 * and `backup:start` are not - so a transport that quietly retried a timeout would sometimes
 * start two of something. Retrying belongs to the caller that knows what it asked for.
 */
export interface HttpTransportOptions {
    /** Where the bridge lives. Defaults to the page's own origin, which is the normal case. */
    readonly baseUrl?: string;
    /**
     * The path separator of the machine answering, discovered at startup.
     *
     * Required rather than defaulted, because guessing it wrong is silent: paths would render
     * with the reader's separator instead of the server's, and a path somebody copied out of
     * the interface would not be a path on the machine it came from.
     */
    readonly pathSeparator: string;
    /** Injected for tests. Defaults to the page's own `fetch` and `EventSource`. */
    readonly fetch?: typeof globalThis.fetch;
    readonly eventSource?: typeof globalThis.EventSource;
}

interface InvokeEnvelope {
    readonly ok?: boolean;
    readonly result?: unknown;
    readonly error?: { readonly message?: unknown; readonly instead?: unknown };
}

/**
 * An error a handler produced, as opposed to one the transport produced.
 *
 * Carrying the channel matters: a rejected promise reaching a Vue component several layers
 * from the call site is otherwise a message with no indication of which of ~350 methods
 * produced it.
 */
export class BridgeCallError extends Error {
    constructor(
        readonly channel: string,
        message: string,
        readonly instead?: string,
    ) {
        super(message);
        this.name = "BridgeCallError";
    }
}

export function createHttpTransport(options: HttpTransportOptions): BridgeTransport {
    const base = options.baseUrl ?? "";
    const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    const EventSourceImpl = options.eventSource ?? globalThis.EventSource;

    /**
     * One stream, opened lazily and shared, with listeners counted.
     *
     * Lazily because a surface that subscribes to nothing should not hold a connection open;
     * shared because of the six-connection cap browsers impose per origin; counted because
     * closing on the first unsubscribe would silence every other subscriber to every other
     * channel, which is the kind of fault that only shows up when two panels are open at once.
     */
    let stream: EventSource | null = null;
    const listeners = new Map<string, Set<(...payload: readonly unknown[]) => void>>();

    const ensureStream = (): EventSource => {
        stream ??= new EventSourceImpl(`${base}/bridge/events`, { withCredentials: true });
        return stream;
    };

    const closeStreamIfIdle = (): void => {
        if (listeners.size > 0) return;
        stream?.close();
        stream = null;
    };

    return {
        invoke: async (channel, ...args) => {
            const response = await doFetch(`${base}/bridge/invoke`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                // Sends the session cookie. The token cannot ride in a header on the event
                // stream, because `EventSource` cannot set one, so the cookie is the single
                // mechanism that works for both and the two stay in step by construction.
                credentials: "include",
                body: JSON.stringify({ channel, args }),
            });

            let envelope: InvokeEnvelope | null = null;
            try {
                envelope = (await response.json()) as InvokeEnvelope;
            } catch {
                envelope = null;
            }

            if (!response.ok) {
                const message =
                    typeof envelope?.error?.message === "string"
                        ? envelope.error.message
                        : `The bridge refused "${channel}" with status ${String(response.status)}.`;
                const instead =
                    typeof envelope?.error?.instead === "string" ? envelope.error.instead : undefined;
                throw new BridgeCallError(channel, message, instead);
            }

            // A handler that threw arrives here as a 200 carrying `ok: false`, and becomes a
            // rejection - which is what every one of the ~350 call sites was written against.
            if (envelope?.ok === false) {
                const message =
                    typeof envelope.error?.message === "string"
                        ? envelope.error.message
                        : `"${channel}" failed without saying why.`;
                throw new BridgeCallError(channel, message);
            }
            return envelope?.result ?? null;
        },

        on: (channel, listener) => {
            let forChannel = listeners.get(channel);
            if (forChannel === undefined) {
                forChannel = new Set();
                listeners.set(channel, forChannel);
                ensureStream().addEventListener(channel, (event) => {
                    const message = event as MessageEvent<string>;
                    let payload: unknown = null;
                    try {
                        payload = JSON.parse(message.data);
                    } catch {
                        payload = null;
                    }
                    // Copied before iterating: a listener that unsubscribes itself while
                    // being notified would otherwise shorten the set mid-loop.
                    for (const each of [...(listeners.get(channel) ?? [])])
                        each(undefined, payload);
                });
            }
            forChannel.add(listener as (...payload: readonly unknown[]) => void);
        },

        off: (channel, listener) => {
            const forChannel = listeners.get(channel);
            if (forChannel === undefined) return;
            forChannel.delete(listener as (...payload: readonly unknown[]) => void);
            if (forChannel.size === 0) listeners.delete(channel);
            closeStreamIfIdle();
        },

        sendSync: () => {
            // There is no synchronous round trip over HTTP, and faking one by blocking would
            // freeze the tab. The single caller already treats a throw as "this shell cannot
            // answer" and carries on without the value, which is the correct outcome here too.
            throw new Error("A hosted deployment has no synchronous bridge channel.");
        },

        setZoomFactor: () => {
            // A browser owns its own zoom, and the reader may have set it deliberately for
            // reasons the application has no business overriding.
        },

        getPathForFile: () => null,

        pathSeparator: options.pathSeparator,
    };
}
