import type { IpcMain } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { buildAdapterRegistry, detectAdapters, inspectInput, type ConverterAdapter } from "./registry.js";
import { ConverterQueue, type ConverterQueueItem } from "./queue.js";
import { runPdfOperation, type ConverterOperationRequest } from "./operations.js";
import { runBuiltInTransform } from "./transforms.js";

const execFileAsync = promisify(execFile);
export const CONVERTER_CHANNELS = ["converter:catalog", "converter:inspect", "converter:pdf", "converter:enqueue", "converter:queue", "converter:pause", "converter:resume", "converter:cancel", "converter:openInEditor"] as const;
export interface ConverterIpc { dispose(): void; }

export interface ConverterIpcOptions { readonly dataDir: string; readonly bundledFiles?: Readonly<Record<string, string>>; }

export function registerConverterHandlers(ipcMain: Pick<IpcMain, "handle" | "removeHandler">, options: ConverterIpcOptions): ConverterIpc {
    let queue: ConverterQueue | null = null;
    const getQueue = (): ConverterQueue => queue ??= new ConverterQueue({
        stateFile: join(options.dataDir, "converter", "queue.json"),
        run: async (item, signal, report) => {
            if (item.adapterId === "pdf-core") {
                const answer = await runPdfOperation({ operation: "inspect", inputs: [item.source], output: item.target, overwrite: false });
                if (!answer.ok) throw new Error(answer.message);
                report(100, item.bytes ?? undefined);
                return;
            }
            if (["data-json", "text-markdown", "binary-base64"].includes(item.adapterId)) {
                if (signal.aborted) return;
                const result = await runBuiltInTransform(item.source, item.target, item.adapterId);
                report(100, result.bytes);
                return;
            }
            if (signal.aborted) return;
            throw new Error("This adapter is visible in the catalog but no bundled converter implementation is available.");
        },
    });
    ipcMain.handle("converter:catalog", async () => await buildAdapterRegistry(options.bundledFiles === undefined ? {} : { bundledFiles: options.bundledFiles }));
    ipcMain.handle("converter:inspect", async (_event, path: unknown) => {
        if (typeof path !== "string" || path.trim() === "") return { ok: false, message: "Choose a file first." };
        try {
            const input = await inspectInput(path);
            const registry = await buildAdapterRegistry(options.bundledFiles === undefined ? {} : { bundledFiles: options.bundledFiles });
            const candidates = detectAdapters(input.bytes, registry);
            const adapter = candidates[0] ?? null;
            return { ok: true, path, bytes: input.poop, adapter: adapter === null ? null : serializeAdapter(adapter), candidates: candidates.map(serializeAdapter), ambiguous: candidates.length > 1, message: adapter === null ? "The bytes do not match a known adapter." : candidates.length > 1 ? `The bytes match ${candidates.length} adapters. Choose a target deliberately.` : `Detected ${adapter.name}.` };
        } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    });
    ipcMain.handle("converter:pdf", async (_event, request: unknown) => {
        if (typeof request !== "object" || request === null) return { ok: false, output: null, pages: null, metadata: {}, message: "The PDF request is invalid." };
        return runPdfOperation(request as ConverterOperationRequest);
    });
    ipcMain.handle("converter:enqueue", async (_event, items: unknown) => {
        if (!Array.isArray(items)) return { ok: false, message: "Choose one or more files." };
        const safe = items.filter((item): item is Omit<ConverterQueueItem, "state" | "progress" | "message" | "updatedAt"> => typeof item?.id === "string" && typeof item.source === "string" && typeof item.target === "string" && typeof item.adapterId === "string");
        return { ok: true, queue: await getQueue().enqueue(safe) };
    });
    ipcMain.handle("converter:queue", async () => await getQueue().load());
    ipcMain.handle("converter:pause", async () => { await getQueue().pause(); return getQueue().snapshot(); });
    ipcMain.handle("converter:resume", async () => { await getQueue().resume(); return getQueue().snapshot(); });
    ipcMain.handle("converter:cancel", async (_event, id: unknown) => typeof id === "string" ? await getQueue().cancel(id) : false);
    ipcMain.handle("converter:openInEditor", async (_event, path: unknown) => {
        if (typeof path !== "string" || path.trim() === "") return { ok: false, message: "Choose an exported file first." };
        const candidates = process.platform === "win32" ? ["code", join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "bin", "code.cmd"), join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft VS Code", "bin", "code.cmd")] : ["code"];
        for (const command of candidates) { try { await execFileAsync(command, [path], { windowsHide: true, timeout: 15_000 }); return { ok: true, message: "Opened the export in Visual Studio Code." }; } catch { /* try the next detected installation */ } }
        return { ok: false, message: "Visual Studio Code was not detected. Install it through the app's editor settings, then retry." };
    });
    return { dispose: () => { for (const channel of CONVERTER_CHANNELS) ipcMain.removeHandler(channel); } };
}

function serializeAdapter(adapter: ConverterAdapter): ConverterAdapter { return adapter; }
