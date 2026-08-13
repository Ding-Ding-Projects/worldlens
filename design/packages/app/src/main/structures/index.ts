/**
 * Finding the structure files a world already has.
 *
 * Arranged the same way `world/` is: `discover.ts` walks the world folder and reports what
 * is there, `discoverIpc.ts` names the channel that asks it, and `ipc.ts` beside them names
 * the separate channel that renders one file. Two modules rather than one because they
 * answer two unrelated questions and arrived from two lanes.
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

export {
    STRUCTURE_DISCOVER_CHANNELS,
    registerStructureHandlers,
    type StructureIpc,
} from "./discoverIpc.js";
export {
    STRUCTURE_CHANNELS,
    registerStructureRenderHandlers,
    type StructureRenderIpc,
} from "./ipc.js";
