import type { IpcMain } from "electron";
import { SchoolModeStore, type SchoolModeResult } from "./record.js";

export const SCHOOL_MODE_CHANNELS = {
    read: "schoolMode:read",
    enable: "schoolMode:enable",
    rename: "schoolMode:rename",
    verify: "schoolMode:verify",
    disable: "schoolMode:disable",
    reset: "schoolMode:reset",
} as const;

/** Safe renderer event emitted after this app or a sibling app changes the shared record. */
export const SCHOOL_MODE_EVENT_CHANNEL = "schoolMode:changed";

export interface SchoolModeIpc {
    readonly store: SchoolModeStore;
    dispose(): void;
}

/** Registers only the narrow record operations the preload exposes to the renderer. */
export function registerSchoolModeHandlers(
    ipcMain: Pick<IpcMain, "handle" | "removeHandler">,
    options: {
        readonly applicationDataDirectory: string;
        readonly onChanged?: (result: SchoolModeResult) => void;
    },
): SchoolModeIpc {
    const store = new SchoolModeStore(options.applicationDataDirectory);
    let lastPublished: string | null = null;
    const publish = (result: SchoolModeResult): void => {
        const payload = JSON.stringify(result);
        if (payload === lastPublished) return;
        lastPublished = payload;
        options.onChanged?.(result);
    };
    const publishSuccessful = async (operation: Promise<SchoolModeResult>): Promise<SchoolModeResult> => {
        const result = await operation;
        if (result.ok) publish(result);
        return result;
    };

    ipcMain.handle(SCHOOL_MODE_CHANNELS.read, (): Promise<SchoolModeResult> => store.read());
    ipcMain.handle(SCHOOL_MODE_CHANNELS.enable, (_event, request: unknown): Promise<SchoolModeResult> =>
        publishSuccessful(store.enable(request)),
    );
    ipcMain.handle(SCHOOL_MODE_CHANNELS.rename, (_event, name: unknown): Promise<SchoolModeResult> =>
        publishSuccessful(store.rename(name)),
    );
    ipcMain.handle(SCHOOL_MODE_CHANNELS.verify, (_event, credential: unknown): Promise<SchoolModeResult> =>
        store.verify(credential),
    );
    ipcMain.handle(SCHOOL_MODE_CHANNELS.disable, (_event, credential: unknown): Promise<SchoolModeResult> =>
        publishSuccessful(store.disable(credential)),
    );
    ipcMain.handle(SCHOOL_MODE_CHANNELS.reset, (): Promise<SchoolModeResult> =>
        publishSuccessful(store.reset()),
    );
    const stopWatching = store.watch(publish);

    return {
        store,
        dispose: () => {
            stopWatching();
            for (const channel of Object.values(SCHOOL_MODE_CHANNELS)) ipcMain.removeHandler(channel);
        },
    };
}
