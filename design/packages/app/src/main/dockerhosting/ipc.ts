import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { DockerHostingManager, type CreateInstanceRequest, type DockerHostingSnapshot, type ManagerAnswer } from "./manager.js";

export const DOCKER_HOSTING_CHANNELS = [
    "dockerhosting:status",
    "dockerhosting:instances",
    "dockerhosting:create",
    "dockerhosting:start",
    "dockerhosting:stop",
    "dockerhosting:restart",
    "dockerhosting:update",
    "dockerhosting:remove",
    "dockerhosting:logs",
    "dockerhosting:inspect",
    "dockerhosting:mutate",
    "dockerhosting:cancel",
    "dockerhosting:removeToken",
    "dockerhosting:authorize",
] as const;

export interface DockerHostingIpcOptions {
    readonly manager?: DockerHostingManager;
    readonly onEvent?: (event: unknown) => void;
}

export interface DockerHostingIpc {
    readonly manager: DockerHostingManager;
    dispose(): void;
}

const INVALID = { ok: false as const, failure: { code: "invalid-request" as const, message: "A valid Docker hosting request is required.", detail: null } };

function id(value: unknown): string | null { return typeof value === "string" ? value : null; }

function createRequest(value: unknown): CreateInstanceRequest | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.name !== "string" || typeof record.image !== "string") return null;
    return {
        id: record.id,
        name: record.name,
        image: record.image,
        ...(Array.isArray(record.ports) ? { ports: record.ports.filter((entry): entry is number => typeof entry === "number") } : {}),
        ...(Array.isArray(record.volumes) ? { volumes: record.volumes.filter((entry): entry is string => typeof entry === "string") } : {}),
    };
}

function describe(error: unknown): string { return error instanceof Error ? error.message : String(error); }

/** Main-process boundary for app-owned Docker workloads. Every handler answers, never rejects. */
export function registerDockerHostingHandlers(ipcMain: IpcMain, options: DockerHostingIpcOptions = {}): DockerHostingIpc {
    const manager = options.manager ?? new DockerHostingManager(options.onEvent === undefined ? {} : { onEvent: options.onEvent });
    const authorizations = new Map<string, { readonly operation: "stop" | "remove"; readonly containerId: string; readonly expiresAt: number }>();
    const answer = async <T>(work: () => Promise<ManagerAnswer<T>>): Promise<ManagerAnswer<T>> => {
        try { return await work(); } catch (error) {
            return { ok: false, failure: { code: "command-failed", message: "Docker hosting could not complete the requested operation.", detail: describe(error) } };
        }
    };
    ipcMain.handle("dockerhosting:status", () => answer(() => manager.status()));
    ipcMain.handle("dockerhosting:instances", () => answer(() => manager.list()));
    ipcMain.handle("dockerhosting:create", (_event: IpcMainInvokeEvent, value: unknown) => {
        const request = createRequest(value);
        return request === null ? Promise.resolve(INVALID) : answer(() => manager.create(request));
    });
    for (const [channel, method] of [["dockerhosting:start", "start"], ["dockerhosting:restart", "restart"]] as const) {
        ipcMain.handle(channel, (_event: IpcMainInvokeEvent, value: unknown) => {
            const valueId = id(value);
            return valueId === null ? Promise.resolve(INVALID) : answer(() => manager[method](valueId));
        });
    }
    const consumeAuthorization = (value: unknown, operation: "stop" | "remove"): { readonly containerId: string; readonly token: string } | null => {
        if (typeof value !== "object" || value === null) return null;
        const record = value as Record<string, unknown>;
        const containerId = id(record.id);
        const token = typeof record.authorization === "string" ? record.authorization : null;
        const granted = token === null ? null : authorizations.get(token);
        authorizations.delete(token ?? "");
        return granted !== null && granted !== undefined && granted.expiresAt >= Date.now() && granted.operation === operation && granted.containerId === containerId && containerId !== null && token !== null ? { containerId, token } : null;
    };
    ipcMain.handle("dockerhosting:stop", (_event: IpcMainInvokeEvent, value: unknown) => {
        const granted = consumeAuthorization(value, "stop");
        return granted === null ? Promise.resolve(INVALID) : answer(() => manager.stop(granted.containerId));
    });
    ipcMain.handle("dockerhosting:update", (_event: IpcMainInvokeEvent, value: unknown) => {
        if (typeof value !== "object" || value === null) return Promise.resolve(INVALID);
        const record = value as Record<string, unknown>;
        const updateId = typeof record.id === "string" ? record.id : null;
        const updateImage = typeof record.image === "string" ? record.image : null;
        return updateId === null || updateImage === null ? Promise.resolve(INVALID) : answer(() => manager.update(updateId, updateImage));
    });
    ipcMain.handle("dockerhosting:remove", (_event: IpcMainInvokeEvent, value: unknown) => {
        const granted = consumeAuthorization(value, "remove");
        return granted === null ? Promise.resolve(INVALID) : answer(() => manager.remove(granted.containerId, granted.token));
    });
    ipcMain.handle("dockerhosting:logs", (_event: IpcMainInvokeEvent, value: unknown) => {
        if (typeof value !== "object" || value === null) return Promise.resolve(INVALID);
        const record = value as Record<string, unknown>;
        const valueId = id(record.id);
        const tail = record.tail === undefined ? 200 : record.tail;
        return valueId === null || typeof tail !== "number" ? Promise.resolve(INVALID) : answer(() => manager.logs(valueId, tail));
    });
    ipcMain.handle("dockerhosting:inspect", () => answer(() => manager.snapshot()));
    ipcMain.handle("dockerhosting:authorize", (_event: IpcMainInvokeEvent, value: unknown) => {
        if (typeof value !== "object" || value === null) return Promise.resolve(INVALID);
        const record = value as Record<string, unknown>;
        const operation = record.operation;
        const containerId = id(record.containerId);
        if (operation !== "stop" || containerId === null) return Promise.resolve(INVALID);
        const token = randomUUID();
        authorizations.set(token, { operation, containerId, expiresAt: Date.now() + 60_000 });
        return Promise.resolve({ ok: true as const, token });
    });
    ipcMain.handle("dockerhosting:cancel", (_event: IpcMainInvokeEvent, operationId: unknown) => Promise.resolve(typeof operationId === "string" && operationId.length > 0 ? manager.cancel(operationId) : false));
    ipcMain.handle("dockerhosting:removeToken", (_event: IpcMainInvokeEvent, value: unknown) => {
        const valueId = id(value);
        return valueId === null ? Promise.resolve(INVALID) : Promise.resolve(manager.issueRemoveToken(valueId));
    });
    ipcMain.handle("dockerhosting:mutate", (_event: IpcMainInvokeEvent, value: unknown): Promise<ManagerAnswer<DockerHostingSnapshot>> => {
        if (typeof value !== "object" || value === null) return Promise.resolve(INVALID);
        const record = value as Record<string, unknown>;
        const containerId = typeof record.containerId === "string" ? record.containerId : null;
        const operation = record.operation;
        const authorization = typeof record.authorization === "string" ? record.authorization : null;
        if (containerId === null || (operation !== "start" && operation !== "stop" && operation !== "restart" && operation !== "update" && operation !== "remove")) return Promise.resolve(INVALID);
        return answer(async () => {
            if (operation === "stop") {
                const granted = authorization === null ? null : authorizations.get(authorization);
                authorizations.delete(authorization ?? "");
                if (granted === null || granted === undefined || granted.expiresAt < Date.now() || granted.operation !== operation || granted.containerId !== containerId) {
                    return { ok: false as const, failure: { code: "invalid-request" as const, message: "A fresh confirmation is required before this Docker action.", detail: null } };
                }
            }
            if (operation === "remove" && authorization === null) {
                return { ok: false as const, failure: { code: "invalid-request" as const, message: "A fresh confirmation is required before this Docker action.", detail: null } };
            }
            const result = operation === "start" ? await manager.start(containerId)
                : operation === "stop" ? await manager.stop(containerId)
                : operation === "restart" ? await manager.restart(containerId)
                : operation === "remove" && authorization !== null ? await manager.remove(containerId, authorization)
                : typeof record.image === "string" ? await manager.update(containerId, record.image)
                : INVALID;
            if (!result.ok) return result;
            return manager.snapshot();
        });
    });
    return { manager, dispose: () => { authorizations.clear(); for (const channel of DOCKER_HOSTING_CHANNELS) ipcMain.removeHandler(channel); } };
}

export type { CreateInstanceRequest, ManagedInstance, ManagerAnswer } from "./manager.js";
