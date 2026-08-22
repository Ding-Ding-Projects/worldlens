/**
 * The locally hosted web management console: an authenticated HTTP surface over the
 * Minecraft server registry, reachable from a browser rather than only from the desktop
 * shell. Built entirely on `HttpServer` from `@worldlens/server` - no second HTTP stack.
 *
 * Binds to loopback (127.0.0.1) by default. A non-loopback bind is refused unless the
 * caller explicitly says the origin is trusted - refusing plain HTTP on a LAN bind is the
 * one rule that cannot be relaxed, because that is a password crossing a network in the
 * clear.
 *
 * Every route before authentication renders in ordinary professional English. No project
 * jargon, no in-house vocabulary - a stranger opening the sign-in page has no context for
 * either.
 */

import type * as http from "node:http";
import { createHash, randomBytes } from "node:crypto";

import { HttpServer, type HttpHandler, SseConnectionManager } from "@worldlens/server";

import type { ServerRegistry } from "../registry.js";
import { createTransport, type FactoryDeps } from "../transport/factory.js";
import type { ConsoleSession } from "../transport/types.js";

import { verifyWebConsolePassword, type SafeStorageLike } from "./password.js";
import { WebConsolePasswordStore } from "./passwordStore.js";
import { SessionManager } from "./sessions.js";
import { LockoutTracker, SignInGate, UnlockLadder, isRung } from "./lockout.js";

const SESSION_COOKIE_NAME = "wl_console_session";

export interface WebConsoleServerOptions {
    readonly registry: ServerRegistry;
    readonly safeStorage: SafeStorageLike;
    readonly dataFolder: string;
    readonly factory?: FactoryDeps;
    /** True when the origin serving this console is genuinely loopback-only. Anything else
     * on a non-loopback host is refused rather than served over plain HTTP. */
    readonly host?: string;
    readonly port?: number;
    /** True when the caller has terminated TLS in front of this server (a reverse proxy).
     * Only then may a non-loopback host be accepted. */
    readonly tlsTerminated?: boolean;
    readonly now?: () => number;
    readonly schoolMode?: () => boolean;
    readonly sessionManager?: SessionManager;
    readonly lockoutTracker?: LockoutTracker;
    readonly unlockLadder?: UnlockLadder;
}

export interface WebConsoleServerHandle {
    readonly host: string;
    readonly port: number;
    close(): Promise<void>;
    /** For tests: read the sign-in gate's session manager without a real socket. */
    readonly sessions: SessionManager;
}

function isLoopbackHost(host: string): boolean {
    return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function sourceKeyFor(req: http.IncomingMessage): string {
    // req.socket.remoteAddress is what Node actually observed on the wire - never a
    // client-supplied header, which could be forged to dodge the rate limit entirely.
    return req.socket.remoteAddress ?? "unknown";
}

function readCookie(req: http.IncomingMessage, name: string): string | null {
    const header = req.headers.cookie;
    if (typeof header !== "string") return null;
    for (const part of header.split(";")) {
        const [k, ...rest] = part.trim().split("=");
        if (k === name) return decodeURIComponent(rest.join("="));
    }
    return null;
}

function sessionCookieHeader(token: string, secure: boolean, maxAgeSeconds: number): string {
    const attrs = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        `Max-Age=${maxAgeSeconds}`,
    ];
    if (secure) attrs.push("Secure");
    return attrs.join("; ");
}

function clearCookieHeader(secure: boolean): string {
    const attrs = [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
    if (secure) attrs.push("Secure");
    return attrs.join("; ");
}

async function readJsonBody(req: http.IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
        total += (chunk as Buffer).length;
        if (total > maxBytes) throw new Error("body too large");
        chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (text.trim() === "") return {};
    return JSON.parse(text);
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(text),
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
        ...extraHeaders,
    });
    res.end(text);
}

const SIGN_IN_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in</title>
<meta name="robots" content="noindex">
</head>
<body>
<main>
<h1>Sign in</h1>
<p>Enter the password for this server console.</p>
<form id="signin-form">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Sign in</button>
</form>
<p id="status" role="status" aria-live="polite"></p>
</main>
<script src="/signin.js"></script>
</body>
</html>
`;

/** Builds the routing handlers. Kept separate from `listen()` so tests can drive requests
 * through the `HttpServer`'s own handler chain without a real socket, exactly like the
 * rest of this package's HTTP tests do. */
export function buildWebConsoleHandlers(options: WebConsoleServerOptions): {
    handlers: HttpHandler[];
    sseManagers: Map<string, SseConnectionManager>;
    sessions: SessionManager;
} {
    const now = options.now ?? (() => Date.now());
    const passwordStore = new WebConsolePasswordStore(options.dataFolder);
    const sessions = options.sessionManager ?? new SessionManager({ now });
    const lockout = options.lockoutTracker ?? new LockoutTracker({ now });
    const ladder = options.unlockLadder ?? new UnlockLadder({ now });
    const gate = new SignInGate(lockout, ladder, now);
    const schoolMode = options.schoolMode ?? (() => false);
    const secureCookies = options.tlsTerminated === true || false;
    const sseManagers = new Map<string, SseConnectionManager>();
    const consoleSessions = new Map<string, ConsoleSession>();

    function requireSession(req: http.IncomingMessage): boolean {
        const token = readCookie(req, SESSION_COOKIE_NAME);
        return token !== null && sessions.touch(token);
    }

    const signInHandler: HttpHandler = {
        async handle(req, res): Promise<boolean> {
            const url = new URL(req.url ?? "/", "http://localhost");

            if (url.pathname === "/" && req.method === "GET") {
                if (requireSession(req)) return false; // fall through to static app handler
                res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
                res.end(SIGN_IN_PAGE_HTML);
                return true;
            }

            if (url.pathname === "/api/auth/status" && req.method === "GET") {
                const authenticated = requireSession(req);
                sendJson(res, 200, { authenticated });
                return true;
            }

            if (url.pathname === "/api/auth/signin" && req.method === "POST") {
                const source = sourceKeyFor(req);
                let body: unknown;
                try {
                    body = await readJsonBody(req);
                } catch {
                    sendJson(res, 400, { ok: false, error: "The request could not be read." });
                    return true;
                }
                const password = typeof body === "object" && body !== null ? (body as Record<string, unknown>).password : undefined;

                if (gate.isLocked(source)) {
                    sendJson(res, 429, {
                        ok: false,
                        error: "Too many attempts. Please wait before trying again.",
                        retryAfterMs: gate.remainingLockMs(source),
                    });
                    return true;
                }

                if (typeof password !== "string" || password.length === 0) {
                    gate.recordPasswordFailure(source);
                    sendJson(res, 400, { ok: false, error: "A password is required." });
                    return true;
                }

                const record = await passwordStore.get();
                const valid = await verifyWebConsolePassword(options.safeStorage, record, password);
                if (!valid) {
                    gate.recordPasswordFailure(source);
                    sendJson(res, 401, { ok: false, error: "That password is incorrect." });
                    return true;
                }

                gate.recordPasswordSuccess(source, schoolMode());
                const token = sessions.create();
                sendJson(res, 200, { ok: true }, {
                    "set-cookie": sessionCookieHeader(token, secureCookies, 12 * 60 * 60),
                });
                return true;
            }

            if (url.pathname === "/api/auth/signout" && req.method === "POST") {
                const token = readCookie(req, SESSION_COOKIE_NAME);
                if (token !== null) sessions.revoke(token);
                sendJson(res, 200, { ok: true }, { "set-cookie": clearCookieHeader(secureCookies) });
                return true;
            }

            if (url.pathname === "/api/auth/ladder/status" && req.method === "GET") {
                const source = sourceKeyFor(req);
                sendJson(res, 200, {
                    locked: gate.isLocked(source),
                    remainingMs: gate.remainingLockMs(source),
                    rung: gate.isLocked(source) ? gate.currentRung(source, schoolMode()) : null,
                });
                return true;
            }

            if (url.pathname === "/api/auth/ladder/challenge" && req.method === "POST") {
                const source = sourceKeyFor(req);
                const payload = gate.requestChallenge(source, schoolMode());
                if (payload === null) {
                    sendJson(res, 200, { ok: false, reason: "not-locked" });
                    return true;
                }
                sendJson(res, 200, { ok: true, challenge: payload });
                return true;
            }

            if (url.pathname === "/api/auth/ladder/submit" && req.method === "POST") {
                const source = sourceKeyFor(req);
                let body: unknown;
                try {
                    body = await readJsonBody(req);
                } catch {
                    sendJson(res, 400, { ok: false, error: "The request could not be read." });
                    return true;
                }
                const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
                const rung = b.rung;
                const nonce = b.nonce;
                let outcome: ReturnType<SignInGate["submitDimSum"]>;
                if (rung === "dimsum") {
                    outcome = gate.submitDimSum(source, schoolMode(), nonce, b.choiceIndex);
                } else if (rung === "sums") {
                    outcome = gate.submitSums(source, schoolMode(), nonce, b.answers);
                } else if (rung === "whackamole") {
                    outcome = gate.submitWhackAMole(source, schoolMode(), nonce, b.hits);
                } else if (isRung(rung)) {
                    outcome = "invalid";
                } else {
                    outcome = "invalid";
                }

                // Winning clears the WAIT ONLY. Never a session, never a cookie - the caller
                // is sent back to the ordinary sign-in form, still needing the real password.
                sendJson(res, 200, {
                    cleared: outcome === "cleared",
                    outcome,
                    locked: gate.isLocked(source),
                    remainingMs: gate.remainingLockMs(source),
                });
                return true;
            }

            return false;
        },
    };

    const apiHandler: HttpHandler = {
        async handle(req, res): Promise<boolean> {
            const url = new URL(req.url ?? "/", "http://localhost");
            if (!url.pathname.startsWith("/api/servers")) return false;

            if (!requireSession(req)) {
                sendJson(res, 401, { ok: false, error: "Sign in required." });
                return true;
            }

            const parts = url.pathname.split("/").filter(Boolean); // ["api", "servers", ...]

            if (parts.length === 2 && req.method === "GET") {
                const list = await options.registry.list();
                sendJson(res, list.ok ? 200 : 502, list);
                return true;
            }

            if (parts.length === 3 && req.method === "GET" && parts[2] !== "console") {
                const id = parts[2] as string;
                const found = await options.registry.get(id);
                sendJson(res, found.ok ? 200 : 404, found);
                return true;
            }

            if (parts.length === 4 && parts[3] === "status" && req.method === "GET") {
                const id = parts[2] as string;
                const found = await options.registry.get(id);
                if (!found.ok) {
                    sendJson(res, 404, found);
                    return true;
                }
                const built = createTransport(found.value.ref, { ...options.factory, writeScope: found.value.writeScope });
                if (!built.ok) {
                    sendJson(res, 502, built);
                    return true;
                }
                const status = await built.value.status();
                sendJson(res, status.ok ? 200 : 502, status);
                return true;
            }

            if (parts.length === 4 && parts[3] === "start" && req.method === "POST") {
                const id = parts[2] as string;
                const found = await options.registry.get(id);
                if (!found.ok) {
                    sendJson(res, 404, found);
                    return true;
                }
                const built = createTransport(found.value.ref, { ...options.factory, writeScope: found.value.writeScope });
                if (!built.ok) {
                    sendJson(res, 502, built);
                    return true;
                }
                const started = await built.value.start();
                sendJson(res, started.ok ? 200 : 502, started);
                return true;
            }

            if (parts.length === 4 && parts[3] === "stop" && req.method === "POST") {
                const id = parts[2] as string;
                const found = await options.registry.get(id);
                if (!found.ok) {
                    sendJson(res, 404, found);
                    return true;
                }
                const built = createTransport(found.value.ref, { ...options.factory, writeScope: found.value.writeScope });
                if (!built.ok) {
                    sendJson(res, 502, built);
                    return true;
                }
                let body: unknown = {};
                try {
                    body = await readJsonBody(req);
                } catch {
                    /* default to graceful */
                }
                const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
                const graceful = b.graceful !== false;
                const timeoutMs = typeof b.timeoutMs === "number" && b.timeoutMs > 0 && b.timeoutMs <= 600_000 ? b.timeoutMs : 60_000;
                const stopped = await built.value.stop({ graceful, timeoutMs });
                sendJson(res, stopped.ok ? 200 : 502, stopped);
                return true;
            }

            if (parts.length === 4 && parts[3] === "console" && req.method === "GET") {
                // SSE stream of console lines for one server, established lazily per id.
                const id = parts[2] as string;
                let manager = sseManagers.get(id);
                if (manager === undefined) {
                    manager = new SseConnectionManager();
                    sseManagers.set(id, manager);
                }
                manager.open(req, res);

                if (!consoleSessions.has(id)) {
                    const found = await options.registry.get(id);
                    if (found.ok) {
                        const built = createTransport(found.value.ref, { ...options.factory, writeScope: found.value.writeScope });
                        if (built.ok) {
                            const attached = await built.value.attach({ tail: 200 });
                            if (attached.ok) {
                                consoleSessions.set(id, attached.value);
                                void (async () => {
                                    for await (const line of attached.value.lines) {
                                        manager?.broadcast("line", JSON.stringify(line));
                                    }
                                })();
                            }
                        }
                    }
                }
                return true;
            }

            return false;
        },
    };

    return { handlers: [signInHandler, apiHandler], sseManagers, sessions };
}

/** Runs the console with a real socket. */
export async function startWebConsoleServer(options: WebConsoleServerOptions): Promise<WebConsoleServerHandle> {
    const host = options.host ?? "127.0.0.1";
    if (!isLoopbackHost(host) && options.tlsTerminated !== true) {
        throw new Error(
            "Refusing to bind the web console to a non-loopback address without TLS: the sign-in password would cross the network in the clear.",
        );
    }

    const { handlers, sessions } = buildWebConsoleHandlers(options);
    const server = new HttpServer({ host, port: options.port ?? 0 });
    for (const handler of handlers) server.addHandler(handler);
    const address = await server.listen();

    return {
        host: typeof address === "object" ? address.address : host,
        port: typeof address === "object" ? address.port : (options.port ?? 0),
        sessions,
        async close(): Promise<void> {
            await server.close();
        },
    };
}

// Re-exported so main-process wiring can build a hashed reference to a password without
// importing the internals directly.
export function hashSourceForLogging(source: string): string {
    return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

export function randomDiagnosticId(): string {
    return randomBytes(8).toString("hex");
}
