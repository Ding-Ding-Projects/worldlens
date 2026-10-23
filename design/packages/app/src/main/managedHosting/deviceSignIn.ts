import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface RegistryDeviceChallenge { verificationUrl: "https://login.docker.com/activate"; userCode: string }
/** Only the transient challenge crosses to the protected sign-in control; no CLI output is logged. */
export async function startDockerDeviceSignIn(onChallenge: (challenge: RegistryDeviceChallenge) => void, signal?: AbortSignal): Promise<void> {
    const configPath = join(process.env.DOCKER_CONFIG || join(homedir(), ".docker"), "config.json");
    let config: { credsStore?: unknown; credHelpers?: Record<string, unknown> };
    try { config = JSON.parse(await readFile(configPath, "utf8")) as typeof config; }
    catch { throw new Error("Configure a native Docker credential store before signing in."); }
    const helper = config.credHelpers?.["https://index.docker.io/v1/"] ?? config.credHelpers?.["docker.io"] ?? config.credsStore;
    if (typeof helper !== "string" || !/^[a-zA-Z0-9_-]+$/u.test(helper)) throw new Error("Configure a native Docker credential store before signing in.");
    if (signal?.aborted) throw new Error("Registry sign-in was canceled.");
    await new Promise<void>((resolve, reject) => {
        const child = spawn("docker", ["login"], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], ...(signal ? { signal } : {}) });
        let output = ""; let displayed = false; let settled = false;
        const timer = setTimeout(() => { child.kill(); finish(new Error("Registry sign-in expired. Start a new sign-in.")); }, 10 * 60 * 1000);
        const finish = (error?: Error): void => { if (settled) return; settled = true; clearTimeout(timer); output = ""; error ? reject(error) : resolve(); };
        const receive = (chunk: Buffer): void => {
            output = (output + chunk.toString("utf8")).slice(-8192);
            const match = /(?:confirmation code|one-time device confirmation code)\s*(?:is|:)\s*([A-Z0-9]{4}-[A-Z0-9]{4})/iu.exec(output);
            if (!displayed && match?.[1]) {
                displayed = true;
                try { onChallenge({ verificationUrl: "https://login.docker.com/activate", userCode: match[1] }); }
                catch { child.kill(); finish(new Error("Registry sign-in control is unavailable.")); }
            }
        };
        child.stdout.on("data", receive); child.stderr.on("data", receive);
        child.on("error", () => finish(new Error("Docker sign-in could not start.")));
        child.on("exit", code => finish(code === 0 ? undefined : new Error("Registry sign-in did not complete.")));
        // Avoid Docker's optional Enter-to-open-browser prompt; the application owns that link.
        child.stdin.end();
    });
}
