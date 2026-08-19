import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { readdir } from "node:fs/promises";
import { StaticMapExporter } from "./staticExport.js";
import type { StaticMapExportEvent, StaticMapExportOptions, StaticMapExportReport, StaticMapExportRequest } from "./staticExport.js";

export const STATIC_EXPORT_EVENT_CHANNEL = "map-export:event";
export const STATIC_EXPORT_CHANNELS = ["map-export:start", "map-export:cancel", "map-export:active", "map-export:overwrite-token", "map-export:resume", "map-export:ledger"] as const;

export interface StaticMapExportIpcOptions extends StaticMapExportOptions {
    readonly ipcMain: IpcMain;
    readonly broadcast: (event: StaticMapExportEvent) => void;
}

export interface StaticMapExportIpc {
    readonly exporter: StaticMapExporter;
    dispose(): void;
}

function text(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const result = value.trim();
    return result.length > 0 ? result : null;
}

function readRequest(value: unknown): StaticMapExportRequest | null {
    if (typeof value !== "object" || value === null) return null;
    const row = value as Record<string, unknown>;
    const renderId = text(row.renderId);
    const destination = text(row.destination);
    const format = row.format;
    if (renderId === null || destination === null || (format !== "folder" && format !== "zip" && format !== "7z")) return null;
    const maps = Array.isArray(row.maps) && row.maps.every((item) => typeof item === "string") ? row.maps as string[] : undefined;
    const rawOptions = row.sevenZipOptions;
    const options = typeof rawOptions === "object" && rawOptions !== null && !Array.isArray(rawOptions) ? (() => {
        const value = rawOptions as Record<string, unknown>;
        const allowed = ["level", "threads", "solid", "dictionaryKb"];
        if (Object.keys(value).some((key) => !allowed.includes(key))) return null;
        if (value.level !== undefined && typeof value.level !== "number") return null;
        if (value.threads !== undefined && typeof value.threads !== "number") return null;
        if (value.solid !== undefined && typeof value.solid !== "boolean") return null;
        if (value.dictionaryKb !== undefined && typeof value.dictionaryKb !== "number") return null;
        return { ...(value.level === undefined ? {} : { level: value.level }), ...(value.threads === undefined ? {} : { threads: value.threads }), ...(value.solid === undefined ? {} : { solid: value.solid }), ...(value.dictionaryKb === undefined ? {} : { dictionaryKb: value.dictionaryKb }) };
    })() : undefined;
    if (maps !== undefined && maps.length > 10_000) return null;
    if (options === null) return null;
    return {
        renderId,
        destination,
        format,
        ...(maps === undefined ? {} : { maps }),
        ...(text(row.basePath) === null ? {} : { basePath: text(row.basePath)! }),
        noJekyll: row.noJekyll !== false,
        compression: row.compression !== false,
        overwrite: row.overwrite === true,
        ...(text(row.overwriteToken) === null ? {} : { overwriteToken: text(row.overwriteToken)! }),
        ...(options === undefined ? {} : { sevenZipOptions: options }),
    };
}

export function installStaticMapExportIpc(options: StaticMapExportIpcOptions): StaticMapExportIpc {
    const exporter = new StaticMapExporter({
        storageDir: options.storageDir,
        ...(options.ledgerDir === undefined ? {} : { ledgerDir: options.ledgerDir }),
        onEvent: options.broadcast,
    });
    options.ipcMain.handle("map-export:start", async (_event: IpcMainInvokeEvent, value: unknown): Promise<StaticMapExportReport | { readonly ok: false; readonly message: string }> => {
        const request = readRequest(value);
        if (request === null) return { ok: false, message: "A render, destination and export format are required." };
        try { return await exporter.export(request); }
        catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    });
    options.ipcMain.handle("map-export:cancel", (_event: IpcMainInvokeEvent, value: unknown): boolean => {
        const id = text(value);
        return id !== null && exporter.cancel(id);
    });
    options.ipcMain.handle("map-export:active", () => exporter.activeExportIds());
    options.ipcMain.handle("map-export:overwrite-token", () => exporter.issueOverwriteToken());
    options.ipcMain.handle("map-export:resume", async (_event, value: unknown) => {
        const id = text(value);
        if (id === null) return { ok: false, message: "An export id is required." };
        try { return await exporter.resume(id); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    });
    options.ipcMain.handle("map-export:ledger", async () => {
        if (options.ledgerDir === undefined) return [] as const;
        try { return await readdir(options.ledgerDir(), { withFileTypes: true }).then((rows) => rows.filter((row) => row.isFile() && row.name.endsWith(".json")).map((row) => row.name.slice(0, -5))); } catch { return [] as const; }
    });
    return {
        exporter,
        dispose(): void { for (const channel of STATIC_EXPORT_CHANNELS) options.ipcMain.removeHandler(channel); },
    };
}
