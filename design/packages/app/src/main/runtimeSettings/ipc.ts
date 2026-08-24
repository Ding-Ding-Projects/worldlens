import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
    createRuntimeSettingsService,
    type RuntimeExternalRequest,
    type RuntimeSettingsService,
} from "./service.js";
import { RuntimeSourceRegistry, type HomeAssistantSourceInput } from "./registry.js";
import { RuntimeHistoryService } from "./history.js";

export const RUNTIME_SETTINGS_CHANNELS = [
    "runtimeSettings:refreshExternal",
    "runtimeSettings:status",
    "runtimeSettings:sources",
    "runtimeSettings:saveHomeAssistant",
    "runtimeSettings:removeSource",
    "runtimeSettings:statusHubRegister",
    "runtimeSettings:statusHubSubmitEvidence",
    "runtimeSettings:statusHubPollReplies",
    "runtimeSettings:statusHubConfirmReply",
    "runtimeSettings:historyPresence",
    "runtimeSettings:historySetCredential",
    "runtimeSettings:historyVerify",
    "runtimeSettings:historyList",
    "runtimeSettings:historyAppend",
    "runtimeSettings:historyExport",
    "runtimeSettings:historyDiff",
    "runtimeSettings:historyRestore",
] as const;
export interface RuntimeSettingsIpc {
    dispose(): void;
}
export function registerRuntimeSettingsHandlers(
    ipcMain: IpcMain,
    service: RuntimeSettingsService = createRuntimeSettingsService(),
    registry?: RuntimeSourceRegistry,
    history?: RuntimeHistoryService,
): RuntimeSettingsIpc {
    ipcMain.handle(
        "runtimeSettings:refreshExternal",
        async (_event: IpcMainInvokeEvent, request: unknown) => {
            if (typeof request !== "object" || request === null)
                return { ok: false, message: "The external settings request is not valid." };
            return service.refresh(request as RuntimeExternalRequest);
        },
    );
    ipcMain.handle("runtimeSettings:status", () => service.status());
    ipcMain.handle("runtimeSettings:sources", () => registry?.list() ?? []);
    ipcMain.handle("runtimeSettings:saveHomeAssistant", (_event: IpcMainInvokeEvent, input: unknown) => {
        if (registry === undefined || typeof input !== "object" || input === null)
            return { ok: false, message: "Home Assistant source configuration is unavailable." };
        return registry.saveHomeAssistant(input as HomeAssistantSourceInput);
    });
    ipcMain.handle("runtimeSettings:removeSource", (_event: IpcMainInvokeEvent, id: unknown) =>
        registry === undefined || typeof id !== "string"
            ? { ok: false, message: "Home Assistant source configuration is unavailable." }
            : registry.remove(id),
    );
    ipcMain.handle("runtimeSettings:statusHubRegister", () => service.statusHubRegister());
    ipcMain.handle("runtimeSettings:statusHubSubmitEvidence", (_event: IpcMainInvokeEvent, evidence: unknown) =>
        service.statusHubSubmitEvidence(evidence),
    );
    ipcMain.handle("runtimeSettings:statusHubPollReplies", (_event: IpcMainInvokeEvent, cursor: unknown) =>
        service.statusHubPollReplies(typeof cursor === "string" ? cursor : undefined),
    );
    ipcMain.handle("runtimeSettings:statusHubConfirmReply", (_event: IpcMainInvokeEvent, id: unknown) =>
        service.statusHubConfirmReply(typeof id === "string" ? id : ""),
    );
    ipcMain.handle("runtimeSettings:historyPresence", () => history?.presence() ?? { configured: false, unlocked: false });
    ipcMain.handle("runtimeSettings:historySetCredential", (_event: IpcMainInvokeEvent, password: unknown) =>
        history === undefined || typeof password !== "string"
            ? { ok: false, message: "Runtime history is unavailable." }
            : history.setCredential(password),
    );
    ipcMain.handle("runtimeSettings:historyVerify", (_event: IpcMainInvokeEvent, password: unknown) =>
        history === undefined || typeof password !== "string"
            ? { ok: false, message: "Runtime history is unavailable." }
            : history.verify(password),
    );
    ipcMain.handle("runtimeSettings:historyList", (_event: IpcMainInvokeEvent, input: unknown) =>
        history?.list(typeof input === "object" && input !== null ? input as { query?: string; action?: string; from?: string; to?: string; regex?: boolean; flags?: string } : {}) ?? [],
    );
    ipcMain.handle("runtimeSettings:historyAppend", (_event: IpcMainInvokeEvent, input: unknown) => {
        if (history === undefined || typeof input !== "object" || input === null) return null;
        const value = input as Record<string, unknown>;
        const action = value.action;
        const fields = value.fields;
        if (!["created", "updated", "deleted", "restored", "imported"].includes(action as string) || !Array.isArray(fields) || !fields.every((field) => typeof field === "string")) return null;
        return history.append(action as "created" | "updated" | "deleted" | "restored" | "imported", fields as string[]);
    });
    ipcMain.handle("runtimeSettings:historyExport", (_event: IpcMainInvokeEvent, format: unknown) =>
        history?.exportRedacted(format === "markdown" ? "markdown" : "json") ?? "",
    );
    ipcMain.handle("runtimeSettings:historyDiff", (_event: IpcMainInvokeEvent, id: unknown) =>
        history?.diff(typeof id === "string" ? id : "") ?? { ok: false, message: "Runtime history is unavailable." },
    );
    ipcMain.handle("runtimeSettings:historyRestore", (_event: IpcMainInvokeEvent, id: unknown) =>
        history?.restore(typeof id === "string" ? id : "") ?? { ok: false, message: "Runtime history is unavailable." },
    );
    return {
        dispose() {
            for (const channel of RUNTIME_SETTINGS_CHANNELS) ipcMain.removeHandler(channel);
            service.dispose();
        },
    };
}
