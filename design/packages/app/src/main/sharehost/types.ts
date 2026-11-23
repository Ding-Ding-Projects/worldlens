/**
 * Shared shapes for the one-click "Host the map" feature.
 *
 * The renderer imports none of this directly: it receives these values as plain JSON over
 * the `shareHost:*` channels, and `packages/ui/.../sharehost/shareHostBridge.ts` restates the
 * few it needs. The two sides agree on the field names, not on a shared module, so a change
 * here is a change to a wire format and the ipc test pins it.
 */

/** The five steps of the progress list, in the order they run. */
export const HOST_STEPS = ["load-image", "pack", "copy", "start", "health"] as const;
export type HostStep = (typeof HOST_STEPS)[number];

export type HostTarget =
    | { readonly kind: "local" }
    | { readonly kind: "ssh"; readonly targetId: string };

export interface HostMapRequest {
    readonly renderId: string;
    readonly target: HostTarget;
    /** Instance name shown in the instance list and used in the container name. */
    readonly name: string;
    readonly port: number;
    /** Map ids to include. An empty list is refused: a map server with no maps proves nothing. */
    readonly maps: readonly string[];
    readonly startOnBoot: boolean;
    /** Ask for a viewer name and generated access code. */
    readonly accessCode: boolean;
    /** Reachable on the local network. Off keeps it on the host itself. */
    readonly lan: boolean;
}

export type StepState = "running" | "done" | "failed";

export interface HostFix {
    readonly id: "use-port";
    readonly port: number;
    readonly label: string;
}

export interface HostFailure {
    readonly step: HostStep | "check";
    readonly message: string;
    /** The command that failed, with secrets masked. */
    readonly command: string | null;
    readonly exitCode: number | null;
    /** The last 20 lines the command said. */
    readonly output: string;
    readonly fix: HostFix | null;
}

export interface HostResult {
    readonly instanceId: string;
    readonly link: string;
    readonly where: string;
    /** Present only when an access code was requested. */
    readonly accessName: string | null;
    /** Shown once. Never stored: the registry keeps only that a code exists. */
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

/** What the registry remembers about one instance. There is no access code in here. */
export interface InstanceRecord {
    readonly instanceId: string;
    readonly name: string;
    readonly target: HostTarget;
    readonly targetLabel: string;
    readonly containerName: string;
    readonly volumeName: string;
    readonly port: number;
    readonly lan: boolean;
    readonly startOnBoot: boolean;
    readonly protected: boolean;
    readonly accessName: string | null;
    readonly maps: readonly string[];
    readonly renderId: string;
    readonly imageRef: string;
    readonly link: string;
    readonly createdAt: string;
}

export type InstanceState = "running" | "stopped" | "unhealthy" | "missing" | "unknown";

export interface InstanceSummary extends InstanceRecord {
    readonly state: InstanceState;
    readonly detail: string;
}

export interface MapChoice {
    readonly id: string;
    readonly bytes: number;
}

export interface PortCheck {
    readonly free: boolean;
    readonly suggested: number;
}

export interface TargetCheck {
    readonly ok: boolean;
    readonly where: string;
    readonly dockerVersion: string | null;
    readonly arch: "amd64" | "arm64" | null;
    readonly message: string;
}
