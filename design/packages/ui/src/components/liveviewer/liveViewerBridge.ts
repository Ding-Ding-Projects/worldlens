/**
 * The seam between the live viewer dialog and the main process.
 *
 * Structural mirrors of the types in `main/liveviewer/types.ts`, restated rather than
 * imported because this package runs in the renderer and the hosted build, where only the
 * first has a preload. Nothing here carries a credential: a Microsoft account is a
 * reference into protected storage, and the only secret-adjacent value that ever reaches
 * this side is the short device code the person types at microsoft.com/link.
 */

export type ViewerKind = "viewer" | "client";
export type AuthKind = "offline" | "microsoft";
export type CameraKind = "follow" | "first";

export interface LiveViewerSettings {
    schema: 1;
    kind: ViewerKind;
    server: { host: string; port: number };
    version: string;
    botName: string;
    auth: AuthKind;
    viewDistance: number;
    camera: CameraKind;
    mouseLook: boolean;
    showPlayers: boolean;
    showChat: boolean;
    behaviours: {
        reconnect: { enabled: boolean; delaySeconds: number; tries: number };
        follow: { enabled: boolean; player: string };
        lookAtPlayers: boolean;
        relayChat: boolean;
        sleepAtNight: boolean;
    };
    vocabulary: Record<string, string>;
}

export type HostTarget = { kind: "local" } | { kind: "ssh"; hostId: string };

export interface ServerChoice {
    id: string;
    label: string;
    host: string;
    port: number;
    version: string | null;
}

export interface HostChoice {
    kind: "local" | "ssh";
    hostId: string | null;
    label: string;
}

export interface Failure {
    code: string;
    message: string;
    detail: string | null;
}

export type StepId = "docker" | "image" | "volumes" | "config" | "secrets" | "start" | "health" | "verify";
export type StepState = "pending" | "running" | "done" | "failed" | "skipped";
export interface HostStep {
    id: StepId;
    state: StepState;
    detail: string | null;
}

export interface Verification {
    linkReachable: boolean;
    botJoined: boolean;
    botName: string;
    checkedAt: string;
    botNote: string | null;
}

export interface ViewerInstance {
    id: string;
    name: string;
    createdAt: string;
    target: HostTarget;
    hostPort: number;
    lanAddress: string;
    url: string;
    containerName: string;
    kind: ViewerKind;
    botName: string;
    serverLabel: string;
    auth: AuthKind;
}

export type InstanceState = "running" | "stopped" | "missing" | "unknown";
export interface InstanceStatus {
    instance: ViewerInstance;
    state: InstanceState;
    botConnected: boolean | null;
}

export interface DeviceCode {
    accountRef: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
}

export type ViewerEvent =
    | { kind: "progress"; operationId: string; steps: HostStep[] }
    | { kind: "device-code"; code: DeviceCode };

export interface HostRequest {
    config: LiveViewerSettings;
    target: HostTarget;
    hostPort: number;
    name: string;
    accountRef?: string;
    operationId: string;
}

export type Answer<T> = { ok: true; value: T } | { ok: false; failure: Failure };
export type HostAnswer =
    | { ok: true; instance: ViewerInstance; verification: Verification; steps: HostStep[] }
    | { ok: false; failure: Failure; steps?: HostStep[] };

export interface LiveViewerBridge {
    choices(): Promise<{ ok: true; servers: ServerChoice[]; hosts: HostChoice[] } | { ok: false; failure: Failure }>;
    host(request: HostRequest): Promise<HostAnswer>;
    cancel(operationId: string): Promise<boolean>;
    list(): Promise<Answer<InstanceStatus[]>>;
    control(request: { id: string; action: "start" | "stop" | "restart" }): Promise<Answer<InstanceStatus>>;
    remove(request: { id: string; confirmName: string }): Promise<Answer<null>>;
    accounts(): Promise<{ ok: true; value: { accountRef: string; label: string }[]; available: boolean }>;
    createAccount(label: string): Promise<Answer<{ accountRef: string; label: string }>>;
    signIn(accountRef: string): Promise<Answer<null>>;
    cancelSignIn(accountRef: string): Promise<boolean>;
    onEvent(listener: (event: ViewerEvent) => void): () => void;
}

interface Host {
    liveViewer?: Partial<LiveViewerBridge>;
}

const REQUIRED = ["choices", "host", "onEvent"] as const;

/** The preload's `liveViewer` object, or `null` when this build has none (a browser, a test). */
export function resolveLiveViewerBridge(): LiveViewerBridge | null {
    const host = (globalThis as { worldlens?: Host }).worldlens?.liveViewer;
    if (host === undefined) return null;
    for (const key of REQUIRED) if (typeof host[key] !== "function") return null;
    return host as LiveViewerBridge;
}

export const NEEDED_VERSION = /^(?:\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)$/;
export const PLAYER_NAME = /^[A-Za-z0-9_]{3,16}$/;

export function defaultSettings(): LiveViewerSettings {
    return {
        schema: 1,
        kind: "viewer",
        server: { host: "", port: 25565 },
        version: "auto",
        botName: "LensBot",
        auth: "offline",
        viewDistance: 6,
        camera: "follow",
        mouseLook: true,
        showPlayers: true,
        showChat: true,
        behaviours: {
            reconnect: { enabled: true, delaySeconds: 10, tries: 5 },
            follow: { enabled: false, player: "" },
            lookAtPlayers: false,
            relayChat: true,
            sleepAtNight: false,
        },
        vocabulary: {},
    };
}
