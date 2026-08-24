import type { IpcMain } from "electron";
import { OllamaClient, resolveOllamaRuntime } from "./client.js";
import { fetchExhaustiveCatalog, mergeInstalledTags, readCatalogCache, refreshOfficialCatalog, writeCatalogCache, type OllamaCatalogSnapshot } from "./catalog.js";
import { ensureOllamaRuntime, readOllamaRuntimeState, type OllamaProvisionProgress } from "./provision.js";

export const OLLAMA_CHANNELS = ["ollama:health", "ollama:tags", "ollama:running", "ollama:show", "ollama:catalog", "ollama:catalogRefresh", "ollama:runtime", "ollama:runtimeEnsure", "ollama:delete", "ollama:copy", "ollama:pull", "ollama:generate", "ollama:chat", "ollama:cancel"] as const;
export interface OllamaIpc { dispose(): void; }
export interface OllamaIpcOptions { readonly baseUrl?: string; readonly dataDir?: string; readonly bundledExecutable?: string | null; readonly managedExecutable?: string | null; readonly catalog?: OllamaCatalogSnapshot | null; }

const stringArg = (value: unknown): string | null => typeof value === "string" && value.trim() !== "" && value.length <= 512 ? value : null;

const MAX_STREAM_BYTES = 64 * 1024 * 1024;
const MAX_STREAM_LINE_BYTES = 1024 * 1024;
const MAX_STREAM_LINES = 100_000;

async function readNdjson(response: Response, signal: AbortSignal): Promise<readonly Record<string, unknown>[]> {
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
        try { result.push(JSON.parse(trimmed) as Record<string, unknown>); } catch { result.push({ error: "Ollama returned malformed streamed JSON." }); }
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
    ipcMain.handle("ollama:health", () => client.health());
    ipcMain.handle("ollama:tags", () => client.tags().catch((error) => ({ models: [], error: error instanceof Error ? error.message : String(error) })));
    ipcMain.handle("ollama:running", () => client.ps().catch((error) => ({ models: [], error: error instanceof Error ? error.message : String(error) })));
    ipcMain.handle("ollama:show", (_event, name: unknown) => { const value = stringArg(name); return value === null ? { error: "Choose a model tag." } : client.show(value).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })); });
    ipcMain.handle("ollama:catalog", async () => catalog ?? await readCatalogCache(options.dataDir ?? ".") ?? { version: 1, variants: [], fetchedAt: null, pages: 0, complete: false, revision: null, stale: true, source: "No verified catalog refresh has completed." });
    ipcMain.handle("ollama:catalogRefresh", async (_event, _signal?: unknown) => { try { const fresh = await refreshOfficialCatalog(options.dataDir ?? "."); const installed = await client.tags().catch(() => ({ models: [] })); catalog = mergeInstalledTags(fresh, Array.isArray(installed.models) ? installed.models : []); await writeCatalogCache(options.dataDir ?? ".", catalog); return { ok: true, catalog }; } catch (error) { const cached = await readCatalogCache(options.dataDir ?? "."); return { ok: false, catalog: cached, message: error instanceof Error ? error.message : String(error) }; } });
    ipcMain.handle("ollama:runtime", async () => { const state = options.dataDir ? await readOllamaRuntimeState(options.dataDir) : null; return state ? { origin: "managed", executable: state.executable, canonicalSource: null, reason: "Using the verified user-scoped Ollama runtime." } : resolveOllamaRuntime(options); });
    ipcMain.handle("ollama:runtimeEnsure", (event: { readonly sender: { send(channel: string, payload: OllamaProvisionProgress): void } }) => ensureOllamaRuntime(options.dataDir === undefined ? { onProgress: (progress) => event.sender.send("ollama:runtimeProgress", progress) } : { dataDir: options.dataDir, onProgress: (progress) => event.sender.send("ollama:runtimeProgress", progress) }));
    ipcMain.handle("ollama:delete", (_event, name: unknown) => { const value = stringArg(name); return value === null ? { error: "Choose a model tag." } : client.delete(value).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })); });
    ipcMain.handle("ollama:copy", (_event, source: unknown, destination: unknown) => { const from = stringArg(source); const to = stringArg(destination); return from === null || to === null ? { error: "Choose both source and destination tags." } : client.copy(from, to).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })); });
    const runStream = async (operationId: unknown, start: (signal: AbortSignal) => Promise<Response>): Promise<readonly Record<string, unknown>[]> => {
        const id = stringArg(operationId);
        if (id === null) return [{ error: "A bounded operation id is required." }];
        const controller = new AbortController();
        active.set(id, controller);
        const timeout = setTimeout(() => controller.abort(), 30 * 60_000);
        try { return await readNdjson(await start(controller.signal), controller.signal); }
        catch (error) { return [{ error: error instanceof Error ? error.message : String(error) }]; }
        finally { clearTimeout(timeout); active.delete(id); }
    };
    ipcMain.handle("ollama:pull", (_event, name: unknown, operationId: unknown) => { const value = stringArg(name); return value === null ? [{ error: "Choose a model tag." }] : runStream(operationId, (signal) => client.pull(value, signal)); });
    ipcMain.handle("ollama:generate", (_event, request: unknown, operationId: unknown) => typeof request !== "object" || request === null ? [{ error: "Generation request is invalid." }] : runStream(operationId, (signal) => client.generate(request as Record<string, unknown>)));
    ipcMain.handle("ollama:chat", (_event, request: unknown, operationId: unknown) => typeof request !== "object" || request === null ? [{ error: "Chat request is invalid." }] : runStream(operationId, (signal) => client.chat(request as Record<string, unknown>)));
    ipcMain.handle("ollama:cancel", (_event, operationId: unknown) => { const id = stringArg(operationId); if (id === null) return false; const controller = active.get(id); if (!controller) return false; controller.abort(); return true; });
    return { dispose: () => { for (const controller of active.values()) controller.abort(); active.clear(); for (const channel of OLLAMA_CHANNELS) ipcMain.removeHandler(channel); } };
}
