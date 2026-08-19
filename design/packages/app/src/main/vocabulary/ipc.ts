import type { IpcMain } from "electron";
import { VocabularyStore, type VocabularyResult, type VocabularySnapshot } from "./store.js";

export const VOCABULARY_CHANNELS = {
    read: "vocabulary:read",
    load: "vocabulary:load",
    clear: "vocabulary:clear",
} as const;

export function registerVocabularyHandlers(
    ipcMain: Pick<IpcMain, "handle" | "removeHandler">,
    options: { readonly applicationDataDirectory: string },
): { readonly store: VocabularyStore; dispose(): void } {
    const store = new VocabularyStore(options.applicationDataDirectory);
    ipcMain.handle(VOCABULARY_CHANNELS.read, (): Promise<VocabularySnapshot> => store.read());
    ipcMain.handle(VOCABULARY_CHANNELS.load, (_event, raw: unknown): Promise<VocabularyResult> => store.load(raw));
    ipcMain.handle(VOCABULARY_CHANNELS.clear, (): Promise<VocabularyResult> => store.clear());
    return { store, dispose: () => Object.values(VOCABULARY_CHANNELS).forEach((channel) => ipcMain.removeHandler(channel)) };
}
