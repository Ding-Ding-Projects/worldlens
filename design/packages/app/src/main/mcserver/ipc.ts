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

import { join } from "node:path";

import type { IpcMain } from "electron";

import type { BackupRunnerOptions } from "../backup/runner.js";
import type { BackupRestoreRunnerOptions } from "../backup/restore.js";
import type { GitHubCallOptions } from "../backup/github.js";
import { discoverAdoptionCandidates } from "./adopt/discover.js";
import { refuseBulkAdoption, refuseSingleAdoption } from "./adopt/refuse.js";
import { computeFingerprint } from "./adopt/fingerprint.js";
import {
    capabilitiesForConsent,
    createAdoptionStore,
    type AdoptionConsent,
    type AdoptionRecord,
    type AdoptionStore,
} from "./adopt/record.js";
import { releaseAdoption } from "./adopt/release.js";
import { listWorlds } from "./adopt/worlds.js";
import { createServerBackup, listServerBackups, restoreServerBackup } from "./adopt/backups.js";
import { createTransport, type FactoryDeps } from "./transport/factory.js";
import { createLocalServer, type CreateLocalServerOptions } from "./create.js";
import type { FetchBinary } from "./install.js";
import { listCatalogue, refreshCatalogue, FLAVOUR_IDS, type FetchText, type FlavourId } from "./flavours/catalogue.js";
import { requiredJavaFeature } from "./flavours/javaRequirement.js";
import { createServerRegistry, type ServerRecord, type ServerRegistry } from "./registry.js";
import { checkCompatibility } from "./plugins/compatibility.js";
import { installPluginVersion } from "./plugins/install.js";
import { checkForUpdate, listInstalledPlugins, removePlugin, togglePlugin } from "./plugins/manage.js";
import { createHangarSource } from "./plugins/sources/hangar.js";
import { createModrinthSource } from "./plugins/sources/modrinth.js";
import { createSpigotSource } from "./plugins/sources/spigot.js";
import type { PluginFetchLike, PluginLoader, PluginSource, PluginSourceId } from "./plugins/types.js";
import { ConsoleSupervisor } from "./console/session.js";
import { buildPlayerCommand, parsePlayerList, type PlayerAction } from "./players/model.js";
import { runOneCommand, testConnection, type SocketFactory } from "./rcon/client.js";
import { realRconSocketFactory } from "./rcon/nodeSocket.js";
// Aliased: the web console module exports a type of the same name for the same Electron
// shape. Two lanes arrived at the same good name independently, which is a collision rather
// than a disagreement - importing both unaliased would simply not compile.
import { RconSecretStore } from "./rcon/secret.js";
import { fail, ok, type Answer, type ServerTransport, type TransportRef } from "./transport/types.js";
import { buildWebConsolePasswordRecord, type SafeStorageLike } from "./webconsole/password.js";
import { WebConsolePasswordStore } from "./webconsole/passwordStore.js";
import { startWebConsoleServer, type WebConsoleServerHandle } from "./webconsole/server.js";
import { discoverJava } from "../java/discovery.js";
import { provisionJava } from "../java/provision.js";
import type { JavaRunner } from "../java/probe.js";
import { REQUIRED_JAVA_FEATURE } from "../java/version.js";

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
    webConsoleStatus: "mcserver:webconsole:status",
    webConsoleStart: "mcserver:webconsole:start",
    webConsoleStop: "mcserver:webconsole:stop",
    webConsoleSetPassword: "mcserver:webconsole:setPassword",
    webConsoleBind: "mcserver:webconsole:bind",
    pluginsSearch: "mcserver:plugins:search",
    pluginsVersions: "mcserver:plugins:versions",
    pluginsInstall: "mcserver:plugins:install",
    pluginsList: "mcserver:plugins:list",
    pluginsToggle: "mcserver:plugins:toggle",
    pluginsRemove: "mcserver:plugins:remove",
    pluginsUpdates: "mcserver:plugins:updates",
    catalogueList: "mcserver:catalogue:list",
    catalogueRefresh: "mcserver:catalogue:refresh",
    javaResolve: "mcserver:java:resolve",
    javaProvision: "mcserver:java:provision",
    create: "mcserver:create",
    rconTest: "mcserver:rcon:test",
    consoleOpen: "mcserver:console:open",
    consoleSend: "mcserver:console:send",
    consoleClose: "mcserver:console:close",
    playersList: "mcserver:players:list",
    playersAction: "mcserver:players:action",
    adoptDiscover: "mcserver:adopt:discover",
    adopt: "mcserver:adopt",
    adoptRelease: "mcserver:adopt:release",
    worldsList: "mcserver:worlds:list",
    backupCreate: "mcserver:backup:create",
    backupList: "mcserver:backup:list",
    backupRestore: "mcserver:backup:restore",
} as const;

/** The console line shape pushed to the renderer as the session lives. Never the RCON password. */
export const MCSERVER_CONSOLE_LINE_EVENT = "mcserver:console:line";

export type McServerChannel = (typeof MCSERVER_CHANNELS)[keyof typeof MCSERVER_CHANNELS];

/** The slice of `IpcMain` this module uses, so a test can hand in a plain object. */
export type IpcMainLike = Pick<IpcMain, "handle" | "removeHandler">;

export interface McServerIpcOptions {
    readonly dataFolder: string;
    /** Where new servers' directories are created. Defaults to `<dataFolder>/servers`. */
    readonly serversRoot?: string;
    readonly factory?: FactoryDeps;
    /**
     * The operating system's credential vault.
     *
     * Two things need it and neither can fall back to writing a secret in the clear: the
     * RCON password this app generates for a server, and the web console's password hash.
     * Required rather than optional because the shell always has one to give, and a caller
     * that genuinely has no vault gets an honest refusal from the modules that need it -
     * `isEncryptionAvailable()` being false is a different answer from the vault being
     * absent, and only the first one is a machine's fault.
     */
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
    readonly registry?: ServerRegistry;
    readonly now?: () => string;
    readonly adoptions?: AdoptionStore;
    /**
     * This installation's own Docker ownership value - see `adopt/discover.ts`'s note on
     * `DiscoverOptions.ownerValue` for why this is not the label key.
     */
    readonly dockerOwnerValue?: string;
    readonly docker?: string;
    /**
     * Present only when this build wants server backups wired up at all - a backup needs a
     * signed-in GitHub account, which not every embedding of this feature has.
     */
    readonly backup?: {
        readonly runnerOptions: BackupRunnerOptions;
        readonly restoreRunnerOptions: BackupRestoreRunnerOptions;
        readonly githubCallOptions: GitHubCallOptions;
    };
    readonly schoolMode?: () => boolean;
    /** Injected for tests. Defaults to the global `fetch`, as `download/downloader.ts` does. */
    readonly pluginFetch?: PluginFetchLike;
    /** Injected for tests, so a source's own default API base need not be reached. */
    readonly pluginSources?: readonly PluginSource[];
    /** Injected in tests so the catalogue and Java channels never touch a real network. */
    readonly fetchText?: FetchText;
    readonly fetchBinary?: FetchBinary;
    readonly javaRunner?: JavaRunner;
    readonly javaExists?: (path: string) => boolean;
    readonly javaEnv?: NodeJS.ProcessEnv;
}

export interface McServerIpc {
    dispose(): void;
    readonly registry: ServerRegistry;
    readonly adoptions: AdoptionStore;
}

function isRecordId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function isPath(value: unknown): value is string {
    // Length and control characters only. Whether the path is *allowed* is decided by
    // `transport/scope.ts`, which is the one place that question is answered.
    return typeof value === "string" && value.length > 0 && value.length <= 4_096 && !/[\0\r\n]/.test(value);
}

function isPluginLoader(value: unknown): value is PluginLoader {
    return (
        value === "bukkit" ||
        value === "spigot" ||
        value === "paper" ||
        value === "purpur" ||
        value === "fabric" ||
        value === "forge" ||
        value === "neoforge"
    );
}

function isSourceId(value: unknown): value is PluginSourceId {
    return value === "modrinth" || value === "hangar" || value === "spigot";
}

function isFlavourId(value: unknown): value is FlavourId {
    return typeof value === "string" && (FLAVOUR_IDS as readonly string[]).includes(value);
}

function defaultRconHostFor(_ref: TransportRef): string {
    return "127.0.0.1";
}

export function registerMcServerHandlers(ipcMain: IpcMainLike, options: McServerIpcOptions): McServerIpc {
    const registry = options.registry ?? createServerRegistry({ dataFolder: options.dataFolder, ...(options.now === undefined ? {} : { now: options.now }) });
    const adoptions = options.adoptions ?? createAdoptionStore({ dataFolder: options.dataFolder, ...(options.now === undefined ? {} : { now: options.now }) });
    const now = options.now ?? (() => new Date().toISOString());
    const docker = options.docker ?? "docker";

    function isConsentBody(value: unknown): value is Partial<AdoptionConsent> {
        return typeof value === "object" && value !== null;
    }

    function readConsent(value: unknown): AdoptionConsent {
        const body = isConsentBody(value) ? value : {};
        return {
            configWrite: body.configWrite === true,
            lifecycle: body.lifecycle === true,
            pluginInstall: body.pluginInstall === true,
            consoleWrite: body.consoleWrite === true,
        };
    }

    const rconSecrets = new RconSecretStore({ dataFolder: options.dataFolder, safeStorage: options.safeStorage });
    const rconSocketFactory = options.rconSocketFactory ?? realRconSocketFactory;
    const rconHostFor = options.rconHostFor ?? defaultRconHostFor;
    /** Live console supervisors, keyed by the stable session id `console:open` handed out. */
    const consoleSessions = new Map<string, { readonly serverId: string; readonly supervisor: ConsoleSupervisor; unsubscribe(): void }>();

    const webConsolePasswordStore = new WebConsolePasswordStore(options.dataFolder);
    let webConsoleHandle: WebConsoleServerHandle | null = null;
    const serversRoot = options.serversRoot ?? join(options.dataFolder, "servers");

    const pluginFetch: PluginFetchLike = options.pluginFetch ?? ((url, init) => globalThis.fetch(url, init));
    const pluginSources: readonly PluginSource[] =
        options.pluginSources ?? [
            createModrinthSource({ fetch: pluginFetch }),
            createHangarSource({ fetch: pluginFetch }),
            createSpigotSource({ fetch: pluginFetch }),
        ];

    function findSource(sourceId: unknown): Answer<PluginSource> {
        if (!isSourceId(sourceId)) return fail("invalid-request", "That plugin source is not recognised.");
        const source = pluginSources.find((candidate) => candidate.id === sourceId);
        if (source === undefined) return fail("invalid-request", "That plugin source is not available.");
        return { ok: true, value: source };
    }

    /**
     * Looks a server up and builds its transport, in one step.
     *
     * Every command handler needs both, and doing it here means the write scope stored on
     * the record always reaches the transport. A handler that built a transport without it
     * would hand the renderer a path check that had quietly forgotten what the user
     * consented to on an adopted container.
     */
    async function open(id: unknown): Promise<Answer<{ record: ServerRecord; transport: ServerTransport; adoption: AdoptionRecord | null }>> {
        if (!isRecordId(id)) return fail("invalid-request", "That is not a server name this app can use.");
        const found = await registry.get(id);
        if (!found.ok) return found;

        // An adopted server's capabilities are exactly what its owner consented to, never
        // more - see `adopt/record.ts`'s `capabilitiesForConsent`. A server this app created
        // carries no adoption record at all, so its transport keeps whatever capabilities
        // `options.factory` already grants it.
        const adopted = found.value.origin === "adopted" ? await adoptions.get(id) : null;
        const adoptionRecord = adopted !== null && adopted.ok ? adopted.value : null;

        const built = createTransport(found.value.ref, {
            ...options.factory,
            writeScope: found.value.writeScope,
            ...(adoptionRecord === null
                ? {}
                : { capabilities: { ...options.factory?.capabilities, ...capabilitiesForConsent(adoptionRecord.consent) } }),
        });
        if (!built.ok) return built;
        return { ok: true, value: { record: found.value, transport: built.value, adoption: adoptionRecord } };
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

        [MCSERVER_CHANNELS.pluginsSearch]: async (_event: never, request: unknown) => {
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That search could not be read.");
            }
            const body = request as Record<string, unknown>;
            const source = findSource(body.sourceId);
            if (!source.ok) return source;
            if (typeof body.query !== "string" || body.query.trim() === "") {
                return fail("invalid-request", "A search needs something to search for.");
            }
            const loader = isPluginLoader(body.loader) ? body.loader : undefined;
            const gameVersion = typeof body.gameVersion === "string" ? body.gameVersion : undefined;
            const limit = typeof body.limit === "number" ? body.limit : undefined;
            return source.value.search({
                query: body.query,
                ...(loader === undefined ? {} : { loader }),
                ...(gameVersion === undefined ? {} : { gameVersion }),
                ...(limit === undefined ? {} : { limit }),
            });
        },

        [MCSERVER_CHANNELS.pluginsVersions]: async (_event: never, request: unknown) => {
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That request could not be read.");
            }
            const body = request as Record<string, unknown>;
            const source = findSource(body.sourceId);
            if (!source.ok) return source;
            if (typeof body.projectId !== "string" || body.projectId === "") {
                return fail("invalid-request", "That project is not recognised.");
            }
            const loader = isPluginLoader(body.loader) ? body.loader : undefined;
            const gameVersion = typeof body.gameVersion === "string" ? body.gameVersion : undefined;
            const versions = await source.value.versions(body.projectId, {
                ...(loader === undefined ? {} : { loader }),
                ...(gameVersion === undefined ? {} : { gameVersion }),
            });
            if (!versions.ok) return versions;

            // Compatibility is decided server-side, against the actual server record,
            // so the renderer never has to re-derive the same logic `compatibility.ts`
            // already owns.
            const serverId = body.serverId;
            if (isRecordId(serverId)) {
                const server = await registry.get(serverId);
                if (server.ok) {
                    return {
                        ok: true,
                        value: versions.value.map((version) => ({
                            version,
                            compatibility: checkCompatibility(server.value, version),
                        })),
                    };
                }
            }
            return {
                ok: true,
                value: versions.value.map((version) => ({ version, compatibility: null })),
            };
        },

        [MCSERVER_CHANNELS.pluginsInstall]: async (_event: never, id: unknown, request: unknown) => {
            const opened = await open(id);
            if (!opened.ok) return opened;
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That install could not be read.");
            }
            const body = request as Record<string, unknown>;
            if (typeof body.version !== "object" || body.version === null) {
                return fail("invalid-request", "That version could not be read.");
            }
            return installPluginVersion({
                fetch: pluginFetch,
                transport: opened.value.transport,
                version: body.version as never,
                ...(typeof body.pluginsDir === "string" ? { pluginsDir: body.pluginsDir } : {}),
                ...(typeof body.modsDir === "string" ? { modsDir: body.modsDir } : {}),
            });
        },

        [MCSERVER_CHANNELS.pluginsList]: async (_event: never, id: unknown, request: unknown) => {
            const opened = await open(id);
            if (!opened.ok) return opened;
            const body = typeof request === "object" && request !== null ? (request as Record<string, unknown>) : {};
            return listInstalledPlugins({
                transport: opened.value.transport,
                ...(typeof body.pluginsDir === "string" ? { pluginsDir: body.pluginsDir } : {}),
                ...(typeof body.modsDir === "string" ? { modsDir: body.modsDir } : {}),
            });
        },

        [MCSERVER_CHANNELS.pluginsToggle]: async (_event: never, id: unknown, request: unknown) => {
            const opened = await open(id);
            if (!opened.ok) return opened;
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That request could not be read.");
            }
            const body = request as Record<string, unknown>;
            if (!isPath(body.path)) return fail("invalid-request", "That file name cannot be used.");
            return togglePlugin({ transport: opened.value.transport, path: body.path, enable: body.enable === true });
        },

        [MCSERVER_CHANNELS.pluginsRemove]: async (_event: never, id: unknown, path: unknown) => {
            if (!isPath(path)) return fail("invalid-request", "That file name cannot be used.");
            const opened = await open(id);
            if (!opened.ok) return opened;
            return removePlugin({ transport: opened.value.transport, path });
        },

        [MCSERVER_CHANNELS.pluginsUpdates]: async (_event: never, request: unknown) => {
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That request could not be read.");
            }
            const body = request as Record<string, unknown>;
            const source = findSource(body.sourceId);
            if (!source.ok) return source;
            if (typeof body.projectId !== "string" || body.projectId === "") {
                return fail("invalid-request", "That project is not recognised.");
            }
            if (typeof body.installed !== "object" || body.installed === null) {
                return fail("invalid-request", "That installed plugin could not be read.");
            }
            return checkForUpdate({
                source: source.value,
                projectId: body.projectId,
                installed: body.installed as never,
            });
        },

        [MCSERVER_CHANNELS.catalogueList]: async () =>
            listCatalogue({
                dataDir: options.dataFolder,
                ...(options.fetchText === undefined ? {} : { fetchText: options.fetchText }),
            }),

        [MCSERVER_CHANNELS.catalogueRefresh]: async () =>
            refreshCatalogue({
                dataDir: options.dataFolder,
                ...(options.fetchText === undefined ? {} : { fetchText: options.fetchText }),
            }),

        [MCSERVER_CHANNELS.javaResolve]: async (_event: never, version: unknown) => {
            if (typeof version !== "string" || version.length === 0 || version.length > 64) {
                return fail("invalid-request", "That is not a version this app can resolve a Java requirement for.");
            }
            const requirement = requiredJavaFeature(version);
            const feature = requirement.known ? requirement.feature : REQUIRED_JAVA_FEATURE;
            const discovery = await discoverJava({
                dataDir: options.dataFolder,
                required: feature,
                ...(options.javaRunner === undefined ? {} : { runner: options.javaRunner }),
                ...(options.javaExists === undefined ? {} : { exists: options.javaExists }),
                ...(options.javaEnv === undefined ? {} : { env: options.javaEnv }),
            });
            return ok({
                requirement,
                installation: discovery.installation,
                rejected: discovery.rejected,
            });
        },

        /**
         * Downloads a Java runtime for a server that has none, and records it.
         *
         * The surface this serves used to state the problem and stop: "This server has no
         * Java runtime chosen yet", with nothing to press. The application knows which
         * version is needed, knows where to get it, and already has the code to fetch and
         * verify it - so leaving the reader to go and solve it themselves was the same
         * failure as telling somebody to go and start Docker.
         *
         * It resolves only once the runtime is genuinely installed and recorded, because a
         * handler that returned as soon as the download began would report success while
         * every following Start still failed for the same reason.
         */
        [MCSERVER_CHANNELS.javaProvision]: async (event: unknown, id: unknown) => {
            if (!isRecordId(id)) return fail("invalid-request", "That is not a server name this app can use.");
            const found = await registry.get(id);
            if (!found.ok) return found;

            const requirement = requiredJavaFeature(found.value.minecraftVersion ?? "");
            const feature = requirement.known ? requirement.feature : REQUIRED_JAVA_FEATURE;

            // Already there is a real answer, and a far better one than downloading two
            // hundred megabytes somebody already has.
            const discovery = await discoverJava({
                dataDir: options.dataFolder,
                required: feature,
                ...(options.javaRunner === undefined ? {} : { runner: options.javaRunner }),
                ...(options.javaExists === undefined ? {} : { exists: options.javaExists }),
                ...(options.javaEnv === undefined ? {} : { env: options.javaEnv }),
            });
            if (discovery.installation !== null) {
                return ok({ outcome: "already-installed", java: discovery.installation, feature });
            }

            const sender = (event as { sender?: { send?: (channel: string, ...args: unknown[]) => void } } | null)
                ?.sender;
            try {
                const record = await provisionJava({
                    dataDir: options.dataFolder,
                    feature,
                    // Progress is pushed rather than polled, so a long download can say what
                    // it is doing instead of showing a spinner that never changes.
                    onEvent: (progress) => {
                        try {
                            sender?.send?.("mcserver:java:progress", id, progress);
                        } catch {
                            // A renderer that has gone away is not a reason to abandon a
                            // download that is otherwise working.
                        }
                    },
                });
                return ok({ outcome: "installed", java: record, feature });
            } catch (error) {
                // `provisionJava` throws; every other handler here answers. Translated rather
                // than propagated, so the renderer keeps one shape to render.
                return fail(
                    "command-failed",
                    "That Java runtime could not be installed.",
                    error instanceof Error ? error.message : String(error),
                );
            }
        },

        [MCSERVER_CHANNELS.create]: async (_event: never, request: unknown) => {
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That server could not be created because its details were not readable.");
            }
            const body = request as Record<string, unknown>;
            if (!isRecordId(body.id) || typeof body.name !== "string" || body.name.trim() === "") {
                return fail("invalid-request", "A server needs a valid name to be created.");
            }
            if (!isFlavourId(body.flavour)) {
                return fail("invalid-request", "That is not a server flavour this app supports.");
            }
            if (typeof body.version !== "string" || body.version.length === 0) {
                return fail("invalid-request", "A server needs a version to be created.");
            }
            if (typeof body.memoryMb !== "number") {
                return fail("invalid-request", "A server needs a memory limit to be created.");
            }
            const createOptions: CreateLocalServerOptions = {
                id: body.id,
                name: body.name,
                flavour: body.flavour,
                version: body.version,
                memoryMb: body.memoryMb,
                acceptedEula: body.acceptedEula === true,
                dataDir: options.dataFolder,
                serversRoot,
                registry,
                ...(typeof body.provisionJavaIfMissing === "boolean"
                    ? { provisionJavaIfMissing: body.provisionJavaIfMissing }
                    : {}),
                ...(typeof body.fabricInstallerVersion === "string"
                    ? { fabricInstallerVersion: body.fabricInstallerVersion }
                    : {}),
                ...(options.now === undefined ? {} : { now: options.now }),
                ...(options.fetchText === undefined ? {} : { fetchText: options.fetchText }),
                ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
                ...(options.javaRunner === undefined ? {} : { javaRunner: options.javaRunner }),
                ...(options.javaExists === undefined ? {} : { javaExists: options.javaExists }),
                ...(options.javaEnv === undefined ? {} : { javaEnv: options.javaEnv }),
            };
            return createLocalServer(createOptions);
        },

        [MCSERVER_CHANNELS.webConsoleStatus]: async () => {
            return ok({
                running: webConsoleHandle !== null,
                host: webConsoleHandle?.host ?? null,
                port: webConsoleHandle?.port ?? null,
                hasPassword: (await webConsolePasswordStore.get()) !== null,
            });
        },

        [MCSERVER_CHANNELS.webConsoleStart]: async (_event: never, request: unknown) => {
            if (webConsoleHandle !== null) {
                return ok({ host: webConsoleHandle.host, port: webConsoleHandle.port });
            }
            if (options.safeStorage === undefined) {
                return fail("unsupported", "This build cannot offer the web console because it has no credential vault.");
            }
            const req = typeof request === "object" && request !== null ? (request as Record<string, unknown>) : {};
            const host = typeof req.host === "string" && req.host.length > 0 && req.host.length <= 253 ? req.host : undefined;
            const port = typeof req.port === "number" && Number.isInteger(req.port) && req.port >= 0 && req.port <= 65_535 ? req.port : undefined;
            const tlsTerminated = req.tlsTerminated === true;
            try {
                const handle = await startWebConsoleServer({
                    registry,
                    safeStorage: options.safeStorage,
                    dataFolder: options.dataFolder,
                    ...(options.factory === undefined ? {} : { factory: options.factory }),
                    ...(host === undefined ? {} : { host }),
                    ...(port === undefined ? {} : { port }),
                    tlsTerminated,
                    ...(options.schoolMode === undefined ? {} : { schoolMode: options.schoolMode }),
                });
                webConsoleHandle = handle;
                return ok({ host: handle.host, port: handle.port });
            } catch (error) {
                return fail("denied", "The web console could not be started.", String(error));
            }
        },

        [MCSERVER_CHANNELS.webConsoleStop]: async () => {
            if (webConsoleHandle === null) return ok(undefined);
            await webConsoleHandle.close();
            webConsoleHandle = null;
            return ok(undefined);
        },

        [MCSERVER_CHANNELS.webConsoleSetPassword]: async (_event: never, password: unknown) => {
            if (options.safeStorage === undefined) {
                return fail("unsupported", "This build cannot offer the web console because it has no credential vault.");
            }
            if (typeof password !== "string" || password.length === 0) {
                return fail("invalid-request", "A password is required.");
            }
            // The password crosses the bridge exactly once, inbound, to be hashed here -
            // never returned, never logged, never characterised.
            const record = await buildWebConsolePasswordRecord(options.safeStorage, password);
            if (record === null) {
                return fail("denied", "The password could not be saved.");
            }
            await webConsolePasswordStore.put(record);
            return ok(undefined);
        },

        [MCSERVER_CHANNELS.webConsoleBind]: async () => {
            return ok({
                running: webConsoleHandle !== null,
                host: webConsoleHandle?.host ?? null,
                port: webConsoleHandle?.port ?? null,
            });
        },

        [MCSERVER_CHANNELS.adoptDiscover]: async () => {
            const runner = options.factory?.runner;
            if (runner === undefined) {
                return fail("unsupported", "Discovering existing containers needs a way to run docker commands, which this build did not provide.");
            }
            return discoverAdoptionCandidates({ runner, docker, ...(options.dockerOwnerValue === undefined ? {} : { ownerValue: options.dockerOwnerValue }) });
        },

        [MCSERVER_CHANNELS.adopt]: async (_event: never, request: unknown) => {
            const runner = options.factory?.runner;
            if (runner === undefined) {
                return fail("unsupported", "Adopting a container needs a way to run docker commands, which this build did not provide.");
            }
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That adoption request could not be read.");
            }
            const body = request as Record<string, unknown>;
            if (!isRecordId(body.id) || typeof body.containerId !== "string" || body.containerId === "") {
                return fail("invalid-request", "That adoption request is missing a server name or a container to adopt.");
            }

            // Adopting is always one-at-a-time. This handler only ever names one
            // container, and `refuseBulkAdoption` is asserted here as a standing
            // reminder that nothing above this function is permitted to loop it.
            const bulkRefusal = refuseBulkAdoption([body.containerId]);
            if (bulkRefusal !== null) return fail("invalid-request", bulkRefusal.message);

            const discovered = await discoverAdoptionCandidates({
                runner,
                docker,
                ...(options.dockerOwnerValue === undefined ? {} : { ownerValue: options.dockerOwnerValue }),
            });
            if (!discovered.ok) return discovered;
            const candidate = discovered.value.find((entry) => entry.containerId === body.containerId);
            if (candidate === undefined) {
                return fail("not-found", "That container could not be found any more.");
            }

            const ownerValue = options.dockerOwnerValue ?? "";
            const refusals = refuseSingleAdoption(candidate, ownerValue);
            if (refusals.length > 0) {
                return fail("denied", refusals.map((r) => r.message).join(" "));
            }

            const mountSources = candidate.mounts.map((mount) => mount.source);
            const fingerprint = computeFingerprint({
                containerId: candidate.containerId,
                createdAt: candidate.createdAt ?? "",
                imageDigest: candidate.imageDigest,
                mountSources,
            });
            const serverDir = candidate.detected.serverDir ?? candidate.mounts[0]?.source ?? "";
            if (serverDir === "") {
                return fail("invalid-request", "This container has no server folder WorldLens could identify.");
            }

            const consent = readConsent(body.consent);
            const record: AdoptionRecord = {
                id: body.id,
                transport: { kind: "local-docker", containerRef: candidate.containerId, serverDir },
                containerId: candidate.containerId,
                containerName: candidate.containerName,
                fingerprint,
                adoptedAt: now(),
                // Docker has no supported way to label a container that already exists
                // without recreating it - see this module's own file header - so every
                // adoption starts, and stays, record-only.
                mode: "record-only",
                detected: { flavour: candidate.detected.flavour, minecraftVersion: candidate.detected.minecraftVersion },
                serverDir,
                writeScope: [],
                consent,
                preAdoptionBackup: null,
                releasedAt: null,
            };
            const saved = await adoptions.put(record);
            if (!saved.ok) return saved;

            const serverRecord: ServerRecord = {
                id: body.id,
                name: candidate.containerName,
                flavour: candidate.detected.flavour,
                minecraftVersion: candidate.detected.minecraftVersion,
                ref: record.transport,
                origin: "adopted",
                createdAt: now(),
                updatedAt: now(),
                hasRconSecret: false,
                rconPort: null,
                writeScope: [],
            };
            const savedServer = await registry.put(serverRecord);
            if (!savedServer.ok) return savedServer;

            return { ok: true, value: { adoption: saved.value, server: savedServer.value } };
        },

        [MCSERVER_CHANNELS.adoptRelease]: async (_event: never, id: unknown, request: unknown) => {
            if (!isRecordId(id)) return fail("invalid-request", "That is not a server name this app can use.");
            const body = typeof request === "object" && request !== null ? (request as Record<string, unknown>) : {};
            return releaseAdoption(adoptions, registry, id, { restoreSnapshot: body.restoreSnapshot === true });
        },

        [MCSERVER_CHANNELS.worldsList]: async (_event: never, id: unknown) => {
            const opened = await open(id);
            if (!opened.ok) return opened;
            const activeWorldName = null; // server.properties is read by listWorlds's caller when needed; unknown here is honest, not a guess.
            return listWorlds(opened.value.transport, opened.value.record.ref.serverDir, activeWorldName);
        },

        [MCSERVER_CHANNELS.backupCreate]: async (_event: never, id: unknown, request: unknown) => {
            if (options.backup === undefined) {
                return fail("unsupported", "Backups are not set up in this build.");
            }
            const opened = await open(id);
            if (!opened.ok) return opened;
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That backup request could not be read.");
            }
            const body = request as Record<string, unknown>;
            if (typeof body.owner !== "string" || typeof body.repo !== "string" || typeof body.worldFolder !== "string") {
                return fail("invalid-request", "A backup needs a world folder and a repository to back up to.");
            }
            return createServerBackup(options.backup.runnerOptions, {
                ref: opened.value.record.ref,
                worldFolder: body.worldFolder,
                owner: body.owner,
                repo: body.repo,
                adopted: opened.value.record.origin === "adopted",
                ...(typeof body.accountId === "string" ? { accountId: body.accountId } : {}),
                ...(body.acknowledgePublic === true ? { acknowledgePublic: true } : {}),
                ...(typeof body.resumeTag === "string" ? { resumeTag: body.resumeTag } : {}),
            });
        },

        [MCSERVER_CHANNELS.backupList]: async (_event: never, owner: unknown, repo: unknown) => {
            if (options.backup === undefined) {
                return fail("unsupported", "Backups are not set up in this build.");
            }
            if (typeof owner !== "string" || typeof repo !== "string") {
                return fail("invalid-request", "A repository owner and name are needed to list backups.");
            }
            return listServerBackups(owner, repo, options.backup.githubCallOptions);
        },

        [MCSERVER_CHANNELS.backupRestore]: async (_event: never, id: unknown, request: unknown) => {
            if (options.backup === undefined) {
                return fail("unsupported", "Backups are not set up in this build.");
            }
            const opened = await open(id);
            if (!opened.ok) return opened;
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That restore request could not be read.");
            }
            const body = request as Record<string, unknown>;
            if (typeof body.owner !== "string" || typeof body.repo !== "string" || typeof body.tag !== "string") {
                return fail("invalid-request", "A restore needs a repository owner, name and release tag.");
            }
            return restoreServerBackup(options.backup.restoreRunnerOptions, {
                ref: opened.value.record.ref,
                owner: body.owner,
                repo: body.repo,
                tag: body.tag,
                adopted: opened.value.record.origin === "adopted",
                ...(typeof body.accountId === "string" ? { accountId: body.accountId } : {}),
            });
        },
    };

    for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.handle(channel, handler as never);
    }

    return {
        registry,
        adoptions,
        dispose(): void {
            for (const entry of consoleSessions.values()) {
                entry.unsubscribe();
                entry.supervisor.close();
            }
            consoleSessions.clear();
            for (const channel of Object.keys(handlers)) {
                ipcMain.removeHandler(channel);
            }
            if (webConsoleHandle !== null) {
                void webConsoleHandle.close();
                webConsoleHandle = null;
            }
        },
    };
}
