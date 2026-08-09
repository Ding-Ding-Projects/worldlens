import type { IpcMain } from "electron";
import { SchoolModeStore, type SchoolModeResult } from "./record.js";

export const SCHOOL_MODE_CHANNELS = {
    read: "schoolMode:read",
    enable: "schoolMode:enable",
    rename: "schoolMode:rename",
    disable: "schoolMode:disable",
    reset: "schoolMode:reset",
} as const;

export interface SchoolModeIpc {
    readonly store: SchoolModeStore;
    dispose(): void;
}

/** Registers only the narrow record operations the preload exposes to the renderer. */
export function registerSchoolModeHandlers(
    ipcMain: Pick<IpcMain, "handle" | "removeHandler">,
    options: { readonly applicationDataDirectory: string },
): SchoolModeIpc {
    const store = new SchoolModeStore(options.applicationDataDirectory);
    ipcMain.handle(SCHOOL_MODE_CHANNELS.read, (): Promise<SchoolModeResult> => store.read());
    ipcMain.handle(SCHOOL_MODE_CHANNELS.enable, (_event, request: unknown): Promise<SchoolModeResult> =>
        store.enable(request),
    );
    ipcMain.handle(SCHOOL_MODE_CHANNELS.rename, (_event, name: unknown): Promise<SchoolModeResult> =>
        store.rename(name),
    );
    ipcMain.handle(SCHOOL_MODE_CHANNELS.disable, (_event, credential: unknown): Promise<SchoolModeResult> =>
        store.disable(credential),
    );
    ipcMain.handle(SCHOOL_MODE_CHANNELS.reset, (): Promise<SchoolModeResult> => store.reset());

    return {
        store,
        dispose: () => {
            for (const channel of Object.values(SCHOOL_MODE_CHANNELS)) ipcMain.removeHandler(channel);
        },
    };
}
