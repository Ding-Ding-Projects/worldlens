import type { BrowserWindow, IpcMain } from "electron";
import * as path from "node:path";
import type { Base64Alphabet, EncodeOptions } from "@worldlens/shared/base64";
import { Base64FileJobs, readHead, writeNew } from "./files.js";

export const BASE64_CHANNELS = [
    "base64:encodeFile",
    "base64:decodeFile",
    "base64:pause",
    "base64:resume",
    "base64:cancel",
    "base64:readHead",
    "base64:saveAs",
    "base64:reveal",
] as const;

export const BASE64_PROGRESS_CHANNEL = "base64:progress";

export interface Base64Ipc {
    readonly jobs: Base64FileJobs;
    dispose(): void;
}

interface ElectronSurface {
    readonly showItemInFolder: (fullPath: string) => void;
    readonly showSaveDialog: (window: BrowserWindow | null, options: { defaultPath?: string; title?: string }) => Promise<{ canceled: boolean; filePath?: string }>;
    readonly windowFor: (sender: unknown) => BrowserWindow | null;
}

const asOptions = (value: unknown): EncodeOptions => {
    const v = (value ?? {}) as Record<string, unknown>;
    const alphabet = v.alphabet === "url" || v.alphabet === "mime" ? v.alphabet : "standard";
    const out: { alphabet: Base64Alphabet; padding?: boolean; lineLength?: number } = { alphabet };
    if (typeof v.padding === "boolean") out.padding = v.padding;
    if (typeof v.lineLength === "number" && Number.isInteger(v.lineLength) && v.lineLength >= 0 && v.lineLength <= 100_000) out.lineLength = v.lineLength;
    return out;
};

/**
 * File side of the Base64 toolkit. Text conversion runs entirely in the window; this only
 * streams files, reads a bounded head for preview, writes exports without overwriting and
 * reveals results. Nothing touches the network.
 */
export function registerBase64Handlers(ipcMain: Pick<IpcMain, "handle" | "removeHandler">, electron: ElectronSurface): Base64Ipc {
    let lastSender: { send: (channel: string, payload: unknown) => void } | null = null;
    const jobs = new Base64FileJobs((progress) => lastSender?.send(BASE64_PROGRESS_CHANNEL, progress));

    ipcMain.handle("base64:encodeFile", async (event, source: unknown, options: unknown, jobId: unknown) => {
        lastSender = event.sender;
        if (typeof source !== "string" || !path.isAbsolute(source)) return { ok: false, cancelled: false, output: null, message: "Choose a file to encode." };
        return await jobs.encode(source, asOptions(options), typeof jobId === "string" ? jobId : undefined);
    });
    ipcMain.handle("base64:decodeFile", async (event, source: unknown, jobId: unknown) => {
        lastSender = event.sender;
        if (typeof source !== "string" || !path.isAbsolute(source)) return { ok: false, cancelled: false, output: null, message: "Choose a Base64 file to decode." };
        return await jobs.decode(source, typeof jobId === "string" ? jobId : undefined);
    });
    ipcMain.handle("base64:pause", (_event, jobId: unknown) => typeof jobId === "string" && jobs.pause(jobId));
    ipcMain.handle("base64:resume", (_event, jobId: unknown) => typeof jobId === "string" && jobs.resume(jobId));
    ipcMain.handle("base64:cancel", (_event, jobId: unknown) => typeof jobId === "string" && jobs.cancel(jobId));
    ipcMain.handle("base64:readHead", async (_event, file: unknown) => (typeof file === "string" && path.isAbsolute(file) ? await readHead(file) : new Uint8Array(0)));
    ipcMain.handle("base64:saveAs", async (event, suggestedName: unknown, bytes: unknown) => {
        if (typeof suggestedName !== "string" || !(bytes instanceof Uint8Array)) return { ok: false, path: null, message: "Nothing to save." };
        const answer = await electron.showSaveDialog(electron.windowFor(event.sender), { defaultPath: path.basename(suggestedName), title: "Save" });
        if (answer.canceled || !answer.filePath) return { ok: false, path: null, message: "Not saved." };
        const written = await writeNew(answer.filePath, bytes);
        return { ok: true, path: written, message: written === answer.filePath ? `Saved ${path.basename(written)}.` : `That name was taken, so it was saved as ${path.basename(written)}.` };
    });
    ipcMain.handle("base64:reveal", (_event, file: unknown) => {
        if (typeof file === "string" && path.isAbsolute(file)) electron.showItemInFolder(file);
        return true;
    });

    return {
        jobs,
        dispose: () => {
            jobs.cancelAll();
            for (const channel of BASE64_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
