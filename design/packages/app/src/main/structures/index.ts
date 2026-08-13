/**
 * Finding the structure files a world already has.
 *
 * Arranged the same way `world/` is: `discover.ts` walks the world folder and reports what
 * is there, `ipc.ts` is the only file here that names a channel.
 *
 * ```ts
 * import { registerStructureHandlers } from "./structures/index.js";
 *
 * const structures = registerStructureHandlers(ipcMain);
 * ```
 */

export {
    MAX_DISCOVERED_STRUCTURES,
    discoverStructures,
    type DiscoveredStructureFile,
} from "./discover.js";

export { STRUCTURE_CHANNELS, registerStructureHandlers, type StructureIpc } from "./ipc.js";
