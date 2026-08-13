/**
 * The structure-discovery channel between the main process and the interface.
 *
 * Built to the same shape as `project/ipc.ts`: this is the only file under `structures/`
 * that imports Electron, `IpcMain` arrives as a parameter so the module is testable with no
 * Electron runtime nearby, and the one channel it registers is named once in
 * {@link STRUCTURE_DISCOVER_CHANNELS} so `dispose` cannot drift from `registerStructureHandlers`.
 *
 * Discovery has this module to itself and rendering has `ipc.ts` beside it, rather than the
 * two sharing one file. They arrived from separate lanes and answer separate questions -
 * "what does this world folder hold" and "render this one file" - and folding them together
 * would put two unrelated contracts and two unrelated doc comments under one name.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { discoverStructures, type DiscoveredStructureFile } from "./discover.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const STRUCTURE_DISCOVER_CHANNELS = ["structures:discover"] as const;

export interface StructureIpc {
    dispose(): void;
}

/**
 * Registers the structure handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take the handler off again without
 * leaving a duplicate registration behind - `ipcMain.handle` throws on a channel that
 * already has one.
 */
export function registerStructureHandlers(ipcMain: IpcMain): StructureIpc {
    ipcMain.handle(
        "structures:discover",
        async (_event: IpcMainInvokeEvent, worldFolder: unknown): Promise<readonly DiscoveredStructureFile[]> =>
            await discoverStructures(worldFolder),
    );

    return {
        dispose(): void {
            for (const channel of STRUCTURE_DISCOVER_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
