import type { LiveViewerConfig } from "@worldlens/liveviewer";

/** Where a viewer is hosted: a Docker daemon on this PC or on a machine reached over SSH. */
export type HostTarget =
    | { readonly kind: "local" }
    | { readonly kind: "ssh"; readonly hostId: string };

export interface HostRequest {
    readonly config: LiveViewerConfig;
    readonly target: HostTarget;
    /** The port on the hosting machine the viewer is published on. */
    readonly hostPort: number;
    /** A Microsoft account kept in protected storage; required when the config says `microsoft`. */
    readonly accountRef?: string;
    /** A name for the instance list. */
    readonly name: string;
}

export type StepId = "docker" | "image" | "volumes" | "config" | "secrets" | "start" | "health" | "verify";
export type StepState = "pending" | "running" | "done" | "failed" | "skipped";

export interface HostStep {
    readonly id: StepId;
    readonly state: StepState;
    /** One sentence for a person; never contains a credential. */
    readonly detail: string | null;
}

export type FailureCode =
    | "invalid-request"
    | "docker-unavailable"
    | "image-missing"
    | "image-load-failed"
    | "command-failed"
    | "port-in-use"
    | "sign-in-required"
    | "sign-in-unavailable"
    | "unreachable"
    | "bot-failed"
    | "not-owned"
    | "cancelled"
    | "ssh-unavailable";

export interface HostFailure {
    readonly code: FailureCode;
    readonly message: string;
    readonly detail: string | null;
}

export interface Verification {
    /** This PC fetched the viewer's health route at the LAN link. */
    readonly linkReachable: boolean;
    /** The bot had joined the Minecraft server when that route answered. */
    readonly botJoined: boolean;
    readonly botName: string;
    readonly checkedAt: string;
    /** What the bot reported when it had not joined, such as a kick reason. */
    readonly botNote: string | null;
}

export interface ViewerInstance {
    readonly id: string;
    readonly name: string;
    readonly createdAt: string;
    readonly target: HostTarget;
    readonly hostPort: number;
    /** The hosting machine's reachable LAN address. */
    readonly lanAddress: string;
    readonly url: string;
    readonly containerName: string;
    readonly image: string;
    readonly kind: LiveViewerConfig["kind"];
    readonly botName: string;
    readonly serverLabel: string;
    readonly auth: LiveViewerConfig["auth"];
    readonly accountRef: string | null;
}

export type HostAnswer =
    | { readonly ok: true; readonly instance: ViewerInstance; readonly verification: Verification; readonly steps: readonly HostStep[] }
    | { readonly ok: false; readonly failure: HostFailure; readonly steps: readonly HostStep[] };

export type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: HostFailure };

export type InstanceState = "running" | "stopped" | "missing" | "unknown";

export interface InstanceStatus {
    readonly instance: ViewerInstance;
    readonly state: InstanceState;
    readonly botConnected: boolean | null;
}

/** The pieces of the protected account store this feature needs. */
export interface LiveViewerAccounts {
    list(): Promise<readonly { readonly accountRef: string; readonly label: string }[]>;
    createMicrosoftAccount(label: string): Promise<{ readonly accountRef: string; readonly label: string }>;
    /** Runs the device-code flow; `onCode` is called with the code and address to show. */
    authenticate(accountRef: string, onCode: (code: DeviceCode) => void): Promise<void>;
    cancel(accountRef: string): void;
    /** The decrypted sign-in cache, for writing to the hosting volume only. Never log it. */
    exportForHosting(accountRef: string): Promise<{ readonly clientId: string; readonly caches: Record<string, unknown> }>;
}

export interface DeviceCode {
    readonly accountRef: string;
    readonly userCode: string;
    readonly verificationUri: string;
    readonly expiresIn: number;
}

export type ViewerEvent =
    | { readonly kind: "progress"; readonly operationId: string; readonly steps: readonly HostStep[] }
    | { readonly kind: "device-code"; readonly code: DeviceCode };
