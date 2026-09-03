export interface OllamaModelTag { readonly name: string; readonly size?: number; readonly digest?: string; readonly modified_at?: string; }
export interface OllamaHealth { readonly ok: boolean; readonly version: string | null; readonly message: string; }
export interface OllamaPage<T> { readonly items: readonly T[]; readonly next: string | null; readonly revision: string | null; }

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function safeBaseUrl(baseUrl: string): URL | null {
    try {
        const url = new URL(baseUrl);
        if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) return null;
        return url;
    } catch { return null; }
}

async function requestJson<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
    const base = safeBaseUrl(baseUrl);
    if (base === null) throw new Error("Ollama requests are restricted to the local loopback service.");
    const url = new URL(path, base);
    const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000), headers: { accept: "application/json", ...(init.headers ?? {}) } });
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_RESPONSE_BYTES) throw new Error("Ollama returned a response above the safety limit.");
    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) throw new Error("Ollama returned a response above the safety limit.");
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    try { return JSON.parse(body) as T; } catch { throw new Error("Ollama returned malformed JSON."); }
}

export class OllamaClient {
    constructor(readonly baseUrl = "http://127.0.0.1:11434") {}
    health(): Promise<OllamaHealth> { return requestJson<{ version?: string }>(this.baseUrl, "/api/version").then((value) => ({ ok: true, version: typeof value.version === "string" ? value.version : null, message: "Ollama is responding on the local service." })).catch((error) => ({ ok: false, version: null, message: error instanceof Error ? error.message : String(error) })); }
    tags(): Promise<{ models?: OllamaModelTag[] }> { return requestJson(this.baseUrl, "/api/tags"); }
    ps(): Promise<{ models?: OllamaModelTag[] }> { return requestJson(this.baseUrl, "/api/ps"); }
    show(name: string): Promise<Record<string, unknown>> { return requestJson(this.baseUrl, "/api/show", { method: "POST", body: JSON.stringify({ name }), headers: { "content-type": "application/json" } }); }
    pull(name: string, signal?: AbortSignal): Promise<Response> {
        const base = safeBaseUrl(this.baseUrl);
        if (base === null) return Promise.reject(new Error("Ollama requests are restricted to the local loopback service."));
        return fetch(new URL("/api/pull", base), { method: "POST", body: JSON.stringify({ name, stream: true }), headers: { "content-type": "application/json" }, redirect: "error", signal: signal ?? AbortSignal.timeout(30 * 60_000) });
    }
    delete(name: string): Promise<Record<string, unknown>> { return requestJson(this.baseUrl, "/api/delete", { method: "DELETE", body: JSON.stringify({ name }), headers: { "content-type": "application/json" } }); }
    copy(source: string, destination: string): Promise<Record<string, unknown>> { return requestJson(this.baseUrl, "/api/copy", { method: "POST", body: JSON.stringify({ source, destination }), headers: { "content-type": "application/json" } }); }
    generate(request: Record<string, unknown>, signal?: AbortSignal): Promise<Response> { return this.stream("/api/generate", request, signal); }
    chat(request: Record<string, unknown>, signal?: AbortSignal): Promise<Response> { return this.stream("/api/chat", request, signal); }
    private stream(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
        const base = safeBaseUrl(this.baseUrl);
        if (base === null) return Promise.reject(new Error("Ollama requests are restricted to the local loopback service."));
        return fetch(new URL(path, base), { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", accept: "application/x-ndjson" }, redirect: "error", signal: signal ?? AbortSignal.timeout(30 * 60_000) });
    }
}

export interface OllamaRuntimePlan { readonly origin: "bundled" | "managed" | "unavailable"; readonly executable: string | null; readonly canonicalSource: string | null; readonly reason: string; }

/** Bundle first. If licensing prevents bundling, this returns a verified managed acquisition plan, never a browser instruction. */
export function resolveOllamaRuntime(options: { readonly bundledExecutable?: string | null; readonly managedExecutable?: string | null }): OllamaRuntimePlan {
    if (options.bundledExecutable) return { origin: "bundled", executable: options.bundledExecutable, canonicalSource: null, reason: "Using the application-bundled Ollama runtime." };
    if (options.managedExecutable) return { origin: "managed", executable: options.managedExecutable, canonicalSource: "https://github.com/ollama/ollama/releases/download/v0.32.5/ollama-windows-amd64.zip", reason: "Using a verified user-scoped runtime acquired by the application." };
    return { origin: "unavailable", executable: null, canonicalSource: "https://github.com/ollama/ollama/releases/download/v0.32.5/ollama-windows-amd64.zip", reason: "The application has not acquired a verified runtime yet. Use the in-app automatic acquisition action; no manual install step is required." };
}
