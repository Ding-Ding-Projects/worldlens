/**
 * The seam between the drop-render zone and whatever can actually render a dropped file.
 *
 * Written to the same shape as `../project/projectHost.ts`, for the same reason: rendering
 * a structure needs a file system and a Java process behind it, and this package runs
 * inside the Electron shell, inside a plain browser tab, and inside vitest, which have
 * three different amounts of either. {@link useDropRenderHost} returns `null` when nothing
 * is wired up, and `DropRenderZone` says plainly that this build cannot render a dropped
 * file rather than accepting the drop and going nowhere.
 */

import { inject, provide, type InjectionKey } from "vue";

/** What rendering one dropped file answered with, read structurally from the bridge. */
export interface DropRenderOutcome {
    readonly ok: boolean;
    /** Present on success: the same map ids a world render's `openRenderedMap` expects. */
    readonly render?: { readonly dataRoot: string; readonly mapIds: readonly string[] };
    /** Present on refusal, one sentence naming exactly what went wrong. */
    readonly message?: string;
}

/** Everything the drop-render zone asks of its environment. */
export interface DropRenderHost {
    /** Named in the interface when rendering is unavailable, e.g. `Electron shell`. */
    readonly name: string;
    /** Renders one dropped file by its absolute path, reusing the world render channel. */
    render(filePath: string): Promise<DropRenderOutcome>;
}

/** The shape the preload bridge's `structures` namespace is expected to satisfy. */
interface BridgeStructuresApi {
    render(filePath: string): Promise<{
        ok: boolean;
        render?: unknown;
        message?: string;
    }>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** Narrows the bridge's loosely-typed `render` payload into the shape `openRenderedMap` wants. */
function readRenderPayload(value: unknown): DropRenderOutcome["render"] | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const candidate = value as { dataRoot?: unknown; mapIds?: unknown };
    if (typeof candidate.dataRoot !== "string" || !Array.isArray(candidate.mapIds)) {
        return undefined;
    }
    const mapIds = candidate.mapIds.filter((id): id is string => typeof id === "string");
    return { dataRoot: candidate.dataRoot, mapIds };
}

/**
 * A host from the desktop shell's bridge, or null when this build has no render layer.
 *
 * Takes the bridge object rather than reaching for `window` itself, so a test can hand it a
 * half-built namespace and see the refusal it produces - exactly the discipline
 * `projectHostFromBridge` already applies.
 */
export function dropRenderHostFromBridge(bridge: unknown): DropRenderHost | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const api = (bridge as { structures?: unknown }).structures;
    if (typeof api !== "object" || api === null) return null;
    const candidate = api as Partial<BridgeStructuresApi>;
    if (!isFunction(candidate.render)) return null;
    const ready = api as BridgeStructuresApi;

    return {
        name: "Electron shell",
        async render(filePath: string): Promise<DropRenderOutcome> {
            const outcome = await ready.render(filePath);
            if (!outcome.ok) {
                return {
                    ok: false,
                    message:
                        typeof outcome.message === "string"
                            ? outcome.message
                            : "This structure or schematic could not be rendered.",
                };
            }
            const render = readRenderPayload(outcome.render);
            if (render === undefined) {
                return {
                    ok: false,
                    message: "The render finished but did not say which map to open.",
                };
            }
            return { ok: true, render };
        },
    };
}

const DROP_RENDER_HOST = Symbol("worldlens-drop-render-host") as InjectionKey<DropRenderHost | null>;

/** Puts a host in reach of every drop-render surface below this component. */
export function provideDropRenderHost(host: DropRenderHost | null): void {
    provide(DROP_RENDER_HOST, host);
}

/**
 * The host, or null when nothing is wired up.
 *
 * Falls back to the window bridge so a surface mounted without an explicit provider still
 * works inside the desktop shell, which is how the shell mounts it.
 */
export function useDropRenderHost(): DropRenderHost | null {
    const provided = inject(DROP_RENDER_HOST, undefined);
    if (provided !== undefined) return provided;
    return resolveDropRenderHost();
}

/** The bridge on `window`, probed. Exported for the surfaces that resolve their own. */
export function resolveDropRenderHost(): DropRenderHost | null {
    return dropRenderHostFromBridge(
        typeof globalThis === "undefined"
            ? null
            : (globalThis as { worldlens?: unknown }).worldlens,
    );
}

/** One sentence explaining what cannot be done and why, for a surface with no host. */
export function dropRenderHostMissingReason(): string {
    return (
        "Rendering a dropped structure needs the desktop app's own render engine, which this " +
        "build does not have access to. Drop it onto the desktop app instead."
    );
}
