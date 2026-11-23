import type { IpcMain } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";
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

/**
 * The bundled appliance base for one architecture, ready to compose onto.
 *
 * The installer carries each base zstd-compressed (about 400 MB smaller than raw). On first use
 * it is expanded into `cacheDir`, checked against the image digest the build recorded, and kept,
 * so later builds start immediately. Nothing is downloaded: the bytes come from the install.
 * An uncompressed base (a build staged with an older script) is used where it lies.
 */
export async function readBundledBase(resourcesDir: string, arch: "x86_64" | "aarch64-rpi" = "x86_64", cacheDir?: string): Promise<{ path: string; sha256: string } | null> {
    try {
        const manifest = JSON.parse(await fs.readFile(path.join(resourcesDir, "appliance", arch === "aarch64-rpi" ? "base-rpi.json" : "base.json"), "utf8")) as { file?: unknown; sha256?: unknown; compression?: unknown };
        if (typeof manifest.file !== "string" || typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(manifest.sha256) || manifest.file.includes("/") || manifest.file.includes("\\")) return null;
        const file = path.join(resourcesDir, "appliance", manifest.file);
        await fs.access(file);
        if (manifest.compression !== "zstd") return { path: file, sha256: manifest.sha256 };
        if (cacheDir === undefined) return null;
        const expanded = path.join(cacheDir, manifest.file.replace(/\.zst$/u, ""));
        if (await digestOf(expanded).catch(() => null) === manifest.sha256) return { path: expanded, sha256: manifest.sha256 };
        await fs.mkdir(cacheDir, { recursive: true });
        const partial = `${expanded}.partial`;
        await pipeline(createReadStream(file), zlib.createZstdDecompress(), createWriteStream(partial));
        if ((await digestOf(partial)) !== manifest.sha256) {
            await fs.rm(partial, { force: true });
            return null;
        }
        await fs.rm(expanded, { force: true });
        await fs.rename(partial, expanded);
        return { path: expanded, sha256: manifest.sha256 };
    } catch {
        return null;
    }
}

async function digestOf(file: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
    return hash.digest("hex");
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
        base: (arch) => readBundledBase(options.resourcesDir, arch, path.join(root, "bases")),
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
