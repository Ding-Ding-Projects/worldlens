/**
 * A server running as an ordinary process on this machine.
 *
 * The simplest of the three, and therefore the reference: when a Docker transport behaves
 * differently from this one in a way no capability flag explains, this one is right and
 * the other has a bug.
 *
 * It owns a real child process, so it is also the only transport whose console can use
 * stdin. That is worth stating plainly because it is a trap: stdin is the obvious way to
 * talk to a Minecraft server and it is available *here only*. Anything built on it stops
 * working the moment the same server is moved into a container, which is a thing this
 * feature explicitly lets a user do. So the console layer above prefers RCON everywhere
 * and treats stdin as an optimisation for the local case, never as the design.
 *
 * Note what this file does NOT reuse. `runtime/process.ts` exports `EngineProcess`, which
 * runs a JVM perfectly well - but it types its child as `ChildProcessByStdio<null, ...>`,
 * so its stdin is `null` by construction. It can hear a server and cannot speak to one.
 * Rather than widen a type the renderer pipeline depends on, this spawns its own child
 * with all three streams piped.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { hashBytes, hashesMatch } from "./hash.js";
import { resolveForWrite, resolveInScope, type ScopeOptions } from "./scope.js";
import {
    DEFAULT_STOP_TIMEOUT_MS,
    MAX_FILE_BYTES,
    fail,
    ok,
    type Answer,
    type AttachOptions,
    type ConsoleExit,
    type ConsoleLine,
    type ConsoleSession,
    type FileBlob,
    type FileEntry,
    type InstanceHandle,
    type InstanceStatus,
    type ReadOptions,
    type ServerSpec,
    type ServerTransport,
    type StopOptions,
    type TransportCapabilities,
    type TransportHealth,
    type TransportRef,
    type WriteOptions,
    type WriteReceipt,
} from "./types.js";

/** Where a pre-write copy of a file goes. Inside the server folder, so it travels with it. */
export const BACKUP_DIR = ".worldlens-backups";

export interface LocalProcessOptions {
    readonly argsFile?: string;
    readonly serverDir: string;
    /** Absolute path to the java binary this server should run under. */
    readonly javaPath: string;
    readonly jarPath: string;
    readonly memoryMb: number;
    readonly writeScope?: readonly string[];
    readonly now?: () => string;
    /** Injectable so tests never spawn a JVM. */
    readonly spawnProcess?: typeof spawn;
}

type NodeError = NodeJS.ErrnoException;

/**
 * Turns a filesystem error into an answer.
 *
 * Every code here is a thing a user can act on, and the point of the mapping is that they
 * arrive at the UI as different sentences. `EACCES` means fix a permission; `ENOENT` means
 * the file is not there; anything else is genuinely unexpected and says so rather than
 * being flattened into a single unhelpful "could not read file".
 */
function fromNodeError<T>(error: unknown, what: string): Answer<T> {
    const code = (error as NodeError | null)?.code;
    const detail = error instanceof Error ? error.message : String(error);
    if (code === "ENOENT") return fail("not-found", `${what} is not there.`, detail);
    if (code === "EACCES" || code === "EPERM")
        return fail("denied", `This computer refused access to ${what}.`, detail);
    if (code === "EISDIR")
        return fail("invalid-request", `${what} is a folder, not a file.`, detail);
    if (code === "ENOTDIR")
        return fail("invalid-request", `Part of the path to ${what} is not a folder.`, detail);
    return fail("command-failed", `Could not reach ${what}.`, detail);
}

export function createLocalProcessTransport(options: LocalProcessOptions): ServerTransport {
    const now = options.now ?? (() => new Date().toISOString());
    const spawnProcess = options.spawnProcess ?? spawn;
    // Built conditionally rather than with `writeScope: options.writeScope`, because
    // `exactOptionalPropertyTypes` draws a real distinction between "absent" and
    // "present and undefined" - and here they mean opposite things: absent is "the whole
    // server folder is writable", while an empty-or-undefined scope must never be read as
    // "nothing is writable" by a later change to `resolveForWrite`.
    const scope: ScopeOptions =
        options.writeScope === undefined
            ? { root: options.serverDir }
            : { root: options.serverDir, writeScope: options.writeScope };
    const ref: TransportRef = { kind: "local-process", serverDir: options.serverDir };

    const capabilities: TransportCapabilities = {
        canCreate: true,
        canLifecycle: true,
        canWriteFiles: true,
        canDestroy: true,
        console: "stdin",
    };

    /** The running child, or null. One server per transport, by construction. */
    let child: ChildProcess | null = null;
    let startedAt: string | null = null;
    let lastExitCode: number | null = null;

    async function probe(): Promise<Answer<TransportHealth>> {
        try {
            await access(options.javaPath, fsConstants.X_OK);
        } catch {
            return ok({
                reachable: false,
                runtimeVersion: null,
                message: "The Java runtime for this server is not available.",
                checkedAt: now(),
            });
        }
        return ok({
            reachable: true,
            runtimeVersion: null,
            message: "Ready to run on this computer.",
            checkedAt: now(),
        });
    }

    async function create(spec: ServerSpec): Promise<Answer<InstanceHandle>> {
        try {
            await mkdir(options.serverDir, { recursive: true });
        } catch (error) {
            return fromNodeError(error, "the server folder");
        }
        void spec;
        return ok({ ref, createdAt: now() });
    }

    async function start(): Promise<Answer<void>> {
        if (child !== null && child.exitCode === null) {
            // Already running is not a failure worth shouting about, but it must not
            // silently spawn a second JVM onto the same world folder - two servers writing
            // one world is how a world gets corrupted.
            return ok(undefined);
        }
        const args = [
            `-Xmx${options.memoryMb}M`,
            `-Xms${Math.min(options.memoryMb, 1024)}M`,
            ...(options.argsFile === undefined
                ? ["-jar", options.jarPath]
                : [`@${options.argsFile}`]),
            "nogui",
        ];
        try {
            const spawned = spawnProcess(options.javaPath, args, {
                cwd: options.serverDir,
                stdio: ["pipe", "pipe", "pipe"],
                windowsHide: true,
            });
            child = spawned;
            startedAt = now();
            lastExitCode = null;
            spawned.on("exit", (code) => {
                lastExitCode = code;
                startedAt = null;
            });
            return ok(undefined);
        } catch (error) {
            return fromNodeError(error, "the Java runtime");
        }
    }

    async function stop(stopOptions: StopOptions): Promise<Answer<void>> {
        const running = child;
        if (running === null || running.exitCode !== null)
            return fail("not-running", "That server is not running.");

        if (stopOptions.graceful) {
            // `stop` on stdin is what the server itself understands: it saves every world
            // and shuts down cleanly. A signal does not give it that chance, and the
            // difference is whatever players built since the last autosave.
            running.stdin?.write("stop\n");
        } else {
            running.kill("SIGTERM");
        }

        const timeout = stopOptions.timeoutMs > 0 ? stopOptions.timeoutMs : DEFAULT_STOP_TIMEOUT_MS;
        const exited = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), timeout);
            running.once("exit", () => {
                clearTimeout(timer);
                resolve(true);
            });
        });

        if (!exited) {
            return fail(
                "timeout",
                "That server did not shut down in time.",
                "It is still running. Stopping it by force would lose anything it has not saved.",
            );
        }
        return ok(undefined);
    }

    async function status(): Promise<Answer<InstanceStatus>> {
        const running = child !== null && child.exitCode === null;
        return ok({
            state: running ? "running" : lastExitCode === null ? "absent" : "exited",
            running,
            startedAt,
            exitCode: lastExitCode,
            checkedAt: now(),
        });
    }

    async function attach(attachOptions?: AttachOptions): Promise<Answer<ConsoleSession>> {
        const running = child;
        if (running === null || running.exitCode !== null) {
            return fail(
                "not-running",
                "That server is not running, so there is nothing to listen to.",
            );
        }
        void attachOptions;

        const queue: ConsoleLine[] = [];
        let push: (() => void) | null = null;
        let done = false;
        let exit: ConsoleExit = { reason: "detached", followerExitCode: null };

        const emit = (stream: ConsoleLine["stream"], text: string): void => {
            for (const line of text.split(/\r?\n/)) {
                if (line === "") continue;
                queue.push({ stream, text: line, at: now() });
            }
            push?.();
        };

        const onOut = (data: Buffer): void => emit("stdout", data.toString("utf8"));
        const onErr = (data: Buffer): void => emit("stderr", data.toString("utf8"));
        running.stdout?.on("data", onOut);
        running.stderr?.on("data", onErr);

        const finish = (reason: ConsoleExit["reason"], code: number | null): void => {
            if (done) return;
            done = true;
            exit = { reason, followerExitCode: code };
            running.stdout?.off("data", onOut);
            running.stderr?.off("data", onErr);
            push?.();
        };
        running.once("exit", (code) => finish("stream-ended", code));

        const closed = new Promise<ConsoleExit>((resolve) => {
            const check = (): void => {
                if (done && queue.length === 0) resolve(exit);
                else setTimeout(check, 10);
            };
            check();
        });

        const session: ConsoleSession = {
            id: randomUUID(),
            lines: {
                async *[Symbol.asyncIterator](): AsyncIterator<ConsoleLine> {
                    while (true) {
                        while (queue.length > 0) {
                            const line = queue.shift();
                            if (line !== undefined) yield line;
                        }
                        if (done) return;
                        await new Promise<void>((resolve) => {
                            push = resolve;
                        });
                        push = null;
                    }
                },
            },
            async send(command: string): Promise<Answer<void>> {
                if (done || running.exitCode !== null)
                    return fail("not-running", "That server is not running.");
                if (/[\r\n]/.test(command)) {
                    // One line in, one command run. A newline inside the string would run
                    // whatever follows it as a second command the user never confirmed.
                    return fail(
                        "invalid-request",
                        "A console command cannot contain a line break.",
                    );
                }
                running.stdin?.write(`${command}\n`);
                return ok(undefined);
            },
            closed,
            detach(): void {
                finish("detached", null);
            },
        };

        return ok(session);
    }

    async function fileList(dir: string): Promise<Answer<readonly FileEntry[]>> {
        const resolved = resolveInScope(dir, scope);
        if (!resolved.ok) return resolved;
        try {
            const entries = await readdir(resolved.value.absolute, { withFileTypes: true });
            const out: FileEntry[] = [];
            for (const entry of entries) {
                const kind: FileEntry["kind"] = entry.isDirectory()
                    ? "directory"
                    : entry.isSymbolicLink()
                      ? "symlink"
                      : entry.isFile()
                        ? "file"
                        : "other";
                let size: number | null = null;
                let modifiedAt: string | null = null;
                if (kind === "file") {
                    try {
                        const info = await stat(join(resolved.value.absolute, entry.name));
                        size = info.size;
                        modifiedAt = info.mtime.toISOString();
                    } catch {
                        // A file that vanished between listing and stat is still worth
                        // listing; reporting no size is better than dropping the row.
                    }
                }
                out.push({ name: entry.name, kind, size, modifiedAt });
            }
            return ok(out);
        } catch (error) {
            return fromNodeError(error, "that folder");
        }
    }

    async function fileRead(path: string, readOptions?: ReadOptions): Promise<Answer<FileBlob>> {
        const resolved = resolveInScope(path, scope);
        if (!resolved.ok) return resolved;
        const limit = readOptions?.maxBytes ?? MAX_FILE_BYTES;
        try {
            const info = await stat(resolved.value.absolute);
            if (info.isSymbolicLink()) {
                return fail(
                    "out-of-scope",
                    "That is a shortcut to somewhere else, which this server will not follow.",
                );
            }
            const bytes = await readFile(resolved.value.absolute);
            const truncated = bytes.byteLength > limit;
            const slice = truncated ? bytes.subarray(0, limit) : bytes;
            return ok({
                bytes: new Uint8Array(slice),
                hash: hashBytes(new Uint8Array(slice)),
                size: bytes.byteLength,
                truncated,
            });
        } catch (error) {
            return fromNodeError(error, "that file");
        }
    }

    async function fileWrite(
        path: string,
        blob: Uint8Array,
        writeOptions: WriteOptions,
    ): Promise<Answer<WriteReceipt>> {
        const resolved = resolveForWrite(path, scope);
        if (!resolved.ok) return resolved;
        const target = resolved.value.absolute;

        // The stale check and the backup both need to know whether the file is already
        // there, so read once and reuse the answer.
        let existing: Uint8Array | null = null;
        try {
            const bytes = await readFile(target);
            existing = new Uint8Array(bytes);
        } catch (error) {
            const code = (error as NodeError | null)?.code;
            if (code !== "ENOENT") return fromNodeError(error, "that file");
        }

        if (writeOptions.expectedHash !== null) {
            if (existing === null) {
                return fail(
                    "stale-document",
                    "That file is no longer there, so the change could not be applied to it.",
                );
            }
            if (!hashesMatch(hashBytes(existing), writeOptions.expectedHash)) {
                return fail(
                    "stale-document",
                    "That file changed on disk after it was opened here.",
                    "Something else - the server itself, or a plugin - rewrote it. Saving now would discard whatever it wrote.",
                );
            }
        }

        let backupPath: string | null = null;
        if (existing !== null && (writeOptions.backup ?? true)) {
            const stamp = now().replace(/[:.]/g, "-");
            backupPath = join(
                options.serverDir,
                BACKUP_DIR,
                `${resolved.value.relative.replace(/[\\/]/g, "_")}.${stamp}.bak`,
            );
            try {
                await mkdir(dirname(backupPath), { recursive: true });
                await copyFile(target, backupPath);
            } catch (error) {
                // A backup that cannot be taken means the write must not proceed. The
                // backup is the whole reason editing somebody else's config is safe.
                return fromNodeError(error, "the backup folder");
            }
        }

        try {
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, blob);
        } catch (error) {
            return fromNodeError(error, "that file");
        }

        return ok({ hash: hashBytes(blob), size: blob.byteLength, writtenAt: now(), backupPath });
    }

    async function fileDelete(path: string): Promise<Answer<void>> {
        const resolved = resolveForWrite(path, scope);
        if (!resolved.ok) return resolved;
        try {
            await rm(resolved.value.absolute, { force: false });
            return ok(undefined);
        } catch (error) {
            return fromNodeError(error, "that file");
        }
    }

    async function dirEnsure(path: string): Promise<Answer<void>> {
        const resolved = resolveForWrite(path, scope);
        if (!resolved.ok) return resolved;
        try {
            await mkdir(resolved.value.absolute, { recursive: true });
            return ok(undefined);
        } catch (error) {
            return fromNodeError(error, "that folder");
        }
    }

    return {
        ref,
        capabilities,
        probe,
        create,
        start,
        stop,
        status,
        attach,
        fileList,
        fileRead,
        fileWrite,
        fileDelete,
        dirEnsure,
    };
}
