/**
 * Choosing where the profile folder and the save folder live, moving them without losing
 * data, and keeping the profile folder as a Git repository with an optional private remote.
 *
 * Start-up reads the pointer synchronously (`pointer.ts`) before the application is ready,
 * so the profile folder is decided before anything reads it. Everything else is a
 * {@link DataFoldersService} reached through `ipc.ts`.
 */

export {
    DATA_FOLDERS_CHANNELS,
    DATA_FOLDERS_HISTORY_CHANNEL,
    DATA_FOLDERS_PROGRESS_CHANNEL,
    registerDataFoldersHandlers,
    type DataFoldersIpc,
} from "./ipc.js";
export { DataFoldersService, type DataFoldersOptions, type DataFoldersStatus } from "./service.js";
export {
    pointerFilePath,
    EMPTY_POINTER,
    readPointerSync,
    resolveProfileFolder,
    writePointerSync,
    type ResolvedProfileFolder,
} from "./pointer.js";
export { defaultSystemFolders } from "./validate.js";
export { commitSettledChanges, ensureProfileRepository } from "./profileRepo.js";
export { isHistoryRelevantPath, isVolatilePath } from "./profileEntries.js";
export { isLanRemote, pushProfile, remoteHost, type PushRunner } from "./mirror.js";
