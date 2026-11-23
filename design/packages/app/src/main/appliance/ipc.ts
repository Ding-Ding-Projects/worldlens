import type { IpcMain } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { nodeCommandRunner } from "./commands.js";
import { ApplianceBuilder } from "./builder.js";
import { InstanceRegistry } from "./registry.js";
import type { ApplianceRequest, ApplianceResult } from "./types.js";
import { createWindowsRunner, type DiskScriptRunner } from "../vdisk/runner.js";

export const APPLIANCE_CHANNELS = [
    "appliance:tools",
    "appliance:usbDisks",
    "appliance:build",
    "appliance:instances",
    "appliance:start",
    "appliance:stop",
    "appliance:remove",
    "appliance:reveal",
] as const;
export const APPLIANCE_PROGRESS_CHANNEL = "appliance:progress";

export interface ApplianceIpc {
    readonly builder: ApplianceBuilder;
    dispose(): void;
}

export interface ApplianceIpcOptions {
    readonly dataDir: string;
    /** Folder holding `appliance/base.json` and the base image the fetch script placed there. */
    readonly resourcesDir: string;
    /** Returns the person's loaded vocabulary entries (empty when none). */
    readonly vocabulary: () => Promise<Readonly<Record<string, string>>>;
    readonly diskRunner?: DiskScriptRunner | null;
    readonly reveal?: (target: string) => void;
}

export async function readBundledBase(resourcesDir: string): Promise<{ path: string; sha256: string } | null> {
    try {
        const manifest = JSON.parse(await fs.readFile(path.join(resourcesDir, "appliance", "base.json"), "utf8")) as { file?: unknown; sha256?: unknown };
        if (typeof manifest.file !== "string" || typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(manifest.sha256) || manifest.file.includes("/") || manifest.file.includes("\\")) return null;
        const file = path.join(resourcesDir, "appliance", manifest.file);
        await fs.access(file);
        return { path: file, sha256: manifest.sha256 };
    } catch {
        return null;
    }
}

const isRequest = (value: unknown): value is ApplianceRequest => value !== null && typeof value === "object" && typeof (value as ApplianceRequest).target === "string";

/**
 * Registers the appliance builder. Wiring is one call from the main process; nothing here is
 * registered until that call is made.
 */
export function registerApplianceHandlers(ipcMain: Pick<IpcMain, "handle" | "removeHandler">, options: ApplianceIpcOptions): ApplianceIpc {
    const root = path.join(options.dataDir, "appliance");
    const diskRunner = options.diskRunner !== undefined ? options.diskRunner : process.platform === "win32" ? createWindowsRunner(path.join(root, "disk")) : null;
    const builder = new ApplianceBuilder({
        root,
        base: () => readBundledBase(options.resourcesDir),
        runner: nodeCommandRunner,
        diskRunner,
        registry: new InstanceRegistry(root),
        vocabulary: options.vocabulary,
    });
    let running = false;

    ipcMain.handle("appliance:tools", () => builder.tools());
    ipcMain.handle("appliance:usbDisks", () => builder.usbDisks());
    ipcMain.handle("appliance:build", async (event, request: unknown): Promise<ApplianceResult> => {
        const sender = (event as { sender: { send(channel: string, payload: unknown): void } }).sender;
        if (!isRequest(request)) return { ok: false, cancelled: false, target: "export", link: null, path: null, message: "Choose what to build.", instanceId: null, steps: [] };
        if (running) return { ok: false, cancelled: false, target: request.target, link: null, path: null, message: "An appliance build is already running.", instanceId: null, steps: [] };
        running = true;
        try {
            return await builder.build(request, (progress) => sender.send(APPLIANCE_PROGRESS_CHANNEL, progress));
        } finally {
            running = false;
        }
    });
    ipcMain.handle("appliance:instances", () => builder.instances());
    const act = (name: "start" | "stop" | "remove") => async (_event: unknown, id: unknown): Promise<{ ok: boolean; message: string }> => {
        if (typeof id !== "string") return { ok: false, message: "Choose an appliance." };
        try {
            await builder[name](id);
            return { ok: true, message: "Done." };
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    };
    ipcMain.handle("appliance:start", act("start"));
    ipcMain.handle("appliance:stop", act("stop"));
    ipcMain.handle("appliance:remove", act("remove"));
    ipcMain.handle("appliance:reveal", (_event, target: unknown) => {
        if (typeof target === "string" && target) options.reveal?.(target);
        return typeof target === "string";
    });

    return {
        builder,
        dispose: () => {
            for (const channel of APPLIANCE_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
