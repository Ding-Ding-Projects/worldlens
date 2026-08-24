import type { IpcMain } from "electron";
import { OllamaClient, resolveOllamaRuntime } from "./client.js";
import { fetchExhaustiveCatalog, mergeInstalledTags, type OllamaCatalogSnapshot } from "./catalog.js";

export const OLLAMA_CHANNELS = ["ollama:health", "ollama:tags", "ollama:running", "ollama:show", "ollama:catalog", "ollama:runtime", "ollama:delete", "ollama:copy", "ollama:pull", "ollama:generate", "ollama:chat"] as const;
export interface OllamaIpc { dispose(): void; }
export interface OllamaIpcOptions { readonly baseUrl?: string; readonly bundledExecutable?: string | null; readonly managedExecutable?: string | null; readonly catalog?: OllamaCatalogSnapshot | null; }

const stringArg = (value: unknown): string | null => typeof value === "string" && value.trim() !== "" && value.length <= 512 ? value : null;

async function readNdjson(response: Response): Promise<readonly Record<string, unknown>[]> {
    if (!response.ok) return [{ error: `Ollama returned HTTP ${response.status}.` }];
    const text = await response.text();
    if (text.length > 16 * 1024 * 1024) return [{ error: "Ollama returned a response above the safety limit." }];
    return text.split(/\r?\n/).filter(Boolean).slice(0, 100_000).flatMap((line) => { try { const parsed = JSON.parse(line) as Record<string, unknown>; return [parsed]; } catch { return [{ error: "Ollama returned malformed streamed JSON." }]; } });
}

export function registerOllamaHandlers(ipcMain: Pick<IpcMain, "handle" | "removeHandler">, options: OllamaIpcOptions = {}): OllamaIpc {
    const client = new OllamaClient(options.baseUrl);
    let catalog = options.catalog ?? null;
    ipcMain.handle("ollama:health", () => client.health());
    ipcMain.handle("ollama:tags", () => client.tags().catch((error) => ({ models: [], error: error instanceof Error ? error.message : String(error) })));
    ipcMain.handle("ollama:running", () => client.ps().catch((error) => ({ models: [], error: error instanceof Error ? error.message : String(error) })));
    ipcMain.handle("ollama:show", (_event, name: unknown) => { const value = stringArg(name); return value === null ? { error: "Choose a model tag." } : client.show(value).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })); });
    ipcMain.handle("ollama:catalog", async () => catalog ?? { version: 1, variants: [], fetchedAt: null, pages: 0, complete: false, revision: null, stale: true, source: "No verified catalog refresh has completed." });
    ipcMain.handle("ollama:runtime", () => resolveOllamaRuntime(options));
    ipcMain.handle("ollama:delete", (_event, name: unknown) => { const value = stringArg(name); return value === null ? { error: "Choose a model tag." } : client.delete(value).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })); });
    ipcMain.handle("ollama:copy", (_event, source: unknown, destination: unknown) => { const from = stringArg(source); const to = stringArg(destination); return from === null || to === null ? { error: "Choose both source and destination tags." } : client.copy(from, to).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })); });
    ipcMain.handle("ollama:pull", async (_event, name: unknown) => { const value = stringArg(name); if (value === null) return [{ error: "Choose a model tag." }]; try { return await readNdjson(await client.pull(value)); } catch (error) { return [{ error: error instanceof Error ? error.message : String(error) }]; } });
    ipcMain.handle("ollama:generate", async (_event, request: unknown) => { if (typeof request !== "object" || request === null) return [{ error: "Generation request is invalid." }]; try { return await readNdjson(await client.generate(request as Record<string, unknown>)); } catch (error) { return [{ error: error instanceof Error ? error.message : String(error) }]; } });
    ipcMain.handle("ollama:chat", async (_event, request: unknown) => { if (typeof request !== "object" || request === null) return [{ error: "Chat request is invalid." }]; try { return await readNdjson(await client.chat(request as Record<string, unknown>)); } catch (error) { return [{ error: error instanceof Error ? error.message : String(error) }]; } });
    return { dispose: () => { for (const channel of OLLAMA_CHANNELS) ipcMain.removeHandler(channel); } };
}
