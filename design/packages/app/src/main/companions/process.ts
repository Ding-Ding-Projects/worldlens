import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import * as path from "node:path";
import type { BuildPlan } from "./source.js";
import { actionArguments, buildEnvironment } from "./source.js";

export interface ProcessExit { readonly code: number | null; readonly signal: string | null; readonly startError?: string }
export interface OwnedBuildProcess {
    readonly completion: Promise<ProcessExit>;
    /** Must control the original owned process tree, never a persisted or user-selected PID. */
    cancel(): Promise<"requested" | "unavailable" | "finished">;
}
export type BuildOutput = (stream: "stdout" | "stderr", text: string) => void;
export type StartBuildProcess = (plan: BuildPlan, output: BuildOutput) => OwnedBuildProcess;
export type OwnedTreeController = (child: ChildProcess) => Promise<boolean>;

/** Batch commands are fixed basenames in a separately supplied cwd. No selected path enters shell text. */
export function batchCommand(plan: BuildPlan): string {
    const expected = actionArguments(plan.action, plan.action === "installer" ? plan.args[1] : undefined);
    if (plan.script !== expected.script || JSON.stringify(plan.args) !== JSON.stringify(expected.args)) throw new Error("Invalid build plan arguments.");
    return `${plan.script} ${plan.args.join(" ")}`;
}

/**
 * Cancellation requires a host-owned tree controller. A plain child.kill() would leave
 * batch grandchildren running. Without that capability cancellation stays unavailable,
 * and the live process remains owned until close. Never turn a PID from history into a kill.
 */
export function windowsBuildTransport(options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly platform?: string;
    readonly cancelTree?: OwnedTreeController;
} = {}): StartBuildProcess {
    return (plan, output) => {
        if ((options.platform ?? process.platform) !== "win32") throw new Error("Windows build transport is unavailable on this host.");
        const env = buildEnvironment(options.env ?? process.env);
        const root = Object.entries(env).find(([key]) => key.toUpperCase() === "SYSTEMROOT")?.[1];
        if (!root || !path.win32.isAbsolute(root)) throw new Error("The Windows command interpreter could not be resolved.");
        const command = batchCommand(plan);
        const child = spawn(path.win32.join(root, "System32", "cmd.exe"), ["/d", "/v:off", "/s", "/c", command], {
            cwd: plan.source.checkout, env, windowsHide: true, shell: false,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let closed = false;
        let startError: string | undefined;
        const safeOutput: BuildOutput = (stream, text) => { try { output(stream, text.slice(0, 16_384)); } catch { /* Observers cannot break ownership. */ } };
        child.stdout?.setEncoding("utf8").on("data", (text: string) => safeOutput("stdout", text));
        child.stderr?.setEncoding("utf8").on("data", (text: string) => safeOutput("stderr", text));
        const completion = new Promise<ProcessExit>((resolve) => {
            child.once("error", () => { startError = "The build process could not start or be controlled."; });
            child.once("close", (code, signal) => {
                closed = true;
                resolve({ code, signal, ...(startError ? { startError } : {}) });
            });
        });
        return {
            completion,
            cancel: async () => {
                if (closed || child.exitCode !== null || child.signalCode !== null) return "finished";
                if (!options.cancelTree) return "unavailable";
                return await options.cancelTree(child) ? "requested" : "unavailable";
            },
        };
    };
}
