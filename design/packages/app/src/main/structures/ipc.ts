/**
 * The structure-discovery channel between the main process and the interface.
 *
 * Built to the same shape as `project/ipc.ts`: this is the only file under `structures/`
 * that imports Electron, `IpcMain` arrives as a parameter so the module is testable with no
 * Electron runtime nearby, and the one channel it registers is named once in
 * {@link STRUCTURE_CHANNELS} so `dispose` cannot drift from `registerStructureHandlers`.
 *
 * There is exactly one channel because there is exactly one question worth asking the main
 * process about structures: "what does this world folder have". Rendering one is not a
 * second channel here - `StructureList.vue` reuses the existing `render:start` channel
 * through the world render bridge, because a structure's `.nbt` file lives inside the same
 * world a normal render already knows how to draw.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { discoverStructures, type DiscoveredStructureFile } from "./discover.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const STRUCTURE_CHANNELS = ["structures:discover"] as const;

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
            for (const channel of STRUCTURE_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
