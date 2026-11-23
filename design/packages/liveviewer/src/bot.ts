/**
 * The bot, and the policy around keeping it connected.
 *
 * A bot is replaced rather than repaired when the connection drops: a fresh `createBot`
 * is the only state mineflayer promises is coherent. The supervisor therefore owns the
 * sequence (connect, run, drop, wait, connect again) and tells everything else which
 * bot is current. The viewer rebinds on every `bot` event.
 */

import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import mineflayer, { type Bot, type BotOptions } from "mineflayer";
import type { LiveViewerConfig } from "./config.js";
import { localisedStrings, type VisibleStrings } from "./vocabulary.js";
import type { AuthCache } from "./authCache.js";

const require = createRequire(import.meta.url);

export type BotState = "connecting" | "connected" | "reconnecting" | "failed" | "stopped";

export interface ChatLine {
    /** `bot` lines are announcements from the container itself and are the only ones the vocabulary touches. */
    readonly source: "player" | "system" | "bot";
    readonly text: string;
    readonly at: number;
}

export interface HealthSnapshot {
    readonly state: BotState;
    readonly botConnected: boolean;
    readonly botName: string;
    readonly minecraftVersion: string | null;
    readonly attempt: number;
    readonly lastError: string | null;
    readonly connectedAt: number | null;
}

/** Night begins at 12542 ticks and ends at 23459, matching when a bed can be used. */
export function isNight(timeOfDay: number): boolean {
    return timeOfDay >= 12542 && timeOfDay <= 23459;
}

export interface SupervisorOptions {
    readonly config: LiveViewerConfig;
    readonly authCache: AuthCache | null;
    readonly onMsaCode?: (code: { user_code: string; verification_uri: string }) => void;
    /** Injection point for tests; the default is the real `mineflayer.createBot`. */
    readonly createBot?: (options: BotOptions) => Bot;
    readonly now?: () => number;
    /** How long a connection attempt may run without spawning before it counts as failed. */
    readonly joinTimeoutMs?: number;
}

/** A server that silently drops packets never produces an error, so every attempt has a deadline. */
export const DEFAULT_JOIN_TIMEOUT_MS = 45_000;

export interface BotSupervisorEvents {
    bot: [Bot];
    chat: [ChatLine];
    state: [HealthSnapshot];
}

/** Builds the options handed to mineflayer. Pure, so it can be tested without a server. */
export function buildBotOptions(config: LiveViewerConfig, authCache: AuthCache | null, onMsaCode?: SupervisorOptions["onMsaCode"]): BotOptions {
    const base: BotOptions = {
        host: config.server.host,
        port: config.server.port,
        username: config.botName,
        hideErrors: true,
        ...(config.version === "auto" ? {} : { version: config.version }),
    };
    if (config.auth === "microsoft" && authCache !== null) {
        const extended = {
            ...base,
            auth: "microsoft" as const,
            // The cache factory takes the place of a folder; refreshed tokens go back to the secret file.
            profilesFolder: authCache.factory as unknown as string,
            flow: "msal",
            authTitle: authCache.clientId,
            ...(onMsaCode === undefined ? {} : { onMsaCode }),
        };
        return extended as unknown as BotOptions;
    }
    return { ...base, auth: "offline" };
}

export class BotSupervisor extends EventEmitter<BotSupervisorEvents> {
    readonly #options: SupervisorOptions;
    readonly #strings: VisibleStrings;
    readonly #history: ChatLine[] = [];
    #bot: Bot | null = null;
    #state: BotState = "connecting";
    #attempt = 0;
    #lastError: string | null = null;
    #connectedAt: number | null = null;
    #timer: NodeJS.Timeout | null = null;
    #stopped = false;
    #sleepGuard = false;

    constructor(options: SupervisorOptions) {
        super();
        this.#options = options;
        this.#strings = localisedStrings(options.config.vocabulary);
    }

    get bot(): Bot | null {
        return this.#bot;
    }

    get strings(): VisibleStrings {
        return this.#strings;
    }

    get history(): readonly ChatLine[] {
        return this.#history;
    }

    health(): HealthSnapshot {
        return {
            state: this.#state,
            botConnected: this.#state === "connected",
            botName: this.#bot?.username ?? this.#options.config.botName,
            minecraftVersion: this.#bot?.version ?? null,
            attempt: this.#attempt,
            lastError: this.#lastError,
            connectedAt: this.#connectedAt,
        };
    }

    start(): void {
        this.#stopped = false;
        this.#connect();
    }

    stop(): void {
        this.#stopped = true;
        if (this.#timer !== null) clearTimeout(this.#timer);
        this.#timer = null;
        this.#set("stopped");
        try {
            this.#bot?.quit();
        } catch {
            /* the connection may already be gone */
        }
    }

    #set(state: BotState): void {
        this.#state = state;
        this.emit("state", this.health());
    }

    #say(source: ChatLine["source"], text: string): void {
        const line: ChatLine = { source, text, at: (this.#options.now ?? Date.now)() };
        this.#history.push(line);
        if (this.#history.length > 100) this.#history.shift();
        if (this.#options.config.behaviours.relayChat || source === "bot") this.emit("chat", line);
    }

    #connect(): void {
        const { config } = this.#options;
        this.#attempt += 1;
        this.#set(this.#attempt === 1 ? "connecting" : "reconnecting");
        const make = this.#options.createBot ?? ((options: BotOptions) => mineflayer.createBot(options));
        let bot: Bot;
        try {
            bot = make(buildBotOptions(config, this.#options.authCache, this.#options.onMsaCode));
        } catch (error) {
            this.#lastError = error instanceof Error ? error.message : String(error);
            this.#afterDrop();
            return;
        }
        this.#bot = bot;
        let dropped = false;
        const watchdog = setTimeout(() => {
            drop("timed out waiting to join the server");
            try {
                bot.end("join timeout");
            } catch {
                /* already closed */
            }
        }, this.#options.joinTimeoutMs ?? DEFAULT_JOIN_TIMEOUT_MS);
        const drop = (reason: string): void => {
            clearTimeout(watchdog);
            if (dropped) return;
            dropped = true;
            this.#lastError = reason;
            this.#connectedAt = null;
            this.#afterDrop();
        };

        bot.once("spawn", () => {
            clearTimeout(watchdog);
            this.#connectedAt = (this.#options.now ?? Date.now)();
            this.#attempt = 0;
            this.#lastError = null;
            this.#set("connected");
            this.emit("bot", bot);
            this.#say("bot", this.#strings.joinedAnnouncement);
            this.#installBehaviours(bot);
        });
        bot.on("kicked", (reason) => drop(`kicked: ${typeof reason === "string" ? reason.slice(0, 200) : "the server closed the connection"}`));
        bot.on("error", (error) => drop(error instanceof Error ? error.message.slice(0, 200) : "connection error"));
        bot.on("end", (reason) => drop(`ended: ${String(reason ?? "connection closed").slice(0, 200)}`));
    }

    #afterDrop(): void {
        if (this.#stopped) return;
        const { reconnect } = this.#options.config.behaviours;
        if (!reconnect.enabled || this.#attempt >= reconnect.tries) {
            this.#set("failed");
            return;
        }
        this.#set("reconnecting");
        this.#say("bot", this.#strings.reconnectingAnnouncement);
        this.#timer = setTimeout(() => {
            this.#timer = null;
            if (!this.#stopped) this.#connect();
        }, reconnect.delaySeconds * 1000);
    }

    #installBehaviours(bot: Bot): void {
        const { behaviours } = this.#options.config;

        bot.on("chat", (username, message) => {
            if (username === bot.username) return;
            this.#say("player", `${username}: ${message}`);
        });
        bot.on("messagestr", (message, position) => {
            if (position === "system" && message.trim() !== "") this.#say("system", message);
        });

        if (behaviours.follow.enabled) this.#followPlayer(bot, behaviours.follow.player);
        if (behaviours.lookAtPlayers) this.#lookAtPlayers(bot);
        if (behaviours.sleepAtNight) this.#sleepAtNight(bot);
    }

    #followPlayer(bot: Bot, name: string): void {
        const { pathfinder, Movements, goals } = require("mineflayer-pathfinder") as typeof import("mineflayer-pathfinder");
        bot.loadPlugin(pathfinder);
        const movements = new Movements(bot);
        bot.pathfinder.setMovements(movements);
        let following = false;
        const timer = setInterval(() => {
            const target = bot.players[name]?.entity;
            if (target === undefined) {
                if (following) {
                    bot.pathfinder.setGoal(null);
                    following = false;
                }
                return;
            }
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
            following = true;
        }, 1000);
        bot.once("end", () => clearInterval(timer));
    }

    #lookAtPlayers(bot: Bot): void {
        let last = 0;
        bot.on("physicsTick", () => {
            const now = Date.now();
            if (now - last < 250) return;
            last = now;
            const nearest = bot.nearestEntity((entity) => entity.type === "player" && entity.username !== bot.username && entity.position.distanceTo(bot.entity.position) < 16);
            if (nearest !== null) {
                void bot.lookAt(nearest.position.offset(0, nearest.height, 0), true).catch(() => undefined);
            }
        });
    }

    #sleepAtNight(bot: Bot): void {
        bot.on("time", () => {
            if (this.#sleepGuard || bot.isSleeping || !isNight(bot.time.timeOfDay)) return;
            const bed = bot.findBlock({ matching: (block) => bot.isABed(block), maxDistance: 16 });
            if (bed === null) return;
            this.#sleepGuard = true;
            bot.sleep(bed)
                .catch(() => undefined)
                .finally(() => {
                    this.#sleepGuard = false;
                });
        });
        bot.on("wake", () => {
            this.#sleepGuard = false;
        });
    }
}
