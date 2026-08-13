/**
 * The seam between `StructureList.vue` and whatever can actually scan a world folder.
 *
 * Written to the same shape as `../project/projectHost.ts`, for the same reason: this
 * package runs inside the Electron shell, inside a plain browser tab, and inside vitest, and
 * only the first of those three has a preload that can walk a world's files. {@link
 * useStructureHost} returns `null` when nothing is wired up, and `StructureList.vue` already
 * has a `canScan` prop for exactly that case - it says plainly that this build cannot look,
 * rather than showing an empty list that reads as "this world has no structures".
 */

import { inject, provide, type InjectionKey } from "vue";

/** One structure file a scan of the world found. Mirrors `StructureFile` in `structureModel.ts`. */
export interface DiscoveredStructureRow {
    readonly id: string;
    readonly name: string;
    readonly namespace: string;
    readonly path: string;
    readonly sizeBytes: number;
}

/** What `StructureList.vue`'s mount asks of its environment. */
export interface StructureHost {
    /** Named in the interface when this build cannot scan at all. */
    readonly name: string;
    /** Every structure file that world folder holds, current and legacy layout alike. */
    discover(worldFolder: string): Promise<readonly DiscoveredStructureRow[]>;
}

/**
 * The shape the preload bridge is expected to expose.
 *
 * Declared here rather than relied on from the preload's own types, for the same reason
 * `projectHost.ts`'s `BridgeProjectApi` is: this file compiles against a shell that has not
 * grown the namespace yet and degrades to "no host" at runtime instead of failing to build.
 */
interface BridgeStructuresApi {
    discover(worldFolder: string): Promise<readonly DiscoveredStructureRow[]>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * A host from the desktop shell's bridge, or null when this build has no structure layer.
 *
 * Takes the bridge object rather than reaching for `window` itself, so a test can hand it a
 * half-built namespace and see the refusal it produces.
 */
export function structureHostFromBridge(bridge: unknown): StructureHost | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const api = (bridge as { structures?: unknown }).structures;
    if (typeof api !== "object" || api === null) return null;
    const candidate = api as Partial<BridgeStructuresApi>;
    if (!isFunction(candidate.discover)) return null;
    const ready = api as BridgeStructuresApi;

    return {
        name: "Electron shell",
        discover: (worldFolder) => ready.discover(worldFolder),
    };
}

const STRUCTURE_HOST = Symbol("worldlens-structure-host") as InjectionKey<StructureHost | null>;

/** Puts a host in reach of every structure surface below this component. */
export function provideStructureHost(host: StructureHost | null): void {
    provide(STRUCTURE_HOST, host);
}

/**
 * The host, or null when nothing is wired up.
 *
 * Falls back to the window bridge so a surface mounted without an explicit provider still
 * works inside the desktop shell, which is how the shell mounts it.
 */
export function useStructureHost(): StructureHost | null {
    const provided = inject(STRUCTURE_HOST, undefined);
    if (provided !== undefined) return provided;
    return resolveStructureHost();
}

/** The bridge on `window`, probed. Exported for a surface that resolves its own. */
export function resolveStructureHost(): StructureHost | null {
    return structureHostFromBridge(
        typeof globalThis === "undefined" ? null : (globalThis as { worldlens?: unknown }).worldlens,
    );
}
