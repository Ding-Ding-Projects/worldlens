/**
 * The channel a dropped structure or schematic is rendered over.
 *
 * Built to the same shape as `project/ipc.ts`: every channel named once in
 * {@link STRUCTURE_CHANNELS} so `dispose` cannot drift from registration, and the handler
 * itself never throws across the bridge - `renderStructure`'s own result already carries
 * every refusal as a value, so this layer only has to check the one thing IPC hands it
 * raw: that `filePath` is actually a string.
 *
 * This module takes an already-constructed `RenderOrchestrator` rather than building its
 * own. `main/index.ts` constructs exactly one orchestrator, inside `startRendering()`, and
 * every other feature that renders (CI sync, remote rendering) reaches through that same
 * instance rather than standing up a second one - a second orchestrator would mean a
 * second idea of which renders are active, which `render:cancel` and `render:active` would
 * not know about.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { RenderOrchestrator } from "../render/orchestrator.js";
import { renderStructure, type RenderStructureOutcome } from "./renderStructure.js";

export const STRUCTURE_CHANNELS = ["structures:render"] as const;

export interface StructureRenderIpcOptions {
    readonly orchestrator: RenderOrchestrator;
    /** Where synthetic worlds built from dropped structures are written. See {@link
     * import("./renderStructure.js").RenderStructureOptions.worldsDir}. */
    readonly worldsDir: string;
}

export interface StructureRenderIpc {
    dispose(): void;
}

/**
 * Registers the one handler this channel needs.
 *
 * Returns a `dispose` for the same reason every other IPC module here does: a test, or a
 * relaunch through `createWindow`'s macOS `activate` path, must be able to take the
 * handler off again without `ipcMain.handle` throwing on a channel that already has one.
 */
export function registerStructureRenderHandlers(
    ipcMain: IpcMain,
    options: StructureRenderIpcOptions,
): StructureRenderIpc {
    ipcMain.handle(
        "structures:render",
        async (_event: IpcMainInvokeEvent, filePath: unknown): Promise<RenderStructureOutcome> => {
            if (typeof filePath !== "string" || filePath.trim() === "") {
                return {
                    ok: false,
                    code: "read-failed",
                    message: "No file path was given to render.",
                };
            }
            return await renderStructure({
                orchestrator: options.orchestrator,
                filePath,
                worldsDir: options.worldsDir,
            });
        },
    );

    return {
        dispose(): void {
            for (const channel of STRUCTURE_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
