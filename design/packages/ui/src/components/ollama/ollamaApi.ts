/**
 * A typed client for Ollama's own documented local HTTP API, and nothing else.
 *
 * Every call here talks to `http://127.0.0.1:11434` (Ollama's own documented default) unless
 * the caller supplies a different local base address. There is no cloud fallback, no
 * unofficial proxy, and no route that leaves the machine: the whole point of a local model
 * runner is that a person's prompts and their downloaded weights never have to go anywhere,
 * and a client that quietly reached out to a hosted service the first time the local daemon
 * was unreachable would betray that in the one moment nobody is watching the network tab.
 *
 * ## Results carry refusals, never throw across the boundary
 *
 * Every function here returns an `OllamaResult<T>`, a discriminated union of `{ ok: true,
 * value: T }` and `{ ok: false, error: OllamaApiError }`. A caller two components away from
 * the network should never have to wrap this client in its own try/catch to find out whether
 * the daemon is even running: the failure is a value, exactly as the store and the screen
 * below want it, and exactly as `markerStudioStore.ts`'s own fail-closed read reports a
 * broken read as a `failure` string instead of an empty list.
 *
 * ## Bounds
 *
 * A local daemon that is merely slow, or that has started returning something enormous, must
 * not be allowed to hang the interface or exhaust memory. Every request carries a timeout,
 * and every response body is read under a byte ceiling; either one tripping is reported as an
 * ordinary refusal, not an unhandled rejection.
 */

/** Ollama's own documented local default. Overridable for a test double or a moved daemon. */
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

/** Wall-clock budget for a single non-streaming request. */
export const DEFAULT_TIMEOUT_MS = 8_000;

/** Wall-clock budget for a single chunk of a streaming response, reset on every chunk. */
export const STREAM_CHUNK_TIMEOUT_MS = 30_000;

/** Longest response body this client will read before refusing the rest as oversized. */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export type OllamaErrorKind =
    | "unreachable"
    | "timeout"
    | "http"
    | "oversized"
    | "malformed"
    | "aborted";

export interface OllamaApiError {
    readonly kind: OllamaErrorKind;
    /** A sentence naming what happened, safe to show as-is. Never a raw stack or URL query. */
    readonly message: string;
    readonly status?: number;
}

export type OllamaResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: OllamaApiError };

function okResult<T>(value: T): OllamaResult<T> {
    return { ok: true, value };
}

function errResult<T>(error: OllamaApiError): OllamaResult<T> {
    return { ok: false, error };
}

/**
 * A `fetch` shape narrow enough to fake in a test and wide enough to be the real thing. Every
 * function below takes one as an explicit argument rather than reaching for the global, so a
 * unit test can hand it a stand-in that never opens a socket.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function resolveFetch(fetchImpl: FetchLike | undefined): FetchLike | null {
    if (fetchImpl) return fetchImpl;
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    return globalFetch ?? null;
}

interface RequestOptions {
    readonly baseUrl?: string;
    readonly fetchImpl?: FetchLike;
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
}

/**
 * Reads a response body under the byte ceiling, refusing the rest rather than buffering an
 * unbounded stream into memory because a misbehaving daemon decided to send gigabytes.
 */
async function readBoundedText(response: Response): Promise<OllamaResult<string>> {
    const reader = response.body?.getReader();
    if (!reader) {
        const text = await response.text();
        if (text.length > MAX_RESPONSE_BYTES) {
            return errResult({ kind: "oversized", message: "The response was larger than this client will read." });
        }
        return okResult(text);
    }
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
            await reader.cancel().catch(() => undefined);
            return errResult({ kind: "oversized", message: "The response was larger than this client will read." });
        }
        text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return okResult(text);
}

async function request(
    path: string,
    init: RequestInit,
    options: RequestOptions,
): Promise<OllamaResult<string>> {
    const fetchImpl = resolveFetch(options.fetchImpl);
    if (!fetchImpl) {
        return errResult({ kind: "unreachable", message: "No HTTP client is available in this build to reach a local Ollama daemon." });
    }
    const baseUrl = options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Chaining the caller's own signal lets a cancel button reach a request already in
    // flight, without giving up the timeout that protects against a daemon that never answers.
    const onCallerAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onCallerAbort);
    try {
        const response = await fetchImpl(`${baseUrl}${path}`, { ...init, signal: controller.signal });
        if (!response.ok) {
            const body = await readBoundedText(response);
            const detail = body.ok ? body.value.slice(0, 500) : "";
            return errResult({
                kind: "http",
                status: response.status,
                message: `The local Ollama daemon answered with HTTP ${response.status}.${detail ? ` ${detail}` : ""}`,
            });
        }
        return await readBoundedText(response);
    } catch (error) {
        if (options.signal?.aborted === true) {
            return errResult({ kind: "aborted", message: "The request was cancelled." });
        }
        if (controller.signal.aborted) {
            return errResult({ kind: "timeout", message: "The local Ollama daemon did not answer in time." });
        }
        return errResult({
            kind: "unreachable",
            message: error instanceof Error ? error.message : "Could not reach a local Ollama daemon.",
        });
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onCallerAbort);
    }
}

function parseJson<T>(text: string): OllamaResult<T> {
    try {
        return okResult(JSON.parse(text) as T);
    } catch {
        return errResult({ kind: "malformed", message: "The local Ollama daemon's response was not valid JSON." });
    }
}

/* -------------------------------------------------------------------------- */
/* Health and version                                                          */
/* -------------------------------------------------------------------------- */

export interface OllamaVersion {
    readonly version: string;
}

/** `GET /api/version`. Also doubles as the health probe: an answer means the daemon is up. */
export async function fetchVersion(options: RequestOptions = {}): Promise<OllamaResult<OllamaVersion>> {
    const result = await request("/api/version", { method: "GET" }, options);
    if (!result.ok) return result;
    return parseJson<OllamaVersion>(result.value);
}

/* -------------------------------------------------------------------------- */
/* Installed models                                                           */
/* -------------------------------------------------------------------------- */

export interface OllamaModelDetails {
    readonly format?: string;
    readonly family?: string;
    readonly families?: readonly string[] | null;
    readonly parameter_size?: string;
    readonly quantization_level?: string;
}

export interface OllamaInstalledModel {
    readonly name: string;
    readonly model: string;
    readonly modified_at: string;
    readonly size: number;
    readonly digest: string;
    readonly details?: OllamaModelDetails;
}

interface TagsResponse {
    readonly models: readonly OllamaInstalledModel[];
}

/** `GET /api/tags`: every model this daemon already has pulled. */
export async function fetchInstalledModels(options: RequestOptions = {}): Promise<OllamaResult<readonly OllamaInstalledModel[]>> {
    const result = await request("/api/tags", { method: "GET" }, options);
    if (!result.ok) return result;
    const parsed = parseJson<TagsResponse>(result.value);
    if (!parsed.ok) return parsed;
    return okResult(Array.isArray(parsed.value.models) ? parsed.value.models : []);
}

/* -------------------------------------------------------------------------- */
/* Show                                                                        */
/* -------------------------------------------------------------------------- */

export interface OllamaShowResult {
    readonly modelfile?: string;
    readonly parameters?: string;
    readonly template?: string;
    readonly details?: OllamaModelDetails;
    readonly model_info?: Record<string, unknown>;
}

/** `POST /api/show`: metadata for one model, installed or not, when the daemon has it cached. */
export async function showModel(name: string, options: RequestOptions = {}): Promise<OllamaResult<OllamaShowResult>> {
    const result = await request(
        "/api/show",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: name }) },
        options,
    );
    if (!result.ok) return result;
    return parseJson<OllamaShowResult>(result.value);
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                      */
/* -------------------------------------------------------------------------- */

/** `DELETE /api/delete`: removes one installed model's local blob. */
export async function deleteInstalledModel(name: string, options: RequestOptions = {}): Promise<OllamaResult<true>> {
    const result = await request(
        "/api/delete",
        { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: name }) },
        options,
    );
    if (!result.ok) return result;
    return okResult(true);
}

/* -------------------------------------------------------------------------- */
/* Pull, streaming                                                             */
/* -------------------------------------------------------------------------- */

export interface OllamaPullProgress {
    readonly status: string;
    readonly digest?: string;
    readonly total?: number;
    readonly completed?: number;
}

/**
 * `POST /api/pull`, reading the newline-delimited JSON stream Ollama sends back one status
 * line at a time. `onProgress` fires for every parsed line; a line that fails to parse is
 * skipped rather than aborting the whole pull, because one malformed heartbeat should not
 * lose a download that was otherwise proceeding normally.
 *
 * Cancellation goes through `options.signal`, the same `AbortSignal` every other call here
 * accepts, so the pull queue's per-item cancel button needs no pull-specific plumbing.
 */
export async function pullModel(
    name: string,
    onProgress: (progress: OllamaPullProgress) => void,
    options: RequestOptions = {},
): Promise<OllamaResult<true>> {
    const fetchImpl = resolveFetch(options.fetchImpl);
    if (!fetchImpl) {
        return errResult({ kind: "unreachable", message: "No HTTP client is available in this build to reach a local Ollama daemon." });
    }
    const baseUrl = options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onCallerAbort);
    let chunkTimer: ReturnType<typeof setTimeout> | null = null;
    const resetChunkTimer = () => {
        if (chunkTimer !== null) clearTimeout(chunkTimer);
        chunkTimer = setTimeout(() => controller.abort(), options.timeoutMs ?? STREAM_CHUNK_TIMEOUT_MS);
    };

    try {
        resetChunkTimer();
        const response = await fetchImpl(`${baseUrl}/api/pull`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model: name, stream: true }),
            signal: controller.signal,
        });
        if (!response.ok) {
            return errResult({ kind: "http", status: response.status, message: `The pull request answered with HTTP ${response.status}.` });
        }
        const reader = response.body?.getReader();
        if (!reader) {
            // No streaming body available in this runtime: fall back to reading the whole
            // response as one bounded block, reporting whatever final status it carried.
            const bounded = await readBoundedText(response);
            if (!bounded.ok) return bounded;
            for (const line of bounded.value.split("\n")) {
                const trimmed = line.trim();
                if (trimmed.length === 0) continue;
                try {
                    onProgress(JSON.parse(trimmed) as OllamaPullProgress);
                } catch {
                    // Skipped: see the doc comment above.
                }
            }
            return okResult(true);
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let totalBytes = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            resetChunkTimer();
            totalBytes += value.byteLength;
            if (totalBytes > MAX_RESPONSE_BYTES * 8) {
                // A pull's own progress stream is chattier than an ordinary response, so its
                // ceiling is wider, but it still has one: an endlessly repeating daemon must
                // not be allowed to grow this buffer without bound.
                await reader.cancel().catch(() => undefined);
                return errResult({ kind: "oversized", message: "The pull progress stream was larger than this client will read." });
            }
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex >= 0) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                if (line.length > 0) {
                    try {
                        onProgress(JSON.parse(line) as OllamaPullProgress);
                    } catch {
                        // Skipped: see the doc comment above.
                    }
                }
                newlineIndex = buffer.indexOf("\n");
            }
        }
        return okResult(true);
    } catch (error) {
        if (options.signal?.aborted === true) return errResult({ kind: "aborted", message: "The pull was cancelled." });
        if (controller.signal.aborted) return errResult({ kind: "timeout", message: "The pull stalled and was abandoned." });
        return errResult({ kind: "unreachable", message: error instanceof Error ? error.message : "Could not reach a local Ollama daemon." });
    } finally {
        if (chunkTimer !== null) clearTimeout(chunkTimer);
        options.signal?.removeEventListener("abort", onCallerAbort);
    }
}

/* -------------------------------------------------------------------------- */
/* Chat, streaming                                                             */
/* -------------------------------------------------------------------------- */

export interface OllamaChatMessage {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
}

export interface OllamaChatOptions {
    readonly temperature?: number;
    readonly top_p?: number;
    readonly num_ctx?: number;
    readonly repeat_penalty?: number;
}

export interface OllamaChatChunk {
    readonly message?: { readonly role: string; readonly content: string };
    readonly done: boolean;
    readonly done_reason?: string;
}

/**
 * `POST /api/chat`, streaming assistant tokens back through `onChunk` as they arrive. Returns
 * once the daemon reports `done: true` or the stream ends, whichever happens first.
 */
export async function streamChat(
    model: string,
    messages: readonly OllamaChatMessage[],
    onChunk: (chunk: OllamaChatChunk) => void,
    chatOptions: OllamaChatOptions = {},
    options: RequestOptions = {},
): Promise<OllamaResult<true>> {
    const fetchImpl = resolveFetch(options.fetchImpl);
    if (!fetchImpl) {
        return errResult({ kind: "unreachable", message: "No HTTP client is available in this build to reach a local Ollama daemon." });
    }
    const baseUrl = options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onCallerAbort);
    let chunkTimer: ReturnType<typeof setTimeout> | null = null;
    const resetChunkTimer = () => {
        if (chunkTimer !== null) clearTimeout(chunkTimer);
        chunkTimer = setTimeout(() => controller.abort(), options.timeoutMs ?? STREAM_CHUNK_TIMEOUT_MS);
    };

    try {
        resetChunkTimer();
        const response = await fetchImpl(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model, messages, options: chatOptions, stream: true }),
            signal: controller.signal,
        });
        if (!response.ok) {
            return errResult({ kind: "http", status: response.status, message: `Chat answered with HTTP ${response.status}.` });
        }
        const reader = response.body?.getReader();
        if (!reader) {
            const bounded = await readBoundedText(response);
            if (!bounded.ok) return bounded;
            for (const line of bounded.value.split("\n")) {
                const trimmed = line.trim();
                if (trimmed.length === 0) continue;
                try {
                    onChunk(JSON.parse(trimmed) as OllamaChatChunk);
                } catch {
                    // A malformed line in an otherwise good stream is skipped, not fatal.
                }
            }
            return okResult(true);
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let totalBytes = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            resetChunkTimer();
            totalBytes += value.byteLength;
            if (totalBytes > MAX_RESPONSE_BYTES * 8) {
                await reader.cancel().catch(() => undefined);
                return errResult({ kind: "oversized", message: "The chat response stream was larger than this client will read." });
            }
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex >= 0) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                if (line.length > 0) {
                    try {
                        onChunk(JSON.parse(line) as OllamaChatChunk);
                    } catch {
                        // Skipped: see above.
                    }
                }
                newlineIndex = buffer.indexOf("\n");
            }
        }
        return okResult(true);
    } catch (error) {
        if (options.signal?.aborted === true) return errResult({ kind: "aborted", message: "Chat was stopped." });
        if (controller.signal.aborted) return errResult({ kind: "timeout", message: "Chat stalled and was abandoned." });
        return errResult({ kind: "unreachable", message: error instanceof Error ? error.message : "Could not reach a local Ollama daemon." });
    } finally {
        if (chunkTimer !== null) clearTimeout(chunkTimer);
        options.signal?.removeEventListener("abort", onCallerAbort);
    }
}
