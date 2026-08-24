import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { access, mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { atomicWriteTextFile } from "../storage/atomicReplace.js";

const execFileAsync = promisify(execFile);
const OLLAMA_VERSION = "v0.32.5";
const OLLAMA_ASSET = "ollama-windows-amd64.zip";
const OLLAMA_SIZE = 1_457_824_795;
const OLLAMA_SHA256 = "7c941ae084569d298062d29f8139163a3187c76dbca0479c70d085e78fd8c7bb";
const OLLAMA_URL = `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/${OLLAMA_ASSET}`;
const OLLAMA_MAX_BYTES = 1_500_000_000;

export interface OllamaRuntimeState { readonly version: string; readonly origin: "managed"; readonly executable: string; readonly asset: string; readonly sha256: string; readonly installedAt: string; }
export interface OllamaProvisionProgress { readonly phase: "download" | "verify" | "extract" | "probe" | "ready"; readonly completedBytes: number; readonly totalBytes: number | null; readonly message: string; }
export interface OllamaProvisionOptions { readonly dataDir?: string; readonly home?: string; readonly fetchImpl?: typeof fetch; readonly signal?: AbortSignal; readonly onProgress?: (progress: OllamaProvisionProgress) => void; }

export const PINNED_OLLAMA = { version: OLLAMA_VERSION, asset: OLLAMA_ASSET, sizeBytes: OLLAMA_SIZE, sha256: OLLAMA_SHA256, url: OLLAMA_URL } as const;

export async function readOllamaRuntimeState(dataDir: string): Promise<OllamaRuntimeState | null> {
    try { const state = JSON.parse(await readFile(join(dataDir, "ollama-runtime", "state.json"), "utf8")) as OllamaRuntimeState; return state.version === OLLAMA_VERSION && state.sha256 === OLLAMA_SHA256 && await exists(state.executable) ? state : null; } catch { return null; }
}

export function superviseOllamaRuntime(executable: string): void {
    const child = spawn(executable, ["serve"], { detached: true, windowsHide: true, stdio: "ignore" });
    child.unref();
}

function sha256(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
async function exists(path: string): Promise<boolean> { return access(path).then(() => true).catch(() => false); }
function report(options: OllamaProvisionOptions, progress: OllamaProvisionProgress): void { options.onProgress?.(progress); }

async function findExecutable(root: string, depth = 0): Promise<string | null> {
    if (depth > 4) return null;
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const candidate = join(root, entry.name);
        if (entry.isFile() && entry.name.toLowerCase() === "ollama.exe") return candidate;
        if (entry.isDirectory()) { const found = await findExecutable(candidate, depth + 1); if (found) return found; }
    }
    return null;
}

async function extractZip(archive: string, destination: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new Error("Ollama acquisition was cancelled.");
    await mkdir(destination, { recursive: true });
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
    const tar = process.platform === "win32" ? join(systemRoot, "System32", "tar.exe") : "tar";
    const child = execFile(tar, ["-xf", archive, "-C", destination], { windowsHide: true });
    const abort = () => child.kill();
    signal?.addEventListener("abort", abort, { once: true });
    try { await new Promise<void>((resolvePromise, reject) => child.once("error", reject).once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Ollama archive extraction exited with code ${String(code)}.`)))); }
    finally { signal?.removeEventListener("abort", abort); }
}

/** Downloads, verifies, extracts and probes the official pinned user-scoped Ollama build. */
export async function ensureOllamaRuntime(options: OllamaProvisionOptions = {}): Promise<{ readonly ok: true; readonly state: OllamaRuntimeState } | { readonly ok: false; readonly message: string }> {
    const dataDir = resolve(options.dataDir ?? join(options.home ?? homedir(), ".worldlens"));
    const runtimeDir = join(dataDir, "ollama-runtime", OLLAMA_VERSION);
    const stateFile = join(dataDir, "ollama-runtime", "state.json");
    const executable = join(runtimeDir, "ollama.exe");
    if (await exists(executable)) {
        try { const saved = JSON.parse(await readFile(stateFile, "utf8")) as OllamaRuntimeState; if (saved.executable === executable && saved.sha256 === OLLAMA_SHA256 && saved.version === OLLAMA_VERSION) { superviseOllamaRuntime(saved.executable); return { ok: true, state: saved }; } } catch { /* stale state is rebuilt */ }
    }
    const fetcher = options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const tempRoot = join(dataDir, "ollama-runtime", `.acquire-${process.pid}-${Date.now()}`);
    const archive = join(tempRoot, OLLAMA_ASSET);
    const extracted = join(tempRoot, "extracted");
    try {
        await mkdir(tempRoot, { recursive: true });
        report(options, { phase: "download", completedBytes: 0, totalBytes: OLLAMA_SIZE, message: "Downloading the pinned official Ollama runtime." });
        const response = await fetcher(OLLAMA_URL, { redirect: "error", signal: controller.signal });
        if (!response.ok) return { ok: false, message: `Official Ollama runtime returned HTTP ${response.status}.` };
        const reader = response.body?.getReader();
        if (!reader) return { ok: false, message: "Official Ollama runtime did not provide a stream." };
        const output = createWriteStream(archive, { flags: "wx" }); const digest = createHash("sha256"); let total = 0;
        const writeChunk = async (chunk: Uint8Array): Promise<void> => { const bytes = Buffer.from(chunk); if (!output.write(bytes)) await new Promise<void>((resolvePromise, reject) => { output.once("drain", resolvePromise); output.once("error", reject); }); digest.update(bytes); };
        try { while (true) { if (controller.signal.aborted) return { ok: false, message: "Ollama acquisition was cancelled." }; const chunk = await reader.read(); if (chunk.done) break; total += chunk.value.byteLength; if (total > OLLAMA_MAX_BYTES) return { ok: false, message: "The official Ollama runtime exceeded the safety size limit." }; await writeChunk(chunk.value); report(options, { phase: "download", completedBytes: total, totalBytes: OLLAMA_SIZE, message: "Downloading the pinned official Ollama runtime." }); } await new Promise<void>((resolvePromise, reject) => output.end(() => resolvePromise()).once("error", reject)); } catch (error) { output.destroy(); throw error; }
        report(options, { phase: "verify", completedBytes: total, totalBytes: total, message: "Verifying the official Ollama digest." });
        if (digest.digest("hex") !== OLLAMA_SHA256) return { ok: false, message: "The official Ollama digest did not match the pinned release." };
        report(options, { phase: "extract", completedBytes: 0, totalBytes: null, message: "Extracting the verified Ollama runtime." });
        await extractZip(archive, extracted, controller.signal);
        const found = await findExecutable(extracted); if (!found) return { ok: false, message: "The verified Ollama archive did not contain ollama.exe." };
        await rm(runtimeDir, { recursive: true, force: true }); await mkdir(dirname(executable), { recursive: true }); await rename(found, executable);
        report(options, { phase: "probe", completedBytes: total, totalBytes: total, message: "Probing the acquired Ollama runtime." });
        await execFileAsync(executable, ["--version"], { windowsHide: true, timeout: 30_000 });
        superviseOllamaRuntime(executable);
        const state: OllamaRuntimeState = { version: OLLAMA_VERSION, origin: "managed", executable, asset: OLLAMA_ASSET, sha256: OLLAMA_SHA256, installedAt: new Date().toISOString() };
        await atomicWriteTextFile(stateFile, JSON.stringify(state, null, 2));
        report(options, { phase: "ready", completedBytes: total, totalBytes: total, message: "The verified Ollama runtime is ready." });
        return { ok: true, state };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    finally { options.signal?.removeEventListener("abort", abort); await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined); }
}
