/**
 * The channel between the main process and the "Update coming soon" card.
 *
 * Three request channels and one push channel, built like `update/ipc.ts`: Electron arrives
 * as a type, `IpcMain` is a parameter, every channel is named once so `dispose` cannot drift
 * from the registration, and no handler rejects. A sender that is not the application's own
 * interface gets an `unknown` state with the reason `refused`, which is a value the card knows
 * how to leave out, rather than a rejection nobody handles.
 *
 * Nothing here can install, download or restart: the only things the renderer can ask for are
 * the current description, a fresh look, and a statement of whether the Updates surface is open
 * (which only changes how often the public build record is read).
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { isAppRendererSender } from "../appRendererSender.js";
import type { ComingSoonState, ComingSoonWatcher } from "./comingSoon.js";

export const COMING_SOON_CHANNELS = [
    "update:comingSoon",
    "update:comingSoonRefresh",
    "update:comingSoonWatching",
] as const;

export interface ComingSoonIpcOptions {
    readonly watcher: Pick<ComingSoonWatcher, "current" | "refresh" | "setWatching">;
    /** Defaults to the application's own renderer check. Overridable for tests. */
    readonly trusted?: (event: IpcMainInvokeEvent) => boolean;
}

export interface ComingSoonIpc {
    dispose(): void;
}

function refusedState(): ComingSoonState {
    return { kind: "unknown", reason: "refused", retryAt: null, checkedAt: null };
}

export function registerComingSoonHandlers(
    ipcMain: IpcMain,
    options: ComingSoonIpcOptions,
): ComingSoonIpc {
    const { watcher } = options;
    const trusted = options.trusted ?? isAppRendererSender;

    ipcMain.handle("update:comingSoon", (event: IpcMainInvokeEvent): ComingSoonState =>
        trusted(event) ? watcher.current() : refusedState(),
    );

    ipcMain.handle(
        "update:comingSoonRefresh",
        async (event: IpcMainInvokeEvent): Promise<ComingSoonState> =>
            trusted(event) ? watcher.refresh() : refusedState(),
    );

    ipcMain.handle(
        "update:comingSoonWatching",
        (event: IpcMainInvokeEvent, open: unknown): ComingSoonState => {
            if (!trusted(event)) return refusedState();
            // Anything but a real `true` counts as closed, which is the slow, safe cadence.
            watcher.setWatching(open === true);
            return watcher.current();
        },
    );

    return {
        dispose(): void {
            for (const channel of COMING_SOON_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
