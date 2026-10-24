import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { ProductionBotPorts } from "./production.js";
import type { ServerRegistry } from "../registry.js";
import { fail, ok, type Answer } from "../transport/types.js";
import { loadMineflayerRuntime } from "./mineflayer.js";
import { describeBotProfiles, type BotCapability } from "./profiles.js";
import {
    registerCommandBotOperations,
    type CommandBotMainPorts,
    type CommandBotRequests,
    type CommandBotResults,
} from "./register.js";

/**
 * The renderer-facing channels for the bot workflow panel, one per method the panel's own
 * `Api` interface declares. The registrar underneath speaks method names (`mcserver.bots.deploy`);
 * these are the channel names the bridge allowlist and the main process agree on.
 */
export const BOT_CHANNELS = Object.freeze({
    configuration: "mcserver:bots:configuration",
    configure: "mcserver:bots:configure",
    signIn: "mcserver:bots:signIn",
    devicePrompt: "mcserver:bots:devicePrompt",
    cancelSignIn: "mcserver:bots:cancelSignIn",
    profiles: "mcserver:bots:profiles",
    accounts: "mcserver:bots:accounts",
    prepareAccount: "mcserver:bots:prepareAccount",
    deploy: "mcserver:bots:deploy",
    stop: "mcserver:bots:stop",
    reconnect: "mcserver:bots:reconnect",
    status: "mcserver:bots:status",
    navigate: "mcserver:bots:navigate",
    cancel: "mcserver:bots:cancel",
} as const);

export const CONNECTION_UNAVAILABLE_REASON =
    "Bots and discovered commands need an authenticated game-protocol connection to the server, " +
    "and this build has no protected game account or protocol connection configured. The bot " +
    "workflow stays unavailable until that connection exists.";

/** Explicit fallback when platform protected storage or production endpoint services cannot initialize. */
export function unavailableBotPorts(registry: Pick<ServerRegistry, "get">): CommandBotMainPorts {
    return {
        resolveTarget: async (serverId) => {
            const found = await registry.get(serverId);
            const name = found.ok ? found.value.name : serverId;
            throw new Error(`${CONNECTION_UNAVAILABLE_REASON} (server: ${name})`);
        },
        resolveAccount: async () => {
            throw new Error("Protected bot accounts are unavailable in this build.");
        },
        baritoneClient: async () => {
            throw new Error(
                "The Baritone client bridge is not built or installed in this release, so the Baritone engine cannot be launched.",
            );
        },
    };
}

export interface BotIpcOptions {
    readonly registry: Pick<ServerRegistry, "get">;
    readonly ports?: CommandBotMainPorts;
    readonly isTrustedSender?: (event: IpcMainInvokeEvent) => boolean;
    /** Test seam for the installed Mineflayer runtime's declared versions. */
    readonly mineflayerVersions?: () => readonly string[];
}

function trusted(event: IpcMainInvokeEvent): boolean {
    return (
        !event.sender.isDestroyed() &&
        event.sender.getURL().startsWith("file:") &&
        (!event.senderFrame || event.senderFrame === event.sender.mainFrame)
    );
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

function identifier(value: unknown): string | null {
    return typeof value === "string" &&
        value.length > 0 &&
        value.length <= 256 &&
        !/[\r\n\0]/u.test(value)
        ? value
        : null;
}

function installedVersions(read: () => readonly string[]): readonly string[] {
    try {
        return read();
    } catch {
        // Availability stays false when the reviewed runtime cannot be loaded.
        return [];
    }
}

/**
 * Register the bot workflow channels. Each handler validates the renderer's request shape,
 * then calls the registrar's method and turns a thrown reason into a `fail` answer the panel
 * already knows how to show. Nothing here invents a connection, account or client.
 */
export function registerBotIpc(
    ipc: Pick<IpcMain, "handle" | "removeHandler">,
    options: BotIpcOptions,
): {
    dispose(): void;
    discover(
        request: CommandBotRequests["mcserver.commands.discover"],
    ): Promise<Answer<CommandBotResults["mcserver.commands.discover"]>>;
    preview(
        request: CommandBotRequests["mcserver.commands.preview"],
    ): Promise<Answer<CommandBotResults["mcserver.commands.preview"]>>;
    execute(
        request: CommandBotRequests["mcserver.commands.execute"],
    ): Promise<Answer<CommandBotResults["mcserver.commands.execute"]>>;
} {
    const ports = options.ports ?? unavailableBotPorts(options.registry);
    const production = "configurePublicClient" in ports ? (ports as ProductionBotPorts) : null;
    const allowed = options.isTrustedSender ?? trusted;
    const versions =
        options.mineflayerVersions ?? (() => loadMineflayerRuntime(false).supportedVersions);
    const methods = new Map<string, (request: unknown) => Promise<unknown>>();
    const registration = registerCommandBotOperations((method, handler) => {
        methods.set(method, handler as (request: unknown) => Promise<unknown>);
    }, ports);

    const call = async <K extends keyof CommandBotRequests>(
        method: K,
        request: CommandBotRequests[K],
    ): Promise<Answer<CommandBotResults[K]>> => {
        const handler = methods.get(method);
        if (!handler)
            return fail("unsupported", `The ${method} operation is not registered in this build.`);
        try {
            return ok((await handler(request)) as CommandBotResults[K]);
        } catch (error) {
            return fail(
                "unsupported",
                error instanceof Error
                    ? error.message
                    : "The bot operation could not be processed.",
            );
        }
    };

    const handle = (channel: string, listener: (request: unknown) => Promise<unknown>): void => {
        ipc.handle(channel, async (event: IpcMainInvokeEvent, request: unknown) => {
            if (!allowed(event))
                return fail("denied", "This request did not come from the application window.");
            return listener(request);
        });
    };

    handle(BOT_CHANNELS.configuration, async () =>
        production
            ? ok(await production.publicClientConfiguration())
            : fail("unsupported", CONNECTION_UNAVAILABLE_REASON),
    );
    handle(BOT_CHANNELS.configure, async (request) => {
        if (!production || !isObject(request) || typeof request.clientId !== "string")
            return fail("invalid-request", "Enter a registered public client ID.");
        try {
            await production.configurePublicClient(request.clientId);
            return ok({ configured: true });
        } catch {
            return fail("invalid-request", "The public client ID could not be saved.");
        }
    });
    handle(BOT_CHANNELS.devicePrompt, async (request) => {
        const reference = isObject(request) ? identifier(request.accountRef) : null;
        return reference && production
            ? ok(production.devicePrompt(reference))
            : fail("invalid-request", "Choose a protected account.");
    });
    for (const [channel, method] of [
        [BOT_CHANNELS.signIn, "mcserver.bots.accounts.signIn"],
        [BOT_CHANNELS.cancelSignIn, "mcserver.bots.accounts.cancel"],
    ] as const) {
        handle(channel, async (request) => {
            const reference = isObject(request) ? identifier(request.accountRef) : null;
            if (!reference) return fail("invalid-request", "Choose a protected account.");
            production?.clearDevicePrompt(reference);
            try {
                return await call(method, { accountRef: reference });
            } finally {
                production?.clearDevicePrompt(reference);
            }
        });
    }
    handle(BOT_CHANNELS.profiles, async (request) => {
        const serverId = isObject(request) ? identifier(request.serverId) : null;
        if (serverId === null) return fail("invalid-request", "Choose a server first.");
        const found = await options.registry.get(serverId);
        if (!found.ok) return found;
        const described = describeBotProfiles(
            found.value.minecraftVersion ?? "",
            installedVersions(versions),
        );
        const capabilities: BotCapability[] = described.map((capability) =>
            capability.available &&
            (!options.ports ||
                (production && capability.engine === "baritone" && !production.baritoneAvailable))
                ? {
                      ...capability,
                      available: false,
                      reason:
                          capability.engine === "baritone" && production
                              ? "The managed Java client and approved launch route are not prepared."
                              : CONNECTION_UNAVAILABLE_REASON,
                  }
                : capability,
        );
        return ok(capabilities);
    });

    handle(BOT_CHANNELS.accounts, async () => {
        return ok((await ports.protectedAccounts?.list()) ?? []);
    });

    handle(BOT_CHANNELS.prepareAccount, async (request) => {
        if (!isObject(request))
            return fail("invalid-request", "That account request could not be read.");
        const username = identifier(request.username);
        if (username === null) return fail("invalid-request", "Enter the account name first.");
        if (request.provider === "microsoft")
            return call("mcserver.bots.accounts.create", { label: username });
        if (request.provider === "offline")
            return fail(
                "unsupported",
                "Offline accounts are not accepted here: a bot joins a server with a protected account you sign in with.",
            );
        return fail("invalid-request", "Choose a supported account provider.");
    });

    handle(BOT_CHANNELS.deploy, async (request) => {
        if (!isObject(request))
            return fail("invalid-request", "That deployment request could not be read.");
        const serverId = identifier(request.serverId);
        const accountRef = identifier(request.accountRef);
        if (
            serverId === null ||
            accountRef === null ||
            (request.engine !== "mineflayer" && request.engine !== "baritone")
        )
            return fail(
                "invalid-request",
                "Choose a server, an engine and a prepared account first.",
            );
        return call("mcserver.bots.deploy", {
            serverId,
            engine: request.engine,
            accountRef,
            navigation: request.navigation === true,
        });
    });

    const byBotId =
        (
            method:
                | "mcserver.bots.stop"
                | "mcserver.bots.reconnect"
                | "mcserver.bots.status"
                | "mcserver.bots.cancel",
        ) =>
        async (request: unknown) => {
            const botId = isObject(request) ? identifier(request.botId) : null;
            if (botId === null) return fail("invalid-request", "Choose a bot first.");
            return call(method, { botId });
        };
    handle(BOT_CHANNELS.stop, byBotId("mcserver.bots.stop"));
    handle(BOT_CHANNELS.reconnect, byBotId("mcserver.bots.reconnect"));
    handle(BOT_CHANNELS.status, byBotId("mcserver.bots.status"));
    handle(BOT_CHANNELS.cancel, byBotId("mcserver.bots.cancel"));

    handle(BOT_CHANNELS.navigate, async (request) => {
        const botId = isObject(request) ? identifier(request.botId) : null;
        const point = isObject(request) && isObject(request.point) ? request.point : null;
        if (
            botId === null ||
            point === null ||
            point.kind !== "point" ||
            typeof point.dimension !== "string" ||
            ![point.x, point.y, point.z].every(
                (value) => typeof value === "number" && Number.isFinite(value),
            )
        )
            return fail("invalid-request", "Pick a destination point on the map first.");
        return call("mcserver.bots.navigate", {
            botId,
            point: {
                kind: "point",
                dimension: point.dimension,
                x: point.x as number,
                y: point.y as number,
                z: point.z as number,
            },
        });
    });

    return {
        discover: (request) => call("mcserver.commands.discover", request),
        preview: (request) => call("mcserver.commands.preview", request),
        execute: (request) => call("mcserver.commands.execute", request),
        dispose() {
            registration.dispose();
            for (const channel of Object.values(BOT_CHANNELS)) ipc.removeHandler(channel);
        },
    };
}
