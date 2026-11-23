/**
 * The bridge behind `HostMapDialog.vue`.
 *
 * The main process answers on the `shareHost:*` channels (see `main/sharehost/ipc.ts`); the
 * preload exposes them as `window.worldlens.shareHost`. The shapes below restate the wire
 * format the dialog needs, so the renderer does not import main-process code.
 *
 * As with the other bridges, every method is checked before any is offered: a half-wired
 * bridge shows a working-looking control that throws when used, so a build without all of it
 * resolves to `null` and the caller hides the feature instead.
 */

export type HostTarget = { readonly kind: "local" } | { readonly kind: "ssh"; readonly targetId: string };
export type HostStep = "load-image" | "pack" | "copy" | "start" | "health";
export type StepState = "running" | "done" | "failed";

export interface HostMapRequest {
    readonly renderId: string;
    readonly target: HostTarget;
    readonly name: string;
    readonly port: number;
    readonly maps: readonly string[];
    readonly startOnBoot: boolean;
    readonly accessCode: boolean;
    readonly lan: boolean;
}

export interface HostFailure {
    readonly step: HostStep | "check";
    readonly message: string;
    readonly command: string | null;
    readonly exitCode: number | null;
    readonly output: string;
    readonly fix: { readonly id: "use-port"; readonly port: number; readonly label: string } | null;
}

export interface HostResult {
    readonly instanceId: string;
    readonly link: string;
    readonly where: string;
    readonly accessName: string | null;
    readonly accessCode: string | null;
    readonly checkedAt: string;
}

export type HostMapEvent =
    | { readonly type: "step"; readonly step: HostStep; readonly state: StepState; readonly meta: string; readonly at: string }
    | { readonly type: "ready"; readonly result: HostResult; readonly at: string }
    | { readonly type: "failed"; readonly failure: HostFailure; readonly at: string };

export type HostMapOutcome =
    | { readonly ok: true; readonly result: HostResult }
    | { readonly ok: false; readonly failure: HostFailure };

export interface TargetCheck {
    readonly ok: boolean;
    readonly where: string;
    readonly dockerVersion: string | null;
    readonly arch: "amd64" | "arm64" | null;
    readonly message: string;
}

export interface MapChoice { readonly id: string; readonly bytes: number }
export interface PortCheck { readonly free: boolean; readonly suggested: number }

export interface ShareHostBridge {
    check(target: HostTarget): Promise<TargetCheck>;
    maps(renderId: string): Promise<readonly MapChoice[]>;
    checkPort(target: HostTarget, port: number): Promise<PortCheck>;
    host(request: HostMapRequest, operationId: string): Promise<HostMapOutcome>;
    cancel(operationId: string): Promise<boolean>;
    /** Subscribes to progress events; returns the unsubscribe function. */
    onEvent(listener: (operationId: string, event: HostMapEvent) => void): () => void;
    /** Opens a link in the person's own browser. Optional: the dialog falls back to `window.open`. */
    openExternal?(url: string): void;
}

const REQUIRED = ["check", "maps", "checkPort", "host", "cancel", "onEvent"] as const;

export function resolveShareHostBridge(): ShareHostBridge | null {
    if (typeof window === "undefined") return null;
    const api = (window as { worldlens?: { shareHost?: unknown } }).worldlens?.shareHost as Partial<ShareHostBridge> | undefined;
    if (!api) return null;
    for (const name of REQUIRED) if (typeof api[name] !== "function") return null;
    return api as ShareHostBridge;
}

export function formatBytes(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${String(Math.round(bytes / 1_000_000))} MB`;
    return `${String(Math.max(1, Math.round(bytes / 1000)))} kB`;
}
