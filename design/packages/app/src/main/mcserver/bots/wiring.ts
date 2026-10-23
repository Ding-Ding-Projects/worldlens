import type { IpcMain, IpcMainInvokeEvent } from "electron";
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

/**
 * The ports this build can honestly supply to the command/bot registrar: none of the live ones.
 *
 * A trusted command target is a real authenticated game-protocol principal with a current
 * `declare_commands` graph and a dispatch channel on that same connection; protected accounts
 * need the approved Microsoft public-client setup; the Baritone bridge needs the Java client
 * build. None of those exist in this build yet, so every port answers with the exact reason
 * instead of pretending. The registrar's own validation, capacity and preview logic still runs
 * in front of them, so a request that would have been refused anyway is refused the same way.
 */
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
): { dispose(): void } {
    const ports = options.ports ?? unavailableBotPorts(options.registry);
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

    handle(BOT_CHANNELS.profiles, async (request) => {
        const serverId = isObject(request) ? identifier(request.serverId) : null;
        if (serverId === null) return fail("invalid-request", "Choose a server first.");
        const found = await options.registry.get(serverId);
        if (!found.ok) return found;
        // Describe what the installed runtime declares for this server's version, then mark
        // every engine unavailable with the one reason that applies to all of them in this
        // build: there is no connection to deploy over. A profile that reads as available
        // while deploy can only fail would be the dishonest answer.
        const described = describeBotProfiles(
            found.value.minecraftVersion ?? "",
            installedVersions(versions),
        );
        const capabilities: BotCapability[] = described.map((capability) =>
            capability.available
                ? { ...capability, available: false, reason: CONNECTION_UNAVAILABLE_REASON }
                : capability,
        );
        return ok(capabilities);
    });

    handle(BOT_CHANNELS.accounts, async () => {
        // No protected account store exists in this build, so the honest list is empty.
        return ok([] as { accountRef: string; label: string }[]);
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
        dispose() {
            registration.dispose();
            for (const channel of Object.values(BOT_CHANNELS)) ipc.removeHandler(channel);
        },
    };
}
