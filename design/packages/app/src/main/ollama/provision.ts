import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { access, mkdir, readdir, readFile, rename, rm, stat as statFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
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

export interface OllamaRuntimeState { readonly version: string; readonly origin: "managed"; readonly executable: string; readonly asset: string; readonly sha256: string; readonly executableSha256?: string; readonly installedAt: string; }
export interface OllamaProvisionProgress { readonly phase: "download" | "verify" | "extract" | "probe" | "ready"; readonly completedBytes: number; readonly totalBytes: number | null; readonly message: string; }
export interface OllamaProvisionOptions { readonly dataDir?: string; readonly home?: string; readonly fetchImpl?: typeof fetch; readonly signal?: AbortSignal; readonly onProgress?: (progress: OllamaProvisionProgress) => void; }

export const PINNED_OLLAMA = { version: OLLAMA_VERSION, asset: OLLAMA_ASSET, sizeBytes: OLLAMA_SIZE, sha256: OLLAMA_SHA256, url: OLLAMA_URL } as const;

const running = new Map<string, ReturnType<typeof spawn>>();

export async function readOllamaRuntimeState(dataDir: string): Promise<OllamaRuntimeState | null> {
    try {
        const state = JSON.parse(await readFile(join(dataDir, "ollama-runtime", "state.json"), "utf8")) as OllamaRuntimeState;
        if (state.version !== OLLAMA_VERSION || state.sha256 !== OLLAMA_SHA256 || !(await exists(state.executable))) return null;
        if (state.executableSha256 !== undefined && state.executableSha256 !== await sha256File(state.executable)) return null;
        return state;
    } catch { return null; }
}

export function superviseOllamaRuntime(executable: string): void {
    const prior = running.get(executable);
    if (prior && prior.exitCode === null) return;
    const child = spawn(executable, ["serve"], { detached: true, windowsHide: true, stdio: "ignore" });
    running.set(executable, child);
    child.once("exit", () => { if (running.get(executable) === child) running.delete(executable); });
    child.unref();
}

export function stopOllamaRuntime(executable?: string): boolean {
    let stopped = false;
    for (const [key, child] of running) if (executable === undefined || key === executable) { stopped = child.kill(); running.delete(key); }
    return stopped;
}

export async function stopOllamaRuntimeAndWait(executable?: string): Promise<boolean> {
    const children = [...running.entries()].filter(([key]) => executable === undefined || key === executable);
    const stopped = stopOllamaRuntime(executable);
    await Promise.all(children.map(([, child]) => new Promise<void>((resolvePromise) => { if (child.exitCode !== null) return resolvePromise(); const timer = setTimeout(resolvePromise, 10_000); child.once("exit", () => { clearTimeout(timer); resolvePromise(); }); })));
    return stopped;
}

export function restartOllamaRuntime(executable: string): void { stopOllamaRuntime(executable); superviseOllamaRuntime(executable); }

function sha256(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
async function sha256File(path: string): Promise<string> { const digest = createHash("sha256"); for await (const chunk of createReadStream(path)) digest.update(chunk); return digest.digest("hex"); }
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

async function validateExtractedTree(root: string, current = root, depth = 0): Promise<{ readonly files: number; readonly bytes: number }> {
    if (depth > 8) throw new Error("The Ollama archive directory depth exceeded the safety limit.");
    let files = 0; let bytes = 0;
    for (const entry of await readdir(current, { withFileTypes: true })) {
        if (entry.name === "." || entry.name === ".." || entry.name.includes("/") || entry.name.includes("\\")) throw new Error("The Ollama archive contains an unsafe entry name.");
        const candidate = join(current, entry.name);
        if (entry.isSymbolicLink()) throw new Error("The Ollama archive contains a symbolic link and was refused.");
        if (entry.isDirectory()) { const nested = await validateExtractedTree(root, candidate, depth + 1); files += nested.files; bytes += nested.bytes; }
        else if (entry.isFile()) { const info = await statFile(candidate); files += 1; bytes += info.size; if (files > 20_000 || bytes > 2_000_000_000) throw new Error("The Ollama archive contents exceed the safety limit."); }
    }
    return { files, bytes };
}

export async function waitForOllamaReadiness(signal?: AbortSignal): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        if (signal?.aborted) throw new Error("Ollama startup was cancelled.");
        try { const response = await fetch("http://127.0.0.1:11434/api/version", { signal: AbortSignal.timeout(1_000) }); if (response.ok) return; } catch { /* bounded retry */ }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    throw new Error("The acquired Ollama runtime did not become ready within 30 seconds.");
}

/** Downloads, verifies, extracts and probes the official pinned user-scoped Ollama build. */
export async function ensureOllamaRuntime(options: OllamaProvisionOptions = {}): Promise<{ readonly ok: true; readonly state: OllamaRuntimeState } | { readonly ok: false; readonly message: string }> {
    const dataDir = resolve(options.dataDir ?? join(options.home ?? homedir(), ".worldlens"));
    const runtimeDir = join(dataDir, "ollama-runtime", OLLAMA_VERSION);
    const stateFile = join(dataDir, "ollama-runtime", "state.json");
    const saved = await readOllamaRuntimeState(dataDir);
    if (saved) { superviseOllamaRuntime(saved.executable); await waitForOllamaReadiness(options.signal); return { ok: true, state: saved }; }
    const fetcher = options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const tempRoot = join(dataDir, "ollama-runtime", `.acquire-${process.pid}-${Date.now()}`);
    const archive = join(tempRoot, OLLAMA_ASSET);
    const extracted = join(tempRoot, "extracted");
    let installedRuntime = false;
    try {
        await mkdir(tempRoot, { recursive: true });
        report(options, { phase: "download", completedBytes: 0, totalBytes: OLLAMA_SIZE, message: "Downloading the pinned official Ollama runtime." });
        const response = await fetcher(OLLAMA_URL, { redirect: "follow", signal: controller.signal });
        if (!response.ok) return { ok: false, message: `Official Ollama runtime returned HTTP ${response.status}.` };
        const finalHost = new URL(response.url || OLLAMA_URL).hostname.toLowerCase();
        if (!new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]).has(finalHost)) return { ok: false, message: "The official Ollama runtime redirected to an unapproved host." };
        const reader = response.body?.getReader();
        if (!reader) return { ok: false, message: "Official Ollama runtime did not provide a stream." };
        const output = createWriteStream(archive, { flags: "wx" }); const digest = createHash("sha256"); let total = 0; let outputFailure: Error | null = null; output.once("error", (error) => { outputFailure = error instanceof Error ? error : new Error(String(error)); });
        const writeChunk = async (chunk: Uint8Array): Promise<void> => { const bytes = Buffer.from(chunk); if (outputFailure) throw outputFailure; if (!output.write(bytes)) await new Promise<void>((resolvePromise) => output.once("drain", resolvePromise)); if (outputFailure) throw outputFailure; digest.update(bytes); };
        try { while (true) { if (controller.signal.aborted) return { ok: false, message: "Ollama acquisition was cancelled." }; const chunk = await reader.read(); if (chunk.done) break; total += chunk.value.byteLength; if (total > OLLAMA_MAX_BYTES) return { ok: false, message: "The official Ollama runtime exceeded the safety size limit." }; await writeChunk(chunk.value); report(options, { phase: "download", completedBytes: total, totalBytes: OLLAMA_SIZE, message: "Downloading the pinned official Ollama runtime." }); } await new Promise<void>((resolvePromise) => output.end(() => resolvePromise())); if (outputFailure) throw outputFailure; } catch (error) { output.destroy(); throw error; }
        report(options, { phase: "verify", completedBytes: total, totalBytes: total, message: "Verifying the official Ollama digest." });
        if (digest.digest("hex") !== OLLAMA_SHA256) return { ok: false, message: "The official Ollama digest did not match the pinned release." };
        report(options, { phase: "extract", completedBytes: 0, totalBytes: null, message: "Extracting the verified Ollama runtime." });
        await extractZip(archive, extracted, controller.signal);
        await validateExtractedTree(extracted);
        const found = await findExecutable(extracted); if (!found) return { ok: false, message: "The verified Ollama archive did not contain ollama.exe." };
        await rm(runtimeDir, { recursive: true, force: true }); await mkdir(dirname(runtimeDir), { recursive: true }); await rename(extracted, runtimeDir); installedRuntime = true;
        const executable = await findExecutable(runtimeDir); if (!executable) return { ok: false, message: "The extracted Ollama companion tree did not retain ollama.exe." };
        report(options, { phase: "probe", completedBytes: total, totalBytes: total, message: "Probing the acquired Ollama runtime." });
        await execFileAsync(executable, ["--version"], { windowsHide: true, timeout: 30_000 });
        superviseOllamaRuntime(executable);
        await waitForOllamaReadiness(controller.signal);
        const state: OllamaRuntimeState = { version: OLLAMA_VERSION, origin: "managed", executable, asset: OLLAMA_ASSET, sha256: OLLAMA_SHA256, executableSha256: await sha256File(executable), installedAt: new Date().toISOString() };
        await atomicWriteTextFile(stateFile, JSON.stringify(state, null, 2));
        report(options, { phase: "ready", completedBytes: total, totalBytes: total, message: "The verified Ollama runtime is ready." });
        return { ok: true, state };
    } catch (error) { if (installedRuntime) await rm(runtimeDir, { recursive: true, force: true }).catch(() => undefined); return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    finally { options.signal?.removeEventListener("abort", abort); await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined); }
}
