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

import type { BackupRunnerOptions } from "../backup/runner.js";
import type { BackupRestoreRunnerOptions } from "../backup/restore.js";
import type { GitHubCallOptions } from "../backup/github.js";
import { createTransport, type FactoryDeps } from "./transport/factory.js";
import { createServerRegistry, type ServerRecord, type ServerRegistry } from "./registry.js";
import { fail, type Answer, type ServerTransport } from "./transport/types.js";
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
    adoptDiscover: "mcserver:adopt:discover",
    adopt: "mcserver:adopt",
    adoptRelease: "mcserver:adopt:release",
    worldsList: "mcserver:worlds:list",
    backupCreate: "mcserver:backup:create",
    backupList: "mcserver:backup:list",
    backupRestore: "mcserver:backup:restore",
} as const;

export type McServerChannel = (typeof MCSERVER_CHANNELS)[keyof typeof MCSERVER_CHANNELS];

/** The slice of `IpcMain` this module uses, so a test can hand in a plain object. */
export type IpcMainLike = Pick<IpcMain, "handle" | "removeHandler">;

export interface McServerIpcOptions {
    readonly dataFolder: string;
    readonly factory?: FactoryDeps;
    readonly registry?: ServerRegistry;
    readonly adoptions?: AdoptionStore;
    readonly now?: () => string;
    /** This installation's own Docker ownership value - see `adopt/discover.ts`'s note on
     *  `DiscoverOptions.ownerValue` for why this is not the label key. */
    readonly dockerOwnerValue?: string;
    readonly docker?: string;
    /** Present only when this build wants server backups wired up at all - a backup needs
     *  a signed-in GitHub CLI account, which not every embedding of this feature has. */
    readonly backup?: {
        readonly runnerOptions: BackupRunnerOptions;
        readonly restoreRunnerOptions: BackupRestoreRunnerOptions;
        readonly githubCallOptions: GitHubCallOptions;
    };
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
        // more - see `adopt/record.ts`'s `capabilitiesForConsent`. A server this app
        // created carries no adoption record at all, so its transport keeps whatever
        // capabilities `options.factory` already grants it.
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
            for (const channel of Object.keys(handlers)) {
                ipcMain.removeHandler(channel);
            }
        },
    };
}
