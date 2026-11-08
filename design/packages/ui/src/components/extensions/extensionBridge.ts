import { blueMapApp, markerSetData } from "../../stores/bluemap.js";

/** The extension bridge as the interface sees it; null outside the desktop app. */
export interface ExtensionInfo {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly builtIn: boolean;
    readonly enabled: boolean;
    readonly needsConsent: boolean;
    readonly problems: readonly string[];
    readonly permissions: readonly { readonly id: string; readonly text: string }[];
    readonly commands: readonly { readonly id: string; readonly title: string; readonly input: "none" | "markers" | "map-summary" }[];
    readonly limits: { readonly timeoutMs: number; readonly maxOutputBytes: number } | null;
    readonly runtime: string;
}

export interface ExtensionRun {
    readonly ok: boolean;
    readonly message: string;
    readonly output?: { readonly kind: "text"; readonly name: string; readonly text: string };
    readonly stderr: string;
    readonly ms: number;
}

export interface ExtensionBridge {
    list(): Promise<readonly ExtensionInfo[]>;
    setEnabled(id: string, enabled: boolean): Promise<ExtensionInfo | null>;
    run(id: string, command: string, input: unknown): Promise<ExtensionRun>;
    import(): Promise<{ readonly ok: boolean; readonly message: string }>;
    openFolder(): Promise<{ readonly ok: boolean; readonly message: string }>;
}

export function extensionBridge(): ExtensionBridge | null {
    return (globalThis.window as unknown as { worldlens?: { extensions?: ExtensionBridge } } | undefined)?.worldlens?.extensions ?? null;
}

interface SetLike {
    readonly label?: string;
    readonly markerSets?: readonly SetLike[];
    readonly markers?: readonly { readonly label?: string; readonly type?: string; readonly position?: { readonly x?: number; readonly y?: number; readonly z?: number } }[];
}

/** Flattens a marker tree to plain rows: set, label, type and block position, nothing else. */
export function flattenMarkers(root: SetLike | null): { set: string; label: string; type: string; x: number | null; y: number | null; z: number | null }[] {
    const out: { set: string; label: string; type: string; x: number | null; y: number | null; z: number | null }[] = [];
    const walk = (set: SetLike, name: string): void => {
        for (const m of set.markers ?? []) {
            const p = m.position ?? {};
            const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
            out.push({ set: name, label: String(m.label ?? "").replace(/<[^>]*>/gu, "").slice(0, 500), type: String(m.type ?? ""), x: num(p.x), y: num(p.y), z: num(p.z) });
        }
        for (const child of set.markerSets ?? []) walk(child, String(child.label ?? ""));
    };
    if (root) walk(root, String(root.label ?? ""));
    return out;
}

/**
 * The input a command declares, built from the open map and nothing more; undefined when the
 * command reads a map and none is open.
 */
export function inputFor(kind: "none" | "markers" | "map-summary"): unknown {
    if (kind === "none") return null;
    const root = markerSetData.value as unknown as SetLike | null;
    const app = blueMapApp.value as unknown as { mapViewer?: { map?: { data?: { id?: string; name?: string } } } } | null;
    const map = app?.mapViewer?.map?.data;
    if (!map) return undefined;
    const markers = flattenMarkers(root);
    if (kind === "markers") return { markers };
    const sets = (root?.markerSets ?? []).map((s) => ({ label: String(s.label ?? ""), count: flattenMarkers(s).length }));
    return { map: map.name ?? map.id ?? "", id: map.id ?? "", markerSets: sets };
}
