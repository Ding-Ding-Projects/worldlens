import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { createServerRegistry, type ServerRegistry, type ServerRecord } from "../registry.js";
import { listCatalogue, type FetchText } from "../flavours/catalogue.js";
import { createLocalServer } from "../create.js";
import { createTransport } from "../transport/factory.js";
import { describeConfigFile, applyConfigChanges } from "../config/describe.js";
import { parseProperties } from "../config/parseProperties.js";
import { fail, ok } from "../transport/types.js";
import {
    GenerationCoordinator,
    type GenerationCoordinatorDeps,
    type GenerationState,
} from "./coordinator.js";
import {
    describeGenerationCapabilities,
    sanitizeGenerationInventory,
    safeGenerationConfigPath,
    type SelectedGenerationInventory,
} from "./capabilities.js";
import { containsProtectedGenerationInput } from "./protectedFields.js";
import { runVanillaGeneration } from "../worldgen/vanillaGeneration.js";
import { executeGenerationCommands } from "./consoleCommands.js";
import { acquireGenerationInventory, type GenerationInventoryReceipt } from "./inventory.js";

export const GENERATION_CHANNELS = {
    run: "mcserver:generation:run",
    read: "mcserver:generation:read",
    cancel: "mcserver:generation:cancel",
    capabilities: "mcserver:generation:capabilities",
} as const;
export const GENERATION_PROGRESS_EVENT = "mcserver:generation:progress";
export interface GenerationProgressEvent {
    readonly operationId: string;
    readonly sequence: number;
    readonly state: GenerationState;
}
export interface GenerationRunInput {
    readonly operationId: string;
    readonly name: string;
    readonly edition: "java";
    readonly flavour: "vanilla" | "paper" | "purpur" | "spigot";
    readonly version: string;
    readonly seed: string;
    readonly worldName: string;
    readonly memoryMb: number;
    readonly port: number;
    readonly downloadConsent: boolean;
    readonly acceptedEula: boolean;
    readonly provisionJavaIfMissing: boolean;
    readonly properties?: Readonly<Record<string, string>>;
    readonly capabilityValues?: Readonly<Record<string, unknown>>;
}
export interface GenerationRegistrationOptions {
    readonly dataFolder: string;
    readonly resourcesPath?: string | null;
    readonly registry?: ServerRegistry;
    readonly serversRoot?: string;
    readonly fetchText?: FetchText;
    readonly isTrustedSender?: (event: IpcMainInvokeEvent) => boolean;
    readonly createProject?: GenerationCoordinatorDeps["createProject"];
    readonly readProject?: GenerationCoordinatorDeps["readProject"];
    /** Exact selected-target report discovery supplied by the existing command/report owner. */
    readonly discoverInventory?: (
        server: ServerRecord,
    ) => Promise<SelectedGenerationInventory | null>;
    readonly createServer?: typeof createLocalServer;
    readonly generate?: typeof runVanillaGeneration;
}
const idPattern = /^[a-z][a-z0-9-]{0,62}$/;
const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
function trusted(event: IpcMainInvokeEvent): boolean {
    return (
        !event.sender.isDestroyed() &&
        event.sender.getURL().startsWith("file:") &&
        (!event.senderFrame || event.senderFrame === event.sender.mainFrame)
    );
}
function parseInput(value: unknown): GenerationRunInput | null {
    if (!isObject(value)) return null;
    const allowed = [
        "operationId",
        "name",
        "edition",
        "flavour",
        "version",
        "seed",
        "worldName",
        "memoryMb",
        "port",
        "downloadConsent",
        "acceptedEula",
        "provisionJavaIfMissing",
        "properties",
        "capabilityValues",
    ];
    if (Object.keys(value).some((key) => !allowed.includes(key))) return null;
    if (
        containsProtectedGenerationInput(value.properties ?? {}) ||
        containsProtectedGenerationInput(value.capabilityValues ?? {})
    )
        return null;
    if (
        typeof value.operationId !== "string" ||
        !idPattern.test(value.operationId) ||
        typeof value.name !== "string" ||
        value.name.length < 1 ||
        value.name.length > 128 ||
        value.edition !== "java" ||
        !["vanilla", "paper", "purpur", "spigot"].includes(String(value.flavour)) ||
        typeof value.version !== "string" ||
        value.version.length < 1 ||
        value.version.length > 128 ||
        typeof value.seed !== "string" ||
        value.seed.length > 1024 ||
        /[\r\n\x00]/.test(value.seed) ||
        typeof value.worldName !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(value.worldName) ||
        typeof value.memoryMb !== "number" ||
        !Number.isSafeInteger(value.memoryMb) ||
        value.memoryMb < 512 ||
        value.memoryMb > 1048576 ||
        typeof value.port !== "number" ||
        !Number.isSafeInteger(value.port) ||
        value.port < 1 ||
        value.port > 65535 ||
        typeof value.downloadConsent !== "boolean" ||
        typeof value.acceptedEula !== "boolean" ||
        typeof value.provisionJavaIfMissing !== "boolean"
    )
        return null;
    if (value.properties !== undefined) {
        if (!isObject(value.properties) || Object.keys(value.properties).length > 512) return null;
        for (const [key, item] of Object.entries(value.properties))
            if (
                !/^[a-z0-9_.-]{1,128}$/.test(key) ||
                typeof item !== "string" ||
                item.length > 16384 ||
                /[\r\n\x00]/.test(item) ||
                ["rcon.password", "management-server-secret", "level-name", "server-port"].includes(
                    key,
                )
            )
                return null;
    }
    if (
        value.capabilityValues !== undefined &&
        (!isObject(value.capabilityValues) ||
            Object.keys(value.capabilityValues).length > 10000 ||
            JSON.stringify(value.capabilityValues).length > 1024 * 1024)
    )
        return null;
    return value as unknown as GenerationRunInput;
}

/** Main-only registration. Renderer input never contains registry, service functions or filesystem roots. */
export function registerGenerationIpc(
    ipc: Pick<IpcMain, "handle" | "removeHandler">,
    options: GenerationRegistrationOptions,
): { dispose(): void; readonly coordinator: GenerationCoordinator } {
    const registry = options.registry ?? createServerRegistry({ dataFolder: options.dataFolder });
    const owners = new Map<string, WebContents>();
    const sequences = new Map<string, number>();
    const inventories = new Map<string, GenerationInventoryReceipt>();
    const allowed = (event: IpcMainInvokeEvent) => (options.isTrustedSender ?? trusted)(event);
    const acquire = async (server: ServerRecord) => {
        const receipt = await acquireGenerationInventory(
            server,
            join(options.dataFolder, "generation-reports"),
        );
        inventories.set(server.id, receipt);
        return receipt.inventory;
    };
    const handle = (
        channel: string,
        listener: (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>,
    ) =>
        ipc.handle(channel, async (event: IpcMainInvokeEvent, input: unknown) => {
            try {
                return await listener(event, input);
            } catch {
                return fail(
                    "failed",
                    "The generation operation could not be processed. Retained server and operation records remain available for recovery.",
                );
            }
        });
    const coordinator = new GenerationCoordinator({
        stateDirectory: join(options.dataFolder, "generation-operations"),
        createServer: options.createServer ?? createLocalServer,
        readServer: (id) => registry.get(id),
        inventoryForServer: options.discoverInventory ?? acquire,
        generate: async (request, callbacks) => {
            const parsed = parseProperties(
                await readFile(join(request.serverDir, "server.properties"), "utf8"),
            );
            if (!parsed.ok) return { ok: false, code: "failed", message: parsed.failure.message };
            const existing = Object.fromEntries(
                parsed.value.nodes
                    .filter((node) => node.kind === "entry")
                    .map((node) => [node.path.join("."), String(node.value)]),
            );
            return (options.generate ?? runVanillaGeneration)(
                { ...request, serverProperties: { ...existing, ...request.serverProperties } },
                callbacks,
                {
                    executeCommands: executeGenerationCommands,
                    applyConfiguration: async (changes) => {
                        const transport = createTransport(
                            { kind: "local-process", serverDir: request.serverDir },
                            {
                                localRuntime: () => ({
                                    javaPath: request.javaPath,
                                    jarPath: request.jarPath,
                                    memoryMb: request.memoryMb,
                                }),
                            },
                        );
                        if (!transport.ok) throw new Error(transport.failure.message);
                        for (const file of changes) {
                            if (!safeGenerationConfigPath(file.file))
                                throw new Error("Unsafe generation configuration path.");
                            const result = await applyConfigChanges({
                                transport: transport.value,
                                path: file.file,
                                expectedHash: file.hash,
                                changes: file.changes,
                            });
                            if (!result.ok) throw new Error(result.failure.message);
                        }
                    },
                },
            );
        },
        createProject:
            options.createProject ??
            (async ({ operationId, server, worldFolder }) => {
                const { PROJECT_FORMAT_VERSION, projectFileSchema } =
                    await import("@worldlens/config");
                const { saveProject } = await import("../../project/save.js");
                const { readProject } = await import("../../project/file.js");
                const existing = await readProject(worldFolder);
                if (existing.ok)
                    return existing.project.id === `generated-${operationId}` &&
                        existing.project.serverId === server.id &&
                        existing.project.maps.length > 0 &&
                        existing.project.maps.every((map) => map.world === worldFolder) &&
                        existing.project.serverId === server.id &&
                        existing.project.maps.length > 0 &&
                        existing.project.maps.every((map) => map.world === worldFolder)
                        ? ok({ projectPath: existing.path })
                        : fail(
                              "destination-exists",
                              "A different project already exists in this world.",
                          );
                if (existing.failure.kind !== "absent")
                    return fail("failed", "The existing project could not be safely read.");
                const now = new Date().toISOString();
                const project = projectFileSchema.parse({
                    version: PROJECT_FORMAT_VERSION,
                    id: `generated-${operationId}`,
                    serverId: server.id,
                    name: server.name,
                    createdAt: now,
                    updatedAt: now,
                    fromWizard: true,
                    maps: [
                        {
                            id: "overworld",
                            name: server.name,
                            dimension: "minecraft:overworld",
                            world: worldFolder,
                            config: `world: ${JSON.stringify(worldFolder)}\ndimension: "minecraft:overworld"\nname: ${JSON.stringify(server.name)}\n`,
                        },
                    ],
                });
                const saved = await saveProject(
                    { dataDir: options.dataFolder, embedHistory: true },
                    worldFolder,
                    project,
                );
                return saved.ok ? ok({ projectPath: saved.path }) : fail("failed", saved.reason);
            }),
        readProject:
            options.readProject ??
            (async (path) => {
                const { readProject } = await import("../../project/file.js");
                const read = await readProject(dirname(path));
                return read.ok && read.path === path
                    ? ok({
                          worldFolder: read.worldFolder,
                          projectId: read.project.id,
                          serverId:
                              typeof read.project.serverId === "string"
                                  ? read.project.serverId
                                  : undefined,
                          mapWorlds: read.project.maps.map((map) => map.world),
                      })
                    : fail("failed", "The generated project could not be read back.");
            }),
        onState: (state) => {
            const sender = owners.get(state.id);
            const sequence = (sequences.get(state.id) ?? 0) + 1;
            sequences.set(state.id, sequence);
            if (sender && !sender.isDestroyed())
                sender.send(GENERATION_PROGRESS_EVENT, {
                    operationId: state.id,
                    sequence,
                    state,
                } satisfies GenerationProgressEvent);
        },
    });
    handle(GENERATION_CHANNELS.run, async (event: IpcMainInvokeEvent, input: unknown) => {
        if (!allowed(event))
            return fail("denied", "Generation is restricted to the application workspace.");
        const parsed = parseInput(input);
        if (!parsed) return fail("invalid-request", "Invalid generation request.");
        const catalogue = await listCatalogue({
            dataDir: options.dataFolder,
            ...(options.fetchText ? { fetchText: options.fetchText } : {}),
        });
        if (!catalogue.ok) return catalogue;
        const entry = catalogue.value.flavours
            .find((item) => item.flavour === parsed.flavour)
            ?.versions.find((item) => item.version === parsed.version);
        if (!entry || !entry.downloadUrl)
            return fail(
                "not-found",
                "The selected server distribution is unavailable in the current catalogue.",
            );
        owners.set(parsed.operationId, event.sender);
        return coordinator.run({
            id: parsed.operationId,
            seed: parsed.seed,
            worldName: parsed.worldName,
            downloadConsent: parsed.downloadConsent,
            ...(parsed.properties ? { serverProperties: parsed.properties } : {}),
            ...(parsed.capabilityValues ? { generationValues: parsed.capabilityValues } : {}),
            server: {
                id: parsed.operationId,
                name: parsed.name,
                flavour: parsed.flavour,
                version: parsed.version,
                memoryMb: parsed.memoryMb,
                port: parsed.port,
                acceptedEula: parsed.acceptedEula,
                provisionJavaIfMissing: parsed.provisionJavaIfMissing,
                dataDir: options.dataFolder,
                serversRoot: options.serversRoot ?? join(options.dataFolder, "servers"),
                registry,
                resourcesPath: options.resourcesPath ?? null,
                ...(options.fetchText ? { fetchText: options.fetchText } : {}),
            },
        });
    });
    handle(GENERATION_CHANNELS.read, async (event: IpcMainInvokeEvent, id: unknown) => {
        if (!allowed(event))
            return fail("denied", "Generation is restricted to the application workspace.");
        if (typeof id !== "string" || !idPattern.test(id))
            return fail("invalid-request", "Invalid generation operation id.");
        owners.set(id, event.sender);
        return ok(await coordinator.read(id));
    });
    handle(GENERATION_CHANNELS.cancel, async (event: IpcMainInvokeEvent, id: unknown) => {
        if (!allowed(event))
            return fail("denied", "Generation is restricted to the application workspace.");
        if (typeof id !== "string" || !idPattern.test(id))
            return fail("invalid-request", "Invalid generation operation id.");
        return ok({ requested: coordinator.cancel(id) });
    });
    handle(GENERATION_CHANNELS.capabilities, async (event: IpcMainInvokeEvent, input: unknown) => {
        if (!allowed(event))
            return fail("denied", "Generation is restricted to the application workspace.");
        if (
            !isObject(input) ||
            Object.keys(input).some(
                (key) => !["edition", "version", "flavour", "serverId"].includes(key),
            ) ||
            input.edition !== "java" ||
            !["vanilla", "paper", "purpur", "spigot"].includes(String(input.flavour)) ||
            typeof input.version !== "string" ||
            input.version.length > 128 ||
            (input.serverId !== undefined &&
                (typeof input.serverId !== "string" || !idPattern.test(input.serverId)))
        )
            return fail("invalid-request", "Invalid generation capability target.");
        const target = {
            edition: "java" as const,
            version: input.version,
            flavour: String(input.flavour),
        };
        let inventory: SelectedGenerationInventory | null = null;
        if (typeof input.serverId === "string") {
            const server = await registry.get(input.serverId);
            if (!server.ok) return server;
            if (
                server.value.minecraftVersion !== input.version ||
                server.value.flavour !== input.flavour
            )
                return fail(
                    "invalid-request",
                    "The server does not match the selected capability target.",
                );
            inventory = await (options.discoverInventory ?? acquire)(server.value);
            if (
                !inventory &&
                server.value.ref.kind === "local-process" &&
                server.value.localRuntime
            ) {
                const transport = createTransport(server.value.ref, {
                    localRuntime: () => server.value.localRuntime,
                });
                if (!transport.ok) return transport;
                const described = await describeConfigFile({
                    transport: transport.value,
                    path: "server.properties",
                    flavour: server.value.flavour,
                    version: input.version,
                });
                if (!described.ok) return described;
                const observed = described.value.fields.filter(
                    (field) => field.state !== "missing",
                );
                inventory = {
                    source: {
                        ...target,
                        reference: `server:${server.value.id}/server.properties`,
                        sha256: described.value.hash,
                    },
                    serverPropertyKeys: observed.map((field) => field.key),
                    serverPropertyValues: Object.fromEntries(
                        observed.map((field) => [field.key, field.value]),
                    ),
                    gameRules: null,
                    generationTypes: null,
                    dimensions: null,
                    datapacks: [],
                };
            }
        }
        const catalogue = await listCatalogue({
            dataDir: options.dataFolder,
            ...(options.fetchText ? { fetchText: options.fetchText } : {}),
        });
        if (!catalogue.ok) return catalogue;
        return ok({
            target,
            descriptors: describeGenerationCapabilities(target, inventory),
            inventory: inventory ? sanitizeGenerationInventory(inventory) : null,
            catalogue: catalogue.value,
            unavailable:
                typeof input.serverId === "string"
                    ? (inventories.get(input.serverId)?.unavailable ?? [])
                    : [],
            jarSha256:
                typeof input.serverId === "string"
                    ? (inventories.get(input.serverId)?.jarSha256 ?? null)
                    : null,
        });
    });
    return {
        coordinator,
        dispose() {
            for (const channel of Object.values(GENERATION_CHANNELS)) ipc.removeHandler(channel);
            owners.clear();
        },
    };
}
