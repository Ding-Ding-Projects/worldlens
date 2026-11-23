/**
 * A visual NBT editor with a local Git history for every project.
 *
 * ```
 * session.ts   one open file or chunk: its tree, undo and redo, search, pending changes
 * service.ts   opening, the guarded write path (live-world check, backup, atomic write)
 * history.ts   the per-project Git repository every save is recorded in
 * project.ts   finding the NBT files and region files of a world
 * safety.ts    the live-world probe, backups and atomic writes
 * ipc.ts       the `nbtEditor:*` channels
 * protocol.ts  the JSON shapes that cross them
 * ```
 *
 * The tag model, the binary codec, SNBT, the semantic diff and region file access live in
 * `@worldlens/nbt`'s `tree/` folder, because none of them need Electron.
 */

export { NBT_EDITOR_CHANNELS, registerNbtEditorHandlers } from "./ipc.js";
export type { NbtEditorIpc, NbtEditorIpcOptions } from "./ipc.js";
export { NbtEditorRefusal, NbtEditorService } from "./service.js";
export type { NbtEditorServiceOptions } from "./service.js";
export { ProjectHistory, chunkHistoryPath, projectKey } from "./history.js";
export { combineWorldChecks, probeSessionLock } from "./safety.js";
export type { WorldInUseCheck } from "./safety.js";
export type * from "./protocol.js";
