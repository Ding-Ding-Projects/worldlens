/**
 * An `ipcMain` that is not Electron's, so the main-process feature modules can run in a
 * container.
 *
 * ## Why this works at all
 *
 * It looked like it should not. There are 79 files under `src/main` that mention `electron`,
 * and a headless host cannot have any of it. But of those 79, **seven** carry a real runtime
 * import. The other 68 are `import type { IpcMain, IpcMainInvokeEvent }`, which erases
 * completely at compile time and leaves plain Node behind.
 *
 * That is not luck. Those modules were written to take their Electron services as options -
 * `safeStorage`, `dialog`, a data directory, a `broadcast` function - precisely so they could
 * be tested without a desktop. Running them without a desktop for real is the same property
 * used for a different purpose, and it is why this file is a few hundred lines rather than a
 * rewrite of the application.
 *
 * ## The cast, named rather than hidden
 *
 * Electron's `IpcMain` extends `EventEmitter`, so satisfying it structurally would mean
 * implementing a dozen members no registrar ever calls. The registrars use `handle`,
 * `removeHandler` and `on`. This implements those honestly and is cast once, at the point of
 * registration, with this comment as the explanation. What proves the cast is safe is not the
 * type system but `registerHostedHandlers.test.ts`, which registers the real modules against
 * this object and asserts the channels they claim actually answer.
 */

/** The subset of Electron's `IpcMainInvokeEvent` any registrar in this application reads. */
export interface HostedInvokeEvent {
    readonly frameId: number;
    readonly processId: number;
    readonly sender: { readonly id: number };
}

/** The subset of Electron's synchronous `IpcMainEvent` the one `sendSync` handler uses. */
export interface HostedSyncEvent {
    returnValue: unknown;
}

type InvokeListener = (event: HostedInvokeEvent, ...args: readonly unknown[]) => unknown;
type SyncListener = (event: HostedSyncEvent, ...args: readonly unknown[]) => void;

/** Raised when a channel is called that nothing registered. */
export class UnknownChannelError extends Error {
    constructor(readonly channel: string) {
        super(`No handler is registered for "${channel}".`);
        this.name = "UnknownChannelError";
    }
}

/** Raised when a channel is registered twice, which would silently shadow the first. */
export class DuplicateChannelError extends Error {
    constructor(readonly channel: string) {
        super(`"${channel}" already has a handler, and replacing it silently would hide one.`);
        this.name = "DuplicateChannelError";
    }
}

export class HostedIpcMain {
    readonly #handlers = new Map<string, InvokeListener>();
    readonly #syncHandlers = new Map<string, SyncListener>();
    readonly #broadcasts: ((channel: string, payload: unknown) => void)[] = [];

    /**
     * Electron replaces a duplicate registration silently; this refuses it.
     *
     * The difference matters here in a way it does not on the desktop. A hosted host wires
     * modules together explicitly, and wiring one twice is a mistake that otherwise shows up
     * much later as a handler that inexplicably has the wrong options closed over it.
     */
    handle(channel: string, listener: InvokeListener): void {
        if (this.#handlers.has(channel)) throw new DuplicateChannelError(channel);
        this.#handlers.set(channel, listener);
    }

    handleOnce(channel: string, listener: InvokeListener): void {
        this.handle(channel, (event, ...args) => {
            this.#handlers.delete(channel);
            return listener(event, ...args);
        });
    }

    removeHandler(channel: string): void {
        this.#handlers.delete(channel);
    }

    /** Synchronous channels, of which this application has exactly one. */
    on(channel: string, listener: SyncListener): this {
        this.#syncHandlers.set(channel, listener);
        return this;
    }

    off(channel: string): this {
        this.#syncHandlers.delete(channel);
        return this;
    }

    removeAllListeners(channel?: string): this {
        if (channel === undefined) this.#syncHandlers.clear();
        else this.#syncHandlers.delete(channel);
        return this;
    }

    /** Every channel that would answer right now. The hosted host's own inventory. */
    registeredChannels(): readonly string[] {
        return [...this.#handlers.keys(), ...this.#syncHandlers.keys()].sort();
    }

    /**
     * Call a channel.
     *
     * Rejects rather than resolving an error envelope, matching `ipcRenderer.invoke`, because
     * the whole renderer was written against that contract and a resolved failure would turn
     * every existing error path into a silent success.
     */
    async invoke(channel: string, args: readonly unknown[]): Promise<unknown> {
        const handler = this.#handlers.get(channel);
        if (handler === undefined) throw new UnknownChannelError(channel);
        // The event object registrars receive. Constant rather than per-caller: nothing in
        // this application reads it to tell callers apart, and inventing plausible frame and
        // process ids would imply a distinction that is not being made.
        const event: HostedInvokeEvent = { frameId: 0, processId: 0, sender: { id: 0 } };
        return await handler(event, ...args);
    }

    /** Read a synchronous channel, or throw exactly as `sendSync` does when none is registered. */
    sendSync(channel: string, args: readonly unknown[]): unknown {
        const handler = this.#syncHandlers.get(channel);
        if (handler === undefined) throw new UnknownChannelError(channel);
        const event: HostedSyncEvent = { returnValue: undefined };
        handler(event, ...args);
        return event.returnValue;
    }

    /**
     * Where a feature module's push events go.
     *
     * On the desktop these modules call `window.webContents.send(...)`, reaching every open
     * window. Here they are given a `broadcast` option that lands in this list, and the HTTP
     * bridge host subscribes to it and fans out over one event stream. The modules themselves
     * do not know the difference, which is the point.
     */
    onBroadcast(listener: (channel: string, payload: unknown) => void): () => void {
        this.#broadcasts.push(listener);
        return () => {
            const index = this.#broadcasts.indexOf(listener);
            if (index !== -1) this.#broadcasts.splice(index, 1);
        };
    }

    /** The `broadcast` function to hand a feature module that pushes events. */
    broadcaster(channel: string): (payload: unknown) => void {
        return (payload) => {
            // Copied before iterating: a listener that unsubscribes itself while being
            // notified would otherwise shorten the array mid-loop and skip its neighbour.
            for (const listener of [...this.#broadcasts]) listener(channel, payload);
        };
    }
}
