/**
 * A server living in a container, wherever that container's daemon happens to be.
 *
 * This is the whole of the Docker support for both the local daemon and a daemon reached
 * over SSH. There is no second copy for the remote case: `localDocker.ts` and
 * `sshDocker.ts` are a few lines each that hand this file a different `CommandRunner` and
 * a different `FileChannel`, because `remote/ssh.ts` already returns exactly the
 * `CommandRunner` shape `runtime/command.ts` defines. If the two ever need to differ in
 * behaviour rather than in transport, that is a capability flag or a bug, not a fork.
 *
 * ## Why files move through a temporary file rather than a pipe
 *
 * The obvious design is `docker cp <container>:<path> -`, which writes a tar to stdout,
 * and stream it. It cannot work here: `CommandOutput.stdout` is a `string`. Bytes that are
 * not valid UTF-8 - every jar, every region file, a config saved in Latin-1 - are replaced
 * with U+FFFD on the way through, and the corruption is silent, one-way, and looks exactly
 * like a file that was always broken.
 *
 * So `docker cp` is pointed at a real file on the daemon's own machine, and the bytes are
 * moved from there by something that understands bytes: `fs` when the daemon is local, and
 * `scp` when it is not. It costs one temporary file per transfer and is impossible to get
 * subtly wrong.
 *
 * ## Why `docker cp` at all, rather than `exec cat`
 *
 * `docker cp` works on a STOPPED container, which matters more than it sounds: fixing a
 * bad config is the most common reason a server will not start, so the one moment a user
 * most needs to edit a file is the moment `exec` is unavailable. It also copies bytes
 * exactly, with no shell quoting to get wrong and no TTY translating line endings.
 */

import { randomUUID } from "node:crypto";

import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { hashBytes, hashesMatch } from "./hash.js";
import { resolveForWrite, resolveInScope, type ScopeOptions } from "./scope.js";
import {
    DEFAULT_STOP_TIMEOUT_MS,
    DEFAULT_TAIL_LINES,
    MAX_FILE_BYTES,
    detailFrom,
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
    type InstanceState,
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

/**
 * Moves bytes between this machine and the machine the Docker daemon runs on.
 *
 * The only thing that genuinely differs between the local and SSH transports. Local is a
 * pair of file reads; SSH is `scp`. Everything else in this file is identical for both,
 * which is the point.
 */
export interface FileChannel {
    /** A path on the daemon's machine that nothing else will use. */
    stagingPath(name: string): string;
    /** Reads a staged file into memory and removes it. */
    collect(stagedPath: string, maxBytes: number): Promise<Answer<Uint8Array>>;
    /** Writes bytes to a staged file on the daemon's machine. */
    deposit(stagedPath: string, bytes: Uint8Array): Promise<Answer<void>>;
    /** Best-effort cleanup. A staging file left behind is litter, not a failure. */
    discard(stagedPath: string): Promise<void>;
}

export interface DockerTransportOptions {
    readonly ref: TransportRef;
    readonly containerRef: string;
    readonly serverDir: string;
    readonly runner: CommandRunner;
    readonly files: FileChannel;
    readonly docker?: string;
    readonly writeScope?: readonly string[];
    readonly now?: () => string;
    /**
     * Overrides for a container WorldLens did not create.
     *
     * An adopted container is routinely readable and not writable, controllable and not
     * destroyable. Defaults here are what a container WorldLens made itself can do.
     */
    readonly capabilities?: Partial<TransportCapabilities>;
}

/** Matches a container reference we are willing to put on a command line. */
const CONTAINER_REF = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

interface InspectState {
    readonly Status?: unknown;
    readonly Running?: unknown;
    readonly StartedAt?: unknown;
    readonly ExitCode?: unknown;
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Turns a docker invocation into an answer.
 *
 * The distinction that matters is the first one: a runner that could not launch, or whose
 * error names a connection problem, means the DAEMON is unreachable and says nothing at
 * all about the server. Rendering that as "stopped" is how a user gets offered a restart
 * button for a server that is running perfectly well.
 */
function classify(output: CommandOutput, what: string): Answer<never> {
    const detail = detailFrom(output.stderr, output.stdout);
    if (output.spawnError !== null) {
        return fail("unreachable", "Docker is not available on that machine.", output.spawnError);
    }
    const stderr = output.stderr.toLowerCase();
    if (
        stderr.includes("cannot connect to the docker daemon") ||
        stderr.includes("is the docker daemon running") ||
        stderr.includes("connection refused") ||
        stderr.includes("connection reset") ||
        stderr.includes("no route to host") ||
        stderr.includes("could not resolve hostname") ||
        stderr.includes("permission denied (publickey")
    ) {
        return fail("unreachable", "That machine's Docker daemon could not be reached.", detail);
    }
    if (stderr.includes("no such container") || stderr.includes("no such file or directory")) {
        return fail("not-found", `${what} is not there.`, detail);
    }
    if (stderr.includes("permission denied") || stderr.includes("access denied")) {
        return fail("denied", `Docker refused access to ${what}.`, detail);
    }
    if (stderr.includes("is not running")) {
        return fail("not-running", "That container is not running.", detail);
    }
    return fail("command-failed", `Docker could not ${what}.`, detail);
}

export function createDockerTransport(options: DockerTransportOptions): ServerTransport {
    const now = options.now ?? (() => new Date().toISOString());
    const docker = options.docker ?? "docker";
    const container = options.containerRef;
    const scope: ScopeOptions =
        options.writeScope === undefined
            ? { root: options.serverDir }
            : { root: options.serverDir, writeScope: options.writeScope };

    const capabilities: TransportCapabilities = {
        canCreate: true,
        canLifecycle: true,
        canWriteFiles: true,
        canDestroy: true,
        console: "rcon",
        ...options.capabilities,
    };

    const run = (args: readonly string[], timeoutMs = 30_000): Promise<CommandOutput> =>
        options.runner(docker, args, { timeoutMs });

    function guardContainer<T>(): Answer<T> | null {
        if (!CONTAINER_REF.test(container)) {
            return fail("invalid-request", "That container name is not one this app will use.");
        }
        return null;
    }

    async function probe(): Promise<Answer<TransportHealth>> {
        const output = await run(["version", "--format", "{{.Server.Version}}"], 15_000);
        if (!output.ok) {
            const failure = classify(output, "reach Docker");
            return ok({
                reachable: false,
                runtimeVersion: null,
                message: failure.ok ? "" : failure.failure.message,
                checkedAt: now(),
            });
        }
        return ok({
            reachable: true,
            runtimeVersion: output.stdout.trim() || null,
            message: "Docker is ready on that machine.",
            checkedAt: now(),
        });
    }

    async function create(spec: ServerSpec): Promise<Answer<InstanceHandle>> {
        if (!capabilities.canCreate) {
            return fail("unsupported", "This server was not created by WorldLens, so it will not be recreated here.");
        }
        const guard = guardContainer<InstanceHandle>();
        if (guard !== null) return guard;
        if (spec.image === undefined || spec.image === "") {
            return fail("invalid-request", "A container image is required to create this server.");
        }

        const args = ["create", "--name", container];
        for (const port of spec.ports) {
            args.push("--publish", `${port.host}:${port.container}`);
        }
        for (const [key, value] of Object.entries(spec.env)) {
            if (/[\r\n\0]/.test(key) || /[\r\n\0]/.test(value)) {
                return fail("invalid-request", "A server setting contains a character that cannot be passed to Docker.");
            }
            args.push("--env", `${key}=${value}`);
        }
        args.push(spec.image);

        const output = await run(args, 120_000);
        if (!output.ok) return classify(output, "create that container");
        return ok({ ref: options.ref, createdAt: now() });
    }

    async function start(): Promise<Answer<void>> {
        if (!capabilities.canLifecycle) {
            return fail("unsupported", "WorldLens has not been given permission to start this server.");
        }
        const guard = guardContainer<void>();
        if (guard !== null) return guard;
        const output = await run(["start", container], 120_000);
        if (!output.ok) return classify(output, "start that container");
        return ok(undefined);
    }

    async function stop(stopOptions: StopOptions): Promise<Answer<void>> {
        if (!capabilities.canLifecycle) {
            return fail("unsupported", "WorldLens has not been given permission to stop this server.");
        }
        const guard = guardContainer<void>();
        if (guard !== null) return guard;

        const timeout = stopOptions.timeoutMs > 0 ? stopOptions.timeoutMs : DEFAULT_STOP_TIMEOUT_MS;
        // `docker stop -t` sends SIGTERM and waits before escalating, which is what a
        // Minecraft server needs to save every world. `kill` skips that grace entirely and
        // costs whatever has not been written since the last autosave.
        const args = stopOptions.graceful
            ? ["stop", "--timeout", String(Math.ceil(timeout / 1000)), container]
            : ["kill", container];
        const output = await run(args, timeout + 30_000);
        if (!output.ok) return classify(output, "stop that container");
        return ok(undefined);
    }

    async function status(): Promise<Answer<InstanceStatus>> {
        const guard = guardContainer<InstanceStatus>();
        if (guard !== null) return guard;

        const output = await run(["inspect", "--format", "{{json .State}}", container], 20_000);
        if (!output.ok) {
            const failure = classify(output, "inspect that container");
            // A container that is genuinely absent is a state, not an error - the UI needs
            // to show "not created yet" rather than a red banner.
            if (!failure.ok && failure.failure.code === "not-found") {
                return ok({ state: "absent", running: false, startedAt: null, exitCode: null, checkedAt: now() });
            }
            return failure;
        }

        let parsed: InspectState;
        try {
            parsed = JSON.parse(output.stdout.trim()) as InspectState;
        } catch {
            return fail("command-failed", "Docker's answer about that container could not be read.", output.stdout.slice(0, 500));
        }

        const raw = asString(parsed.Status);
        const state: InstanceState =
            raw === "running" || raw === "paused" || raw === "created" || raw === "exited" ? raw : "unknown";
        return ok({
            state,
            // Read from Docker's own boolean rather than inferred from anything else. This
            // is the probe the console layer trusts instead of a log stream ending.
            running: parsed.Running === true,
            startedAt: asString(parsed.StartedAt),
            exitCode: typeof parsed.ExitCode === "number" ? parsed.ExitCode : null,
            checkedAt: now(),
        });
    }

    async function fileList(dir: string): Promise<Answer<readonly FileEntry[]>> {
        const resolved = resolveInScope(dir, scope);
        if (!resolved.ok) return resolved;
        const guard = guardContainer<readonly FileEntry[]>();
        if (guard !== null) return guard;

        // `exec` needs a running container. Listing is the one operation where that is an
        // acceptable limit, because a stopped server's files are still reachable by path
        // for read and write - only browsing needs the container up.
        const output = await run(["exec", container, "ls", "-lA", "--time-style=long-iso", resolved.value.absolute], 20_000);
        if (!output.ok) return classify(output, "list that folder");

        const entries: FileEntry[] = [];
        for (const line of output.stdout.split(/\r?\n/)) {
            const match = /^([dl-])\S*\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+(.*)$/.exec(line);
            if (match === null) continue;
            const [, typeChar, size, modified, rawName] = match;
            if (typeChar === undefined || rawName === undefined) continue;
            const name = typeChar === "l" ? rawName.split(" -> ")[0] ?? rawName : rawName;
            entries.push({
                name,
                kind: typeChar === "d" ? "directory" : typeChar === "l" ? "symlink" : "file",
                size: typeChar === "-" && size !== undefined ? Number(size) : null,
                modifiedAt: modified === undefined ? null : `${modified.replace(" ", "T")}:00`,
            });
        }
        return ok(entries);
    }

    async function fileRead(path: string, readOptions?: ReadOptions): Promise<Answer<FileBlob>> {
        const resolved = resolveInScope(path, scope);
        if (!resolved.ok) return resolved;
        const guard = guardContainer<FileBlob>();
        if (guard !== null) return guard;

        const limit = readOptions?.maxBytes ?? MAX_FILE_BYTES;
        const staged = options.files.stagingPath(`read-${randomUUID()}`);
        try {
            const copied = await run(["cp", `${container}:${resolved.value.absolute}`, staged], 120_000);
            if (!copied.ok) return classify(copied, "that file");

            const collected = await options.files.collect(staged, limit + 1);
            if (!collected.ok) return collected;

            const bytes = collected.value;
            const truncated = bytes.byteLength > limit;
            const slice = truncated ? bytes.subarray(0, limit) : bytes;
            return ok({
                bytes: slice,
                hash: hashBytes(slice),
                size: bytes.byteLength,
                truncated,
            });
        } finally {
            await options.files.discard(staged);
        }
    }

    async function fileWrite(path: string, blob: Uint8Array, writeOptions: WriteOptions): Promise<Answer<WriteReceipt>> {
        if (!capabilities.canWriteFiles) {
            return fail("unsupported", "WorldLens has not been given permission to change this server's files.");
        }
        const resolved = resolveForWrite(path, scope);
        if (!resolved.ok) return resolved;
        const guard = guardContainer<WriteReceipt>();
        if (guard !== null) return guard;

        if (writeOptions.expectedHash !== null) {
            const current = await fileRead(path);
            if (!current.ok) {
                if (current.failure.code === "not-found") {
                    return fail("stale-document", "That file is no longer there, so the change could not be applied to it.");
                }
                return current;
            }
            if (current.value.truncated) {
                return fail(
                    "invalid-request",
                    "That file is too large to check safely before writing.",
                    "Editing it here could discard the part that was never read.",
                );
            }
            if (!hashesMatch(current.value.hash, writeOptions.expectedHash)) {
                return fail(
                    "stale-document",
                    "That file changed inside the container after it was opened here.",
                    "Something else - the server itself, or a plugin - rewrote it. Saving now would discard whatever it wrote.",
                );
            }
        }

        const staged = options.files.stagingPath(`write-${randomUUID()}`);
        try {
            const deposited = await options.files.deposit(staged, blob);
            if (!deposited.ok) return deposited;

            const copied = await run(["cp", staged, `${container}:${resolved.value.absolute}`], 120_000);
            if (!copied.ok) return classify(copied, "write that file");

            return ok({ hash: hashBytes(blob), size: blob.byteLength, writtenAt: now(), backupPath: null });
        } finally {
            await options.files.discard(staged);
        }
    }

    async function fileDelete(path: string): Promise<Answer<void>> {
        if (!capabilities.canWriteFiles) {
            return fail("unsupported", "WorldLens has not been given permission to change this server's files.");
        }
        const resolved = resolveForWrite(path, scope);
        if (!resolved.ok) return resolved;
        const guard = guardContainer<void>();
        if (guard !== null) return guard;

        const output = await run(["exec", container, "rm", "--", resolved.value.absolute], 30_000);
        if (!output.ok) return classify(output, "delete that file");
        return ok(undefined);
    }

    async function dirEnsure(path: string): Promise<Answer<void>> {
        if (!capabilities.canWriteFiles) {
            return fail("unsupported", "WorldLens has not been given permission to change this server's files.");
        }
        const resolved = resolveForWrite(path, scope);
        if (!resolved.ok) return resolved;
        const guard = guardContainer<void>();
        if (guard !== null) return guard;

        const output = await run(["exec", container, "mkdir", "-p", "--", resolved.value.absolute], 30_000);
        if (!output.ok) return classify(output, "create that folder");
        return ok(undefined);
    }

    async function attach(attachOptions?: AttachOptions): Promise<Answer<ConsoleSession>> {
        const guard = guardContainer<ConsoleSession>();
        if (guard !== null) return guard;

        const tail = attachOptions?.tail ?? DEFAULT_TAIL_LINES;
        const queue: ConsoleLine[] = [];
        let wake: (() => void) | null = null;
        let done = false;
        let exit: ConsoleExit = { reason: "detached", followerExitCode: null };
        const controller = new AbortController();

        const finish = (reason: ConsoleExit["reason"], code: number | null): void => {
            if (done) return;
            done = true;
            exit = { reason, followerExitCode: code };
            wake?.();
        };

        // A one-shot replay rather than a live follow. The supervising session layer above
        // re-reads on an interval and de-duplicates, which is what lets a dropped SSH
        // connection be re-established without the transcript doubling up.
        const output = await options.runner(
            docker,
            ["logs", "--tail", String(tail), container],
            { timeoutMs: 30_000, signal: controller.signal },
        );
        if (!output.ok) return classify(output, "read that server's log");

        for (const line of `${output.stdout}\n${output.stderr}`.split(/\r?\n/)) {
            if (line !== "") queue.push({ stream: "stdout", text: line, at: now() });
        }
        finish("stream-ended", output.exitCode);

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
                            wake = resolve;
                        });
                        wake = null;
                    }
                },
            },
            async send(command: string): Promise<Answer<void>> {
                if (capabilities.console === "none") {
                    return fail("unsupported", "This server's console can be read here but not written to.");
                }
                if (/[\r\n]/.test(command)) {
                    return fail("invalid-request", "A console command cannot contain a line break.");
                }
                if (capabilities.console !== "exec-helper") {
                    // RCON is owned by `rcon/client.ts`, not by the transport: it is a TCP
                    // conversation with the server, not a Docker operation, and it works
                    // identically on all three transports for exactly that reason.
                    return fail("unsupported", "Send this server's commands over RCON.");
                }
                const sent = await run(["exec", container, "mc-send-to-console", command], 20_000);
                if (!sent.ok) return classify(sent, "send that command");
                return ok(undefined);
            },
            closed: Promise.resolve(exit),
            detach(): void {
                controller.abort();
                finish("detached", null);
            },
        };

        return ok(session);
    }

    return {
        ref: options.ref,
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
