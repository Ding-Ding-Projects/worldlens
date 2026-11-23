import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { ShareHostService } from "./service.js";
import type { HostMapEvent, HostMapRequest, HostTarget } from "./types.js";

/** Renderer to main. Every handler answers; none rejects. */
export const SHARE_HOST_CHANNELS = [
    "shareHost:check",
    "shareHost:maps",
    "shareHost:checkPort",
    "shareHost:host",
    "shareHost:cancel",
    "shareHost:list",
    "shareHost:start",
    "shareHost:stop",
    "shareHost:restart",
    "shareHost:update",
    "shareHost:remove",
] as const;

/** Main to renderer: `{ operationId, event }` for every progress event of a `shareHost:host` call. */
export const SHARE_HOST_EVENT_CHANNEL = "shareHost:event";

export interface ShareHostIpcOptions {
    readonly service: ShareHostService;
    /** Delivers a progress event to the window that asked. */
    readonly onEvent: (operationId: string, event: HostMapEvent) => void;
}

export interface ShareHostIpc {
    dispose(): void;
}

const INVALID = { ok: false as const, message: "A valid hosting request is required.", output: "" };

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseTarget(value: unknown): HostTarget | null {
    const r = record(value);
    if (r === null) return null;
    if (r["kind"] === "local") return { kind: "local" };
    if (r["kind"] === "ssh" && typeof r["targetId"] === "string" && r["targetId"].length > 0 && r["targetId"].length <= 128) return { kind: "ssh", targetId: r["targetId"] };
    return null;
}

export function parseRequest(value: unknown): HostMapRequest | null {
    const r = record(value);
    if (r === null) return null;
    const target = parseTarget(r["target"]);
    if (target === null || typeof r["renderId"] !== "string" || typeof r["name"] !== "string" || typeof r["port"] !== "number") return null;
    if (!Array.isArray(r["maps"]) || !r["maps"].every((entry): entry is string => typeof entry === "string") || r["maps"].length > 1000) return null;
    return {
        renderId: r["renderId"],
        target,
        name: r["name"],
        port: r["port"],
        maps: r["maps"],
        startOnBoot: r["startOnBoot"] === true,
        accessCode: r["accessCode"] === true,
        lan: r["lan"] === true,
    };
}

export function registerShareHostHandlers(ipcMain: IpcMain, options: ShareHostIpcOptions): ShareHostIpc {
    const { service } = options;
    const running = new Map<string, AbortController>();
    const answer = async <T>(work: () => Promise<T>, fallback: T): Promise<T> => {
        try { return await work(); } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return typeof fallback === "object" && fallback !== null ? { ...fallback, message, output: message } : fallback;
        }
    };

    ipcMain.handle("shareHost:check", (_e: IpcMainInvokeEvent, value: unknown) => {
        const target = parseTarget(value);
        return target === null ? Promise.resolve({ ok: false, where: "", dockerVersion: null, arch: null, message: "A valid target is required." }) : answer(() => service.check(target), { ok: false, where: "", dockerVersion: null, arch: null, message: "" });
    });
    ipcMain.handle("shareHost:maps", (_e: IpcMainInvokeEvent, value: unknown) =>
        typeof value === "string" && /^[a-z0-9][a-z0-9_-]*$/.test(value) ? answer(() => service.maps(value), []) : Promise.resolve([]));
    ipcMain.handle("shareHost:checkPort", (_e: IpcMainInvokeEvent, value: unknown) => {
        const r = record(value);
        const target = r === null ? null : parseTarget(r["target"]);
        return r === null || target === null || typeof r["port"] !== "number" ? Promise.resolve({ free: false, suggested: 0 }) : answer(() => service.checkPort(target, r["port"] as number), { free: false, suggested: 0 });
    });
    ipcMain.handle("shareHost:host", async (_e: IpcMainInvokeEvent, value: unknown) => {
        const r = record(value);
        const request = r === null ? null : parseRequest(r["request"]);
        const operationId = r !== null && typeof r["operationId"] === "string" && r["operationId"].length > 0 ? r["operationId"] : null;
        if (request === null || operationId === null) return { ok: false as const, failure: { step: "check", message: "A valid hosting request is required.", command: null, exitCode: null, output: "", fix: null } };
        const abort = new AbortController();
        running.set(operationId, abort);
        try {
            return await service.host(request, (event) => options.onEvent(operationId, event), abort.signal);
        } finally {
            running.delete(operationId);
        }
    });
    ipcMain.handle("shareHost:cancel", (_e: IpcMainInvokeEvent, operationId: unknown) => {
        const abort = typeof operationId === "string" ? running.get(operationId) : undefined;
        abort?.abort();
        return Promise.resolve(abort !== undefined);
    });
    ipcMain.handle("shareHost:list", () => answer(() => service.manager.list(), []));
    for (const [channel, method] of [["shareHost:start", "start"], ["shareHost:stop", "stop"], ["shareHost:restart", "restart"], ["shareHost:update", "update"], ["shareHost:remove", "remove"]] as const) {
        ipcMain.handle(channel, (_e: IpcMainInvokeEvent, instanceId: unknown) =>
            typeof instanceId === "string" && /^[a-f0-9]{8}$/.test(instanceId) ? answer(() => service.manager[method](instanceId), INVALID) : Promise.resolve(INVALID));
    }
    return {
        dispose: () => {
            for (const abort of running.values()) abort.abort();
            running.clear();
            for (const channel of SHARE_HOST_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
