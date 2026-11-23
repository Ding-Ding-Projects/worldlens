/**
 * Prismarine Web Client, served from the container with its connection proxy locked to
 * the one server the person chose.
 *
 * The stock `server.js` of the web client lets any visitor ask the container to open a
 * TCP connection to any host and port, which is a way into every machine the container
 * can reach. The proxy it uses (`net-browserify`) has an allow-list option the stock
 * entry point never sets, so this file builds the same server with that list set to
 * exactly the configured Minecraft server.
 *
 * The web client is installed beside this package in the image (`/opt/web-client`), not
 * in the workspace, because its prebuilt bundle is hundreds of megabytes of assets and
 * one of its dependencies is fetched from GitHub rather than npm.
 *
 * What this does NOT do: the web client is its own player. It joins as whoever the
 * visitor is, in the visitor's browser, and the bot beside it keeps running separately.
 * The settings that describe the other viewer (camera, mouse look, other players, chat
 * panel, view distance) do not reach it.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { Server as HttpServer } from "node:http";
import { join } from "node:path";
import type { BotSupervisor } from "./bot.js";
import type { LiveViewerConfig } from "./config.js";
import { escapeHtml } from "./view.js";

export const DEFAULT_WEB_CLIENT_ROOT = "/opt/web-client/node_modules/prismarine-web-client";

export interface WebClientDefaults {
    readonly defaultHost: string;
    readonly defaultHostPort: number;
    readonly defaultProxy: string;
    readonly defaultProxyPort: number;
    readonly defaultVersion: string;
}

/** The `config.json` the web client reads for its connect form. Pure. */
export function webClientDefaults(config: LiveViewerConfig, detectedVersion: string | null): WebClientDefaults {
    const version = config.version !== "auto" ? config.version : (detectedVersion ?? "1.18.2");
    return { defaultHost: config.server.host, defaultHostPort: config.server.port, defaultProxy: "", defaultProxyPort: 0, defaultVersion: version };
}

/** The proxy allow-list: exactly one destination. Pure. */
export function proxyAllowList(config: LiveViewerConfig): { host: string; port: number }[] {
    return [{ host: config.server.host, port: config.server.port }];
}

export function startWebClientServer(
    config: LiveViewerConfig,
    supervisor: BotSupervisor,
    port: number,
    healthBody: () => unknown,
    root: string = process.env.WEB_CLIENT_ROOT ?? DEFAULT_WEB_CLIENT_ROOT,
): HttpServer {
    const load = createRequire(join(root, "package.json"));
    const express = load("express") as typeof import("express");
    const compression = load("compression") as typeof import("compression");
    const netApi = load("net-browserify") as (options: Record<string, unknown>) => unknown;

    const app = express();
    app.disable("x-powered-by");
    app.get("/health", (_request, response) => {
        const body = healthBody() as { state?: string };
        response.status(body.state === "failed" || body.state === "stopped" ? 503 : 200).json(body);
    });
    app.get("/config.json", (_request, response) => {
        response.json(webClientDefaults(config, supervisor.health().minecraftVersion));
    });
    const indexHtml = readFileSync(join(root, "public", "index.html"), "utf8").replace(
        /<title>[^<]*<\/title>/,
        `<title>${escapeHtml(supervisor.strings.pageTitle)}</title>`,
    );
    app.get(["/", "/index.html"], (_request, response) => {
        response.type("html").send(indexHtml);
    });
    app.use(compression());
    app.use(netApi({ allowOrigin: false, to: proxyAllowList(config) }) as never);
    app.use(express.static(join(root, "public"), { index: false }));

    // `net-browserify` replaces `app.listen` so its websocket route shares the server it
    // creates; calling it is required, wrapping `app` in `createServer` would break the proxy.
    return app.listen(port, "0.0.0.0");
}
