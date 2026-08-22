/**
 * The Minecraft server hosting manager's public face.
 *
 * A barrel, so the shell imports one name from one place rather than reaching into the
 * folder's internals - and so that what is deliberately internal stays internal. The
 * parsers, the scope resolver and the individual transports are all reachable through the
 * factory and the registry; nothing outside this folder should be constructing a transport
 * by hand, because doing so is how a caller ends up with one that quietly forgot the write
 * scope an adopted container was limited to.
 */

export { registerMcServerHandlers, MCSERVER_CHANNELS, type McServerIpc, type IpcMainLike } from "./ipc.js";
export {
    createServerRegistry,
    parseRecord,
    REGISTRY_FILE,
    REGISTRY_MAX_RECORDS,
    SERVER_FLAVOURS,
    type ServerFlavour,
    type ServerOrigin,
    type ServerRecord,
    type ServerRegistry,
} from "./registry.js";
export { createTransport, type FactoryDeps } from "./transport/factory.js";
export type {
    Answer,
    AttachOptions,
    ConsoleLine,
    ConsoleSession,
    FileBlob,
    FileEntry,
    InstanceStatus,
    ServerSpec,
    ServerTransport,
    StopOptions,
    TransportCapabilities,
    TransportFailureCode,
    TransportRef,
    WriteOptions,
    WriteReceipt,
} from "./transport/types.js";
