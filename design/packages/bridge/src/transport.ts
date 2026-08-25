/**
 * How the renderer reaches whatever is answering it.
 *
 * ## Why this exists
 *
 * The renderer talks to exactly one object: `window.worldlens`, built once and handed over
 * `contextBridge`. Every one of its ~350 methods is a thin wrapper around one of a very
 * small number of Electron calls - measured on the real file: 330 `invoke`, 24 `on`/`off`
 * pairs, and one each of `sendSync`, `webFrame.setZoomFactor`, `webUtils.getPathForFile`
 * and `process.platform`. That is the whole Electron surface underneath 800 lines of
 * forwarding.
 *
 * So the forwarding moves into {@link createWorldlensBridge} and takes one of these, and
 * each host supplies its own: the preload an Electron-backed one, a browser an HTTP-backed
 * one. The point is not that a second transport becomes possible. It is that there is
 * exactly **one** definition of the bridge, so a method added for the desktop cannot be
 * silently missing in a hosted deployment - which is not hypothetical, the contract type
 * was already hand-maintained in two files at once before this package existed.
 *
 * ## Why this mirrors `ipcRenderer` rather than improving on it
 *
 * A tidier interface was available: one `subscribe(channel, listener)` returning its own
 * unsubscribe, instead of the `on`/`off` pair and the wrapper closure each of the 24 event
 * methods builds by hand. It was rejected deliberately.
 *
 * Reshaping the seam would mean rewriting all 24 of those methods during a move whose whole
 * value is that the bodies arrive unchanged. A move that also rewrites is a move whose
 * failures cannot be told apart from its rewrites, and the thing being moved is the entire
 * renderer's only route to the application. Matching the shape the call sites already use
 * makes the extraction almost mechanical, and leaves the tidying as a later change that can
 * be reviewed on its own terms.
 */
export interface BridgeTransport {
    /**
     * Call a channel and wait for its answer.
     *
     * A handler that throws must surface here as a **rejected** promise, whatever the
     * transport did underneath. Every call site was written against `ipcRenderer.invoke` and
     * treats rejection as the failure signal, so an HTTP transport that resolved with an
     * `{ok: false}` envelope instead would quietly turn every existing error path in the
     * renderer into a success path.
     */
    invoke(channel: string, ...args: readonly unknown[]): Promise<unknown>;

    /** Start listening to a push channel. The listener's first argument is the event object. */
    on(channel: string, listener: (event: unknown, ...args: readonly never[]) => void): void;

    /**
     * Stop listening. Must match on listener identity, not merely on channel, because
     * several surfaces subscribe to one channel independently and one unmounting must not
     * silence the others.
     */
    off(channel: string, listener: (event: unknown, ...args: readonly never[]) => void): void;

    /**
     * The one synchronous round trip in the whole bridge, used to read the lock data folder
     * before anything renders. It is allowed to throw - a shell too old to have the handler
     * does exactly that, and the single call site already catches it and carries on without
     * the folder rather than failing to load.
     */
    sendSync(channel: string, ...args: readonly unknown[]): unknown;

    /**
     * Scale the interface. Electron does this through `webFrame`. A browser has its own zoom
     * that the page neither can nor should override, so there the honest implementation does
     * nothing rather than fight the reader's own accessibility setting.
     */
    setZoomFactor(factor: number): void;

    /**
     * The absolute host path of a dropped file, or `null` when there is none.
     *
     * `null` is the correct answer in a browser rather than a degraded one: a browser `File`
     * genuinely has no host path, by deliberate design of the sandbox. Callers already
     * handle `null` because Electron returns it too whenever the object is not a real file.
     */
    getPathForFile(file: File): string | null;

    /**
     * `"\\"` or `"/"`, for the machine whose paths are about to be displayed.
     *
     * Deliberately the *answering* side's separator rather than the reader's. Somebody on
     * Windows looking at a hosted Linux container must see that container's paths written
     * the way that container writes them, or a path they copy will not be a path.
     */
    readonly pathSeparator: string;
}
