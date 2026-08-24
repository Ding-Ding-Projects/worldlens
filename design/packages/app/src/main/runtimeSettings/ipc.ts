import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
    createRuntimeSettingsService,
    type RuntimeExternalRequest,
    type RuntimeSettingsService,
} from "./service.js";

export const RUNTIME_SETTINGS_CHANNELS = [
    "runtimeSettings:refreshExternal",
    "runtimeSettings:status",
] as const;
export interface RuntimeSettingsIpc {
    dispose(): void;
}
export function registerRuntimeSettingsHandlers(
    ipcMain: IpcMain,
    service: RuntimeSettingsService = createRuntimeSettingsService(),
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
    return {
        dispose() {
            for (const channel of RUNTIME_SETTINGS_CHANNELS) ipcMain.removeHandler(channel);
            service.dispose();
        },
    };
}
