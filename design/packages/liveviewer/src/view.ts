/**
 * The Prismarine Viewer page, served by this container rather than by the library.
 *
 * `prismarine-viewer`'s own `mineflayer()` helper starts a web server and cannot be told
 * to change the page title, hide other players, relay chat or follow a bot that is
 * replaced after a reconnect. It is about fifty lines around two public pieces
 * (`WorldView` and the static client), so those pieces are used directly and the server
 * around them is this file.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import { dirname, join } from "node:path";
import compression from "compression";
import express, { type Express } from "express";
import { Server as SocketServer, type Socket } from "socket.io";
import type { Bot } from "mineflayer";
import type { BotSupervisor, ChatLine } from "./bot.js";
import type { LiveViewerConfig } from "./config.js";

const require = createRequire(import.meta.url);

interface WorldViewLike {
    init(position: unknown): Promise<void>;
    updatePosition(position: unknown): void;
    listenToBot(bot: Bot): void;
    removeListenersFromBot(bot: Bot): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
}
type WorldViewConstructor = new (world: unknown, viewDistance: number, position: unknown, emitter: unknown) => WorldViewLike;

export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** The viewer's own `index.html`, with the title replaced and the overlay added. Pure. */
export function customiseIndex(html: string, config: LiveViewerConfig, title: string): string {
    const withTitle = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
    const style = config.mouseLook ? "" : "<style>canvas{pointer-events:none}</style>";
    const overlay = config.showChat ? '<script src="/socket.io/socket.io.js"></script><script src="/lv/overlay.js"></script>' : "";
    return withTitle.replace("</head>", `${style}</head>`).replace("</body>", `${overlay}</body>`);
}

/** The chat panel. Plain DOM, no framework, text only (never innerHTML). */
export function overlayScript(chatLabel: string, offlineLabel: string): string {
    return `(() => {
  const label = ${JSON.stringify(chatLabel)};
  const waiting = ${JSON.stringify(offlineLabel)};
  const panel = document.createElement('div');
  panel.setAttribute('role', 'log');
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-label', label);
  panel.style.cssText = 'position:fixed;left:12px;bottom:12px;max-width:min(420px,calc(100vw - 24px));max-height:40vh;overflow:auto;background:rgba(0,0,0,.55);color:#fff;font:14px/1.4 Roboto,sans-serif;padding:8px 12px;border-radius:12px;pointer-events:none;';
  const add = (line) => { const row = document.createElement('div'); row.textContent = line.text; panel.appendChild(row); while (panel.childNodes.length > 60) panel.removeChild(panel.firstChild); panel.scrollTop = panel.scrollHeight; };
  const first = document.createElement('div'); first.textContent = waiting; panel.appendChild(first);
  document.body.appendChild(panel);
  const socket = io();
  socket.on('lv:chat', (line) => { if (first.parentNode) panel.removeChild(first); add(line); });
})();`;
}

export interface ViewerServer {
    readonly app: Express;
    readonly http: HttpServer;
    close(): Promise<void>;
}

export function startViewerServer(config: LiveViewerConfig, supervisor: BotSupervisor, port: number, healthBody: () => unknown): ViewerServer {
    const viewerRoot = dirname(require.resolve("prismarine-viewer/package.json"));
    // Only the world view is needed. `prismarine-viewer/viewer` (the index) also loads the
    // browser renderer, whose server-side import of `canvas` fails because that package is a
    // dev dependency of the library and absent from every install.
    const { WorldView } = require("prismarine-viewer/viewer/lib/worldView") as { WorldView: WorldViewConstructor };
    const publicDir = join(viewerRoot, "public");
    const indexHtml = readFileSync(join(publicDir, "index.html"), "utf8");
    const strings = supervisor.strings;

    const app = express();
    app.disable("x-powered-by");
    app.use(compression());
    app.get("/health", (_request, response) => {
        const body = healthBody() as { botConnected?: boolean; state?: string };
        response.status(body.state === "failed" || body.state === "stopped" ? 503 : 200).json(body);
    });
    const page = customiseIndex(indexHtml, config, strings.pageTitle);
    app.get(["/", "/index.html"], (_request, response) => {
        response.type("html").send(page);
    });
    app.get("/lv/overlay.js", (_request, response) => {
        response.type("js").send(overlayScript(strings.chatLabel, strings.offlineLabel));
    });
    app.use(express.static(publicDir, { index: false }));

    const http = createServer(app);
    const io = new SocketServer(http, { path: "/socket.io" });

    const onChat = (line: ChatLine): void => {
        io.emit("lv:chat", { text: line.text, source: line.source, at: line.at });
    };
    supervisor.on("chat", onChat);
    // A replaced bot invalidates every world view built on the old one; clients reconnect on their own.
    supervisor.on("bot", () => io.disconnectSockets(true));

    io.on("connection", (socket: Socket) => {
        const bot = supervisor.bot;
        if (bot === null || !supervisor.health().botConnected) {
            socket.disconnect(true);
            return;
        }
        socket.emit("version", bot.version);
        for (const line of supervisor.history) socket.emit("lv:chat", { text: line.text, source: line.source, at: line.at });

        const hidden = new Set<number>();
        if (!config.showPlayers) {
            const emit = socket.emit.bind(socket) as (event: string, ...args: unknown[]) => boolean;
            (socket as unknown as { emit: typeof emit }).emit = (event: string, ...args: unknown[]): boolean => {
                if (event === "entity") {
                    const data = args[0] as { id?: number; username?: unknown } | undefined;
                    if (data !== undefined && typeof data.id === "number") {
                        if (typeof data.username === "string") hidden.add(data.id);
                        if (hidden.has(data.id)) return false;
                    }
                }
                return emit(event, ...args);
            };
        }

        const view = new WorldView(bot.world, config.viewDistance, bot.entity.position, socket);
        void view.init(bot.entity.position);
        const sendPosition = (): void => {
            const packet: Record<string, unknown> = { pos: bot.entity.position, yaw: bot.entity.yaw, addMesh: true };
            if (config.camera === "first") packet.pitch = bot.entity.pitch;
            socket.emit("position", packet);
            view.updatePosition(bot.entity.position);
        };
        bot.on("move", sendPosition);
        view.listenToBot(bot);
        socket.on("disconnect", () => {
            bot.removeListener("move", sendPosition);
            try {
                view.removeListenersFromBot(bot);
            } catch {
                /* the bot may have been replaced already */
            }
        });
    });

    http.listen(port, "0.0.0.0");
    return {
        app,
        http,
        close: () =>
            new Promise<void>((resolve) => {
                supervisor.off("chat", onChat);
                io.close(() => resolve());
            }),
    };
}
