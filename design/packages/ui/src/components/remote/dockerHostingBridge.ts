/** Renderer-side contract for the local Docker hosting manager.
 *
 * This is intentionally a structural mirror of the preload bridge. The renderer never imports
 * dockerode (or a process runner); every list, mutation and progress event comes from the real
 * main-process daemon adapter. A missing method makes the whole manager unavailable rather than
 * drawing controls that would fail only after a click.
 */
export type DockerHostingDaemonState = "ready" | "available" | "not-installed" | "daemon-unreachable" | "refused" | "unusable";

export interface DockerHostingContainer {
    readonly id: string;
    readonly name: string;
    readonly image: string;
    readonly status: string;
    readonly running: boolean;
    readonly owned: boolean;
    readonly ports: readonly string[];
    readonly volumes: readonly string[];
    readonly health: string | null;
    readonly mapCount: number | null;
    readonly configState: "current" | "outdated" | "unknown";
    readonly logsAvailable: boolean;
}

export interface DockerHostingSnapshot {
    readonly daemon: DockerHostingDaemonState;
    readonly clientVersion: string | null;
    readonly serverVersion: string | null;
    readonly message: string;
    readonly detail: string | null;
    readonly containers: readonly DockerHostingContainer[];
    readonly images: readonly string[];
    readonly volumes: readonly string[];
    readonly checkedAt: string;
}

export interface DockerHostingFailure { readonly code: string; readonly message: string; readonly detail: string | null; }
export type DockerHostingReadResult = { readonly ok: true; readonly snapshot: DockerHostingSnapshot } | { readonly ok: false; readonly failure: DockerHostingFailure };
export type DockerHostingMutationResult = { readonly ok: true; readonly snapshot: DockerHostingSnapshot } | { readonly ok: false; readonly failure: DockerHostingFailure };
export interface CreateInstanceRequest {
    readonly id: string;
    readonly name: string;
    readonly image: string;
    readonly ports?: readonly number[];
    readonly volumes?: readonly string[];
    readonly removeToken?: string;
}
export interface DockerHostingManagedInstance {
    readonly id: string;
    readonly name: string;
    readonly image: string;
    readonly containerId: string | null;
    readonly state: "created" | "running" | "paused" | "exited" | "unknown";
    readonly ports: readonly number[];
    readonly volumes: readonly string[];
    readonly updatedAt: string;
    readonly health: string | null;
    readonly fingerprint: string | null;
}
export type DockerHostingCreateAnswer =
    | { readonly ok: true; readonly value: DockerHostingManagedInstance }
    | { readonly ok: false; readonly failure: DockerHostingFailure };
export type DockerHostingOperation = "start" | "stop" | "restart" | "update" | "remove";
export interface DockerHostingRequest { readonly operation: DockerHostingOperation; readonly containerId: string; readonly image?: string; }

export type DockerHostingEvent =
    | { readonly type: "started"; readonly operationId: string; readonly operation: DockerHostingOperation; readonly containerId: string; readonly at: string }
    | { readonly type: "progress"; readonly operationId: string; readonly phase: string; readonly message: string; readonly done: number; readonly total: number; readonly at: string }
    | { readonly type: "log"; readonly operationId: string; readonly level: "info" | "warning" | "error"; readonly message: string; readonly at: string }
    | { readonly type: "finished"; readonly operationId: string; readonly containerId: string; readonly snapshot: DockerHostingSnapshot; readonly at: string }
    | { readonly type: "failed"; readonly operationId: string; readonly failure: DockerHostingFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly operationId: string; readonly at: string };

export interface DockerHostingBridge {
    create(request: CreateInstanceRequest): Promise<DockerHostingCreateAnswer>;
    inspect(): Promise<DockerHostingReadResult>;
    authorize(request: { readonly operation: "stop"; readonly containerId: string }): Promise<{ readonly ok: true; readonly token: string } | { readonly ok: false; readonly failure: DockerHostingFailure }>;
    removeToken(containerId: string): Promise<{ readonly ok: true; readonly token: string } | { readonly ok: false; readonly failure: DockerHostingFailure }>;
    mutate(request: DockerHostingRequest & { readonly authorization?: string }): Promise<DockerHostingMutationResult>;
    logs(containerId: string, tail?: number): Promise<{ readonly ok: true; readonly logs: string } | { readonly ok: false; readonly failure: DockerHostingFailure }>;
    cancel(operationId: string): Promise<boolean>;
    onEvent(listener: (event: DockerHostingEvent) => void): () => void;
}

type Host = Partial<DockerHostingBridge & {
    dockerHosting?: Partial<DockerHostingBridge>;
    dockerHostingCreate: (request: CreateInstanceRequest) => Promise<unknown>;
    dockerHostingInspect: () => Promise<unknown>;
    dockerHostingMutate: (request: unknown) => Promise<unknown>;
    dockerHostingCancel: (operationId: string) => Promise<boolean>;
    dockerHostingRemoveToken: (instanceId: string) => Promise<unknown>;
    dockerHostingAuthorize: (request: { readonly operation: "stop"; readonly containerId: string }) => Promise<unknown>;
    onDockerHostingEvent: (listener: (event: unknown) => void) => () => void;
}>;
const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === "function";

export function resolveDockerHostingBridge(): DockerHostingBridge | null {
    const world = (globalThis as { worldlens?: Host }).worldlens;
    const candidate = world?.dockerHosting ?? (world?.dockerHostingInspect === undefined ? undefined : {
        create: world.dockerHostingCreate,
        inspect: world.dockerHostingInspect,
        authorize: world.dockerHostingAuthorize,
        removeToken: world.dockerHostingRemoveToken,
        mutate: world.dockerHostingMutate,
        logs: async () => ({ ok: true as const, logs: "" }),
        cancel: world.dockerHostingCancel,
        onEvent: world.onDockerHostingEvent,
    });
    if (candidate === undefined || !isFunction(candidate.create) || !isFunction(candidate.inspect) || !isFunction(candidate.authorize) || !isFunction(candidate.mutate) || !isFunction(candidate.logs) || !isFunction(candidate.cancel) || !isFunction(candidate.onEvent)) return null;
    const normalize = (answer: unknown): DockerHostingReadResult | DockerHostingMutationResult => {
        if (typeof answer === "object" && answer !== null && "ok" in answer && (answer as { ok?: unknown }).ok === true && "value" in answer) {
            return { ok: true, snapshot: (answer as { value: DockerHostingSnapshot }).value };
        }
        return answer as DockerHostingReadResult | DockerHostingMutationResult;
    };
    const normalizeCreate = (answer: unknown): DockerHostingCreateAnswer => {
        if (typeof answer === "object" && answer !== null && "ok" in answer && (answer as { ok?: unknown }).ok === true && "value" in answer) {
            return { ok: true, value: (answer as { value: DockerHostingManagedInstance }).value };
        }
        return answer as DockerHostingCreateAnswer;
    };
    return {
        create: async (request) => normalizeCreate(await candidate.create!(request)),
        inspect: async () => normalize(await candidate.inspect!()) as DockerHostingReadResult,
        authorize: async (request) => (await candidate.authorize!(request)) as { readonly ok: true; readonly token: string } | { readonly ok: false; readonly failure: DockerHostingFailure },
        removeToken: async (containerId) => {
            const answer = await candidate.removeToken!(containerId);
            if (typeof answer === "object" && answer !== null && "ok" in answer && (answer as { ok?: unknown }).ok === true && "value" in answer) return { ok: true as const, token: (answer as { value: string }).value };
            return answer as { readonly ok: false; readonly failure: DockerHostingFailure };
        },
        mutate: async (request) => normalize(await candidate.mutate!(request)) as DockerHostingMutationResult,
        logs: async (containerId, tail = 200) => {
            const answer = await candidate.logs!(containerId, tail);
            if (typeof answer === "object" && answer !== null && "ok" in answer && (answer as { ok?: unknown }).ok === true && "value" in answer) return { ok: true as const, logs: (answer as { value: string }).value };
            return answer as { readonly ok: false; readonly failure: DockerHostingFailure };
        },
        cancel: async (operationId) => await candidate.cancel!(operationId) as boolean,
        onEvent: (listener) => candidate.onEvent!((event) => listener(event as DockerHostingEvent)),
    };
}
