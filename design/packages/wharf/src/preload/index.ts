import { contextBridge, ipcRenderer } from "electron";

/**
 * Wharf's bridge: five channels, and nothing else reachable from the renderer.
 *
 * Deliberately tiny. The WorldLens application's bridge has around 350 methods because it is
 * an application; this one deploys containers, and a bridge that offered more than deploying
 * containers would be offering the renderer a way to do something nobody designed.
 */
const bridge = {
    /** Whether Docker is usable on this destination, and what is wrong when it is not. */
    probe: (destination: unknown) => ipcRenderer.invoke("wharf:probe", destination),
    /** What a deployment would do, and everything wrong with it, before any of it happens. */
    plan: (destination: unknown, request: unknown) =>
        ipcRenderer.invoke("wharf:plan", destination, request),
    /** Deploy. Re-checks the plan on the far side rather than trusting this one. */
    deploy: (destination: unknown, request: unknown) =>
        ipcRenderer.invoke("wharf:deploy", destination, request),
    /** Ask the destination itself whether a published port is genuinely answering. */
    verifyPort: (destination: unknown, port: number) =>
        ipcRenderer.invoke("wharf:verifyPort", destination, port),
    /**
     * Open the platform's own folder picker.
     *
     * There is deliberately no channel that takes a path the renderer composed. A path
     * reaches the main process only by having been chosen in a real file manager, which is
     * the difference between a control somebody operated and a string somebody typed.
     */
    chooseFolder: () => ipcRenderer.invoke("wharf:chooseFolder"),
};

contextBridge.exposeInMainWorld("wharf", bridge);
