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

import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

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
import { createLocalDockerServer, createLocalServer, type CreateLocalServerOptions } from "./create.js";
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
import { applyConfigChanges, describeConfigFile } from "./config/describe.js";
import type { JavaRunner } from "../java/probe.js";
import { REQUIRED_JAVA_FEATURE } from "../java/version.js";
import { execFileCommandRunner, type CommandRunner } from "../runtime/command.js";
import { planAwsServer } from "./aws/plan.js";
import { provisionAwsServer } from "./aws/provision.js";
import { teardownAwsServer, type AwsTeardownTarget } from "./aws/teardown.js";
import { AWS_INSTANCE_TYPES, AWS_REGIONS } from "./aws/regions.js";
import type { AwsServerSpec } from "./aws/types.js";
import { listAccounts, setAccountAlias } from "./aws/accounts.js";
import { readCredits, type CreditsPeriod } from "./aws/credits.js";
import {
    createHostProfileStore,
    type HostProfileDraft,
    type HostProfileStore,
} from "./hostProfiles.js";
import { recordedFor, scanHostKeys, trustHostKey } from "../remote/hostkey.js";
import { openSshRconTunnel, type SshRconTunnel } from "./rcon/sshTunnel.js";
import { sshCommandRunner } from "../remote/ssh.js";

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
    configDescribe: "mcserver:config:describe",
    configApply: "mcserver:config:apply",
    create: "mcserver:create",
    rconTest: "mcserver:rcon:test",
    rconConfigure: "mcserver:rcon:configure",
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
    backupCancel: "mcserver:backup:cancel",
    backupList: "mcserver:backup:list",
    backupRestore: "mcserver:backup:restore",
    backupRestoreChallenge: "mcserver:backup:restore:challenge",
    backupRestoreIssue: "mcserver:backup:restore:issue",
    awsPlan: "mcserver:aws:plan",
    awsProvision: "mcserver:aws:provision",
    awsTeardown: "mcserver:aws:teardown",
    suggestFolder: "mcserver:suggestFolder",
    awsRegions: "mcserver:aws:regions",
    awsInstanceTypes: "mcserver:aws:instanceTypes",
    awsAccounts: "mcserver:aws:accounts",
    awsAccountAlias: "mcserver:aws:accountAlias",
    awsCredits: "mcserver:aws:credits",
    hostProfilesList: "mcserver:hostProfiles:list",
    hostProfileGet: "mcserver:hostProfiles:get",
    hostProfileSave: "mcserver:hostProfiles:save",
    hostProfileForget: "mcserver:hostProfiles:forget",
    hostProfileScan: "mcserver:hostProfiles:scan",
    hostProfileTrust: "mcserver:hostProfiles:trust",
} as const;

/** The console line shape pushed to the renderer as the session lives. Never the RCON password. */
export const MCSERVER_CONSOLE_LINE_EVENT = "mcserver:console:line";

export type McServerChannel = (typeof MCSERVER_CHANNELS)[keyof typeof MCSERVER_CHANNELS];

/** The slice of `IpcMain` this module uses, so a test can hand in a plain object. */
export type IpcMainLike = Pick<IpcMain, "handle" | "removeHandler">;

export interface McServerIpcOptions {
    readonly dataFolder: string;
    /**
     * Electron process.resourcesPath in a packaged app, null in development.
     *
     * The Java a server runs on is discovered here, and without this the runtime the
     * installer carries is never a candidate. That is the difference between a fresh
     * install opening a server normally and one telling the user no Java runtime has been
     * chosen while a working one sits unused in resources/bundled/java.
     */
    readonly resourcesPath?: string | null;
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
    /** Injectable profile store for tests; production uses the app-owned JSON store. */
    readonly hostProfiles?: HostProfileStore;
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
    /** Local ssh binary and tunnel opener are injectable so tests never spawn a process. */
    readonly ssh?: string;
    readonly sshRconTunnel?: typeof openSshRconTunnel;
    /** The `CommandRunner` the AWS provisioning/teardown channels run the `aws` CLI through. */
    readonly awsRunner?: CommandRunner;
    readonly aws?: string;
}

export interface McServerIpc {
    dispose(): void;
    readonly registry: ServerRegistry;
    readonly adoptions: AdoptionStore;
    readonly hostProfiles: HostProfileStore;
}

function isRecordId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function isPath(value: unknown): value is string {
    // Length and control characters only. Whether the path is *allowed* is decided by
    // `transport/scope.ts`, which is the one place that question is answered.
    return typeof value === "string" && value.length > 0 && value.length <= 4_096 && !/[\0\r\n]/.test(value);
}

export function safeContainerServerDir(value: string): boolean {
    const normalized = value.replace(/\/+$/, "") || "/";
    const recognized = normalized === "/data" || normalized === "/server" || normalized.startsWith("/data/") || normalized.startsWith("/server/");
    return recognized && normalized.length <= 512 && !/[\0\r\n]/.test(normalized) && !normalized.split("/").some((part) => part === "." || part === "..");
}

function recognizedContainerMount(destination: string): boolean {
    const lower = destination.toLowerCase();
    return lower === "/data" || lower === "/server";
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

/** Reads and validates an {@link AwsServerSpec} from an untrusted renderer payload. */
function readAwsServerSpec(request: unknown): AwsServerSpec | null {
    if (typeof request !== "object" || request === null) return null;
    const body = request as Record<string, unknown>;
    if (!isRecordId(body.serverId)) return null;
    if (typeof body.region !== "string" || body.region.length === 0) return null;
    if (typeof body.instanceType !== "string" || body.instanceType.length === 0) return null;
    if (typeof body.diskGiB !== "number" || !Number.isFinite(body.diskGiB) || body.diskGiB <= 0 || body.diskGiB > 16_384) return null;
    if (typeof body.staticAddress !== "boolean") return null;
    if (typeof body.amiId !== "string" || body.amiId.length === 0) return null;
    if (typeof body.keyPairName !== "string" || body.keyPairName.length === 0) return null;
    if (!Array.isArray(body.rules)) return null;
    const rules = body.rules.map((entry) => {
        const r = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
        return {
            port: typeof r.port === "number" ? r.port : -1,
            protocol: r.protocol === "udp" ? ("udp" as const) : ("tcp" as const),
            cidr: typeof r.cidr === "string" ? r.cidr : "",
            description: typeof r.description === "string" ? r.description : "",
        };
    });
    if (rules.some((r) => r.port < 1 || r.port > 65_535 || r.cidr === "")) return null;
    return {
        serverId: body.serverId,
        region: body.region,
        instanceType: body.instanceType,
        diskGiB: body.diskGiB,
        staticAddress: body.staticAddress,
        rules,
        amiId: body.amiId,
        keyPairName: body.keyPairName,
    };
}

/** Reads and validates an {@link AwsTeardownTarget} from an untrusted renderer payload. */
function readAwsTeardownTarget(request: unknown): AwsTeardownTarget | null {
    if (typeof request !== "object" || request === null) return null;
    const body = request as Record<string, unknown>;
    if (!isRecordId(body.serverId)) return null;
    if (typeof body.region !== "string" || body.region.length === 0) return null;
    const optionalString = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
    return {
        serverId: body.serverId,
        region: body.region,
        instanceId: optionalString(body.instanceId),
        elasticIpAllocationId: optionalString(body.elasticIpAllocationId),
        securityGroupId: optionalString(body.securityGroupId),
    };
}

export function registerMcServerHandlers(ipcMain: IpcMainLike, options: McServerIpcOptions): McServerIpc {
    const registry = options.registry ?? createServerRegistry({ dataFolder: options.dataFolder, ...(options.now === undefined ? {} : { now: options.now }) });
    const adoptions = options.adoptions ?? createAdoptionStore({ dataFolder: options.dataFolder, ...(options.now === undefined ? {} : { now: options.now }) });
    const hostProfiles = options.hostProfiles ?? createHostProfileStore({
        dataFolder: options.dataFolder,
        knownHostsFile: join(options.dataFolder, "known_hosts"),
        userKnownHostsFile: join(homedir(), ".ssh", "known_hosts"),
        ...(options.now === undefined ? {} : { now: options.now }),
    });
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
    const openRconTunnel = options.sshRconTunnel ?? openSshRconTunnel;
    const rconTunnels = new Map<string, SshRconTunnel>();
    const restoreReceipts = new Map<string, { readonly digest: string; readonly serverId: string; readonly target: string; readonly owner: string; readonly repo: string; readonly tag: string; readonly expiresAt: number }>();
    const restoreChallenges = new Map<string, { readonly digest: string; readonly serverId: string; readonly target: string; readonly owner: string; readonly repo: string; readonly tag: string; readonly expiresAt: number }>();
    const activeBackupControllers = new Map<string, AbortController>();
    const RESTORE_AUTH_LIMIT = 128;
    const sweepRestoreAuth = (): void => {
        const current = Date.now();
        for (const [digest, value] of restoreReceipts) if (value.expiresAt <= current) restoreReceipts.delete(digest);
        for (const [digest, value] of restoreChallenges) if (value.expiresAt <= current) restoreChallenges.delete(digest);
    };

    async function closeRconTunnelIfUnused(serverId: string): Promise<void> {
        const active = [...consoleSessions.values()].some((entry) => entry.serverId === serverId);
        if (active) return;
        const tunnel = rconTunnels.get(serverId);
        if (tunnel === undefined) return;
        rconTunnels.delete(serverId);
        await tunnel.close();
    }
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

        let sshHost = options.factory?.sshHost;
        if (sshHost === undefined && found.value.ref.kind === "ssh-docker") {
            // Load first so the store's synchronous factory lookup has a warm, validated
            // cache. A missing profile remains a typed not-found answer from the factory.
            await hostProfiles.get(found.value.ref.hostId);
            sshHost = (hostId) => hostProfiles.sshHost(hostId);
        }
        const built = createTransport(found.value.ref, {
            // The same `known_hosts` the remote-render side writes, so a host key trusted
            // once is trusted everywhere in this app - and never the user's own file, which
            // an application has no business appending to.
            //
            // Supplied here rather than left to the caller: the AWS transport requires it,
            // and a required dependency nobody passes is a transport that fails on its
            // first use with a message about a parameter rather than about the machine.
            awsKnownHostsFile: join(options.dataFolder, "known_hosts"),
            ...options.factory,
            ...(sshHost === undefined ? {} : { sshHost }),
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
        let host = rconHostFor(found.value.ref);
        let port = found.value.rconPort;
        if (found.value.ref.kind === "ssh-docker") {
            const profile = await hostProfiles.get(found.value.ref.hostId);
            if (!profile.ok) return profile;
            const ssh = hostProfiles.sshHost(found.value.ref.hostId);
            if (ssh === null) return fail("not-found", "The SSH host profile for this server is not available.");
            let tunnel = rconTunnels.get(found.value.id);
            if (tunnel === undefined) {
                const opened = await openRconTunnel({
                    ssh,
                    remotePort: found.value.rconPort,
                    ...(options.ssh === undefined ? {} : { sshBinary: options.ssh }),
                });
                if (!opened.ok) return opened;
                tunnel = opened.value;
                rconTunnels.set(found.value.id, tunnel);
            }
            host = "127.0.0.1";
            port = tunnel.localPort;
        }
        return ok({
            host,
            port,
            password,
            socketFactory: rconSocketFactory,
        });
    }

    async function adoptionRunner(hostId: unknown): Promise<Answer<{ runner: CommandRunner; hostId: string | null }>> {
        if (hostId === undefined || hostId === null || hostId === "") {
            const runner = options.factory?.runner;
            return runner === undefined
                ? fail("unsupported", "Adoption needs a Docker command runner in this build.")
                : ok({ runner, hostId: null });
        }
        if (!isRecordId(hostId)) return fail("invalid-request", "That SSH host profile id is not valid.");
        const profile = await hostProfiles.get(hostId);
        if (!profile.ok) return profile;
        const ssh = hostProfiles.sshHost(hostId);
        if (ssh === null) return fail("not-found", "That SSH host profile is not available.");
        return ok({
            runner: sshCommandRunner({ ...ssh, ...(options.factory?.runner === undefined ? {} : { runner: options.factory.runner }) }),
            hostId,
        });
    }

    function rconConsoleTransport(id: string, transport: ServerTransport): ServerTransport {
        if (transport.ref.kind !== "ssh-docker" || transport.capabilities.console === "none") return transport;
        return {
            ...transport,
            capabilities: { ...transport.capabilities, console: "rcon" },
            async attach(attachOptions) {
                const attached = await transport.attach(attachOptions);
                if (!attached.ok) return attached;
                return ok({
                    ...attached.value,
                    async send(command: string) {
                        const rcon = await openRcon(id);
                        if (!rcon.ok) return rcon;
                        const reply = await runOneCommand(rcon.value, command);
                        return reply.ok ? ok(undefined) : reply;
                    },
                });
            },
        };
    }

    const handlers: Record<string, (...args: never[]) => Promise<unknown>> = {
        [MCSERVER_CHANNELS.list]: async () => registry.list(),

        [MCSERVER_CHANNELS.hostProfilesList]: async () => hostProfiles.list(),

        [MCSERVER_CHANNELS.hostProfileGet]: async (_event: never, hostId: unknown) => {
            if (!isRecordId(hostId)) return fail("invalid-request", "That SSH host profile id is not valid.");
            return hostProfiles.get(hostId);
        },

        [MCSERVER_CHANNELS.hostProfileSave]: async (_event: never, request: unknown) => {
            if (typeof request !== "object" || request === null) return fail("invalid-request", "That SSH host profile could not be read.");
            const body = request as Record<string, unknown>;
            if (!isRecordId(body.hostId) || typeof body.target !== "object" || body.target === null) {
                return fail("invalid-request", "A host profile needs an id and connection details.");
            }
            return hostProfiles.save({ hostId: body.hostId, target: body.target as HostProfileDraft["target"] });
        },

        [MCSERVER_CHANNELS.hostProfileForget]: async (_event: never, hostId: unknown) => {
            if (!isRecordId(hostId)) return fail("invalid-request", "That SSH host profile id is not valid.");
            return hostProfiles.forget(hostId);
        },

        [MCSERVER_CHANNELS.hostProfileScan]: async (_event: never, hostId: unknown) => {
            if (!isRecordId(hostId)) return fail("invalid-request", "That SSH host profile id is not valid.");
            const profile = await hostProfiles.get(hostId);
            if (!profile.ok) return profile;
            const ssh = hostProfiles.sshHost(hostId);
            if (ssh === null) return fail("not-found", "That SSH host profile is not available.");
            const scanned = await scanHostKeys(profile.value.target, {
                knownHostsFile: ssh.knownHostsFile,
                ...(ssh.userKnownHostsFile === undefined ? {} : { userKnownHostsFile: ssh.userKnownHostsFile }),
                ...(options.factory?.runner === undefined ? {} : { runner: options.factory.runner }),
            });
            return ok({
                profile: profile.value,
                recorded: await recordedFor(profile.value.target, ssh.knownHostsFile),
                offers: scanned.offers,
                detail: scanned.detail,
            });
        },

        [MCSERVER_CHANNELS.hostProfileTrust]: async (_event: never, hostId: unknown, fingerprint: unknown) => {
            if (!isRecordId(hostId) || typeof fingerprint !== "string") return fail("invalid-request", "A host profile and fingerprint are required.");
            const profile = await hostProfiles.get(hostId);
            if (!profile.ok) return profile;
            const ssh = hostProfiles.sshHost(hostId);
            if (ssh === null) return fail("not-found", "That SSH host profile is not available.");
            const trusted = await trustHostKey(profile.value.target, fingerprint, {
                knownHostsFile: ssh.knownHostsFile,
                ...(ssh.userKnownHostsFile === undefined ? {} : { userKnownHostsFile: ssh.userKnownHostsFile }),
                ...(options.factory?.runner === undefined ? {} : { runner: options.factory.runner }),
            });
            return trusted.ok ? ok(trusted) : fail("denied", trusted.message);
        },

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

        [MCSERVER_CHANNELS.rconConfigure]: async (_event: never, id: unknown, request: unknown) => {
            if (!isRecordId(id) || typeof request !== "object" || request === null) {
                return fail("invalid-request", "RCON configuration needs a server id, port and password.");
            }
            const body = request as Record<string, unknown>;
            if (typeof body.port !== "number" || !Number.isInteger(body.port) || body.port < 1 || body.port > 65_535 ||
                typeof body.password !== "string" || body.password.length === 0 || body.password.length > 512) {
                return fail("invalid-request", "RCON configuration needs a valid port and password.");
            }
            if (!rconSecrets.vaultAvailable()) return fail("unsupported", "This build cannot store an RCON password in its credential vault.");
            const found = await registry.get(id);
            if (!found.ok) return found;
            const stored = await rconSecrets.put(id, body.password);
            if (!stored) return fail("denied", "The RCON password could not be stored in the credential vault.");
            const saved = await registry.put({ ...found.value, hasRconSecret: true, rconPort: body.port, updatedAt: now() });
            return saved.ok ? ok({ configured: true, port: body.port }) : saved;
        },

        // Starts (or reuses, per-call - each open() gets its own supervisor and id) a
        // stable console session and pushes further lines to whichever renderer opened
        // it, over MCSERVER_CONSOLE_LINE_EVENT, for as long as that session stays open.
        [MCSERVER_CHANNELS.consoleOpen]: async (event: unknown, id: unknown, tail?: unknown) => {
            const opened = await open(id);
            if (!opened.ok) return opened;
            const tailLines = typeof tail === "number" && tail > 0 && tail <= 5_000 ? Math.floor(tail) : 200;

            const supervisor = new ConsoleSupervisor({ transport: rconConsoleTransport(opened.value.record.id, opened.value.transport), tail: tailLines });
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
            await closeRconTunnelIfUnused(id);
            return { ok: true, value: undefined };
        },

        // Player management runs over a fresh, short-lived RCON connection per call
        // rather than reusing an open console session - `list`/op/ban etc. are one-shot
        // requests and holding a second authenticated socket open for them would only be
        // one more thing that can go stale.
        [MCSERVER_CHANNELS.playersList]: async (_event: never, id: unknown) => {
            const opened = await open(id);
            if (!opened.ok) return opened;
            if (opened.value.transport.capabilities.console === "none") {
                return fail("unsupported", "This server has not been granted console-write consent for player actions.");
            }
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

            const opened = await open(id);
            if (!opened.ok) return opened;
            if (opened.value.transport.capabilities.console === "none") {
                return fail("unsupported", "This server has not been granted console-write consent for player actions.");
            }
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
                kind: "config",
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
                ...(options.resourcesPath === undefined ? {} : { resourcesPath: options.resourcesPath }),
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
            if (!found.ok && found.failure.code !== "not-found") return found;
            // The create wizard asks for a runtime before a server record exists. A saved
            // server id still works, while a version or Java feature string is accepted as
            // the pre-creation form. No fake registry record is created for this probe.
            const version = found.ok ? found.value.minecraftVersion ?? "" : id;
            const requirement = requiredJavaFeature(version);
            const feature = requirement.known ? requirement.feature : REQUIRED_JAVA_FEATURE;

            // Already there is a real answer, and a far better one than downloading two
            // hundred megabytes somebody already has.
            const discovery = await discoverJava({
                dataDir: options.dataFolder,
                ...(options.resourcesPath === undefined ? {} : { resourcesPath: options.resourcesPath }),
                required: feature,
                ...(options.javaRunner === undefined ? {} : { runner: options.javaRunner }),
                ...(options.javaExists === undefined ? {} : { exists: options.javaExists }),
                ...(options.javaEnv === undefined ? {} : { env: options.javaEnv }),
            });
            if (discovery.installation !== null) {
                return ok({ outcome: "already-installed", java: discovery.installation, feature, version });
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
                            const phase = progress.stage === "downloading"
                                ? "downloading"
                                : progress.stage === "extracting" || progress.stage === "installing"
                                  ? "extracting"
                                  : progress.stage === "done"
                                    ? "done"
                                    : progress.stage === "verifying"
                                      ? "verifying"
                                      : "failed";
                            sender?.send?.("mcserver:java:progress", id, {
                                phase,
                                receivedBytes: progress.received ?? 0,
                                totalBytes: progress.total,
                                message: progress.message,
                            });
                        } catch {
                            // A renderer that has gone away is not a reason to abandon a
                            // download that is otherwise working.
                        }
                    },
                });
                return ok({ outcome: "installed", java: record, feature, version });
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

        /**
         * Every key of one configuration file, as a real control.
         *
         * The schemas, the parsers and the reconciler all existed in this process and none
         * of them could be reached from the interface, so the editor grew a partial copy of
         * one schema and showed a text box for everything else. This is the seam that was
         * missing rather than a new capability.
         */
        [MCSERVER_CHANNELS.configDescribe]: async (_event: never, id: unknown, path: unknown) => {
            if (!isPath(path)) return fail("invalid-request", "That file name cannot be used.");
            const opened = await open(id);
            if (!opened.ok) return opened;
            return describeConfigFile({
                transport: opened.value.transport,
                path,
                flavour: opened.value.record.flavour,
                version: opened.value.record.minecraftVersion ?? "",
            });
        },

        [MCSERVER_CHANNELS.configApply]: async (_event: never, id: unknown, path: unknown, request: unknown) => {
            if (!isPath(path)) return fail("invalid-request", "That file name cannot be used.");
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That change could not be read.");
            }
            const body = request as Record<string, unknown>;
            if (typeof body.expectedHash !== "string" || body.expectedHash === "") {
                // Without the hash there is nothing to check the file against, and an
                // unconditional write here would silently discard whatever the server or a
                // plugin wrote since it was opened.
                return fail("invalid-request", "That change did not say which version of the file it was made against.");
            }
            if (!Array.isArray(body.changes) || body.changes.length === 0) {
                return fail("invalid-request", "That change listed nothing to change.");
            }
            const changes = body.changes.map((entry) => {
                const record = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
                const path_ = Array.isArray(record.path)
                    ? record.path.filter((segment): segment is string => typeof segment === "string")
                    : [];
                return { path: path_, value: record.value };
            });
            if (changes.some((change) => change.path.length === 0)) {
                return fail("invalid-request", "One of those changes did not name a setting.");
            }

            const opened = await open(id);
            if (!opened.ok) return opened;
            return applyConfigChanges({
                transport: opened.value.transport,
                path,
                changes,
                expectedHash: body.expectedHash,
            });
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
            const runtime = body.runtime ?? body.transport ?? "local-process";
            if (runtime === "local-docker") {
                if (typeof body.dockerPlan !== "object" || body.dockerPlan === null) return fail("invalid-request", "A local Docker server needs its verified Docker plan.");
                const plan = body.dockerPlan as Record<string, unknown>;
                if (typeof plan.image !== "string" || typeof plan.containerRef !== "string" || typeof plan.serverDir !== "string" || !Array.isArray(plan.ports)) {
                    return fail("invalid-request", "The local Docker plan is incomplete.");
                }
                const ports = plan.ports.map((port) => typeof port === "object" && port !== null && typeof (port as Record<string, unknown>).host === "number" && typeof (port as Record<string, unknown>).container === "number"
                    ? { host: (port as Record<string, unknown>).host as number, container: (port as Record<string, unknown>).container as number }
                    : null);
                if (ports.some((port) => port === null)) return fail("invalid-request", "The local Docker plan contains an invalid port entry.");
                return createLocalDockerServer({
                    id: body.id,
                    name: body.name,
                    flavour: body.flavour,
                    version: body.version,
                    memoryMb: body.memoryMb,
                    acceptedEula: body.acceptedEula === true,
                    serversRoot,
                    registry,
                    dockerPlan: {
                        image: plan.image,
                        imageVerified: plan.imageVerified === true,
                        containerRef: plan.containerRef,
                        serverDir: plan.serverDir,
                        ports: ports.filter((port): port is { host: number; container: number } => port !== null),
                        ...(options.factory?.runner === undefined ? {} : { runner: options.factory.runner }),
                        ...(options.docker === undefined ? {} : { docker: options.docker }),
                    },
                    ...(options.now === undefined ? {} : { now: options.now }),
                });
            }
            if (runtime !== "local-process") return fail("invalid-request", "That server runtime is not supported by this build.");
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
                ...(typeof body.loaderVersion === "string"
                    ? { loaderVersion: body.loaderVersion }
                    : {}),
                ...(typeof body.modsDirectory === "string"
                    ? { modsDirectory: body.modsDirectory }
                    : {}),
                ...(Array.isArray(body.preinstallApiLibraries)
                    ? {
                          preinstallApiLibraries: body.preinstallApiLibraries.filter(
                              (value): value is string => typeof value === "string",
                          ),
                      }
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
                const loadedProfiles = await hostProfiles.list();
                if (!loadedProfiles.ok) return loadedProfiles;
                const factory = options.factory === undefined
                    ? { sshHost: (hostId: string) => hostProfiles.sshHost(hostId) }
                    : options.factory.sshHost === undefined
                      ? { ...options.factory, sshHost: (hostId: string) => hostProfiles.sshHost(hostId) }
                      : options.factory;
                const handle = await startWebConsoleServer({
                    registry,
                    safeStorage: options.safeStorage,
                    dataFolder: options.dataFolder,
                    factory,
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

        [MCSERVER_CHANNELS.adoptDiscover]: async (_event: never, request?: unknown) => {
            const body = typeof request === "object" && request !== null ? request as Record<string, unknown> : {};
            const selected = await adoptionRunner(body.hostId);
            if (!selected.ok) return selected;
            return discoverAdoptionCandidates({ runner: selected.value.runner, docker, ...(options.dockerOwnerValue === undefined ? {} : { ownerValue: options.dockerOwnerValue }) });
        },

        [MCSERVER_CHANNELS.adopt]: async (_event: never, request: unknown) => {
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That adoption request could not be read.");
            }
            const body = request as Record<string, unknown>;
            if (!isRecordId(body.id) || typeof body.containerId !== "string" || body.containerId === "") {
                return fail("invalid-request", "That adoption request is missing a server name or a container to adopt.");
            }
            const rconRaw = typeof body.rcon === "object" && body.rcon !== null ? body.rcon as Record<string, unknown> : null;
            const rconPort = rconRaw === null ? null : rconRaw.port;
            const rconPassword = rconRaw === null ? null : rconRaw.password;
            if (rconRaw !== null &&
                (typeof rconPort !== "number" || !Number.isInteger(rconPort) || rconPort < 1 || rconPort > 65_535 ||
                    typeof rconPassword !== "string" || rconPassword.length === 0 || rconPassword.length > 512)) {
                return fail("invalid-request", "Remote RCON needs a valid port and password, or no RCON configuration.");
            }
            if (rconRaw !== null && body.consent !== undefined &&
                (typeof body.consent !== "object" || body.consent === null || (body.consent as Record<string, unknown>).consoleWrite !== true)) {
                return fail("denied", "Remote RCON configuration requires the console-write consent switch.");
            }
            if (rconRaw !== null && !rconSecrets.vaultAvailable()) {
                return fail("unsupported", "This build cannot store the remote RCON password in its credential vault.");
            }
            const selected = await adoptionRunner(body.hostId);
            if (!selected.ok) return selected;
            const runner = selected.value.runner;

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
            // The mount source belongs to the Docker host. Transport paths are inside the
            // container, so persist the matching destination instead of a host filesystem
            // path that would make every later read target the wrong machine namespace.
            const explicitServerDir = typeof body.serverDir === "string" ? body.serverDir : null;
            const recognizedMount = candidate.mounts.find((mount) => recognizedContainerMount(mount.destination))?.destination ?? null;
            const serverDir = explicitServerDir ?? recognizedMount ?? "";
            if (!safeContainerServerDir(serverDir) || !candidate.mounts.some((mount) => mount.destination === serverDir)) {
                return fail("invalid-request", "This container has no safe recognized server mount. Choose an exact mounted /data or /server path.");
            }
            if (serverDir === "") {
                return fail("invalid-request", "This container has no server folder WorldLens could identify.");
            }

            const existingAdoption = await adoptions.get(body.id);
            if (existingAdoption.ok) return fail("denied", "That server id is already used by an adoption record.");
            if (!existingAdoption.ok && existingAdoption.failure.code !== "not-found") return existingAdoption;
            const existingServer = await registry.get(body.id);
            if (existingServer.ok) return fail("denied", "That server id is already used by a server record.");
            if (!existingServer.ok && existingServer.failure.code !== "not-found") return existingServer;

            const consent = readConsent(body.consent);
            const remote = selected.value.hostId !== null;
            const writeScope = candidate.detected.serverDir === null ? [] : ["."];
            const record: AdoptionRecord = {
                id: body.id,
                transport: remote
                    ? { kind: "ssh-docker", hostId: selected.value.hostId!, containerRef: candidate.containerId, serverDir }
                    : { kind: "local-docker", containerRef: candidate.containerId, serverDir },
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
                writeScope,
                consent,
                preAdoptionBackup: null,
                releasedAt: null,
            };
            const saved = await adoptions.put(record);
            if (!saved.ok) return saved;

            const adoptionIdentity = { id: record.id, containerId: record.containerId, fingerprint: record.fingerprint, adoptedAt: record.adoptedAt };
            const removeAdoptionIfOwned = async (): Promise<void> => {
                const current = await adoptions.get(adoptionIdentity.id);
                if (current.ok && current.value.containerId === adoptionIdentity.containerId && current.value.fingerprint === adoptionIdentity.fingerprint && current.value.adoptedAt === adoptionIdentity.adoptedAt) await adoptions.remove(adoptionIdentity.id);
            };

            const serverRecord: ServerRecord = {
                id: body.id,
                name: candidate.containerName,
                flavour: candidate.detected.flavour,
                minecraftVersion: candidate.detected.minecraftVersion,
                ref: record.transport,
                origin: "adopted",
                createdAt: now(),
                updatedAt: now(),
                hasRconSecret: rconRaw !== null,
                rconPort: rconRaw === null ? null : rconPort as number,
                writeScope,
            };
            const removeServerIfOwned = async (): Promise<void> => {
                const current = await registry.get(serverRecord.id);
                if (current.ok && current.value.origin === "adopted" && current.value.createdAt === serverRecord.createdAt && current.value.ref.kind === serverRecord.ref.kind && current.value.ref.serverDir === serverRecord.ref.serverDir) await registry.remove(serverRecord.id);
            };
            if (rconRaw !== null) {
                const stored = await rconSecrets.put(body.id, rconPassword as string);
                if (!stored) {
                    await rconSecrets.remove(body.id);
                    await removeServerIfOwned();
                    await removeAdoptionIfOwned();
                    return fail("denied", "The remote RCON password could not be stored in the credential vault.");
                }
            }
            const savedServer = await registry.put(serverRecord);
            if (!savedServer.ok) {
                if (rconRaw !== null) await rconSecrets.remove(body.id);
                await removeServerIfOwned();
                await removeAdoptionIfOwned();
                return savedServer;
            }

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
            if (!isRecordId(id)) return fail("invalid-request", "That backup server id could not be read.");
            const opened = await open(id);
            if (!opened.ok) return opened;
            if (typeof request !== "object" || request === null) {
                return fail("invalid-request", "That backup request could not be read.");
            }
            const body = request as Record<string, unknown>;
            if (typeof body.owner !== "string" || typeof body.repo !== "string" || typeof body.worldFolder !== "string") {
                return fail("invalid-request", "A backup needs a world folder and a repository to back up to.");
            }
            if (opened.value.record.origin === "adopted" && body.backupConsent !== true) {
                return fail("denied", "Backing up an adopted server needs explicit backup consent.");
            }
            const controller = new AbortController();
            activeBackupControllers.set(id, controller);
            try {
                return await createServerBackup(options.backup.runnerOptions, {
                    ref: opened.value.record.ref,
                    transport: opened.value.transport,
                    worldFolder: body.worldFolder,
                    owner: body.owner,
                    repo: body.repo,
                    adopted: opened.value.record.origin === "adopted",
                    signal: controller.signal,
                    ...(typeof body.accountId === "string" ? { accountId: body.accountId } : {}),
                    ...(body.acknowledgePublic === true ? { acknowledgePublic: true } : {}),
                    ...(typeof body.resumeTag === "string" ? { resumeTag: body.resumeTag } : {}),
                });
            } finally {
                activeBackupControllers.delete(id);
            }
        },

        [MCSERVER_CHANNELS.backupCancel]: async (_event: never, id: unknown) => {
            if (!isRecordId(id)) return fail("invalid-request", "That backup id could not be read.");
            const controller = activeBackupControllers.get(id);
            if (controller === undefined) return fail("not-found", "That backup is not active in this process.");
            controller.abort();
            return ok({ cancelled: true });
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

        [MCSERVER_CHANNELS.backupRestoreChallenge]: async (_event: never, id: unknown, request: unknown) => {
            sweepRestoreAuth();
            if (!isRecordId(id) || typeof request !== "object" || request === null) return fail("invalid-request", "A restore challenge needs a server and backup identity.");
            const body = request as Record<string, unknown>;
            if (typeof body.owner !== "string" || typeof body.repo !== "string" || typeof body.tag !== "string") return fail("invalid-request", "A restore challenge needs a repository owner, name and release tag.");
            const opened = await open(id);
            if (!opened.ok) return opened;
            const target = typeof body.worldFolder === "string" ? body.worldFolder : opened.value.record.ref.serverDir;
            if (!safeContainerServerDir(target) || !(target === opened.value.record.ref.serverDir || target.startsWith(`${opened.value.record.ref.serverDir.replace(/\/$/, "")}/`))) return fail("invalid-request", "The restore target is outside this server's recognized folder.");
            if (restoreChallenges.size + restoreReceipts.size >= RESTORE_AUTH_LIMIT) return fail("timeout", "Too many restore confirmations are waiting. Complete one or wait for them to expire.");
            const challenge = randomBytes(32).toString("hex");
            const digest = createHash("sha256").update(challenge).digest("hex");
            const expiresAt = Date.now() + 60_000;
            restoreChallenges.set(digest, { digest, serverId: id, target, owner: body.owner, repo: body.repo, tag: body.tag, expiresAt });
            return ok({ challenge, expiresAt });
        },

        [MCSERVER_CHANNELS.backupRestoreIssue]: async (_event: never, id: unknown, request: unknown) => {
            sweepRestoreAuth();
            if (!isRecordId(id) || typeof request !== "object" || request === null) return fail("invalid-request", "A restore confirmation needs a server and backup identity.");
            const body = request as Record<string, unknown>;
            if (typeof body.challenge !== "string" || typeof body.owner !== "string" || typeof body.repo !== "string" || typeof body.tag !== "string") {
                return fail("denied", "This restore needs the main-process challenge and native confirmation evidence.");
            }
            const proof = typeof body.proof === "object" && body.proof !== null ? body.proof as Record<string, unknown> : {};
            if (proof.keyOne !== true || proof.keyTwo !== true || proof.travel !== 100) return fail("denied", "The two independent confirmation keys and the full slider travel are required.");
            const opened = await open(id);
            if (!opened.ok) return opened;
            const target = typeof body.worldFolder === "string" ? body.worldFolder : opened.value.record.ref.serverDir;
            if (!safeContainerServerDir(target) || !(target === opened.value.record.ref.serverDir || target.startsWith(`${opened.value.record.ref.serverDir.replace(/\/$/, "")}/`))) {
                return fail("invalid-request", "The restore target is outside this server's scoped folder.");
            }
            const challengeDigest = createHash("sha256").update(body.challenge).digest("hex");
            const challenge = restoreChallenges.get(challengeDigest);
            if (challenge === undefined || challenge.expiresAt < Date.now() || challenge.serverId !== id || challenge.target !== target || challenge.owner !== body.owner || challenge.repo !== body.repo || challenge.tag !== body.tag) return fail("denied", "This native confirmation challenge is expired, already used, or scoped to another restore.");
            restoreChallenges.delete(challengeDigest);
            if (restoreReceipts.size >= RESTORE_AUTH_LIMIT) return fail("timeout", "Too many restore receipts are waiting. Complete one or wait for them to expire.");
            const receipt = randomBytes(32).toString("hex");
            const digest = createHash("sha256").update(receipt).digest("hex");
            const expiresAt = Date.now() + 60_000;
            restoreReceipts.set(digest, { digest, serverId: id, target, owner: body.owner, repo: body.repo, tag: body.tag, expiresAt });
            return ok({ receipt, expiresAt });
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
            if (typeof body.restoreReceipt !== "string" || body.restoreReceipt.length < 16) {
                return fail("denied", "This restore needs a fresh main-process destructive confirmation receipt.");
            }
            const receiptDigest = createHash("sha256").update(body.restoreReceipt).digest("hex");
            const issued = restoreReceipts.get(receiptDigest);
            const requestedTarget = typeof body.worldFolder === "string" ? body.worldFolder : opened.value.record.ref.serverDir;
            if (issued === undefined || issued.expiresAt < Date.now() || issued.serverId !== id || issued.owner !== body.owner || issued.repo !== body.repo || issued.tag !== body.tag || issued.target !== requestedTarget) {
                return fail("denied", "This restore receipt is expired, already used, or scoped to another server or backup.");
            }
            if (opened.value.record.origin === "adopted" && body.restoreConsent !== true) {
                return fail("denied", "Restoring an adopted server needs dedicated restore consent.");
            }
            restoreReceipts.delete(receiptDigest);
            const restoreTransport = opened.value.record.origin === "adopted"
                ? {
                      ...opened.value.transport,
                      // Dedicated restore consent and the destructive receipt are per-call,
                      // separate from the four persistent adoption switches.
                      capabilities: { ...opened.value.transport.capabilities, canBackupRestore: true },
                  }
                : opened.value.transport;
            return restoreServerBackup(options.backup.restoreRunnerOptions, {
                ref: opened.value.record.ref,
                owner: body.owner,
                repo: body.repo,
                tag: body.tag,
                adopted: opened.value.record.origin === "adopted",
                transport: restoreTransport,
                targetFolder: typeof body.worldFolder === "string" ? body.worldFolder : opened.value.record.ref.serverDir,
                ...(typeof body.accountId === "string" ? { accountId: body.accountId } : {}),
            });
        },

        /**
         * The bill, before anything is created. Pure - `planAwsServer` never touches AWS -
         * so this channel answers instantly and offline, which is exactly what a screen
         * showing "here is what this will cost" needs.
         */
        [MCSERVER_CHANNELS.awsPlan]: async (_event: never, request: unknown) => {
            const spec = readAwsServerSpec(request);
            if (spec === null) return fail("invalid-request", "That AWS server description could not be read.");
            return { ok: true, value: planAwsServer(spec) };
        },

        [MCSERVER_CHANNELS.awsProvision]: async (_event: never, request: unknown) => {
            const spec = readAwsServerSpec(request);
            if (spec === null) return fail("invalid-request", "That AWS server description could not be read.");
            const runner = options.awsRunner ?? execFileCommandRunner;
            return provisionAwsServer(planAwsServer(spec), { runner, ...(options.aws === undefined ? {} : { aws: options.aws }) });
        },

        [MCSERVER_CHANNELS.awsTeardown]: async (_event: never, request: unknown) => {
            const target = readAwsTeardownTarget(request);
            if (target === null) return fail("invalid-request", "That AWS server could not be identified for teardown.");
            const runner = options.awsRunner ?? execFileCommandRunner;
            return teardownAwsServer(target, { runner, ...(options.aws === undefined ? {} : { aws: options.aws }) });
        },

        // Where a new server should live, so the folder field arrives filled in.
        //
        // An empty path field is a question the app can already answer: it owns a servers
        // directory and has since the registry was written. Leaving it blank asked every
        // user to type or browse to a location the app was going to choose anyway, and an
        // empty value was also the thing that made the creation wizard unfinishable.
        [MCSERVER_CHANNELS.suggestFolder]: async (_event: unknown, name?: unknown) => {
            // Only a plain folder-name fragment is ever appended, so a crafted name cannot
            // climb out of the servers directory.
            const raw = typeof name === "string" ? name.trim() : "";
            const safe = raw.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 64);
            return { ok: true, value: safe === "" ? serversRoot : join(serversRoot, safe) };
        },

        [MCSERVER_CHANNELS.awsRegions]: async () => ({ ok: true, value: AWS_REGIONS }),

        [MCSERVER_CHANNELS.awsInstanceTypes]: async () => ({ ok: true, value: AWS_INSTANCE_TYPES }),

        /** Every AWS account this machine can reach, read fresh from the CLI's own profiles. */
        [MCSERVER_CHANNELS.awsAccounts]: async () => {
            const runner = options.awsRunner ?? execFileCommandRunner;
            return listAccounts({ runner, ...(options.aws === undefined ? {} : { aws: options.aws }) });
        },

        /** Names an account. Refused before the call when the alias itself could not be valid. */
        [MCSERVER_CHANNELS.awsAccountAlias]: async (_event: never, request: unknown) => {
            const body = request as { profile?: unknown; alias?: unknown } | null;
            if (body === null || typeof body !== "object" || typeof body.profile !== "string" || typeof body.alias !== "string") {
                return fail("invalid-request", "That account naming request could not be read.");
            }
            const runner = options.awsRunner ?? execFileCommandRunner;
            return setAccountAlias(body.profile, body.alias, {
                runner,
                ...(options.aws === undefined ? {} : { aws: options.aws }),
            });
        },

        /** One account's spend and applied credits for a period. Billed by AWS - fetched on demand, never polled. */
        [MCSERVER_CHANNELS.awsCredits]: async (_event: never, request: unknown) => {
            const body = request as { profile?: unknown; period?: unknown } | null;
            if (body === null || typeof body !== "object" || typeof body.profile !== "string") {
                return fail("invalid-request", "That credits request could not be read.");
            }
            let period: CreditsPeriod | undefined;
            if (body.period !== undefined && body.period !== null && typeof body.period === "object") {
                const p = body.period as { start?: unknown; end?: unknown };
                if (typeof p.start === "string" && typeof p.end === "string") {
                    period = { start: p.start, end: p.end };
                }
            }
            const runner = options.awsRunner ?? execFileCommandRunner;
            return readCredits(body.profile, { runner, ...(options.aws === undefined ? {} : { aws: options.aws }) }, period);
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
            for (const tunnel of rconTunnels.values()) void tunnel.close();
            rconTunnels.clear();
            restoreChallenges.clear();
            restoreReceipts.clear();
            for (const controller of activeBackupControllers.values()) controller.abort();
            activeBackupControllers.clear();
            for (const channel of Object.keys(handlers)) {
                ipcMain.removeHandler(channel);
            }
            if (webConsoleHandle !== null) {
                void webConsoleHandle.close();
                webConsoleHandle = null;
            }
        },
        hostProfiles,
    };
}
