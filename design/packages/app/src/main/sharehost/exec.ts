/**
 * Running Docker, here or over SSH, with an optional file piped to standard input.
 *
 * `dockhand` already runs a command and quotes it for a remote shell, but its runner has no
 * standard input, and two steps of hosting need one: `docker load` reads the bundled image
 * tar, and the one-off run that fills the volume reads the map tar. Both are streamed from a
 * file so nothing is held in memory and nothing is placed on a command line.
 *
 * Nothing here throws. A missing binary or a refused connection is an answer, exactly as in
 * `dockhand`'s runner, because every caller turns the answer into a sentence for the person.
 */
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import {
    execFileCommandRunner,
    remoteCommandLine,
    sshArguments,
    sshCommandRunner,
    type CommandOptions,
    type CommandOutput,
    type CommandRunner,
    type SshOptionsInput,
    type SshTarget,
} from "@worldlens/dockhand";

export interface StdinOptions extends CommandOptions {
    readonly stdinFile: string;
}

/** Runs a process whose standard input is a file. Never rejects. */
export type StdinRunner = (command: string, args: readonly string[], options: StdinOptions) => Promise<CommandOutput>;

const KEEP_BYTES = 64 * 1024;

function tail(current: string, chunk: Buffer): string {
    const next = current + chunk.toString("utf8");
    return next.length > KEEP_BYTES ? next.slice(next.length - KEEP_BYTES) : next;
}

export const spawnStdinRunner: StdinRunner = (command, args, options) =>
    new Promise<CommandOutput>((resolve) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (output: CommandOutput): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(output);
        };
        const child = spawn(command, [...args], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        const timer = setTimeout(() => {
            child.kill();
            finish({ ok: false, exitCode: null, stdout, stderr: `${stderr}\ntimed out`, spawnError: null });
        }, options.timeoutMs ?? 30 * 60_000);
        options.signal?.addEventListener("abort", () => {
            child.kill();
            finish({ ok: false, exitCode: null, stdout, stderr: `${stderr}\ncancelled`, spawnError: null });
        }, { once: true });
        child.stdout.on("data", (chunk: Buffer) => { stdout = tail(stdout, chunk); });
        child.stderr.on("data", (chunk: Buffer) => { stderr = tail(stderr, chunk); });
        child.once("error", (error: NodeJS.ErrnoException) => {
            finish({ ok: false, exitCode: null, stdout, stderr: error.message, spawnError: typeof error.code === "string" ? error.code : "SPAWN" });
        });
        child.once("close", (code) => {
            finish({ ok: code === 0, exitCode: code, stdout, stderr, spawnError: null });
        });
        const source = createReadStream(options.stdinFile);
        source.once("error", (error) => {
            child.kill();
            finish({ ok: false, exitCode: null, stdout, stderr: `could not read ${options.stdinFile}: ${error.message}`, spawnError: null });
        });
        // The child may exit before reading everything (a refused `docker load`); an EPIPE
        // on its stdin is then the expected consequence, not a second failure to report.
        child.stdin.on("error", () => undefined);
        source.pipe(child.stdin);
    });

/** One place Docker runs: this PC, or a host reached over SSH. */
export interface Executor {
    readonly kind: "local" | "ssh";
    /** The Docker binary on that machine. */
    readonly docker: string;
    /** What to call it on screen. */
    readonly label: string;
    exec(command: string, args: readonly string[], options?: CommandOptions): Promise<CommandOutput>;
    execWithStdin(command: string, args: readonly string[], options: StdinOptions): Promise<CommandOutput>;
}

export interface LocalExecutorOptions {
    readonly docker?: string;
    readonly runner?: CommandRunner;
    readonly stdinRunner?: StdinRunner;
}

export function localExecutor(options: LocalExecutorOptions = {}): Executor {
    const runner = options.runner ?? execFileCommandRunner;
    const stdinRunner = options.stdinRunner ?? spawnStdinRunner;
    return {
        kind: "local",
        docker: options.docker ?? "docker",
        label: "this PC",
        exec: (command, args, commandOptions) => runner(command, args, commandOptions),
        execWithStdin: (command, args, stdinOptions) => stdinRunner(command, args, stdinOptions),
    };
}

export interface SshExecutorOptions extends SshOptionsInput {
    readonly ssh?: string;
    readonly runner?: CommandRunner;
    readonly stdinRunner?: StdinRunner;
}

export function sshExecutor(options: SshExecutorOptions): Executor {
    const target: SshTarget = options.target;
    const ssh = options.ssh ?? "ssh";
    const run = sshCommandRunner({ ...options, ssh, ...(options.runner === undefined ? {} : { runner: options.runner }) });
    const stdinRunner = options.stdinRunner ?? spawnStdinRunner;
    return {
        kind: "ssh",
        docker: target.docker,
        label: `${target.user}@${target.host}`,
        exec: (command, args, commandOptions) => run(command, args, commandOptions),
        execWithStdin: (command, args, stdinOptions) =>
            stdinRunner(ssh, [...sshArguments(options), remoteCommandLine([command, ...args])], stdinOptions),
    };
}

/** The last `count` non-empty lines of what a command said, stderr first. */
export function lastLines(output: CommandOutput, count = 20): string {
    const text = [output.stderr, output.stdout].filter((part) => part.trim() !== "").join("\n");
    return text.split(/\r?\n/).filter((line) => line.trim() !== "").slice(-count).join("\n");
}
