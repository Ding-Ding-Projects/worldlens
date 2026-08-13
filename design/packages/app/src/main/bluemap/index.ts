/**
 * Where the vendored BlueMap engine in this installation came from, and whether upstream has
 * moved past it. See `source.ts` for why the provenance lives beside the jars rather than
 * inside them, and `docs/bluemap-upstream.md` for the arrangement as a whole.
 *
 * ```ts
 * import { registerBlueMapSourceHandlers } from "./bluemap/index.js";
 *
 * const bluemapSource = registerBlueMapSourceHandlers(ipcMain, { resourcesPath: process.resourcesPath });
 * ```
 */

export {
    BLUEMAP_REPOSITORY,
    JAR_STAMP_NAME,
    checkSourceReport,
    classifyComparison,
    localSourceReport,
    readJarProvenance,
    readUpstreamRelease,
    type BlueMapComparison,
    type BlueMapJarProvenance,
    type BlueMapSourceReport,
    type BlueMapUpstreamRelease,
    type FetchJson,
    type JarProvenanceOptions,
} from "./source.js";

export {
    BLUEMAP_SOURCE_CHANNELS,
    registerBlueMapSourceHandlers,
    type BlueMapSourceIpc,
    type BlueMapSourceIpcOptions,
} from "./ipc.js";
