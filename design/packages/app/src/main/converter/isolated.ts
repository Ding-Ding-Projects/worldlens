import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WORKER = join(dirname(fileURLToPath(import.meta.url)), "isolatedWorker.js");

export interface IsolatedResult { readonly ok: boolean; readonly result?: Record<string, unknown>; readonly message?: string; }

export async function runIsolatedAdapter(request: Record<string, unknown>, signal?: AbortSignal, timeoutMs = 30 * 60_000): Promise<IsolatedResult> {
    await access(WORKER).catch(() => { throw new Error("The bundled isolated converter worker is missing from this build."); });
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [WORKER], { windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["pipe", "pipe", "ignore"] });
        let output = "";
        const timer = setTimeout(() => { child.kill(); reject(new Error("The isolated converter adapter exceeded its deadline.")); }, timeoutMs);
        const abort = () => { child.kill(); clearTimeout(timer); reject(new Error("The isolated converter adapter was cancelled.")); };
        signal?.addEventListener("abort", abort, { once: true });
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => { output += chunk; if (output.length > 4 * 1024 * 1024) { child.kill(); clearTimeout(timer); reject(new Error("The isolated converter response exceeded the safety limit.")); } });
        child.once("error", (error) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(error); });
        child.once("exit", (code) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); try { const parsed = JSON.parse(output) as IsolatedResult; if (code !== 0 && parsed.ok !== false) reject(new Error(`The isolated converter adapter exited with code ${String(code)}.`)); else resolve(parsed); } catch (error) { reject(error); } });
        child.stdin.end(JSON.stringify(request));
    });
}
