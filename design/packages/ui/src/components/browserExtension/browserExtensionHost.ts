/**
 * The seam between the capture surfaces above and whatever browser extension actually
 * supplies them.
 *
 * Written to the same shape as `../project/projectHost.ts`: probed method by method rather
 * than trusted whole, and null when nothing is wired up. A capture cannot exist without a
 * real installed extension handing this application a proposed file, a real source and a
 * real destination, so a build with no extension bridge says that plainly rather than
 * drawing a Start download dialog whose confirm button would throw.
 *
 * The bridge also carries the operating controls for a live transfer - pause, resume,
 * cancel - because the Downloading dialog's contract is that its controls operate the real
 * transfer, never a value this package invents on its own.
 */

import { inject, provide, type InjectionKey } from "vue";

import type { CapturedDownload, DownloadProgress } from "./downloadCapture.js";

/** Everything the capture surfaces ask of their environment. */
export interface BrowserExtensionHost {
    /** Named in the interface when this build cannot receive captures, e.g. `Electron shell`. */
    readonly name: string;
    /** Begins the real transfer for a proposal the Start dialog just confirmed. */
    startDownload(download: CapturedDownload): Promise<void>;
    /** Registers a listener for real progress reports on a running transfer. */
    onProgress(listener: (id: string, progress: DownloadProgress) => void): () => void;
    /** Registers a listener for a newly captured proposal, before the Start dialog opens. */
    onCaptured(listener: (download: CapturedDownload) => void): () => void;
    pauseDownload(id: string): Promise<void>;
    resumeDownload(id: string): Promise<void>;
    cancelDownload(id: string): Promise<void>;
}

/** The shape the preload bridge is expected to expose. Declared here for the same reason
 * `BridgeProjectApi` is declared in `projectHost.ts`: this surface compiles against a shell
 * that has not grown the namespace yet and degrades to "no host" at runtime. */
interface BridgeBrowserExtensionApi {
    startDownload(download: CapturedDownload): Promise<void>;
    onProgress(listener: (id: string, progress: DownloadProgress) => void): () => void;
    onCaptured(listener: (download: CapturedDownload) => void): () => void;
    pauseDownload(id: string): Promise<void>;
    resumeDownload(id: string): Promise<void>;
    cancelDownload(id: string): Promise<void>;
}

const REQUIRED: readonly (keyof BridgeBrowserExtensionApi)[] = [
    "startDownload",
    "onProgress",
    "onCaptured",
    "pauseDownload",
    "resumeDownload",
    "cancelDownload",
];

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * A host from the desktop shell's bridge, or null when this build has no browser-extension
 * layer. Takes the bridge object rather than reaching for `window` itself, so a test can
 * hand it a half-built namespace and see the refusal it produces.
 */
export function browserExtensionHostFromBridge(bridge: unknown): BrowserExtensionHost | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const api = (bridge as { browserExtension?: unknown }).browserExtension;
    if (typeof api !== "object" || api === null) return null;

    const candidate = api as Partial<Record<keyof BridgeBrowserExtensionApi, unknown>>;
    for (const method of REQUIRED) {
        if (!isFunction(candidate[method])) return null;
    }
    const ready = api as BridgeBrowserExtensionApi;

    return {
        name: "Electron shell",
        startDownload: (download) => ready.startDownload(download),
        onProgress: (listener) => ready.onProgress(listener),
        onCaptured: (listener) => ready.onCaptured(listener),
        pauseDownload: (id) => ready.pauseDownload(id),
        resumeDownload: (id) => ready.resumeDownload(id),
        cancelDownload: (id) => ready.cancelDownload(id),
    };
}

const BROWSER_EXTENSION_HOST = Symbol("worldlens-browser-extension-host") as InjectionKey<
    BrowserExtensionHost | null
>;

/** Puts a host in reach of every capture surface below this component. */
export function provideBrowserExtensionHost(host: BrowserExtensionHost | null): void {
    provide(BROWSER_EXTENSION_HOST, host);
}

/**
 * The host, or null when nothing is wired up.
 *
 * Falls back to the window bridge so a surface mounted without an explicit provider still
 * works inside the desktop shell, which is how the shell mounts it.
 */
export function useBrowserExtensionHost(): BrowserExtensionHost | null {
    const provided = inject(BROWSER_EXTENSION_HOST, undefined);
    if (provided !== undefined) return provided;
    return resolveBrowserExtensionHost();
}

/** The bridge on `window`, probed. Exported for the surfaces that resolve their own. */
export function resolveBrowserExtensionHost(): BrowserExtensionHost | null {
    return browserExtensionHostFromBridge(
        typeof globalThis === "undefined"
            ? null
            : (globalThis as { worldlens?: unknown }).worldlens,
    );
}

/** One sentence explaining what cannot be done and why, for a surface with no host. */
export function browserExtensionHostMissingReason(): string {
    return (
        "This build cannot receive captures from a browser extension. A capture needs the " +
        "desktop application's own bridge to a real extension, which this window does not have."
    );
}
