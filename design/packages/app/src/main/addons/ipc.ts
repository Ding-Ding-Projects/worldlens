import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import * as path from "node:path";
import { pickFolder, type OpenDialogHost } from "../dialogs/ipc.js";
import { AddonManager, type AddonRecord as StoredAddonRecord } from "./manager.js";
import { ADDON_CAPABILITIES, type AddonCapability } from "@worldlens/server";

export const ADDON_CHANNELS = ["addons:list", "addons:import", "addons:setEnabled", "addons:grant", "addons:revoke", "addons:remove", "addons:safeMode", "addons:safeModeState", "addons:diagnostics"] as const;
export interface AddonIpc { dispose(): void }
export interface RendererAddonRecord {
    id: string; name: string; version: string; description: string; apiVersion: string;
    capabilities: string[]; grantedCapabilities: string[]; entry: string; enabled: boolean; importedAt: string; error: string | null;
}
type RendererAnswer<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

function serialize(record: StoredAddonRecord): RendererAddonRecord {
    return { id: record.manifest.id, name: record.manifest.name, version: record.manifest.version, description: record.manifest.description ?? "No description provided.", apiVersion: record.manifest.apiVersion, capabilities: [...(record.manifest.capabilities ?? [])], grantedCapabilities: [...record.grantedCapabilities], entry: record.manifest.entry, enabled: record.enabled, importedAt: record.importedAt, error: record.error };
}

function mapAnswer<T, U>(answer: RendererAnswer<T>, map: (value: T) => U): RendererAnswer<U> {
    return answer.ok ? { ok: true, value: map(answer.value) } : answer;
}

export function registerAddonHandlers(
    ipcMain: Pick<IpcMain, "handle" | "removeHandler">,
    options: { dataDir: string; dialog: OpenDialogHost; resolveWindow: (event: IpcMainInvokeEvent) => BrowserWindow | null },
): AddonIpc {
    const manager = new AddonManager(path.join(options.dataDir, "addons"));
    ipcMain.handle("addons:list", async (): Promise<RendererAnswer<RendererAddonRecord[]>> => mapAnswer(await manager.list(), (records) => records.map(serialize)));
    ipcMain.handle("addons:import", async (event) => {
        const folder = await pickFolder(options.dialog, options.resolveWindow(event), { title: "Choose an add-on package" });
        return folder === null ? { ok: false, code: "cancelled", message: "No add-on package was selected." } : mapAnswer(await manager.importFromDirectory(folder), serialize);
    });
    ipcMain.handle("addons:setEnabled", async (_event, id: unknown, enabled: unknown) =>
        mapAnswer(await manager.setEnabled(typeof id === "string" ? id : "", enabled === true), serialize));
    ipcMain.handle("addons:grant", async (_event, id: unknown, capabilities: unknown) => {
        const allowed = Array.isArray(capabilities) ? capabilities.filter((cap): cap is AddonCapability => typeof cap === "string" && ADDON_CAPABILITIES.includes(cap as AddonCapability)) : [];
        return mapAnswer(await manager.grant(typeof id === "string" ? id : "", allowed), serialize);
    });
    ipcMain.handle("addons:revoke", async (_event, id: unknown, capability: unknown) =>
        mapAnswer(await manager.revoke(typeof id === "string" ? id : "", ADDON_CAPABILITIES.includes(capability as AddonCapability) ? capability as AddonCapability : "renderer"), serialize));
    ipcMain.handle("addons:remove", async (_event, id: unknown) => manager.remove(typeof id === "string" ? id : ""));
    ipcMain.handle("addons:safeMode", async (_event, enabled: unknown) => manager.setSafeMode(enabled === true));
    ipcMain.handle("addons:safeModeState", async () => manager.safeModeState());
    ipcMain.handle("addons:diagnostics", async () => manager.diagnostics());
    return { dispose: () => { void manager.dispose(); for (const channel of ADDON_CHANNELS) ipcMain.removeHandler(channel); } };
}
