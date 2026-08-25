/**
 * The bridge behind `MountRootBrowser.vue`.
 *
 * `pathFieldHost.ts` probes `window.worldlens.dialog` and gets a native picker. In a
 * container there is no desktop to draw one on, so those channels are refused and the
 * refusal says "choose from the folders the operator mounted". This is what that sentence
 * points at.
 *
 * ## Same all-or-nothing rule as its sibling
 *
 * A half-wired bridge is worse than none, because it shows a working-looking control that
 * throws the moment somebody uses it. Both methods are checked before either is offered, and
 * a build with neither resolves to `null` so the caller can fall back rather than discover
 * the gap at click time.
 */

export interface MountRootSummary {
    readonly id: string;
    readonly label: string;
    readonly writable: boolean;
}

export interface MountEntrySummary {
    readonly name: string;
    readonly kind: "folder" | "file";
    readonly path: string;
}

export interface MountListingSummary {
    readonly rootId: string;
    readonly rootLabel: string;
    readonly writable: boolean;
    readonly path: string;
    readonly parent: string | null;
    readonly entries: readonly MountEntrySummary[];
    readonly truncated: boolean;
}

export type MountBrowseOutcome =
    | { readonly ok: true; readonly listing: MountListingSummary }
    | { readonly ok: false; readonly reason: string };

export interface MountBrowserBridge {
    list(): Promise<readonly MountRootSummary[]>;
    browse(rootId: string, path: string | null): Promise<MountBrowseOutcome>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The mounts half of the bridge, or null when this build has none. */
export function resolveMountBrowserBridge(): MountBrowserBridge | null {
    if (typeof window === "undefined") return null;

    const root = (window as { worldlens?: { mounts?: unknown } }).worldlens;
    const api = root?.mounts as Partial<MountBrowserBridge> | undefined;
    if (!api) return null;
    if (!isFunction(api.list) || !isFunction(api.browse)) return null;

    const complete = api as MountBrowserBridge;
    return {
        list: () => complete.list(),
        browse: (rootId, path) => complete.browse(rootId, path),
    };
}
