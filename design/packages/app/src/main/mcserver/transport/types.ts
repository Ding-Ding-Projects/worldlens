/**
 * The one seam every Minecraft server feature is written against.
 *
 * A server can live in three places - as a process on this machine, in a container on the
 * local Docker daemon, or in a container on a Docker daemon reached over SSH - and the
 * whole point of this file is that nothing above it needs to know which. The console, the
 * config editor, the plugin manager and the backup runner all talk to a `ServerTransport`
 * and are written once.
 *
 * The economy that makes this affordable is `CommandRunner`. `remote/ssh.ts` already
 * exports `sshCommandRunner(options): CommandRunner`, which is the exact type
 * `runtime/command.ts` defines and `dockerhosting/manager.ts` already accepts. So the SSH
 * transport is not a third implementation of Docker - it is the Docker implementation
 * handed a different runner. Anything that ends up genuinely different between them is a
 * bug or a missing capability flag, not a reason for a parallel stack.
 *
 * Nothing here throws. Every call answers with `Answer<T>`, the same discriminated result
 * `dockerhosting/manager.ts` uses, because a server that is not running, a daemon that is
 * unreachable and a path that is out of scope are all ordinary answers a caller must
 * handle - and turning them into exceptions would make every caller wrap every call in the
 * same try/catch to turn them back into values.
 */

import type { CommandRunner } from "../../runtime/command.js";

/**
 * Where a server lives, and how to reach it.
 *
 * A tagged union rather than a bag of optional fields, so a `local-process` reference
 * cannot accidentally carry a container id and a container reference cannot accidentally
 * carry a host directory. `factory.ts` switches on `kind` once and nothing else has to.
 */
export type TransportRef =
    | { readonly kind: "local-process"; readonly serverDir: string }
    | { readonly kind: "local-docker"; readonly containerRef: string; readonly serverDir: string }
    | {
          readonly kind: "ssh-docker";
          readonly hostId: string;
          readonly containerRef: string;
          readonly serverDir: string;
      };

export type TransportKind = TransportRef["kind"];

/**
 * Why a call did not do what was asked.
 *
 * `unreachable` and `not-running` are deliberately separate, and keeping them apart is the
 * single most important distinction in this file. "I lost the SSH connection" and "the
 * server has stopped" look identical from a dropped log stream, and a UI that renders the
 * first as the second offers a restart button for a server that is running perfectly well,
 * full of players. `console/session.ts` judges liveness from a separate probe for exactly
 * this reason.
 */
export type TransportFailureCode =
    /** The machine or daemon could not be reached. Says nothing about the server. */
    | "unreachable"
    /** Reached it; the server or container is not running. */
    | "not-running"
    /** Reached it; it refused us. Permissions, an untrusted host key, a locked file. */
    | "denied"
    /** The container, file or directory is not there. */
    | "not-found"
    /** A write was gated on a hash and the file has moved since it was read. */
    | "stale-document"
    /** A path resolved outside the server root, or outside an adoption's write scope. */
    | "out-of-scope"
    /** The command ran and failed. `detail` carries what it said. */
    | "command-failed"
    /** The command did not answer in time. */
    | "timeout"
    /** The request itself was malformed. A caller bug, not a machine problem. */
    | "invalid-request"
    /** This transport cannot do this at all. Check `capabilities` before asking. */
    | "unsupported";

export interface TransportFailure {
    readonly code: TransportFailureCode;
    readonly message: string;
    /** What the underlying command said, truncated. Null when there was nothing to quote. */
    readonly detail: string | null;
}

export type Answer<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly failure: TransportFailure };

export function ok<T>(value: T): Answer<T> {
    return { ok: true, value };
}

export function fail<T = never>(
    code: TransportFailureCode,
    message: string,
    detail: string | null = null,
): Answer<T> {
    return { ok: false, failure: { code, message, detail } };
}

/** Trims a command's output into something short enough to show beside a failure. */
export function detailFrom(stderr: string, stdout: string): string | null {
    const text = `${stderr}\n${stdout}`.trim();
    return text === "" ? null : text.slice(0, 2_000);
}

/**
 * What this transport can actually do, asked rather than assumed.
 *
 * An adopted container is the reason this exists. WorldLens may be allowed to read a
 * container's files and follow its log while having no permission to write, no way to send
 * it a console command, and no business creating or destroying it. A UI that renders a
 * Start button it has no right to press is the decorative-control defect; these flags are
 * how a screen knows to disable it and say which condition is unmet.
 */
export interface TransportCapabilities {
    /** May bring a new server into existence here. False for every adopted container. */
    readonly canCreate: boolean;
    /** May start, stop and restart. */
    readonly canLifecycle: boolean;
    /** May write files under the server root. */
    readonly canWriteFiles: boolean;
    /** May remove the container or directory entirely. */
    readonly canDestroy: boolean;
    /**
     * How a console command can be delivered.
     *
     * `stdin` exists only for a local process. `exec-helper` is an image-provided console
     * helper. `rcon` works identically everywhere and is what makes a GUI player editor
     * possible, because it returns each command's reply. `none` means the console is
     * read-only, which is an honest state and must be rendered as one rather than as a
     * command box that silently discards what is typed into it.
     */
    readonly console: "stdin" | "exec-helper" | "rcon" | "none";
}

export interface TransportHealth {
    readonly reachable: boolean;
    /** Docker client/server version, or the Java version for a local process. */
    readonly runtimeVersion: string | null;
    /** A sentence fit to show a user. Never a raw stack trace. */
    readonly message: string;
    readonly checkedAt: string;
}

export type InstanceState = "absent" | "created" | "running" | "paused" | "exited" | "unknown";

export interface InstanceStatus {
    readonly state: InstanceState;
    /** True only when we positively observed it running. Never inferred from a log stream. */
    readonly running: boolean;
    readonly startedAt: string | null;
    readonly exitCode: number | null;
    readonly checkedAt: string;
}

/**
 * A file, read whole.
 *
 * Whole-file only, deliberately. `docker cp` is not a general filesystem - there are no
 * seeks and no partial writes - so offering an API richer than the weakest transport can
 * honour would mean three implementations that quietly differ. Config files and plugin
 * jars both fit this shape.
 *
 * `hash` is the write precondition. A caller reads, edits, and writes back quoting the
 * hash it read; if the file moved in between - a plugin rewrote it, the server flushed its
 * defaults on shutdown - the write is refused with `stale-document` rather than silently
 * discarding whatever changed underneath.
 */
export interface FileBlob {
    readonly bytes: Uint8Array;
    /** sha256 of `bytes`, lowercase hex. */
    readonly hash: string;
    readonly size: number;
    /** True when `maxBytes` cut the read short. The bytes are then a prefix, not the file. */
    readonly truncated: boolean;
}

export interface FileEntry {
    readonly name: string;
    readonly kind: "file" | "directory" | "symlink" | "other";
    readonly size: number | null;
    readonly modifiedAt: string | null;
}

export interface WriteReceipt {
    /** sha256 of what was actually written, so a caller can carry on without re-reading. */
    readonly hash: string;
    readonly size: number;
    readonly writtenAt: string;
    /** Where the pre-write copy went, when one was taken. Null when the file was new. */
    readonly backupPath: string | null;
}

export interface ReadOptions {
    /** Refuse to buffer more than this. Defaults to `MAX_FILE_BYTES`. */
    readonly maxBytes?: number;
    readonly signal?: AbortSignal;
}

export interface WriteOptions {
    /**
     * The hash the caller believes is currently on disk, or null to create a new file.
     *
     * Not optional-by-omission: a caller that genuinely means "overwrite whatever is there"
     * passes `expectedHash: null` and says so, which makes an unconditional write visible in
     * review rather than being what you get by forgetting a field.
     */
    readonly expectedHash: string | null;
    /** Copy the existing file aside before replacing it. Default true. */
    readonly backup?: boolean;
    readonly signal?: AbortSignal;
}

export interface ConsoleLine {
    readonly stream: "stdout" | "stderr" | "app";
    readonly text: string;
    readonly at: string;
}

export type ConsoleExitReason = "detached" | "stream-ended" | "unreachable" | "error";

export interface ConsoleExit {
    readonly reason: ConsoleExitReason;
    /**
     * The exit code of the *follower*, never of the server.
     *
     * `runtime/attach.ts` already records this trap: `docker logs --follow` is a separate
     * client process, and its exit code says only what happened to that client. Anything
     * wanting to know whether the server is alive calls `status()`.
     */
    readonly followerExitCode: number | null;
}

export interface AttachOptions {
    /** How many existing lines to replay on connect. */
    readonly tail?: number;
    readonly signal?: AbortSignal;
}

export interface ConsoleSession {
    readonly id: string;
    readonly lines: AsyncIterable<ConsoleLine>;
    /** Refused with `unsupported` when `capabilities.console` is `none`. */
    send(command: string): Promise<Answer<void>>;
    readonly closed: Promise<ConsoleExit>;
    /** Stops following. Never stops the server - see the note on `ConsoleExit`. */
    detach(): void;
}

/** Everything needed to bring a new server into existence. Filled out by Phase 2. */
export interface ServerSpec {
    readonly id: string;
    readonly name: string;
    /** Container image, for the Docker transports. Ignored by `local-process`. */
    readonly image?: string;
    /** Absolute path to the java binary, for `local-process`. Ignored by the Docker ones. */
    readonly javaPath?: string;
    readonly jarPath?: string;
    readonly memoryMb: number;
    readonly ports: readonly { readonly host: number; readonly container: number }[];
    readonly env: Readonly<Record<string, string>>;
}

export interface InstanceHandle {
    readonly ref: TransportRef;
    readonly createdAt: string;
}

export interface StopOptions {
    /**
     * Ask the server to save and shut down, rather than killing the process.
     *
     * A Minecraft server that is killed loses whatever was in memory since its last
     * autosave, which is somebody's afternoon. Graceful is the default everywhere, and the
     * ungraceful path is a deliberate, separately confirmed act.
     */
    readonly graceful: boolean;
    readonly timeoutMs: number;
}

export interface ServerTransport {
    readonly ref: TransportRef;
    readonly capabilities: TransportCapabilities;

    probe(): Promise<Answer<TransportHealth>>;
    create(spec: ServerSpec): Promise<Answer<InstanceHandle>>;
    start(): Promise<Answer<void>>;
    stop(options: StopOptions): Promise<Answer<void>>;
    status(): Promise<Answer<InstanceStatus>>;
    attach(options?: AttachOptions): Promise<Answer<ConsoleSession>>;

    fileList(dir: string): Promise<Answer<readonly FileEntry[]>>;
    fileRead(path: string, options?: ReadOptions): Promise<Answer<FileBlob>>;
    fileWrite(path: string, blob: Uint8Array, options: WriteOptions): Promise<Answer<WriteReceipt>>;
    fileDelete(path: string): Promise<Answer<void>>;
    dirEnsure(path: string): Promise<Answer<void>>;
}

/** Shared dependencies every transport takes, so none of them reaches for a global. */
export interface TransportDeps {
    readonly runner: CommandRunner;
    readonly docker?: string;
    readonly now?: () => string;
}

/** Refuse to buffer a file larger than this into memory. */
export const MAX_FILE_BYTES = 16 * 1024 * 1024;

/** How long a server is given to shut down cleanly before the caller must decide. */
export const DEFAULT_STOP_TIMEOUT_MS = 60_000;

/** Lines replayed when a console session connects or reconnects. */
export const DEFAULT_TAIL_LINES = 500;
