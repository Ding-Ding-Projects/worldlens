/**
 * The renderer's only way to reach a Minecraft server.
 *
 * Same shape as `locks/ipc.ts`: an exported channel map, one `register*` factory that
 * returns something disposable, and an `ipcMain` narrowed to the handful of methods used so
 * a test needs no Electron at all.
 *
 * Every handler validates its arguments and REFUSES rather than coercing. A renderer built
 * at a different time to this shell is a real situation - an update replaces one and not
 * the other for the length of a restart - and the failure that guards against is not a
 * crash. It is a plausible-looking argument reaching `docker` or the filesystem.
 */

import type { IpcMain } from "electron";

import { ConsoleSupervisor } from "./console/session.js";
import { buildPlayerCommand, parsePlayerList, type PlayerAction } from "./players/model.js";
import { runOneCommand, testConnection, type SocketFactory } from "./rcon/client.js";
import { realRconSocketFactory } from "./rcon/nodeSocket.js";
import { RconSecretStore, type SafeStorageLike } from "./rcon/secret.js";
import { createTransport, type FactoryDeps } from "./transport/factory.js";
import { createServerRegistry, type ServerRecord, type ServerRegistry } from "./registry.js";
import { fail, ok, type Answer, type ServerTransport, type TransportRef } from "./transport/types.js";

export const MCSERVER_CHANNELS = {
    list: "mcserver:list",
    get: "mcserver:get",
    save: "mcserver:save",
    forget: "mcserver:forget",
    probe: "mcserver:probe",
    status: "mcserver:status",
    start: "mcserver:start",
    stop: "mcserver:stop",
    fileList: "mcserver:file:list",
    fileRead: "mcserver:file:read",
    fileWrite: "mcserver:file:write",
    logTail: "mcserver:log:tail",
    rconTest: "mcserver:rcon:test",
    consoleOpen: "mcserver:console:open",
    consoleSend: "mcserver:console:send",
    consoleClose: "mcserver:console:close",
    playersList: "mcserver:players:list",
    playersAction: "mcserver:players:action",
} as const;

/** The console line shape pushed to the renderer as the session lives. Never the RCON password. */
export const MCSERVER_CONSOLE_LINE_EVENT = "mcserver:console:line";

export type McServerChannel = (typeof MCSERVER_CHANNELS)[keyof typeof MCSERVER_CHANNELS];

/** The slice of `IpcMain` this module uses, so a test can hand in a plain object. */
export type IpcMainLike = Pick<IpcMain, "handle" | "removeHandler">;

export interface McServerIpcOptions {
    readonly dataFolder: string;
    readonly factory?: FactoryDeps;
    readonly registry?: ServerRegistry;
    readonly now?: () => string;
    /** Where an RCON password is encrypted at rest. Required - see rcon/secret.ts. */
    readonly safeStorage: SafeStorageLike;
    /** Injectable so a test needs no real socket. Defaults to a real TCP connection. */
    readonly rconSocketFactory?: SocketFactory;
    /**
     * Where a server's RCON port is actually reachable.
     *
     * Every current transport publishes its RCON port on loopback (a local process
     * binds it directly; a Docker container has it mapped to the host), so "127.0.0.1"
     * is correct for `local-process` and `local-docker` today. An `ssh-docker` server's
     * RCON port is reachable from the far side of that SSH host rather than from this
     * machine's loopback - a caller wiring that transport in supplies its real address
     * here rather than this module inventing one.
     */
    readonly rconHostFor?: (ref: TransportRef) => string;
}

export interface McServerIpc {
    dispose(): void;
    readonly registry: ServerRegistry;
}

function isRecordId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function isPath(value: unknown): value is string {
    // Length and control characters only. Whether the path is *allowed* is decided by
    // `transport/scope.ts`, which is the one place that question is answered.
    return typeof value === "string" && value.length > 0 && value.length <= 4_096 && !/[\0\r\n]/.test(value);
}

function defaultRconHostFor(_ref: TransportRef): string {
    return "127.0.0.1";
}

export function registerMcServerHandlers(ipcMain: IpcMainLike, options: McServerIpcOptions): McServerIpc {
    const registry = options.registry ?? createServerRegistry({ dataFolder: options.dataFolder, ...(options.now === undefined ? {} : { now: options.now }) });
    const rconSecrets = new RconSecretStore({ dataFolder: options.dataFolder, safeStorage: options.safeStorage });
    const rconSocketFactory = options.rconSocketFactory ?? realRconSocketFactory;
    const rconHostFor = options.rconHostFor ?? defaultRconHostFor;
    /** Live console supervisors, keyed by the stable session id `console:open` handed out. */
    const consoleSessions = new Map<string, { readonly serverId: string; readonly supervisor: ConsoleSupervisor; unsubscribe(): void }>();

    /**
     * Looks a server up and builds its transport, in one step.
     *
     * Every command handler needs both, and doing it here means the write scope stored on
     * the record always reaches the transport. A handler that built a transport without it
     * would hand the renderer a path check that had quietly forgotten what the user
     * consented to on an adopted container.
     */
    async function open(id: unknown): Promise<Answer<{ record: ServerRecord; transport: ServerTransport }>> {
        if (!isRecordId(id)) return fail("invalid-request", "That is not a server name this app can use.");
        const found = await registry.get(id);
        if (!found.ok) return found;

        const built = createTransport(found.value.ref, {
            ...options.factory,
            writeScope: found.value.writeScope,
        });
        if (!built.ok) return built;
        return { ok: true, value: { record: found.value, transport: built.value } };
    }

    /**
     * Resolves the live RCON connection parameters for a server, or explains exactly why
     * it cannot: no port configured, or no password has been generated for it yet. The
     * password itself never leaves this function except folded straight into the
     * `RconClientOptions` a caller passes on to `rcon/client.ts` - it is never returned,
     * logged, or placed in a failure message.
     */
    async function openRcon(
        id: unknown,
    ): Promise<Answer<{ readonly host: string; readonly port: number; readonly password: string; readonly socketFactory: SocketFactory }>> {
        if (!isRecordId(id)) return fail("invalid-request", "That is not a server name this app can use.");
        const found = await registry.get(id);
        if (!found.ok) return found;
        if (found.value.rconPort === null) {
            return fail("invalid-request", "This server has no RCON port configured yet.");
        }
        if (!found.value.hasRconSecret) {
            return fail("invalid-request", "No RCON password has been generated for this server yet.");
        }
        const password = await rconSecrets.get(found.value.id);
        if (password === null) {
            return fail(
                "denied",
                "The RCON password for this server could not be unlocked from this machine's credential vault.",
            );
        }
        return ok({
            host: rconHostFor(found.value.ref),
            port: found.value.rconPort,
            password,
            socketFactory: rconSocketFactory,
        });
    }

    const handlers: Record<string, (...args: never[]) => Promise<unknown>> = {
        [MCSERVER_CHANNELS.list]: async () => registry.list(),

        [MCSERVER_CHANNELS.get]: async (_event: never, id: unknown) => {
            if (!isRecordId(id)) return fail("invalid-request", "That is not a server name this app can use.");
            return registry.get(id);
        },

        [MCSERVER_CHANNELS.save]: async (_event: never, value: unknown) => {
            if (typeof value !== "object" || value === null) {
                return fail("invalid-request", "That server could not be saved because its details were not readable.");
            }
            return registry.put(value as ServerRecord);
        },

        [MCSERVER_CHANNELS.forget]: async (_event: never, id: unknown) => {
            if (!isRecordId(id)) return fail("invalid-request", "That is not a server name this app can use.");
            // Forgetting, never deleting. The container or folder is untouched.
            return registry.remove(id);
        },

        [MCSERVER_CHANNELS.probe]: async (_event: never, id: unknown) => {
            const opened = await open(id);
            return opened.ok ? opened.value.transport.probe() : opened;
        },

        [MCSERVER_CHANNELS.status]: async (_event: never, id: unknown) => {
            const opened = await open(id);
            return opened.ok ? opened.value.transport.status() : opened;
        },

        [MCSERVER_CHANNELS.start]: async (_event: never, id: unknown) => {
            const opened = await open(id);
            return opened.ok ? opened.value.transport.start() : opened;
        },

        [MCSERVER_CHANNELS.stop]: async (_event: never, id: unknown, request: unknown) => {
            const opened = await open(id);
            if (!opened.ok) return opened;
            const options_ = typeof request === "object" && request !== null ? (request as Record<string, unknown>) : {};
            // Graceful unless the renderer explicitly said otherwise. A missing or
            // malformed flag must never be read as "kill it": that costs whatever the
            // server has not saved.
            const graceful = options_.graceful !== false;
            const timeoutMs =
                typeof options_.timeoutMs === "number" && options_.timeoutMs > 0 && options_.timeoutMs <= 600_000
                    ? options_.timeoutMs
                    : 60_000;
            return opened.value.transport.stop({ graceful, timeoutMs });
        },

        [MCSERVER_CHANNELS.fileList]: async (_event: never, id: unknown, dir: unknown) => {
            if (!isPath(dir)) return fail("invalid-request", "That folder name cannot be used.");
            const opened = await open(id);
            return opened.ok ? opened.value.transport.fileList(dir) : opened;
        },

        [MCSERVER_CHANNELS.fileRead]: async (_event: never, id: unknown, path: unknown) => {
            if (!isPath(path)) return fail("invalid-request", "That file name cannot be used.");
            const opened = await open(id);
            if (!opened.ok) return opened;
            const read = await opened.value.transport.fileRead(path);
            if (!read.ok) return read;
            // Bytes do not survive the structured clone boundary as a Uint8Array view in
            // every Electron version, and text is what every config editor wants anyway.
            // The hash still describes the BYTES, so the write guard stays exact.
            return {
                ok: true,
                value: {
                    text: Buffer.from(read.value.bytes).toString("utf8"),
                    hash: read.value.hash,
                    size: read.value.size,
                    truncated: read.value.truncated,
                },
            };
        },

        [MCSERVER_CHANNELS.fileWrite]: async (_event: never, id: unknown, path: unknown, request: unknown) => {
            if (!isPath(path)) return fail("invalid-request", "That file name cannot be used.");
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That change could not be read.");
            }
            const body = request as Record<string, unknown>;
            if (typeof body.text !== "string") {
                return fail("invalid-request", "That change could not be read.");
            }
            const expectedHash =
                typeof body.expectedHash === "string" && body.expectedHash.length <= 128 ? body.expectedHash : null;
            const opened = await open(id);
            if (!opened.ok) return opened;
            return opened.value.transport.fileWrite(path, new Uint8Array(Buffer.from(body.text, "utf8")), {
                expectedHash,
                backup: body.backup !== false,
            });
        },

        [MCSERVER_CHANNELS.logTail]: async (_event: never, id: unknown, lines: unknown) => {
            const opened = await open(id);
            if (!opened.ok) return opened;
            const tail = typeof lines === "number" && lines > 0 && lines <= 5_000 ? Math.floor(lines) : 500;
            const attached = await opened.value.transport.attach({ tail });
            if (!attached.ok) return attached;
            const collected: { stream: string; text: string; at: string }[] = [];
            for await (const line of attached.value.lines) {
                collected.push({ stream: line.stream, text: line.text, at: line.at });
                if (collected.length >= tail) break;
            }
            attached.value.detach();
            return { ok: true, value: collected };
        },

        // Proves the stored password and port actually work, without opening a lasting
        // connection or ever handing the password itself back to the renderer.
        [MCSERVER_CHANNELS.rconTest]: async (_event: never, id: unknown) => {
            const rconOptions = await openRcon(id);
            if (!rconOptions.ok) return rconOptions;
            return testConnection(rconOptions.value);
        },

        // Starts (or reuses, per-call - each open() gets its own supervisor and id) a
        // stable console session and pushes further lines to whichever renderer opened
        // it, over MCSERVER_CONSOLE_LINE_EVENT, for as long as that session stays open.
        [MCSERVER_CHANNELS.consoleOpen]: async (event: unknown, id: unknown, tail?: unknown) => {
            const opened = await open(id);
            if (!opened.ok) return opened;
            const tailLines = typeof tail === "number" && tail > 0 && tail <= 5_000 ? Math.floor(tail) : 200;

            const supervisor = new ConsoleSupervisor({ transport: opened.value.transport, tail: tailLines });
            const sender = (event as { sender?: { send(channel: string, ...args: unknown[]): void } } | undefined)?.sender;
            const unsubscribe = supervisor.onUpdate((update) => {
                try {
                    sender?.send(MCSERVER_CONSOLE_LINE_EVENT, supervisor.id, update);
                } catch {
                    /* The renderer window is gone; the session is torn down by consoleClose or dispose(). */
                }
            });
            consoleSessions.set(supervisor.id, { serverId: opened.value.record.id, supervisor, unsubscribe });
            supervisor.start();
            return { ok: true, value: { sessionId: supervisor.id } };
        },

        [MCSERVER_CHANNELS.consoleSend]: async (_event: never, id: unknown, sessionId: unknown, command: unknown) => {
            if (!isRecordId(id)) return fail("invalid-request", "That is not a server name this app can use.");
            if (typeof sessionId !== "string" || typeof command !== "string" || command.length === 0 || command.length > 2_000) {
                return fail("invalid-request", "That console command could not be read.");
            }
            const entry = consoleSessions.get(sessionId);
            if (entry === undefined || entry.serverId !== id) {
                return fail("invalid-request", "That console session is not open.");
            }
            return entry.supervisor.send(command);
        },

        [MCSERVER_CHANNELS.consoleClose]: async (_event: never, id: unknown, sessionId: unknown) => {
            if (!isRecordId(id)) return fail("invalid-request", "That is not a server name this app can use.");
            if (typeof sessionId !== "string") return fail("invalid-request", "That is not a real console session.");
            const entry = consoleSessions.get(sessionId);
            if (entry === undefined || entry.serverId !== id) return { ok: true, value: undefined };
            entry.unsubscribe();
            entry.supervisor.close();
            consoleSessions.delete(sessionId);
            return { ok: true, value: undefined };
        },

        // Player management runs over a fresh, short-lived RCON connection per call
        // rather than reusing an open console session - `list`/op/ban etc. are one-shot
        // requests and holding a second authenticated socket open for them would only be
        // one more thing that can go stale.
        [MCSERVER_CHANNELS.playersList]: async (_event: never, id: unknown) => {
            const rconOptions = await openRcon(id);
            if (!rconOptions.ok) return rconOptions;
            const reply = await runOneCommand(rconOptions.value, "list");
            if (!reply.ok) return reply;
            return parsePlayerList(reply.value);
        },

        [MCSERVER_CHANNELS.playersAction]: async (_event: never, id: unknown, request: unknown) => {
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That player action could not be read.");
            }
            const body = request as Record<string, unknown>;
            const validActions: readonly PlayerAction[] = [
                "op",
                "deop",
                "whitelist-add",
                "whitelist-remove",
                "kick",
                "ban",
                "pardon",
            ];
            if (typeof body.action !== "string" || !validActions.includes(body.action as PlayerAction)) {
                return fail("invalid-request", "That is not a recognised player action.");
            }
            if (typeof body.name !== "string") {
                return fail("invalid-request", "That is not a real player name.");
            }
            const built = buildPlayerCommand({
                action: body.action as PlayerAction,
                name: body.name,
                ...(typeof body.reason === "string" ? { reason: body.reason } : {}),
            });
            if (!built.ok) return built;

            const rconOptions = await openRcon(id);
            if (!rconOptions.ok) return rconOptions;
            return runOneCommand(rconOptions.value, built.value);
        },
    };

    for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.handle(channel, handler as never);
    }

    return {
        registry,
        dispose(): void {
            for (const entry of consoleSessions.values()) {
                entry.unsubscribe();
                entry.supervisor.close();
            }
            consoleSessions.clear();
            for (const channel of Object.keys(handlers)) {
                ipcMain.removeHandler(channel);
            }
        },
    };
}
