import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { parseLiveViewerConfig } from "@worldlens/liveviewer";
import type { HostChoice, ServerChoice } from "./choices.js";
import type { LiveViewerService } from "./service.js";
import type { Answer, DeviceCode, HostAnswer, HostFailure, HostRequest, HostTarget, LiveViewerAccounts, ViewerEvent } from "./types.js";

export const LIVE_VIEWER_CHANNELS = [
    "liveViewer:choices",
    "liveViewer:host",
    "liveViewer:cancel",
    "liveViewer:list",
    "liveViewer:control",
    "liveViewer:logs",
    "liveViewer:remove",
    "liveViewer:accounts",
    "liveViewer:createAccount",
    "liveViewer:signIn",
    "liveViewer:cancelSignIn",
] as const;

export interface LiveViewerIpcOptions {
    readonly service: LiveViewerService;
    readonly accounts: LiveViewerAccounts | null;
    readonly servers: () => Promise<readonly ServerChoice[]>;
    readonly hosts: () => Promise<readonly HostChoice[]>;
    readonly onEvent: (event: ViewerEvent) => void;
}

const INVALID = (message: string): { ok: false; failure: HostFailure } => ({ ok: false, failure: { code: "invalid-request", message, detail: null } });

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function target(value: unknown): HostTarget | null {
    const raw = record(value);
    if (raw === null) return null;
    if (raw.kind === "local") return { kind: "local" };
    if (raw.kind === "ssh" && typeof raw.hostId === "string" && /^[a-z][a-z0-9-]{0,62}$/.test(raw.hostId)) return { kind: "ssh", hostId: raw.hostId };
    return null;
}

/** Reads an untrusted renderer request into a hosting request, or says what is wrong. */
export function parseHostRequest(value: unknown): { ok: true; request: HostRequest } | { ok: false; message: string } {
    const raw = record(value);
    if (raw === null) return { ok: false, message: "A hosting request is required." };
    const config = parseLiveViewerConfig(raw.config);
    if (!config.ok) return { ok: false, message: `${config.field}: ${config.message}` };
    const where = target(raw.target);
    if (where === null) return { ok: false, message: "Choose This PC or a saved SSH host." };
    if (typeof raw.hostPort !== "number" || !Number.isInteger(raw.hostPort)) return { ok: false, message: "The web port must be a whole number." };
    if (typeof raw.name !== "string" || raw.name.trim() === "" || raw.name.length > 120 || /[\0\r\n]/.test(raw.name)) return { ok: false, message: "Give the viewer a short name." };
    const accountRef = raw.accountRef === undefined || raw.accountRef === null ? undefined : raw.accountRef;
    if (accountRef !== undefined && !(typeof accountRef === "string" && /^[a-f0-9-]{36}$/.test(accountRef))) return { ok: false, message: "The Microsoft account reference is not valid." };
    // The vocabulary is added by the main process from the local file; whatever the renderer sent is discarded.
    return { ok: true, request: { config: { ...config.config, vocabulary: {} }, target: where, hostPort: raw.hostPort, name: raw.name.trim(), ...(accountRef === undefined ? {} : { accountRef }) } };
}

function failed(error: unknown): { ok: false; failure: HostFailure } {
    return { ok: false, failure: { code: "command-failed", message: "The live viewer could not complete that request.", detail: error instanceof Error ? error.message.slice(0, 300) : null } };
}

/** Main-process boundary. Every handler answers; none rejects. */
export function registerLiveViewerHandlers(ipcMain: IpcMain, options: LiveViewerIpcOptions): { dispose(): void } {
    const handle = <T>(channel: string, work: (event: IpcMainInvokeEvent, value: unknown) => Promise<T>): void => {
        ipcMain.handle(channel, async (event: IpcMainInvokeEvent, value: unknown) => {
            try {
                return await work(event, value);
            } catch (error) {
                return failed(error);
            }
        });
    };

    handle("liveViewer:choices", async () => ({ ok: true as const, servers: await options.servers(), hosts: await options.hosts() }));
    handle("liveViewer:host", async (_event, value): Promise<HostAnswer | { ok: false; failure: HostFailure }> => {
        const parsed = parseHostRequest(value);
        if (!parsed.ok) return INVALID(parsed.message);
        const operationId = typeof record(value)?.operationId === "string" ? (record(value)?.operationId as string) : undefined;
        return options.service.host(parsed.request, operationId);
    });
    handle("liveViewer:cancel", async (_event, value) => typeof value === "string" && options.service.cancel(value));
    handle("liveViewer:list", async () => ({ ok: true as const, value: await options.service.list() }));
    handle("liveViewer:control", async (_event, value): Promise<unknown> => {
        const raw = record(value);
        if (raw === null || typeof raw.id !== "string" || (raw.action !== "start" && raw.action !== "stop" && raw.action !== "restart")) return INVALID("A viewer and an action are required.");
        return options.service.control(raw.id, raw.action);
    });
    handle("liveViewer:logs", async (_event, value): Promise<Answer<string> | { ok: false; failure: HostFailure }> => {
        const raw = record(value);
        if (raw === null || typeof raw.id !== "string") return INVALID("A viewer is required.");
        return options.service.logs(raw.id, typeof raw.tail === "number" ? raw.tail : 200);
    });
    handle("liveViewer:remove", async (_event, value): Promise<unknown> => {
        const raw = record(value);
        if (raw === null || typeof raw.id !== "string" || typeof raw.confirmName !== "string") return INVALID("A viewer and its name are required.");
        return options.service.remove(raw.id, raw.confirmName);
    });
    handle("liveViewer:accounts", async () => (options.accounts === null ? { ok: true as const, value: [] as never[], available: false } : { ok: true as const, value: await options.accounts.list(), available: true }));
    handle("liveViewer:createAccount", async (_event, value): Promise<unknown> => {
        if (options.accounts === null) return { ok: false, failure: { code: "sign-in-unavailable", message: "Protected account storage is unavailable on this PC.", detail: null } };
        const label = typeof value === "string" ? value.trim() : "";
        if (label === "" || label.length > 80 || /[\0\r\n]/.test(label)) return INVALID("Give the account a short label.");
        return { ok: true, value: await options.accounts.createMicrosoftAccount(label) };
    });
    handle("liveViewer:signIn", async (_event, value): Promise<unknown> => {
        if (options.accounts === null) return { ok: false, failure: { code: "sign-in-unavailable", message: "Protected account storage is unavailable on this PC.", detail: null } };
        if (typeof value !== "string" || !/^[a-f0-9-]{36}$/.test(value)) return INVALID("A Microsoft account is required.");
        try {
            await options.accounts.authenticate(value, (code: DeviceCode) => options.onEvent({ kind: "device-code", code }));
            return { ok: true, value: null };
        } catch {
            return { ok: false, failure: { code: "sign-in-required", message: "The Microsoft sign-in did not complete. Start it again.", detail: null } };
        }
    });
    handle("liveViewer:cancelSignIn", async (_event, value) => {
        if (options.accounts !== null && typeof value === "string" && /^[a-f0-9-]{36}$/.test(value)) options.accounts.cancel(value);
        return true;
    });

    return { dispose: () => { for (const channel of LIVE_VIEWER_CHANNELS) ipcMain.removeHandler(channel); } };
}
