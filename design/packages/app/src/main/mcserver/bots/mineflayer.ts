import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import {
    discoverCommands,
    bindExecutionDimension,
    type CommandGraph,
    type CommandTarget,
    type DeclaredPacket,
    type PointOperand,
    validateSpatial,
} from "../commands/index.js";

export const BOT_DEPENDENCIES = {
    mineflayer: "4.39.0",
    pathfinder: "2.4.5",
    nodeMajorMinimum: 22,
} as const;
export interface BotProfile {
    id: string;
    engine: "mineflayer" | "baritone";
    target: CommandTarget;
    host: string;
    port: number;
    accountRef: string;
    navigation: boolean;
}
export interface BotStatus {
    id: string;
    attempt: string;
    engine: BotProfile["engine"];
    state: "starting" | "connected" | "navigating" | "stopping" | "stopped" | "failed";
    message: string;
    position: PointOperand | null;
    commandGraph: CommandGraph | null;
}
export interface ProtocolLoginClient {
    session?: unknown;
    username?: string;
}
export interface ProtocolLoginOptions {
    accessToken?: string;
    haveCredentials?: boolean;
    connect(client: ProtocolLoginClient): void;
}
export type ProtectedAuthenticator = (
    client: ProtocolLoginClient,
    options: ProtocolLoginOptions,
) => Promise<void>;
export interface ProtectedAccount {
    authenticate?: ProtectedAuthenticator;
    username: string;
    auth: "offline" | "microsoft";
    profilesFolder?: string;
    onMsaCode?: (data: unknown) => void;
}
interface Events {
    on(event: string, listener: (...args: never[]) => void): unknown;
    once(event: string, listener: (...args: never[]) => void): unknown;
    removeListener(event: string, listener: (...args: never[]) => void): unknown;
}
export interface MineflayerBot extends Events {
    version: string;
    entity?: { position: { x: number; y: number; z: number } };
    game?: { dimension: string };
    _client: Events;
    loadPlugin(plugin: unknown): void;
    quit(reason?: string): void;
    chat(message: string): void;
    pathfinder?: {
        setMovements(movements: unknown): void;
        goto(goal: unknown): Promise<void>;
        setGoal(goal: unknown): void;
        stop(): void;
    };
}
export interface MineflayerRuntime {
    version: string;
    supportedVersions: readonly string[];
    createBot(options: {
        host: string;
        port: number;
        username: string;
        version: string;
        auth: "offline" | "microsoft" | ProtectedAuthenticator;
        hideErrors?: boolean;
        logErrors?: boolean;
        profilesFolder?: string;
        onMsaCode?: (data: unknown) => void;
    }): MineflayerBot;
    pathfinder?: {
        version: string;
        plugin: unknown;
        movements(bot: MineflayerBot): unknown;
        goal(x: number, y: number, z: number): unknown;
    };
}
export function loadMineflayerRuntime(withNavigation: boolean): MineflayerRuntime {
    const require = createRequire(import.meta.url);
    const mineflayer = require("mineflayer") as {
        createBot: MineflayerRuntime["createBot"];
        testedVersions: string[];
    };
    const metadata = require("mineflayer/package.json") as { version: string };
    if (metadata.version !== BOT_DEPENDENCIES.mineflayer)
        throw new Error("Mineflayer runtime version differs from the reviewed dependency.");
    const base: MineflayerRuntime = {
        version: metadata.version,
        createBot: mineflayer.createBot,
        supportedVersions: mineflayer.testedVersions,
    };
    if (!withNavigation) return base;
    const pathfinder = require("mineflayer-pathfinder") as {
        pathfinder: unknown;
        Movements: new (bot: MineflayerBot) => unknown;
        goals: { GoalBlock: new (x: number, y: number, z: number) => unknown };
    };
    const pathMetadata = require("mineflayer-pathfinder/package.json") as { version: string };
    if (pathMetadata.version !== BOT_DEPENDENCIES.pathfinder)
        throw new Error("Pathfinder runtime version differs from the reviewed dependency.");
    return {
        ...base,
        pathfinder: {
            version: pathMetadata.version,
            plugin: pathfinder.pathfinder,
            movements: (bot) => new pathfinder.Movements(bot),
            goal: (x, y, z) => new pathfinder.goals.GoalBlock(x, y, z),
        },
    };
}
export class MineflayerSession {
    readonly #profile: BotProfile;
    readonly #runtime: MineflayerRuntime;
    readonly #listeners = new Set<(status: BotStatus) => void>();
    #bot: MineflayerBot | null = null;
    #generation = 0;
    #navigation = 0;
    #status: BotStatus;
    constructor(
        profile: BotProfile,
        runtime: MineflayerRuntime = loadMineflayerRuntime(profile.navigation),
    ) {
        if (
            profile.engine !== "mineflayer" ||
            !profile.id ||
            !profile.accountRef ||
            !profile.host ||
            !Number.isInteger(profile.port) ||
            profile.port < 1 ||
            profile.port > 65535
        )
            throw new Error("Invalid bot profile.");
        if (
            !runtime.supportedVersions.includes(profile.target.version) ||
            /^26\.(?:[2-9]|\d{2,})(?:\.|$)/.test(profile.target.version)
        )
            throw new Error(
                "This server version is not supported by the reviewed Mineflayer runtime.",
            );
        if (profile.navigation && !runtime.pathfinder)
            throw new Error("Navigation dependency is unavailable.");
        this.#profile = structuredClone(profile);
        this.#runtime = runtime;
        this.#status = {
            id: profile.id,
            attempt: "",
            engine: "mineflayer",
            state: "stopped",
            message: "Not started.",
            position: null,
            commandGraph: null,
        };
    }
    get status(): BotStatus {
        return structuredClone(this.#status);
    }
    onStatus(listener: (status: BotStatus) => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
    #update(patch: Partial<BotStatus>): void {
        this.#status = { ...this.#status, ...patch };
        for (const listener of this.#listeners) listener(this.status);
    }
    async start(resolveAccount: (reference: string) => Promise<ProtectedAccount>): Promise<void> {
        if (this.#bot || this.#status.state === "starting")
            throw new Error("Bot is already active.");
        const generation = ++this.#generation;
        this.#update({
            attempt: randomUUID(),
            state: "starting",
            message: "Resolving protected account.",
            position: null,
            commandGraph: null,
        });
        try {
            const account = await resolveAccount(this.#profile.accountRef);
            if (generation !== this.#generation) return;
            if (!account.username || !["offline", "microsoft"].includes(account.auth))
                throw new Error("Invalid account.");
            if (account.auth === "microsoft" && !account.onMsaCode && !account.authenticate)
                throw new Error("Protected Microsoft sign-in callback is required.");
            const bot = this.#runtime.createBot({
                host: this.#profile.host,
                port: this.#profile.port,
                username: account.username,
                version: this.#profile.target.version,
                auth: account.authenticate ?? account.auth,
                hideErrors: true,
                logErrors: false,
                ...(account.onMsaCode ? { onMsaCode: account.onMsaCode } : {}),
                ...(account.profilesFolder ? { profilesFolder: account.profilesFolder } : {}),
            });
            this.#bot = bot;
            const active = (): boolean => generation === this.#generation && this.#bot === bot;
            bot.once("spawn", () => {
                if (!active()) return;
                if (bot.version !== this.#profile.target.version) {
                    this.#update({
                        state: "failed",
                        message: "Negotiated server version differs from the selected profile.",
                        commandGraph: null,
                    });
                    bot.quit("Version mismatch");
                    return;
                }
                if (this.#profile.navigation) {
                    const navigation = this.#runtime.pathfinder!;
                    bot.loadPlugin(navigation.plugin);
                    bot.pathfinder!.setMovements(navigation.movements(bot));
                }
                this.#update({ state: "connected", message: "Server spawn confirmed." });
            });
            bot.on("move", () => {
                if (!active() || !bot.entity) return;
                const dimension = bot.game?.dimension ?? "";
                if (!dimension) {
                    this.#update({ position: null, commandGraph: null });
                    return;
                }
                this.#update({
                    commandGraph:
                        this.#status.commandGraph &&
                        this.#status.commandGraph.target.executionDimension !==
                            (dimension.includes(":") ? dimension : `minecraft:${dimension}`)
                            ? bindExecutionDimension(
                                  this.#status.commandGraph,
                                  dimension.includes(":") ? dimension : `minecraft:${dimension}`,
                              )
                            : this.#status.commandGraph,
                    position: {
                        kind: "point",
                        dimension: dimension.includes(":") ? dimension : `minecraft:${dimension}`,
                        ...bot.entity.position,
                    },
                });
            });
            bot._client.on("declare_commands", (packet: DeclaredPacket) => {
                if (!active() || ["stopping", "stopped", "failed"].includes(this.#status.state))
                    return;
                try {
                    this.#update({
                        commandGraph: discoverCommands(packet, {
                            ...this.#profile.target,
                            connectionEpoch: this.#status.attempt,
                            executionDimension: bot.game?.dimension
                                ? bot.game.dimension.includes(":")
                                    ? bot.game.dimension
                                    : `minecraft:${bot.game.dimension}`
                                : null,
                        }),
                    });
                } catch {
                    this.#update({
                        commandGraph: null,
                        message: "The server command graph could not be validated.",
                    });
                }
            });
            bot.on("error", () => {
                if (active())
                    this.#update({
                        state: "failed",
                        message: "The bot connection failed. Account details were not recorded.",
                    });
            });
            bot.on("kicked", () => {
                if (active())
                    this.#update({ state: "failed", message: "The server disconnected the bot." });
            });
            bot.once("end", () => {
                if (!active()) return;
                this.#bot = null;
                this.#navigation++;
                this.#update({
                    state: this.#status.state === "failed" ? "failed" : "stopped",
                    message: "Connection ended.",
                    position: null,
                    commandGraph: null,
                });
            });
        } catch {
            if (generation === this.#generation)
                this.#update({
                    state: "failed",
                    message:
                        "Bot startup failed. Check runtime and protected account configuration.",
                });
        }
    }
    async navigate(point: PointOperand): Promise<void> {
        validateSpatial(point);
        if (![point.x, point.y, point.z].every(Number.isInteger))
            throw new Error("Navigation requires integer block coordinates.");
        const bot = this.#bot;
        if (
            !bot?.pathfinder ||
            !this.#runtime.pathfinder ||
            !["connected", "navigating"].includes(this.#status.state)
        )
            throw new Error("Navigation is unavailable.");
        if (this.#status.position?.dimension !== point.dimension)
            throw new Error("Navigation across dimensions is unavailable.");
        const generation = this.#generation,
            navigation = ++this.#navigation;
        bot.pathfinder.setGoal(null);
        this.#update({ state: "navigating", message: "Finding and following a path." });
        try {
            await bot.pathfinder.goto(this.#runtime.pathfinder.goal(point.x, point.y, point.z));
            if (
                generation === this.#generation &&
                navigation === this.#navigation &&
                this.#bot === bot
            )
                this.#update({ state: "connected", message: "Navigation goal reached." });
        } catch {
            if (
                generation === this.#generation &&
                navigation === this.#navigation &&
                this.#bot === bot
            )
                this.#update({
                    state: "connected",
                    message: "Navigation could not reach the goal.",
                });
        }
    }
    cancelNavigation(): void {
        this.#navigation++;
        this.#bot?.pathfinder?.setGoal(null);
        if (this.#status.state === "navigating")
            this.#update({ state: "connected", message: "Navigation cancelled." });
    }
    stop(): void {
        ++this.#navigation;
        const bot = this.#bot;
        if (bot) {
            this.#update({
                state: "stopping",
                message: "Waiting for connection end.",
                commandGraph: null,
            });
            bot.pathfinder?.setGoal(null);
            bot.quit("Worldlens bot stopped");
            return;
        }
        ++this.#generation;
        this.#update({
            state: "stopped",
            message: "Startup cancelled.",
            position: null,
            commandGraph: null,
        });
    }
}
