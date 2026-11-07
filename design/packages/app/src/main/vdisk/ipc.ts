import type { IpcMain } from "electron";
import * as path from "node:path";
import { VirtualDiskManager, type OperationRequest, type PackResult } from "./manager.js";
import { createWindowsRunner, type DiskScriptRunner } from "./runner.js";

export const VDISK_CHANNELS = [
    "vdisk:status",
    "vdisk:list",
    "vdisk:history",
    "vdisk:addToLibrary",
    "vdisk:removeFromLibrary",
    "vdisk:script",
    "vdisk:run",
    "vdisk:quickPack",
    "vdisk:cancelPack",
    "vdisk:prepareMapDisk",
] as const;

export const VDISK_PROGRESS_CHANNEL = "vdisk:progress";

export interface VirtualDiskIpc {
    readonly manager: VirtualDiskManager;
    dispose(): void;
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : []);

/**
 * Registers the virtual disk manager. Every disk-changing channel goes through the manager, which
 * refuses on systems other than Windows with the reason, and on Windows asks through the standard
 * permission prompt.
 */
export function registerVirtualDiskHandlers(
    ipcMain: Pick<IpcMain, "handle" | "removeHandler">,
    options: { readonly dataDir: string; readonly runner?: DiskScriptRunner | null },
): VirtualDiskIpc {
    const root = path.join(options.dataDir, "vdisk");
    const runner = options.runner !== undefined ? options.runner : process.platform === "win32" ? createWindowsRunner(root) : null;
    const manager = new VirtualDiskManager(root, runner);
    let pack: AbortController | null = null;
    /** Map disks mounted this session, watched so a render never stops for space. */
    const mapWatches = new Map<string, { timer: ReturnType<typeof setInterval>; size: number }>();

    ipcMain.handle("vdisk:status", async () => await manager.status());
    ipcMain.handle("vdisk:list", async () => await manager.list());
    ipcMain.handle("vdisk:history", async () => await manager.history());
    ipcMain.handle("vdisk:addToLibrary", async (_event, paths: unknown) => await manager.addToLibrary(strings(paths)));
    ipcMain.handle("vdisk:removeFromLibrary", async (_event, target: unknown) => {
        if (typeof target === "string") await manager.removeFromLibrary(target);
        return await manager.list();
    });
    ipcMain.handle("vdisk:script", (_event, request: unknown) => manager.script(request as OperationRequest));
    ipcMain.handle("vdisk:run", async (_event, request: unknown) => {
        const r = request as Partial<OperationRequest> | null;
        if (!r || typeof r.operation !== "string" || typeof r.path !== "string") return { ok: false, cancelled: false, route: null, message: "Choose a disk and an operation.", script: "" };
        return await manager.run(r as OperationRequest);
    });
    ipcMain.handle("vdisk:quickPack", async (event, sources: unknown): Promise<PackResult> => {
        if (pack) return { ok: false, partial: false, cancelled: false, path: null, virtualBytes: 0, files: 0, verified: 0, skipped: [], growths: [], message: "A Quick pack is already running." };
        pack = new AbortController();
        try {
            return await manager.quickPack(strings(sources), (progress) => event.sender.send(VDISK_PROGRESS_CHANNEL, progress), pack.signal);
        } finally {
            pack = null;
        }
    });
    ipcMain.handle("vdisk:cancelPack", () => {
        pack?.abort();
        return pack !== null;
    });
    ipcMain.handle("vdisk:prepareMapDisk", async (_event, vhdx: unknown, sizeBytes: unknown) => {
        if (typeof vhdx !== "string" || typeof sizeBytes !== "number") return { ok: false, mount: null, message: "Choose where the map disk goes." };
        const result = await manager.prepareMapDisk(vhdx, sizeBytes);
        if (result.ok && result.mount && !mapWatches.has(vhdx)) {
            const mount = result.mount;
            const watch = { size: sizeBytes, timer: setInterval(() => {
                void manager.growMapDiskIfNeeded(vhdx, mount, watch.size).then((grown) => {
                    if (grown !== null) watch.size = grown;
                });
            }, 60_000) };
            watch.timer.unref?.();
            mapWatches.set(vhdx, watch);
        }
        return result;
    });

    return {
        manager,
        dispose: () => {
            pack?.abort();
            for (const watch of mapWatches.values()) clearInterval(watch.timer);
            for (const channel of VDISK_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
