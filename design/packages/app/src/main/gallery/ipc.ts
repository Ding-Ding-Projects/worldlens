import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { GalleryStore, type GalleryDraft, type GalleryUpdate } from "./store.js";

export const GALLERY_CHANNELS = ["gallery:list", "gallery:readAsset", "gallery:add", "gallery:import", "gallery:update", "gallery:delete", "gallery:export"] as const;
export interface GalleryIpc { dispose(): void; }
function sender(event: IpcMainInvokeEvent): void { if (!event.senderFrame) throw new Error("gallery request has no sender frame"); }
export function registerGalleryHandlers(ipcMain: Pick<IpcMain, "handle" | "removeHandler">, dataDir: string): GalleryIpc {
    const store = new GalleryStore(dataDir);
    // Electron's own handler type, rather than a hand-written signature: these handlers take
    // different arguments from one another, so any shared shape written here is either a lie
    // or an any. Parameters<typeof ipcMain.handle>[1] is exactly what handle() accepts.
    const handlers: Array<[string, Parameters<typeof ipcMain.handle>[1]]> = [
        ["gallery:list", async (event) => { sender(event); return store.list(); }],
        ["gallery:readAsset", async (event, id: string) => { sender(event); return store.readAsset(id); }],
        ["gallery:add", async (event, draft: GalleryDraft) => { sender(event); return store.add(draft); }],
        ["gallery:import", async (event, drafts: readonly GalleryDraft[]) => { sender(event); const records = []; for (const draft of drafts) records.push(await store.add({ ...draft, metadata: { ...draft.metadata, provenance: { ...draft.metadata.provenance, kind: "user-import" } } })); return records; }],
        ["gallery:update", async (event, id: string, changes: GalleryUpdate) => { sender(event); return store.update(id, changes); }],
        ["gallery:delete", async (event, ids: readonly string[]) => { sender(event); return store.remove(ids); }],
        ["gallery:export", async (event, format: "json" | "markdown") => { sender(event); return store.export(format); }],
    ];
    for (const [channel, handler] of handlers) ipcMain.handle(channel, handler);
    return { dispose: () => { for (const [channel] of handlers) ipcMain.removeHandler(channel); } };
}
