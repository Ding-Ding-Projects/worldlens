export interface OllamaBridge {
    health(): Promise<{ ok: boolean; version: string | null; message: string }>;
    tags(): Promise<{ models?: readonly OllamaTag[]; error?: string }>;
    running(): Promise<{ models?: readonly OllamaTag[]; error?: string }>;
    show(name: string): Promise<Record<string, unknown>>;
    catalog(): Promise<OllamaCatalogSnapshot>;
    runtime(): Promise<{ origin: string; executable: string | null; canonicalSource: string | null; reason: string }>;
    delete(name: string): Promise<unknown>;
    copy(source: string, destination: string): Promise<unknown>;
    pull(name: string): Promise<readonly Record<string, unknown>[]>;
    generate(request: Record<string, unknown>): Promise<readonly Record<string, unknown>[]>;
    chat(request: Record<string, unknown>): Promise<readonly Record<string, unknown>[]>;
}
export interface OllamaTag { name: string; size?: number; digest?: string; modified_at?: string; }
export interface OllamaCatalogSnapshot { version: 1; variants: readonly (OllamaTag & { family: string | null; capabilities: readonly string[]; quantization: string | null; parameterSize: string | null; catalogSource: string })[]; fetchedAt: string | null; pages: number; complete: boolean; revision: string | null; stale: boolean; source: string; }
export function resolveOllamaBridge(): OllamaBridge | null { const value = (globalThis as { worldlens?: { ollama?: OllamaBridge } }).worldlens?.ollama; return value?.health && value.tags && value.catalog ? value : null; }
