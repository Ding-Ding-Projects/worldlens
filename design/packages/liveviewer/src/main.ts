/**
 * Container entry point.
 *
 * Reads the configuration (a mounted file, never the environment), starts the bot, then
 * starts exactly one web server on the fixed internal port. The host decides which
 * outside port maps to it. Nothing here prints a token, a configuration value or a
 * player's chat: the only log lines are state changes.
 */

import { readFileSync } from "node:fs";
import { BotSupervisor } from "./bot.js";
import { loadAuthCache } from "./authCache.js";
import { parseLiveViewerConfig, VIEWER_INTERNAL_PORT } from "./config.js";
import { startViewerServer } from "./view.js";
import { startWebClientServer } from "./webClient.js";

export const DEFAULT_CONFIG_PATH = "/config/config.json";
export const DEFAULT_SECRET_PATH = "/secrets/auth.json";

function log(message: string): void {
    process.stdout.write(`[liveviewer] ${message}\n`);
}

export function run(): void {
    const configPath = process.env.LIVEVIEWER_CONFIG ?? DEFAULT_CONFIG_PATH;
    const secretPath = process.env.LIVEVIEWER_SECRET ?? DEFAULT_SECRET_PATH;

    let raw: unknown;
    try {
        raw = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
        log("The configuration file is missing or is not valid JSON.");
        process.exit(2);
    }
    const parsed = parseLiveViewerConfig(raw);
    if (!parsed.ok) {
        log(`The configuration was refused at '${parsed.field}': ${parsed.message}`);
        process.exit(2);
    }
    const { config } = parsed;

    const authCache = config.auth === "microsoft" ? loadAuthCache(secretPath) : null;
    if (config.auth === "microsoft" && authCache === null) {
        log("Microsoft sign-in was chosen but no usable sign-in file is mounted.");
        process.exit(3);
    }

    const supervisor = new BotSupervisor({
        config,
        authCache,
        // The container cannot show a code; it only ever refreshes an existing sign-in.
        onMsaCode: () => log("The Microsoft sign-in expired. Sign in again from the application."),
    });
    const startedAt = Date.now();
    const health = (): unknown => ({
        ...supervisor.health(),
        kind: config.kind,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
    supervisor.on("state", (snapshot) => log(`state ${snapshot.state}${snapshot.lastError === null ? "" : ` (${snapshot.lastError})`}`));

    const server = config.kind === "viewer" ? startViewerServer(config, supervisor, VIEWER_INTERNAL_PORT, health) : startWebClientServer(config, supervisor, VIEWER_INTERNAL_PORT, health);
    supervisor.start();
    log(`web server on port ${VIEWER_INTERNAL_PORT} (${config.kind})`);

    const shutdown = (): void => {
        supervisor.stop();
        if ("close" in server && typeof server.close === "function") (server as { close(): unknown }).close();
        setTimeout(() => process.exit(0), 500).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
}
