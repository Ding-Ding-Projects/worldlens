import type { IpcMain } from "electron";
import { statfs } from "node:fs/promises";
import { arch, totalmem } from "node:os";
import { OllamaClient, resolveOllamaRuntime } from "./client.js";
import { fetchExhaustiveCatalog, mergeInstalledTags, readCatalogCache, refreshOfficialCatalog, writeCatalogCache, type OllamaCatalogSnapshot } from "./catalog.js";
import { ensureOllamaRuntime, readOllamaRuntimeState, restartOllamaRuntime, stopOllamaRuntime, superviseOllamaRuntime, waitForOllamaReadiness, type OllamaProvisionProgress } from "./provision.js";

export const OLLAMA_CHANNELS = ["ollama:health", "ollama:tags", "ollama:running", "ollama:show", "ollama:catalog", "ollama:catalogRefresh", "ollama:hardware", "ollama:runtime", "ollama:runtimeEnsure", "ollama:runtimeCancel", "ollama:runtimeStop", "ollama:runtimeRestart", "ollama:runtimeProbe", "ollama:delete", "ollama:copy", "ollama:pull", "ollama:generate", "ollama:chat", "ollama:cancel"] as const;
export interface OllamaIpc { dispose(): void; }
export interface OllamaIpcOptions { readonly baseUrl?: string; readonly dataDir?: string; readonly bundledExecutable?: string | null; readonly managedExecutable?: string | null; readonly catalog?: OllamaCatalogSnapshot | null; }

const stringArg = (value: unknown): string | null => typeof value === "string" && value.trim() !== "" && value.length <= 512 ? value : null;

const MAX_STREAM_BYTES = 64 * 1024 * 1024;
const MAX_STREAM_LINE_BYTES = 1024 * 1024;
const MAX_STREAM_LINES = 100_000;
const MAX_RETURNED_RECORDS = 4_096;

async function readNdjson(response: Response, signal: AbortSignal, onRecord?: (record: Record<string, unknown>) => void): Promise<readonly Record<string, unknown>[]> {
    if (!response.ok) return [{ error: `Ollama returned HTTP ${response.status}.` }];
    const reader = response.body?.getReader();
    if (reader === undefined) return [{ error: "Ollama did not provide a stream body." }];
    const decoder = new TextDecoder();
    let buffer = "";
    let bytes = 0;
    let lines = 0;
    const result: Record<string, unknown>[] = [];
    const emit = (line: string): void => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (++lines > MAX_STREAM_LINES) throw new Error("Ollama returned too many streamed records.");
        if (new TextEncoder().encode(trimmed).byteLength > MAX_STREAM_LINE_BYTES) throw new Error("Ollama returned a streamed record above the safety limit.");
        try { const record = JSON.parse(trimmed) as Record<string, unknown>; if (result.length < MAX_RETURNED_RECORDS) result.push(record); onRecord?.(record); } catch { const record = { error: "Ollama returned malformed streamed JSON." }; if (result.length < MAX_RETURNED_RECORDS) result.push(record); onRecord?.(record); }
    };
    const drain = (flush: boolean): void => {
        if (flush) buffer += decoder.decode();
        let index = buffer.indexOf("\n");
        while (index >= 0) { emit(buffer.slice(0, index)); buffer = buffer.slice(index + 1); index = buffer.indexOf("\n"); }
        if (flush && buffer.trim()) { emit(buffer); buffer = ""; }
    };
    try {
        while (true) {
            if (signal.aborted) { await reader.cancel().catch(() => undefined); return [{ error: "The Ollama request was cancelled." }]; }
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > MAX_STREAM_BYTES) { await reader.cancel().catch(() => undefined); return [{ error: "Ollama returned a response above the safety limit." }]; }
            buffer += decoder.decode(chunk.value, { stream: true });
            drain(false);
        }
        drain(true);
        return result;
    } catch (error) { return [{ error: error instanceof Error ? error.message : String(error) }]; }
}

export function registerOllamaHandlers(ipcMain: Pick<IpcMain, "handle" | "removeHandler">, options: OllamaIpcOptions = {}): OllamaIpc {
    const client = new OllamaClient(options.baseUrl);
    let catalog = options.catalog ?? null;
    const active = new Map<string, AbortController>();
    let runtimeController: AbortController | null = null;
    ipcMain.handle("ollama:health", () => client.health());
    ipcMain.handle("ollama:tags", () => client.tags().catch((error) => ({ models: [], error: error instanceof Error ? error.message : String(error) })));
    ipcMain.handle("ollama:running", () => client.ps().catch((error) => ({ models: [], error: error instanceof Error ? error.message : String(error) })));
    ipcMain.handle("ollama:show", (_event, name: unknown) => { const value = stringArg(name); return value === null ? { error: "Choose a model tag." } : client.show(value).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })); });
    ipcMain.handle("ollama:catalog", async () => catalog ?? await readCatalogCache(options.dataDir ?? ".") ?? { version: 1, variants: [], fetchedAt: null, pages: 0, complete: false, revision: null, stale: true, source: "No verified catalog refresh has completed." });
    ipcMain.handle("ollama:hardware", async () => { let freeDiskBytes: number | null = null; try { const fs = await statfs(options.dataDir ?? "."); freeDiskBytes = Number(fs.bavail) * Number(fs.bsize); } catch { /* unknown is safer than guessed storage */ } return { architecture: arch(), totalRamBytes: totalmem(), freeDiskBytes, gpuModel: null, gpuVramBytes: null, gpuDriverSupported: null, sources: ["node:os.totalmem", "node:process.arch", "node:fs.statfs"] }; });
    ipcMain.handle("ollama:catalogRefresh", async (_event, _signal?: unknown) => { try { const fresh = await refreshOfficialCatalog(options.dataDir ?? "."); const installed = await client.tags().catch(() => ({ models: [] })); catalog = mergeInstalledTags(fresh, Array.isArray(installed.models) ? installed.models : []); await writeCatalogCache(options.dataDir ?? ".", catalog); return fresh.complete ? { ok: true, catalog } : { ok: false, catalog, message: fresh.completenessReason ?? "The documented Ollama source does not provide exhaustive public catalog coverage, so refresh remains visibly incomplete." }; } catch (error) { const cached = await readCatalogCache(options.dataDir ?? "."); return { ok: false, catalog: cached, message: error instanceof Error ? error.message : String(error) }; } });
    ipcMain.handle("ollama:runtime", async () => { const state = options.dataDir ? await readOllamaRuntimeState(options.dataDir) : null; return state ? { origin: "managed", executable: state.executable, canonicalSource: null, reason: "Using the verified user-scoped Ollama runtime." } : resolveOllamaRuntime(options); });
    ipcMain.handle("ollama:runtimeEnsure", (event: { readonly sender: { send(channel: string, payload: OllamaProvisionProgress): void } }) => { runtimeController?.abort(); runtimeController = new AbortController(); const request = options.dataDir === undefined ? { signal: runtimeController.signal, onProgress: (progress: OllamaProvisionProgress) => event.sender.send("ollama:runtimeProgress", progress) } : { dataDir: options.dataDir, signal: runtimeController.signal, onProgress: (progress: OllamaProvisionProgress) => event.sender.send("ollama:runtimeProgress", progress) }; return ensureOllamaRuntime(request).finally(() => { runtimeController = null; }); });
    ipcMain.handle("ollama:runtimeCancel", () => { if (!runtimeController) return false; runtimeController.abort(); runtimeController = null; return true; });
    ipcMain.handle("ollama:runtimeStop", async () => { const state = options.dataDir ? await readOllamaRuntimeState(options.dataDir) : null; return stopOllamaRuntime(state?.executable); });
    ipcMain.handle("ollama:runtimeRestart", async () => { const state = options.dataDir ? await readOllamaRuntimeState(options.dataDir) : null; if (!state) return { ok: false, message: "No verified managed runtime is available to restart." }; restartOllamaRuntime(state.executable); try { await waitForOllamaReadiness(); return { ok: true }; } catch (error) { stopOllamaRuntime(state.executable); return { ok: false, message: error instanceof Error ? error.message : String(error) }; } });
    ipcMain.handle("ollama:runtimeProbe", async () => { try { await waitForOllamaReadiness(); return { ok: true }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; } });
    ipcMain.handle("ollama:delete", (_event, name: unknown) => { const value = stringArg(name); return value === null ? { error: "Choose a model tag." } : client.delete(value).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })); });
    ipcMain.handle("ollama:copy", (_event, source: unknown, destination: unknown) => { const from = stringArg(source); const to = stringArg(destination); return from === null || to === null ? { error: "Choose both source and destination tags." } : client.copy(from, to).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })); });
    const runStream = async (operationId: unknown, start: (signal: AbortSignal) => Promise<Response>, onRecord?: (record: Record<string, unknown>) => void): Promise<readonly Record<string, unknown>[]> => {
        const id = stringArg(operationId);
        if (id === null) return [{ error: "A bounded operation id is required." }];
        const controller = new AbortController();
        active.set(id, controller);
        const timeout = setTimeout(() => controller.abort(), 30 * 60_000);
        try { return await readNdjson(await start(controller.signal), controller.signal, onRecord); }
        catch (error) { return [{ error: error instanceof Error ? error.message : String(error) }]; }
        finally { clearTimeout(timeout); active.delete(id); }
    };
    ipcMain.handle("ollama:pull", (event, name: unknown, operationId: unknown) => { const value = stringArg(name); return value === null ? [{ error: "Choose a model tag." }] : runStream(operationId, (signal) => client.pull(value, signal), (record) => event.sender.send("ollama:streamProgress", { operationId, record })); });
    ipcMain.handle("ollama:generate", (event, request: unknown, operationId: unknown) => typeof request !== "object" || request === null ? [{ error: "Generation request is invalid." }] : runStream(operationId, (signal) => client.generate(request as Record<string, unknown>), (record) => event.sender.send("ollama:streamProgress", { operationId, record })));
    ipcMain.handle("ollama:chat", (event, request: unknown, operationId: unknown) => typeof request !== "object" || request === null ? [{ error: "Chat request is invalid." }] : runStream(operationId, (signal) => client.chat(request as Record<string, unknown>), (record) => event.sender.send("ollama:streamProgress", { operationId, record })));
    ipcMain.handle("ollama:cancel", (_event, operationId: unknown) => { const id = stringArg(operationId); if (id === null) return false; const controller = active.get(id); if (!controller) return false; controller.abort(); return true; });
    return { dispose: () => { for (const controller of active.values()) controller.abort(); active.clear(); runtimeController?.abort(); runtimeController = null; for (const channel of OLLAMA_CHANNELS) ipcMain.removeHandler(channel); } };
}
