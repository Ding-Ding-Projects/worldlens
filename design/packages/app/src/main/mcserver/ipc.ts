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

import { createTransport, type FactoryDeps } from "./transport/factory.js";
import { createLocalServer, type CreateLocalServerOptions } from "./create.js";
import type { FetchBinary } from "./install.js";
import { listCatalogue, refreshCatalogue, FLAVOUR_IDS, type FetchText, type FlavourId } from "./flavours/catalogue.js";
import { requiredJavaFeature } from "./flavours/javaRequirement.js";
import { createServerRegistry, type ServerRecord, type ServerRegistry } from "./registry.js";
import { fail, ok, type Answer, type ServerTransport } from "./transport/types.js";
import { discoverJava } from "../java/discovery.js";
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
    catalogueList: "mcserver:catalogue:list",
    catalogueRefresh: "mcserver:catalogue:refresh",
    javaResolve: "mcserver:java:resolve",
    create: "mcserver:create",
} as const;

export type McServerChannel = (typeof MCSERVER_CHANNELS)[keyof typeof MCSERVER_CHANNELS];

/** The slice of `IpcMain` this module uses, so a test can hand in a plain object. */
export type IpcMainLike = Pick<IpcMain, "handle" | "removeHandler">;

export interface McServerIpcOptions {
    readonly dataFolder: string;
    /** Where new servers' directories are created. Defaults to `<dataFolder>/servers`. */
    readonly serversRoot?: string;
    readonly factory?: FactoryDeps;
    readonly registry?: ServerRegistry;
    readonly now?: () => string;
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
}

function isRecordId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function isPath(value: unknown): value is string {
    // Length and control characters only. Whether the path is *allowed* is decided by
    // `transport/scope.ts`, which is the one place that question is answered.
    return typeof value === "string" && value.length > 0 && value.length <= 4_096 && !/[\0\r\n]/.test(value);
}

function isFlavourId(value: unknown): value is FlavourId {
    return typeof value === "string" && (FLAVOUR_IDS as readonly string[]).includes(value);
}

export function registerMcServerHandlers(ipcMain: IpcMainLike, options: McServerIpcOptions): McServerIpc {
    const registry = options.registry ?? createServerRegistry({ dataFolder: options.dataFolder, ...(options.now === undefined ? {} : { now: options.now }) });
    const serversRoot = options.serversRoot ?? join(options.dataFolder, "servers");

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
    };

    for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.handle(channel, handler as never);
    }

    return {
        registry,
        dispose(): void {
            for (const channel of Object.keys(handlers)) {
                ipcMain.removeHandler(channel);
            }
        },
    };
}
